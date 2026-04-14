import { spawn, ChildProcess } from 'child_process';
import type { StorageBackend } from '../db/types/repository';
import type { RunLogRow } from '../db/types/repository';
import { verboseLog } from '../utils/logger';
import { ConflictError } from '../errors';
import type { IProcessService } from './IProcessService';
import type { OutputEvent, RunLog, SubscribeCallback } from './ClaudeProcessService';

// Codex output event types from JSONL
type CodexStreamEvent =
  | { type: 'thread.started'; thread_id: string; [key: string]: unknown }
  | {
      type: 'item.completed';
      item: {
        type: string;
        content?: string;
        [key: string]: unknown;
      };
      [key: string]: unknown;
    }
  | { type: 'turn.completed'; [key: string]: unknown }
  | { type: string; [key: string]: unknown };

interface ProcessInfo {
  taskId: number;
  command: string;
  process: ChildProcess;
  startedAt: Date;
  status: 'running' | 'stopped';
  outputBuffer: CodexStreamEvent[];
  processedEvents: OutputEvent[];
  subscribers: Set<SubscribeCallback>;
  runLogId: number | null;
  sessionId: string | null;
}

/**
 * CodexProcessService
 * Manages codex CLI processes running in JSON mode.
 * Parses JSONL output from codex and converts to OutputEvent format.
 * Implements IProcessService for use with ProcessServiceFactory.
 */
export class CodexProcessService implements IProcessService {
  private processes: Map<number, ProcessInfo> = new Map();
  private db: StorageBackend | null;

  constructor(db?: StorageBackend | null) {
    this.db = db ?? null;
  }

