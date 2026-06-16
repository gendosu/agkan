/**
 * Tests for BulkRunService: task selection logic, stop flag, blocker exclusion
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BulkRunService } from '../../src/board/BulkRunService';
import { TaskService } from '../../src/services/TaskService';
import { TaskBlockService } from '../../src/services/TaskBlockService';
import { PtySessionService } from '../../src/terminal/PtySessionService';
import { resetDatabase } from '../../src/db/reset';
import { getStorageBackend } from '../../src/db/connection';

type OutputCallback = (event: { kind: 'done'; exitCode: number } | { kind: 'error'; message: string }) => void;

function buildMockPty(overrides?: Partial<PtySessionService>): PtySessionService {
  return {
    startProcess: vi.fn().mockResolvedValue(undefined),
    stopProcess: vi.fn().mockReturnValue(true),
    listRunningTasks: vi.fn().mockReturnValue([]),
    subscribeOutput: vi.fn().mockReturnValue(() => {}),
    subscribeRunningTasksChange: vi.fn().mockReturnValue(() => {}),
    subscribeCompletionConfirm: vi.fn().mockReturnValue(() => {}),
    notifyCompletionConfirm: vi.fn(),
    isUserStopped: vi.fn().mockReturnValue(false),
    getRunLogs: vi.fn().mockReturnValue([]),
    ...overrides,
  } as unknown as PtySessionService;
}

beforeEach(() => {
  resetDatabase();
});

describe('BulkRunService task selection', () => {
  it('selects highest priority ready task with no blockers', async () => {
    const db = getStorageBackend();
    const ts = new TaskService(db);
    const tbs = new TaskBlockService(db);

    ts.createTask({ title: 'low task', status: 'ready', priority: 'low' });
    const high = ts.createTask({ title: 'high task', status: 'ready', priority: 'high' });
    ts.createTask({ title: 'medium task', status: 'ready', priority: 'medium' });

    const startProcess = vi.fn().mockResolvedValue(undefined);
    const pty = buildMockPty({ startProcess });
    const service = new BulkRunService(ts, tbs, pty);
    await service.start('direct');

    expect(startProcess).toHaveBeenCalledWith(high.id, expect.any(String), 'run', undefined, undefined);
  });

  it('excludes tasks with unresolved blockers', async () => {
    const db = getStorageBackend();
    const ts = new TaskService(db);
    const tbs = new TaskBlockService(db);

    const blocker = ts.createTask({ title: 'blocker', status: 'in_progress', priority: 'high' });
    const blocked = ts.createTask({ title: 'blocked', status: 'ready', priority: 'critical' });
    const free = ts.createTask({ title: 'free', status: 'ready', priority: 'low' });

    tbs.addBlock({ blocker_task_id: blocker.id, blocked_task_id: blocked.id });

    const startProcess = vi.fn().mockResolvedValue(undefined);
    const pty = buildMockPty({ startProcess });
    const service = new BulkRunService(ts, tbs, pty);
    await service.start('direct');

    // Should pick the free task (not the blocked one, even though it has higher priority)
    expect(startProcess).toHaveBeenCalledWith(free.id, expect.any(String), 'run', undefined, undefined);
    expect(startProcess).not.toHaveBeenCalledWith(
      blocked.id,
      expect.any(String),
      expect.any(String),
      undefined,
      undefined
    );
  });

  it('includes tasks whose blockers are done', async () => {
    const db = getStorageBackend();
    const ts = new TaskService(db);
    const tbs = new TaskBlockService(db);

    const blocker = ts.createTask({ title: 'done blocker', status: 'done', priority: 'high' });
    const blocked = ts.createTask({ title: 'ready task', status: 'ready', priority: 'critical' });

    tbs.addBlock({ blocker_task_id: blocker.id, blocked_task_id: blocked.id });

    const startProcess = vi.fn().mockResolvedValue(undefined);
    const pty = buildMockPty({ startProcess });
    const service = new BulkRunService(ts, tbs, pty);
    await service.start('direct');

    expect(startProcess).toHaveBeenCalledWith(blocked.id, expect.any(String), 'run', undefined, undefined);
  });

  it('includes tasks whose blockers are in review', async () => {
    const db = getStorageBackend();
    const ts = new TaskService(db);
    const tbs = new TaskBlockService(db);

    const blocker = ts.createTask({ title: 'review blocker', status: 'review', priority: 'high' });
    const blocked = ts.createTask({ title: 'ready task', status: 'ready', priority: 'critical' });

    tbs.addBlock({ blocker_task_id: blocker.id, blocked_task_id: blocked.id });

    const startProcess = vi.fn().mockResolvedValue(undefined);
    const pty = buildMockPty({ startProcess });
    const service = new BulkRunService(ts, tbs, pty);
    await service.start('direct');

    expect(startProcess).toHaveBeenCalledWith(blocked.id, expect.any(String), 'run', undefined, undefined);
  });

  it('stays running and polls when no ready tasks remain', async () => {
    vi.useFakeTimers();
    const db = getStorageBackend();
    const ts = new TaskService(db);
    const tbs = new TaskBlockService(db);

    const pty = buildMockPty();
    const service = new BulkRunService(ts, tbs, pty);

    const stateChanges: string[] = [];
    service.subscribeStateChange((s) => stateChanges.push(s.mode));

    await service.start('direct');

    expect(stateChanges).toContain('running');
    expect(service.getStatus().mode).toBe('running');

    vi.useRealTimers();
    service.stop();
  });

  it('picks up new ready task added during polling', async () => {
    vi.useFakeTimers();
    const db = getStorageBackend();
    const ts = new TaskService(db);
    const tbs = new TaskBlockService(db);

    const startProcess = vi.fn().mockResolvedValue(undefined);
    const pty = buildMockPty({ startProcess });
    const service = new BulkRunService(ts, tbs, pty);

    await service.start('direct');
    expect(startProcess).not.toHaveBeenCalled();
    expect(service.getStatus().mode).toBe('running');

    const newTask = ts.createTask({ title: 'new task', status: 'ready', priority: 'medium' });

    await vi.advanceTimersByTimeAsync(3000);

    expect(startProcess).toHaveBeenCalledWith(newTask.id, expect.any(String), 'run', undefined, undefined);

    vi.useRealTimers();
    service.stop();
  });

  it('transitions to idle on stop when polling with no ready tasks', async () => {
    vi.useFakeTimers();
    const db = getStorageBackend();
    const ts = new TaskService(db);
    const tbs = new TaskBlockService(db);

    const startProcess = vi.fn().mockResolvedValue(undefined);
    const pty = buildMockPty({ startProcess });
    const service = new BulkRunService(ts, tbs, pty);

    const stateChanges: string[] = [];
    service.subscribeStateChange((s) => stateChanges.push(s.mode));

    await service.start('direct');
    expect(service.getStatus().mode).toBe('running');

    service.stop();

    expect(service.getStatus().mode).toBe('idle');
    expect(stateChanges[stateChanges.length - 1]).toBe('idle');

    // Timer should be cleared — adding a ready task and advancing time must not trigger startProcess
    ts.createTask({ title: 'new task', status: 'ready', priority: 'medium' });
    await vi.advanceTimersByTimeAsync(3000);
    expect(startProcess).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('stop() sets mode to idle after current task finishes', async () => {
    const db = getStorageBackend();
    const ts = new TaskService(db);
    const tbs = new TaskBlockService(db);

    ts.createTask({ title: 'task 1', status: 'ready', priority: 'medium' });
    ts.createTask({ title: 'task 2', status: 'ready', priority: 'medium' });

    let outputCallback: OutputCallback | null = null;
    const subscribeOutput = vi.fn().mockImplementation((_id: number, cb: OutputCallback) => {
      outputCallback = cb;
      return () => {};
    });
    const startProcess = vi.fn().mockResolvedValue(undefined);
    const pty = buildMockPty({ startProcess, subscribeOutput });
    const service = new BulkRunService(ts, tbs, pty);

    await service.start('direct');
    expect(startProcess).toHaveBeenCalledTimes(1);

    // Set stop before process exits
    service.stop();

    // Simulate process exit
    outputCallback?.({ kind: 'done', exitCode: 0 });

    // After exit with stop flag, should go idle without starting next task
    await Promise.resolve();
    expect(startProcess).toHaveBeenCalledTimes(1);
    expect(service.getStatus().mode).toBe('idle');
  });

  it('uses pr command when started with pr', async () => {
    const db = getStorageBackend();
    const ts = new TaskService(db);
    const tbs = new TaskBlockService(db);

    ts.createTask({ title: 'task', status: 'ready', priority: 'medium' });

    const startProcess = vi.fn().mockResolvedValue(undefined);
    const pty = buildMockPty({ startProcess });
    const service = new BulkRunService(ts, tbs, pty);
    await service.start('pr');

    expect(startProcess).toHaveBeenCalledWith(
      expect.any(Number),
      expect.stringContaining('/agkan-subtask'),
      'pr',
      undefined,
      undefined
    );
  });

  it('returns error when already running', async () => {
    const db = getStorageBackend();
    const ts = new TaskService(db);
    const tbs = new TaskBlockService(db);

    ts.createTask({ title: 'task', status: 'ready', priority: 'medium' });

    let outputCallback: OutputCallback | null = null;
    const subscribeOutput = vi.fn().mockImplementation((_id: number, cb: OutputCallback) => {
      outputCallback = cb;
      return () => {};
    });
    const pty = buildMockPty({ subscribeOutput });
    const service = new BulkRunService(ts, tbs, pty);

    await service.start('direct');
    expect(outputCallback).not.toBeNull();

    const result = await service.start('direct');
    expect(result.error).toBe('Bulk run already in progress');
  });
});

describe('BulkRunService - Run all loop continuity regression', () => {
  /**
   * These tests verify that the Run-all loop always advances to the next task
   * regardless of how the current process terminates.
   *
   * Each scenario uses a subscribeOutput mock that can fire callbacks imperatively,
   * mirroring the fixed PtySessionService behaviour where the callback is always invoked.
   */

  it('runs all ready tasks sequentially (normal completion)', async () => {
    const db = getStorageBackend();
    const ts = new TaskService(db);
    const tbs = new TaskBlockService(db);

    const task1 = ts.createTask({ title: 'task 1', status: 'ready', priority: 'high' });
    const task2 = ts.createTask({ title: 'task 2', status: 'ready', priority: 'medium' });
    const task3 = ts.createTask({ title: 'task 3', status: 'ready', priority: 'low' });

    // Simulate tasks moving out of ready when startProcess is called
    const startProcess = vi.fn().mockImplementation(async (taskId: number) => {
      ts.updateTask(taskId, { status: 'in_progress' });
    });

    const outputCallbacks: Map<number, OutputCallback> = new Map();
    const subscribeOutput = vi.fn().mockImplementation((taskId: number, cb: OutputCallback) => {
      outputCallbacks.set(taskId, cb);
      return () => outputCallbacks.delete(taskId);
    });

    const listRunningTasks = vi.fn().mockReturnValue([]);

    const pty = buildMockPty({ startProcess, subscribeOutput, listRunningTasks });
    const service = new BulkRunService(ts, tbs, pty);

    await service.start('direct');

    // task1 should have started
    expect(startProcess).toHaveBeenCalledWith(task1.id, expect.any(String), 'run', undefined, undefined);

    // Simulate task1 completing
    outputCallbacks.get(task1.id)?.({ kind: 'done', exitCode: 0 });
    await Promise.resolve(); // flush micro-tasks

    // task2 should have started
    expect(startProcess).toHaveBeenCalledWith(task2.id, expect.any(String), 'run', undefined, undefined);

    // Simulate task2 completing
    outputCallbacks.get(task2.id)?.({ kind: 'done', exitCode: 0 });
    await Promise.resolve();

    // task3 should have started
    expect(startProcess).toHaveBeenCalledWith(task3.id, expect.any(String), 'run', undefined, undefined);

    // Simulate task3 completing
    outputCallbacks.get(task3.id)?.({ kind: 'done', exitCode: 0 });
    await Promise.resolve();

    expect(startProcess).toHaveBeenCalledTimes(3);
    service.stop();
  });

  it('advances loop when subscribeOutput fires error (fast-exit / no session)', async () => {
    const db = getStorageBackend();
    const ts = new TaskService(db);
    const tbs = new TaskBlockService(db);

    const task1 = ts.createTask({ title: 'task 1', status: 'ready', priority: 'high' });
    const task2 = ts.createTask({ title: 'task 2', status: 'ready', priority: 'low' });

    const startProcess = vi.fn().mockImplementation(async (taskId: number) => {
      ts.updateTask(taskId, { status: 'in_progress' });
    });

    // Simulates PtySessionService fixed behaviour: immediately fires error when session
    // is not found (process exited before subscription).
    const subscribeOutput = vi.fn().mockImplementation((_taskId: number, cb: OutputCallback) => {
      cb({ kind: 'error', message: 'No session found' });
      return () => {};
    });

    const pty = buildMockPty({ startProcess, subscribeOutput });
    const service = new BulkRunService(ts, tbs, pty);

    await service.start('direct');
    // Flush multiple micro-task rounds: subscribeOutput fires synchronously inside
    // launchTask which schedules runNext → launchTask chain asynchronously.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Both tasks must have been launched despite the immediate error
    expect(startProcess).toHaveBeenCalledWith(task1.id, expect.any(String), 'run', undefined, undefined);
    expect(startProcess).toHaveBeenCalledWith(task2.id, expect.any(String), 'run', undefined, undefined);

    service.stop();
  });

  it('advances loop when user stops a running task (stopProcess fires done before clear)', async () => {
    const db = getStorageBackend();
    const ts = new TaskService(db);
    const tbs = new TaskBlockService(db);

    const task1 = ts.createTask({ title: 'task 1', status: 'ready', priority: 'high' });
    const task2 = ts.createTask({ title: 'task 2', status: 'ready', priority: 'low' });

    const startProcess = vi.fn().mockImplementation(async (taskId: number) => {
      ts.updateTask(taskId, { status: 'in_progress' });
    });

    const outputCallbacks: Map<number, OutputCallback> = new Map();
    const subscribeOutput = vi.fn().mockImplementation((taskId: number, cb: OutputCallback) => {
      outputCallbacks.set(taskId, cb);
      return () => outputCallbacks.delete(taskId);
    });

    // Simulates stopProcess notifying subscribers before clearing (fixed behaviour)
    const stopProcess = vi.fn().mockImplementation((taskId: number) => {
      const cb = outputCallbacks.get(taskId);
      if (cb) {
        cb({ kind: 'done', exitCode: 0 });
        outputCallbacks.delete(taskId);
      }
      return true;
    });

    const pty = buildMockPty({ startProcess, subscribeOutput, stopProcess });
    const service = new BulkRunService(ts, tbs, pty);

    await service.start('direct');

    // task1 should have started
    expect(startProcess).toHaveBeenCalledWith(task1.id, expect.any(String), 'run', undefined, undefined);
    expect(outputCallbacks.has(task1.id)).toBe(true);

    // User stops task1 — this must fire the done callback and allow the loop to advance
    stopProcess(task1.id);
    await Promise.resolve();

    // task2 should now have started
    expect(startProcess).toHaveBeenCalledWith(task2.id, expect.any(String), 'run', undefined, undefined);

    // Simulate task2 completing normally
    outputCallbacks.get(task2.id)?.({ kind: 'done', exitCode: 0 });
    await Promise.resolve();

    expect(startProcess).toHaveBeenCalledTimes(2);
    service.stop();
  });
});

