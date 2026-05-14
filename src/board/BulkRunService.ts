import { TaskService } from '../services/TaskService';
import { TaskBlockService } from '../services/TaskBlockService';
import { PtySessionService } from '../terminal/PtySessionService';
import { loadConfig } from '../db/config';
import { PRIORITY_ORDER } from '../models';

export type BulkRunCommand = 'direct' | 'pr';
type BulkRunState = 'idle' | 'running';

export interface BulkRunStatus {
  mode: BulkRunState;
  command: BulkRunCommand | null;
}

type StateChangeCallback = (status: BulkRunStatus) => void;

const POLL_INTERVAL_MS = 3000;

export class BulkRunService {
  private mode: BulkRunState = 'idle';
  private command: BulkRunCommand | null = null;
  private stopRequested = false;
  private stateChangeSubscribers: Set<StateChangeCallback> = new Set();
  private runningChangeUnsub: (() => void) | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private ts: TaskService,
    private tbs: TaskBlockService,
    private claudeProcess: PtySessionService
  ) {}

  getStatus(): BulkRunStatus {
    return { mode: this.mode, command: this.command };
  }

  subscribeStateChange(callback: StateChangeCallback): () => void {
    this.stateChangeSubscribers.add(callback);
    return () => this.stateChangeSubscribers.delete(callback);
  }

  private notifyStateChange(): void {
    const status = this.getStatus();
    this.stateChangeSubscribers.forEach((cb) => cb(status));
  }

  async start(command: BulkRunCommand): Promise<{ error?: string }> {
    if (this.mode === 'running') {
      return { error: 'Bulk run already in progress' };
    }
    this.mode = 'running';
    this.command = command;
    this.stopRequested = false;
    this.notifyStateChange();
    void this.runNext();
    return {};
  }

  stop(): void {
    this.stopRequested = true;
    this.runningChangeUnsub?.();
    this.runningChangeUnsub = null;
    if (this.pollTimer !== null) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.mode === 'running') {
      this.mode = 'idle';
      this.command = null;
      this.notifyStateChange();
    }
  }

  private selectNextTask(): number | null {
    const tasks = this.ts.listTasks({ status: 'ready' }, 'id', 'asc');
    const allBlocks = this.tbs.getAllBlocks();

    // Build map of blocked_task_id -> blocker_task_ids
    const blockedByMap = new Map<number, number[]>();
    for (const block of allBlocks) {
      if (!blockedByMap.has(block.blocked_task_id)) {
        blockedByMap.set(block.blocked_task_id, []);
      }
      blockedByMap.get(block.blocked_task_id)!.push(block.blocker_task_id);
    }

    const available = tasks.filter((task) => {
      const blockerIds = blockedByMap.get(task.id) ?? [];
      return blockerIds.every((bid) => {
        const blocker = this.ts.getTask(bid);
        return !blocker || blocker.status === 'done' || blocker.status === 'closed' || blocker.status === 'review';
      });
    });

    available.sort((a, b) => {
      const oa = a.priority ? (PRIORITY_ORDER[a.priority] ?? 4) : 4;
      const ob = b.priority ? (PRIORITY_ORDER[b.priority] ?? 4) : 4;
      if (oa !== ob) return oa - ob;
      return a.id - b.id;
    });

    return available.length > 0 ? available[0].id : null;
  }

  private finishLoop(): void {
    this.runningChangeUnsub?.();
    this.runningChangeUnsub = null;
    if (this.pollTimer !== null) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.mode !== 'idle') {
      this.mode = 'idle';
      this.command = null;
      this.notifyStateChange();
    }
  }

  private scheduleNextPoll(): void {
    this.pollTimer = setTimeout(() => {
      this.pollTimer = null;
      void this.runNext();
    }, POLL_INTERVAL_MS);
  }

  private async runNext(): Promise<void> {
    if (this.stopRequested) {
      this.finishLoop();
      return;
    }

    // If another process is already running, wait for it to finish
    const running = this.claudeProcess.listRunningTasks();
    if (running.length > 0) {
      this.runningChangeUnsub?.();
      this.runningChangeUnsub = this.claudeProcess.subscribeRunningTasksChange(() => {
        if (this.claudeProcess.listRunningTasks().length === 0) {
          this.runningChangeUnsub?.();
          this.runningChangeUnsub = null;
          void this.runNext();
        }
      });
      return;
    }

    const taskId = this.selectNextTask();
    if (taskId === null) {
      this.scheduleNextPoll();
      return;
    }

    const command = this.command!;
    const ptyCommand = command === 'pr' ? 'pr' : 'run';
    const prompt =
      command === 'pr' ? `Task ID: ${taskId}\n/agkan-subtask` : `Task ID: ${taskId}\n/agkan-subtask-direct`;

    const config = loadConfig();
    const rawConfig = config.models?.run;
    const model = rawConfig?.model?.trim() || undefined;
    const effort = rawConfig?.effort?.trim() || undefined;

    try {
      await this.claudeProcess.startProcess(taskId, prompt, ptyCommand, model, effort);
    } catch {
      // Start failed - try next task
      void this.runNext();
      return;
    }

    // When this task's process exits, run next
    const unsubscribe = this.claudeProcess.subscribeOutput(taskId, (evt) => {
      if (evt.kind === 'done' || evt.kind === 'error') {
        unsubscribe();
        void this.runNext();
      }
    });
  }
}
