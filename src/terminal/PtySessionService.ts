import * as pty from 'node-pty';
import { execSync } from 'child_process';
import type { StorageBackend, RunLogRow } from '../db/types/repository';
import type { RunLog, OutputEvent as ClaudeOutputEvent } from '../services/ClaudeProcessService';
import { ConflictError } from '../errors';
import { ensureBoardHookSettings } from '../hooks/claudeHookSettings';
import { getHookToken } from '../utils/hookToken';
import { AttentionStateService } from '../services/AttentionStateService';

function resolveClaudePath(): string {
  try {
    return execSync('which claude', { env: process.env }).toString().trim() || 'claude';
  } catch {
    return 'claude';
  }
}

const CLAUDE_BIN = resolveClaudePath();
const PROMPT_FALLBACK_DELAY_MS = 10000;
const MAX_SNAPSHOT_BYTES = 500_000;
const MAX_COMPLETED_SNAPSHOTS = 10;

type OutputEvent = { kind: 'done'; exitCode: number } | { kind: 'error'; message: string };
type SubscribeCallback = (event: OutputEvent) => void;

interface SessionInfo {
  taskId: number;
  command: string;
  ptyProcess: pty.IPty;
  startedAt: Date;
  outputBuffer: string;
  exitSubscribers: Set<SubscribeCallback>;
  rawOutputSubscribers: Set<(data: string) => void>;
  runLogId: number | null;
  pendingPrompt: string | null;
  promptTimer: ReturnType<typeof setTimeout> | null;
  workspaceTrustHandled: boolean;
}

function hasWorkspaceTrustPrompt(text: string): boolean {
  return /trust.*folder|Do you trust/i.test(text) && /y\/n|yes.*trust/i.test(text);
}

function hasClaudeReadySignal(text: string): boolean {
  return text.includes('bypass permissions');
}

export interface PtySessionServiceOptions {
  boardApiUrl: string;
  attentionStateService: AttentionStateService;
  hookSettingsDataDir: string;
}

export class PtySessionService {
  private sessions: Map<number, SessionInfo> = new Map();
  private completedSnapshots: Map<number, string> = new Map();
  private db: StorageBackend | null;
  private runningTasksChangeSubscribers: Set<() => void> = new Set();
  private boardApiUrl: string | null;
  private attentionStateService: AttentionStateService | null;
  private hookSettingsDataDir: string | null;
  private hookSettingsPath: string | null = null;

  constructor(db?: StorageBackend | null, options?: PtySessionServiceOptions) {
    this.db = db ?? null;
    this.boardApiUrl = options?.boardApiUrl ?? null;
    this.attentionStateService = options?.attentionStateService ?? null;
    this.hookSettingsDataDir = options?.hookSettingsDataDir ?? null;
  }

  setBoardApiUrl(url: string): void {
    this.boardApiUrl = url;
  }

  subscribeRunningTasksChange(callback: () => void): () => void {
    this.runningTasksChangeSubscribers.add(callback);
    return () => {
      this.runningTasksChangeSubscribers.delete(callback);
    };
  }

  private notifyRunningTasksChange(): void {
    this.runningTasksChangeSubscribers.forEach((cb) => cb());
  }

