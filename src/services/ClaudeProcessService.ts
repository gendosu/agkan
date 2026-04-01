import { spawn, ChildProcess } from 'child_process';
import Database from 'better-sqlite3';

// ---- Type definitions ----

export type ClaudeStreamEvent =
  | { type: 'system'; subtype: string; session_id?: string; [key: string]: unknown }
  | {
      type: 'assistant';
      message: {
        content: Array<
          | { type: 'text'; text: string }
          | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
        >;
        [key: string]: unknown;
      };
      [key: string]: unknown;
    }
  | { type: 'result'; subtype: string; result?: string; duration_ms?: number; [key: string]: unknown }
  | { type: string; [key: string]: unknown };

export type OutputEvent =
  | { kind: 'text'; text: string }
  | { kind: 'tool_use'; name: string; input: Record<string, unknown> }
  | { kind: 'done'; exitCode: number }
  | { kind: 'error'; message: string };

export type SubscribeCallback = (event: OutputEvent) => void;

export interface RunLog {
  id: number;
  task_id: number;
  started_at: string;
  finished_at: string | null;
  exit_code: number | null;
  events: OutputEvent[];
}

interface RunLogRow {
  id: number;
  task_id: number;
  started_at: string;
  finished_at: string | null;
  exit_code: number | null;
  events: string;
}

interface ProcessInfo {
  taskId: number;
  command: string;
  process: ChildProcess;
  startedAt: Date;
  status: 'running' | 'stopped';
  outputBuffer: ClaudeStreamEvent[];
  processedEvents: OutputEvent[];
  subscribers: Set<SubscribeCallback>;
  runLogId: number | null;
}

// ---- ClaudeProcessService ----

/**
 * ClaudeProcessService
 * Manages claude CLI processes running in stream-json mode.
 * Keyed by taskId, supports start/stop/subscribe/list operations.
 */
export class ClaudeProcessService {
  private processes: Map<number, ProcessInfo> = new Map();
  private db: Database.Database | null;

  constructor(db?: Database.Database | null) {
    this.db = db ?? null;
  }