  /**
   * Start a codex process for the given taskId and prompt.
   * Prevents duplicate processes for the same taskId.
   */
  startProcess(taskId: number, prompt: string, command: string = 'run'): void {
    if (this.processes.has(taskId)) {
      const existing = this.processes.get(taskId)!;
      const pid = existing.process.pid;
      const killed = existing.process.killed;
      const exitCode = existing.process.exitCode;
      const signalCode = existing.process.signalCode;
      const aliveMs = Date.now() - existing.startedAt.getTime();
      verboseLog(
        `[CodexProcessService] startProcess DUPLICATE taskId=${taskId} existing pid=${pid} killed=${killed} exitCode=${exitCode} signalCode=${signalCode} aliveMs=${aliveMs} command=${existing.command}`
      );
      throw new ConflictError(`Process for taskId ${taskId} is already running`);
    }

    verboseLog(`[CodexProcessService] startProcess taskId=${taskId} command=${command}`);

    const child = spawn('codex', ['exec', '--json', '--dangerously-bypass-approvals-and-sandbox', prompt], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

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
      sessionId: null,
    };

    this.processes.set(taskId, info);
    verboseLog(`[CodexProcessService] process added to map taskId=${taskId} total=${this.processes.size}`);

    if (this.db) {
      info.runLogId = this.db.runLogs.create(info.taskId, info.startedAt.toISOString());
      verboseLog(`[CodexProcessService] run log created id=${info.runLogId} taskId=${taskId}`);
    }

    let lineBuffer = '';
    let spawnError = false;

    child.on('error', (err: NodeJS.ErrnoException) => {
      spawnError = true;
      const message = err.code === 'ENOENT' ? 'codex CLI not found in PATH' : err.message;
      console.error(`[CodexProcessService] spawn error for taskId=${taskId}: ${message}`, err);
      const errorEvent: OutputEvent = { kind: 'error', message };
      info.processedEvents.push(errorEvent);
      info.subscribers.forEach((cb) => cb(errorEvent));

      const doneEvent: OutputEvent = { kind: 'done', exitCode: 1 };
      info.subscribers.forEach((cb) => cb(doneEvent));

      if (this.db && info.runLogId) {
        const finishedAt = new Date().toISOString();
        this.db.runLogs.updateFinished(info.runLogId, finishedAt, 1, JSON.stringify(info.processedEvents));
        verboseLog(`[CodexProcessService] run log updated (error) id=${info.runLogId} taskId=${taskId}`);
      }

      if (this.processes.get(taskId) === info) {
        this.processes.delete(taskId);
        verboseLog(
          `[CodexProcessService] process removed from map (error) taskId=${taskId} total=${this.processes.size}`
        );
      } else {
        verboseLog(`[CodexProcessService] process error skipped map delete (stale entry) taskId=${taskId}`);
      }
    });

    child.stdout?.on('data', (chunk: Buffer) => {
      lineBuffer += chunk.toString();
      const lines = lineBuffer.split('\n');
      // Keep the last (potentially incomplete) line in the buffer
      lineBuffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let parsed: CodexStreamEvent;
        try {
          parsed = JSON.parse(trimmed) as CodexStreamEvent;
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
          const parsed = JSON.parse(remaining) as CodexStreamEvent;
          info.outputBuffer.push(parsed);
          this._notifySubscribers(info, parsed);
        } catch {
          // Ignore
        }
      }

      if (stderrBuffer) {
        console.error(`[CodexProcessService] stderr for taskId=${taskId}:\n${stderrBuffer}`);
        const errorEvent: OutputEvent = { kind: 'error', message: stderrBuffer };
        info.processedEvents.push(errorEvent);
        info.subscribers.forEach((cb) => cb(errorEvent));
      }

      const exitCode = code ?? 0;
      verboseLog(`[CodexProcessService] process close taskId=${taskId} exitCode=${exitCode}`);
      if (exitCode !== 0) {
        console.error(`[CodexProcessService] process exited with code ${exitCode} for taskId=${taskId}`);
      }
      const doneEvent: OutputEvent = { kind: 'done', exitCode };
      info.subscribers.forEach((cb) => cb(doneEvent));

      // Finalize log in DB before removing process
      if (this.db && info.runLogId) {
        const finishedAt = new Date().toISOString();
        this.db.runLogs.updateFinished(info.runLogId, finishedAt, exitCode, JSON.stringify(info.processedEvents));
        verboseLog(`[CodexProcessService] run log finalized id=${info.runLogId} taskId=${taskId} exitCode=${exitCode}`);
        // Rotate: keep only latest 5 per task
        const ids = this.db.runLogs.findIdsByTaskId(info.taskId);
        if (ids.length > 5) {
          const toDelete = ids.slice(5);
          this.db.runLogs.deleteMany(toDelete);
          verboseLog(`[CodexProcessService] rotated run logs taskId=${taskId} deleted=${toDelete.length}`);
        }
      }

      if (this.processes.get(taskId) === info) {
        this.processes.delete(taskId);
        verboseLog(
          `[CodexProcessService] process removed from map (close) taskId=${taskId} total=${this.processes.size}`
        );
      } else {
        verboseLog(`[CodexProcessService] process close skipped map delete (stale entry) taskId=${taskId}`);
      }
    });
  }

  /**
   * Stop the process for the given taskId.
   * Returns true if the process was found and signalled, false otherwise.
   */
  stopProcess(taskId: number): boolean {
    const info = this.processes.get(taskId);
    if (!info) {
      verboseLog(`[CodexProcessService] stopProcess taskId=${taskId} not found`);
      return false;
    }
    verboseLog(`[CodexProcessService] stopProcess taskId=${taskId} sending SIGTERM`);
    info.process.kill('SIGTERM');
    this.processes.delete(taskId);
    verboseLog(`[CodexProcessService] process removed from map (stop) taskId=${taskId} total=${this.processes.size}`);
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
        const row = this.db.runLogs.findLatestByTaskId(taskId);

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
   * Get saved run logs for a task from DB (most recent first, up to 5).
   */
  getRunLogs(taskId: number): RunLog[] {
    if (!this.db) return [];
    const rows = this.db.runLogs.findByTaskId(taskId, 5);
    return rows.map((r: RunLogRow) => ({
      id: r.id,
      task_id: r.task_id,
      started_at: r.started_at,
      finished_at: r.finished_at,
      exit_code: r.exit_code,
      session_id: r.session_id,
      events: JSON.parse(r.events) as OutputEvent[],
    }));
  }

  // ---- Private helpers ----

  private _notifySubscribers(info: ProcessInfo, event: CodexStreamEvent): void {
    // Map Codex events to OutputEvent format
    if (event.type === 'thread.started') {
      // Extract thread_id as session_id
      const threadId = (event as Extract<CodexStreamEvent, { type: 'thread.started' }>).thread_id;
      if (threadId && !info.sessionId) {
        info.sessionId = threadId;
        if (this.db && info.runLogId) {
          this.db.runLogs.updateSessionId(info.runLogId, info.sessionId);
        }
      }
    }

    if (event.type === 'item.completed') {
      const itemEvent = event as Extract<CodexStreamEvent, { type: 'item.completed' }>;
      const item = itemEvent.item;

      // Treat agent_message items as text output
      if (item.type === 'agent_message' && item.content) {
        const outputEvent: OutputEvent = { kind: 'text', text: String(item.content) };
        info.processedEvents.push(outputEvent);
        info.subscribers.forEach((cb) => cb(outputEvent));

        if (this.db && info.runLogId) {
          this.db.runLogs.updateEvents(info.runLogId, JSON.stringify(info.processedEvents));
        }
      }
    }
    // 'turn.completed' events are buffered but not forwarded as OutputEvents
    // (done/error are sent on process close)
  }
}