  async startProcess(taskId: number, prompt: string, command = 'run', model?: string, effort?: string): Promise<void> {
    if (this.sessions.has(taskId)) {
      throw new ConflictError(`Process for taskId ${taskId} is already running`);
    }

    // Ensure hook settings file exists if hook integration is configured
    if (this.hookSettingsDataDir !== null && this.hookSettingsPath === null) {
      this.hookSettingsPath = await ensureBoardHookSettings(this.hookSettingsDataDir);
    }

    const modelArgs = model ? ['--model', model] : [];
    const effortArgs = effort ? ['--effort', effort] : [];
    const settingsArgs = this.hookSettingsPath ? ['--settings', this.hookSettingsPath] : [];
    const args = [...settingsArgs, ...modelArgs, ...effortArgs, '--dangerously-skip-permissions'];

    const hookEnv: Record<string, string> = {};
    if (this.boardApiUrl !== null) {
      hookEnv.BOARD_TASK_ID = String(taskId);
      hookEnv.BOARD_API_URL = this.boardApiUrl;
      hookEnv.BOARD_HOOK_TOKEN = getHookToken();
    }

    const ptyProcess = pty.spawn(CLAUDE_BIN, args, {
      name: 'xterm-256color',
      cols: 220,
      rows: 50,
      cwd: process.cwd(),
      env: {
        ...process.env,
        COLORTERM: 'truecolor',
        TERM: 'xterm-256color',
        ...hookEnv,
      },
    });

    const info: SessionInfo = {
      taskId,
      command,
      ptyProcess,
      startedAt: new Date(),
      outputBuffer: '',
      exitSubscribers: new Set(),
      rawOutputSubscribers: new Set(),
      runLogId: null,
      pendingPrompt: prompt,
      promptTimer: null,
      workspaceTrustHandled: false,
    };

    this.sessions.set(taskId, info);
    this.notifyRunningTasksChange();

    if (this.db) {
      info.runLogId = this.db.runLogs.create(taskId, info.startedAt.toISOString());
    }

    // Fallback: send prompt if ready signal never detected within timeout
    info.promptTimer = setTimeout(() => {
      info.promptTimer = null;
      if (info.pendingPrompt !== null && this.sessions.has(taskId)) {
        ptyProcess.write(info.pendingPrompt + '\r');
        info.pendingPrompt = null;
      }
    }, PROMPT_FALLBACK_DELAY_MS);

    ptyProcess.onData((data: string) => {
      info.outputBuffer += data;
      if (info.outputBuffer.length > MAX_SNAPSHOT_BYTES) {
        info.outputBuffer = info.outputBuffer.slice(-MAX_SNAPSHOT_BYTES);
      }

      // Auto-confirm workspace trust
      if (!info.workspaceTrustHandled && hasWorkspaceTrustPrompt(info.outputBuffer)) {
        info.workspaceTrustHandled = true;
        ptyProcess.write('y\r');
      }

      // Send pending prompt as soon as Claude's input prompt is ready
      if (info.pendingPrompt !== null && hasClaudeReadySignal(info.outputBuffer)) {
        if (info.promptTimer !== null) {
          clearTimeout(info.promptTimer);
          info.promptTimer = null;
        }
        ptyProcess.write(info.pendingPrompt + '\r');
        info.pendingPrompt = null;
      }

      info.rawOutputSubscribers.forEach((cb) => cb(data));
    });

    ptyProcess.onExit(({ exitCode }) => {
      const code = exitCode ?? 0;

      if (info.promptTimer !== null) {
        clearTimeout(info.promptTimer);
        info.promptTimer = null;
      }
      info.pendingPrompt = null;

      if (this.db && info.runLogId) {
        const finishedAt = new Date().toISOString();
        const cleanText = info.outputBuffer.replace(/\x1b\[[0-9;]*[mGKHFJlh]/g, '');
        const events = JSON.stringify([{ kind: 'text', text: cleanText }]);
        this.db.runLogs.updateFinished(info.runLogId, finishedAt, code, events);
        const ids = this.db.runLogs.findIdsByTaskId(taskId);
        if (ids.length > 5) {
          this.db.runLogs.deleteMany(ids.slice(5));
        }
      }

      this.completedSnapshots.set(taskId, info.outputBuffer);
      if (this.completedSnapshots.size > MAX_COMPLETED_SNAPSHOTS) {
        const firstKey = this.completedSnapshots.keys().next().value!;
        this.completedSnapshots.delete(firstKey);
      }

      const doneEvent: OutputEvent = { kind: 'done', exitCode: code };
      info.exitSubscribers.forEach((cb) => cb(doneEvent));

      this.attentionStateService?.clearTask(taskId);

      if (this.sessions.get(taskId) === info) {
        this.sessions.delete(taskId);
        this.notifyRunningTasksChange();
      }
    });
  }

  stopProcess(taskId: number): boolean {
    const info = this.sessions.get(taskId);
    if (!info) return false;
    if (info.promptTimer !== null) {
      clearTimeout(info.promptTimer);
      info.promptTimer = null;
    }
    info.pendingPrompt = null;
    info.exitSubscribers.clear();
    info.ptyProcess.kill();
    this.sessions.delete(taskId);
    this.attentionStateService?.clearTask(taskId);
    this.notifyRunningTasksChange();
    return true;
  }

  listRunningTasks(): { taskId: number; command: string }[] {
    return Array.from(this.sessions.values()).map((s) => ({ taskId: s.taskId, command: s.command }));
  }

  getSnapshot(taskId: number): string {
    return this.sessions.get(taskId)?.outputBuffer ?? this.completedSnapshots.get(taskId) ?? '';
  }

  subscribeOutput(taskId: number, callback: SubscribeCallback): () => void {
    const info = this.sessions.get(taskId);
    if (!info) {
      if (this.db) {
        const row = this.db.runLogs.findLatestByTaskId(taskId);
        if (row) {
          callback({ kind: 'done', exitCode: row.exit_code ?? 0 });
          return () => {};
        }
      }
      return () => {};
    }
    info.exitSubscribers.add(callback);
    return () => {
      info.exitSubscribers.delete(callback);
    };
  }

  subscribeRawOutput(taskId: number, callback: (data: string) => void): () => void {
    const info = this.sessions.get(taskId);
    if (!info) return () => {};
    info.rawOutputSubscribers.add(callback);
    return () => {
      info.rawOutputSubscribers.delete(callback);
    };
  }

  resize(taskId: number, cols: number, rows: number): void {
    this.sessions.get(taskId)?.ptyProcess.resize(cols, rows);
  }

  writeInput(taskId: number, data: string): void {
    this.sessions.get(taskId)?.ptyProcess.write(data);
  }

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
      events: JSON.parse(r.events) as ClaudeOutputEvent[],
    }));
  }
}