  /**
   * Start a claude process for the given taskId and prompt.
   * Prevents duplicate processes for the same taskId.
   */
  startProcess(taskId: number, prompt: string, command: string = 'run'): void {
    if (this.processes.has(taskId)) {
      throw new Error(`Process for taskId ${taskId} is already running`);
    }

    const child = spawn(
      'claude',
      ['--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions', '-p', prompt],
      {
        cwd: '/workspace',
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );

    const info: ProcessInfo = {
      taskId,
      command,
      process: child,
      startedAt: new Date(),
      status: 'running',
      outputBuffer: [],
      processedEvents: [],
      subscribers: new Set(),
      runLogId: null,
    };

    this.processes.set(taskId, info);

    if (this.db) {
      const result = this.db
        .prepare(
          `INSERT INTO task_run_logs (task_id, started_at, finished_at, exit_code, events) VALUES (?, ?, NULL, NULL, '[]')`
        )
        .run(info.taskId, info.startedAt.toISOString());
      info.runLogId = result.lastInsertRowid as number;
    }

    let lineBuffer = '';
    let spawnError = false;

    child.on('error', (err: NodeJS.ErrnoException) => {
      spawnError = true;
      const message = err.code === 'ENOENT' ? 'claude CLI not found in PATH' : err.message;
      const errorEvent: OutputEvent = { kind: 'error', message };
      info.processedEvents.push(errorEvent);
      info.subscribers.forEach((cb) => cb(errorEvent));

      const doneEvent: OutputEvent = { kind: 'done', exitCode: 1 };
      info.subscribers.forEach((cb) => cb(doneEvent));

      if (this.db && info.runLogId) {
        const finishedAt = new Date().toISOString();
        this.db
          .prepare(`UPDATE task_run_logs SET finished_at = ?, exit_code = ?, events = ? WHERE id = ?`)
          .run(finishedAt, 1, JSON.stringify(info.processedEvents), info.runLogId);
      }

      this.processes.delete(taskId);
    });

    child.stdout?.on('data', (chunk: Buffer) => {
      lineBuffer += chunk.toString();
      const lines = lineBuffer.split('\n');
      // Keep the last (potentially incomplete) line in the buffer
      lineBuffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let parsed: ClaudeStreamEvent;
        try {
          parsed = JSON.parse(trimmed) as ClaudeStreamEvent;
        } catch {
          // Skip non-JSON lines
          continue;
        }

        info.outputBuffer.push(parsed);
        this._notifySubscribers(info, parsed);
      }
    });

    let stderrBuffer = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderrBuffer += chunk.toString();
    });

    child.on('close', (code) => {
      if (spawnError) return;
      // Process any remaining buffered line
      const remaining = lineBuffer.trim();
      if (remaining) {
        try {
          const parsed = JSON.parse(remaining) as ClaudeStreamEvent;
          info.outputBuffer.push(parsed);
          this._notifySubscribers(info, parsed);
        } catch {
          // Ignore
        }
      }

      if (stderrBuffer) {
        const errorEvent: OutputEvent = { kind: 'error', message: stderrBuffer };
        info.subscribers.forEach((cb) => cb(errorEvent));
      }

      const exitCode = code ?? 0;
      const doneEvent: OutputEvent = { kind: 'done', exitCode };
      info.subscribers.forEach((cb) => cb(doneEvent));

      // Finalize log in DB before removing process
      if (this.db && info.runLogId) {
        const finishedAt = new Date().toISOString();
        this.db
          .prepare(`UPDATE task_run_logs SET finished_at = ?, exit_code = ?, events = ? WHERE id = ?`)
          .run(finishedAt, exitCode, JSON.stringify(info.processedEvents), info.runLogId);
        // Rotate: keep only latest 5 per task
        const rows = this.db
          .prepare(`SELECT id FROM task_run_logs WHERE task_id = ? ORDER BY started_at DESC`)
          .all(info.taskId) as { id: number }[];
        if (rows.length > 5) {
          const toDelete = rows.slice(5).map((r) => r.id);
          const placeholders = toDelete.map(() => '?').join(',');
          this.db.prepare(`DELETE FROM task_run_logs WHERE id IN (${placeholders})`).run(...toDelete);
        }
      }

      this.processes.delete(taskId);
    });
  }

  /**
   * Stop the process for the given taskId.
   * Returns true if the process was found and signalled, false otherwise.
   */
  stopProcess(taskId: number): boolean {
    const info = this.processes.get(taskId);
    if (!info) {
      return false;
    }
    info.process.kill('SIGTERM');
    this.processes.delete(taskId);
    return true;
  }

  /**
   * List all currently running tasks with their command type.
   */
  listRunningTasks(): { taskId: number; command: string }[] {
    return Array.from(this.processes.values()).map((info) => ({ taskId: info.taskId, command: info.command }));
  }

  /**
   * Subscribe to output events for a given taskId.
   * If process is running: replay past events and subscribe to future events.
   * If no process but DB available: replay last saved log from DB.
   * Returns an unsubscribe function.
   */
  subscribeOutput(taskId: number, callback: SubscribeCallback): () => void {
    const info = this.processes.get(taskId);
    if (!info) {
      // Try to replay from DB
      if (this.db) {
        const row = this.db
          .prepare(`SELECT * FROM task_run_logs WHERE task_id = ? ORDER BY started_at DESC LIMIT 1`)
          .get(taskId) as RunLogRow | undefined;

        if (row) {
          const events = JSON.parse(row.events) as OutputEvent[];
          events.forEach((evt) => callback(evt));
          callback({ kind: 'done', exitCode: row.exit_code ?? 0 });
          return () => {};
        }
      }

      // No process and no log found — emit error
      callback({ kind: 'error', message: `No running process for taskId ${taskId}` });
      return () => {};
    }

    // Replay past events to the new subscriber before registering
    info.processedEvents.forEach((evt) => callback(evt));
    info.subscribers.add(callback);
    return () => {
      info.subscribers.delete(callback);
    };
  }

  /**
   * Get the buffered output events for a taskId.
   * Useful for late subscribers who missed earlier events.
   */
  getOutputBuffer(taskId: number): ClaudeStreamEvent[] {
    return this.processes.get(taskId)?.outputBuffer ?? [];
  }

  /**
   * Get saved run logs for a task from DB (most recent first, up to 5).
   */
  getRunLogs(taskId: number): RunLog[] {
    if (!this.db) return [];
    const rows = this.db
      .prepare(`SELECT * FROM task_run_logs WHERE task_id = ? ORDER BY started_at DESC LIMIT 5`)
      .all(taskId) as RunLogRow[];
    return rows.map((r) => ({
      id: r.id,
      task_id: r.task_id,
      started_at: r.started_at,
      finished_at: r.finished_at,
      exit_code: r.exit_code,
      events: JSON.parse(r.events) as OutputEvent[],
    }));
  }

  // ---- Private helpers ----

  private _notifySubscribers(info: ProcessInfo, event: ClaudeStreamEvent): void {
    if (event.type === 'assistant') {
      const assistantEvent = event as Extract<ClaudeStreamEvent, { type: 'assistant' }>;
      let added = false;
      for (const content of assistantEvent.message.content) {
        if (content.type === 'text') {
          const outputEvent: OutputEvent = { kind: 'text', text: content.text };
          info.processedEvents.push(outputEvent);
          info.subscribers.forEach((cb) => cb(outputEvent));
          added = true;
        } else if (content.type === 'tool_use') {
          const outputEvent: OutputEvent = { kind: 'tool_use', name: content.name, input: content.input };
          info.processedEvents.push(outputEvent);
          info.subscribers.forEach((cb) => cb(outputEvent));
          added = true;
        }
      }
      if (added && this.db && info.runLogId) {
        this.db
          .prepare(`UPDATE task_run_logs SET events = ? WHERE id = ?`)
          .run(JSON.stringify(info.processedEvents), info.runLogId);
      }
    }
    // 'result' and 'system' events are buffered but not forwarded as OutputEvents
    // (done/error are sent on process close)
  }
}
