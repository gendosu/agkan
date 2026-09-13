import { TaskService } from '../services/TaskService';
import { TaskBlockService } from '../services/TaskBlockService';
import { PtySessionService } from '../terminal/PtySessionService';
import { PRIORITY_ORDER } from '../models';
import { resolveLaunchSettings, LaunchSettingsError } from './claudePromptBuilder';
import type { AgentTool } from '../db/config';

export type BulkRunCommand = 'direct' | 'pr';
type BulkRunState = 'idle' | 'running';

export interface BulkRunStatus {
  mode: BulkRunState;
  command: BulkRunCommand | null;
  /** Set when the loop was stopped by a configuration error (not a per-task catalog miss). */
  error?: string;
}

type StateChangeCallback = (status: BulkRunStatus) => void;

const POLL_INTERVAL_MS = 3000;

interface LaunchParams {
  prompt: string;
  ptyCommand: 'pr' | 'run';
  model: string | undefined;
  effort: string | undefined;
  agent: AgentTool;
}

export class BulkRunService {
  private mode: BulkRunState = 'idle';
  private command: BulkRunCommand | null = null;
  private stopRequested = false;
  private stateChangeSubscribers: Set<StateChangeCallback> = new Set();
  private runningChangeUnsub: (() => void) | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  // Tasks whose launch settings could not be resolved. Without this the loop
  // would re-select the same still-'ready' task forever.
  private skippedTaskIds = new Set<number>();
  private error: string | undefined = undefined;

  constructor(
    private ts: TaskService,
    private tbs: TaskBlockService,
    private claudeProcess: PtySessionService,
    private taskService?: TaskService
  ) {}

  getStatus(): BulkRunStatus {
    return { mode: this.mode, command: this.command, error: this.error };
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
    this.skippedTaskIds.clear();
    this.error = undefined;
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
      if (this.skippedTaskIds.has(task.id)) return false;
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

  private waitForRunningToFinish(): void {
    this.runningChangeUnsub?.();
    this.runningChangeUnsub = this.claudeProcess.subscribeRunningTasksChange(() => {
      if (this.claudeProcess.listRunningTasks().length === 0) {
        this.runningChangeUnsub?.();
        this.runningChangeUnsub = null;
        void this.runNext();
      }
    });
  }

  private buildLaunchParams(taskId: number): LaunchParams {
    const command = this.command!;
    const ptyCommand: 'pr' | 'run' = command === 'pr' ? 'pr' : 'run';
    const exitInstruction =
      "\n\nWhen you have completed this task, send 'exit' as a prompt (not as a bash command) to end this session.";
    const prompt =
      command === 'pr'
        ? `Task ID: ${taskId}\n/agkan-subtask${exitInstruction}`
        : `Task ID: ${taskId}\n/agkan-subtask-direct${exitInstruction}`;
    const { agent, model, effort } = resolveLaunchSettings(this.taskService, taskId, 'run');
    return { prompt, ptyCommand, model, effort, agent };
  }

  private async launchTask(taskId: number): Promise<void> {
    // Track whether runNext has already been called to prevent duplicate invocations.
    let advanced = false;
    const advance = (): void => {
      if (!advanced) {
        advanced = true;
        void this.runNext();
      }
    };

    let params: LaunchParams;
    try {
      params = this.buildLaunchParams(taskId);
    } catch (e) {
      if (e instanceof LaunchSettingsError && e.source === 'task') {
        // Task-level catalog miss (e.g. a stale model_run/effort_run override):
        // skip this task and let the loop move on to the next ready one.
        console.error(`[BulkRunService] skipping taskId=${taskId}: ${e.message}`);
        this.skippedTaskIds.add(taskId);
        advance();
        return;
      }
      // Anything else means the .agkan.yml configuration itself (modelCatalog,
      // agent, or a models.*.effort outside the catalog) is broken. Skipping would just repeat for every remaining ready task, so
      // stop the run instead and surface the error via the status notification.
      const message = e instanceof Error ? e.message : String(e);
      console.error(`[BulkRunService] stopping bulk run: ${message}`);
      this.error = message;
      this.finishLoop();
      return;
    }
    const { prompt, ptyCommand, model, effort, agent } = params;

    try {
      await this.claudeProcess.startProcess(taskId, prompt, ptyCommand, model, effort, agent);
    } catch {
      advance();
      return;
    }

    // subscribeOutput always fires the callback (done or error) even when the session
    // has already exited (fixed in PtySessionService), so the loop is guaranteed to proceed.
    // Use let so the callback can safely reference unsubscribe even when the callback fires
    // synchronously before the assignment completes (fast-exit / no-session path).
    let unsubscribe: (() => void) | undefined;
    unsubscribe = this.claudeProcess.subscribeOutput(taskId, (evt) => {
      if (evt.kind === 'done' || evt.kind === 'error') {
        if (evt.kind === 'done' && evt.exitCode === 0 && !this.claudeProcess.isExplicitUserStop(taskId)) {
          this.ts.updateTask(taskId, { status: 'done' });
        }
        unsubscribe?.();
        advance();
      }
    });
  }

  private async runNext(): Promise<void> {
    if (this.stopRequested) {
      this.finishLoop();
      return;
    }
    if (this.claudeProcess.listRunningTasks().length > 0) {
      this.waitForRunningToFinish();
      return;
    }
    const taskId = this.selectNextTask();
    if (taskId === null) {
      this.scheduleNextPoll();
      return;
    }
    await this.launchTask(taskId);
  }
}
