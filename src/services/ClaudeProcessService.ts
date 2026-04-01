import { spawn, ChildProcess } from 'child_process';

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

interface ProcessInfo {
  taskId: number;
  process: ChildProcess;
  startedAt: Date;
  status: 'running' | 'stopped';
  outputBuffer: ClaudeStreamEvent[];
  subscribers: Set<SubscribeCallback>;
}

// ---- ClaudeProcessService ----

/**
 * ClaudeProcessService
 * Manages claude CLI processes running in stream-json mode.
 * Keyed by taskId, supports start/stop/subscribe/list operations.
 */
export class ClaudeProcessService {
  private processes: Map<number, ProcessInfo> = new Map();

  /**
   * Start a claude process for the given taskId and prompt.
   * Prevents duplicate processes for the same taskId.
   */
  startProcess(taskId: number, prompt: string): void {
    if (this.processes.has(taskId)) {
      throw new Error(`Process for taskId ${taskId} is already running`);
    }

    const child = spawn('claude', ['--output-format', 'stream-json', '-p', prompt], {
      cwd: '/workspace',
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const info: ProcessInfo = {
      taskId,
      process: child,
      startedAt: new Date(),
      status: 'running',
      outputBuffer: [],
      subscribers: new Set(),
    };

    this.processes.set(taskId, info);

    let lineBuffer = '';

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

      const doneEvent: OutputEvent = { kind: 'done', exitCode: code ?? 0 };
      info.subscribers.forEach((cb) => cb(doneEvent));

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
   * List all currently running taskIds.
   */
  listRunningTasks(): number[] {
    return Array.from(this.processes.keys());
  }

  /**
   * Subscribe to output events for a given taskId.
   * Returns an unsubscribe function.
   */
  subscribeOutput(taskId: number, callback: SubscribeCallback): () => void {
    const info = this.processes.get(taskId);
    if (!info) {
      // Task not found — immediately emit an error and return a no-op unsubscribe
      callback({ kind: 'error', message: `No running process for taskId ${taskId}` });
      return () => {};
    }

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

  // ---- Private helpers ----

  private _notifySubscribers(info: ProcessInfo, event: ClaudeStreamEvent): void {
    if (event.type === 'assistant') {
      const assistantEvent = event as Extract<ClaudeStreamEvent, { type: 'assistant' }>;
      for (const content of assistantEvent.message.content) {
        if (content.type === 'text') {
          const outputEvent: OutputEvent = { kind: 'text', text: content.text };
          info.subscribers.forEach((cb) => cb(outputEvent));
        } else if (content.type === 'tool_use') {
          const outputEvent: OutputEvent = { kind: 'tool_use', name: content.name, input: content.input };
          info.subscribers.forEach((cb) => cb(outputEvent));
        }
      }
    }
    // 'result' and 'system' events are buffered but not forwarded as OutputEvents
    // (done/error are sent on process close)
  }
}