describe('BulkRunService API routes', () => {
  it('POST /api/claude/bulk-run starts bulk run', async () => {
    const { Hono } = await import('hono');
    const { registerBoardRoutes } = await import('../../src/board/boardRoutes');

    const db = getStorageBackend();
    const { TaskTagService } = await import('../../src/services/TaskTagService');
    const { TagService } = await import('../../src/services/TagService');
    const { MetadataService } = await import('../../src/services/MetadataService');
    const { CommentService } = await import('../../src/services/CommentService');

    const ts = new TaskService(db);
    const tbs = new TaskBlockService(db);

    const app = new Hono();
    registerBoardRoutes(app, {
      ts,
      tts: new TaskTagService(db),
      tags: new TagService(db),
      ms: new MetadataService(db),
      cs: new CommentService(db),
      tbs,
      database: db,
      configDir: '/tmp/test-bulk-run',
      ptySessionService: buildMockPty(),
    });

    const res = await app.request('/api/claude/bulk-run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: 'direct' }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { started: boolean };
    expect(data.started).toBe(true);
  });

  it('POST /api/claude/bulk-run/stop returns stopped', async () => {
    const { Hono } = await import('hono');
    const { registerBoardRoutes } = await import('../../src/board/boardRoutes');

    const db = getStorageBackend();
    const { TaskTagService } = await import('../../src/services/TaskTagService');
    const { TagService } = await import('../../src/services/TagService');
    const { MetadataService } = await import('../../src/services/MetadataService');
    const { CommentService } = await import('../../src/services/CommentService');

    const ts = new TaskService(db);
    const tbs = new TaskBlockService(db);

    const app = new Hono();
    registerBoardRoutes(app, {
      ts,
      tts: new TaskTagService(db),
      tags: new TagService(db),
      ms: new MetadataService(db),
      cs: new CommentService(db),
      tbs,
      database: db,
      configDir: '/tmp/test-bulk-run-stop',
      ptySessionService: buildMockPty(),
    });

    const res = await app.request('/api/claude/bulk-run/stop', { method: 'POST' });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { stopped: boolean };
    expect(data.stopped).toBe(true);
  });
});
