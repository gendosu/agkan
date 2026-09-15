/**
 * Tests for `agkan task run-all`: CLI equivalent of Board's bulk "Run all"
 * feature (BulkRunService), but stopping the whole run on the first failure
 * instead of continuing to the next ready task.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Command } from 'commander';
import fs from 'fs';
import os from 'os';
import path from 'path';
import yaml from 'js-yaml';
import { runCommand } from '../../../helpers/command-test-utils';
import { setupTaskRunAllCommand, runLoop, previewRunOrder } from '../../../../src/cli/commands/task/run-all';
import { resetDatabase } from '../../../../src/db/reset';
import { getStorageBackend } from '../../../../src/db/connection';
import { TaskService } from '../../../../src/services/TaskService';
import { TaskBlockService } from '../../../../src/services/TaskBlockService';
import type { PtySessionService } from '../../../../src/terminal/PtySessionService';
import type { ServiceContainer } from '../../../../src/cli/utils/service-container';

type OutputCallback = (event: { kind: 'done'; exitCode: number } | { kind: 'error'; message: string }) => void;

function buildMockPty(overrides?: Partial<PtySessionService>): PtySessionService {
  return {
    startProcess: vi.fn().mockResolvedValue(undefined),
    stopProcess: vi.fn().mockReturnValue(true),
    listRunningTasks: vi.fn().mockReturnValue([]),
    subscribeOutput: vi.fn().mockReturnValue(() => {}),
    subscribeRawOutput: vi.fn().mockReturnValue(() => {}),
    resize: vi.fn(),
    isExplicitUserStop: vi.fn().mockReturnValue(false),
    ...overrides,
  } as unknown as PtySessionService;
}

function buildContainer(pty: PtySessionService, ts: TaskService, tbs: TaskBlockService): ServiceContainer {
  return {
    taskService: ts,
    taskBlockService: tbs,
    taskTagService: {} as ServiceContainer['taskTagService'],
    commentService: {} as ServiceContainer['commentService'],
    tagService: {} as ServiceContainer['tagService'],
    metadataService: {} as ServiceContainer['metadataService'],
    ptySessionService: pty,
  };
}

beforeEach(() => {
  resetDatabase();
});

describe('runLoop', () => {
  it('runs the highest priority ready task first, with ptyCommand "run" by default', async () => {
    const db = getStorageBackend();
    const ts = new TaskService(db);
    const tbs = new TaskBlockService(db);
    const low = ts.createTask({ title: 'low task', status: 'ready', priority: 'low' });
    const high = ts.createTask({ title: 'high task', status: 'ready', priority: 'high' });

    const outputCallbacks = new Map<number, OutputCallback>();
    const subscribeOutput = vi.fn().mockImplementation((taskId: number, callback: OutputCallback) => {
      outputCallbacks.set(taskId, callback);
      return () => outputCallbacks.delete(taskId);
    });
    const startProcess = vi.fn().mockResolvedValue(undefined);
    const pty = buildMockPty({ startProcess, subscribeOutput });
    const container = buildContainer(pty, ts, tbs);

    const runPromise = runLoop(container, false);
    await Promise.resolve();
    await Promise.resolve();
    outputCallbacks.get(high.id)?.({ kind: 'done', exitCode: 0 });
    await Promise.resolve();
    await Promise.resolve();
    outputCallbacks.get(low.id)?.({ kind: 'done', exitCode: 0 });
    const exitCode = await runPromise;

    expect(startProcess).toHaveBeenNthCalledWith(1, high.id, expect.any(String), 'run', undefined, undefined, 'claude');
    expect(startProcess).toHaveBeenNthCalledWith(2, low.id, expect.any(String), 'run', undefined, undefined, 'claude');
    expect(exitCode).toBe(0);
    expect(ts.getTask(high.id)?.status).toBe('done');
  });

  it('streams live raw PTY output to stdout as it arrives, not just a completion summary', async () => {
    const db = getStorageBackend();
    const ts = new TaskService(db);
    const tbs = new TaskBlockService(db);
    ts.createTask({ title: 'task', status: 'ready', priority: 'medium' });

    let outputCb: OutputCallback | null = null;
    let rawCb: ((data: string) => void) | null = null;
    const subscribeOutput = vi.fn().mockImplementation((_id: number, callback: OutputCallback) => {
      outputCb = callback;
      return () => {};
    });
    const unsubscribeRaw = vi.fn();
    const subscribeRawOutput = vi.fn().mockImplementation((_id: number, callback: (data: string) => void) => {
      rawCb = callback;
      return unsubscribeRaw;
    });
    const startProcess = vi.fn().mockResolvedValue(undefined);
    const pty = buildMockPty({ startProcess, subscribeOutput, subscribeRawOutput });
    const container = buildContainer(pty, ts, tbs);

    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      const runPromise = runLoop(container, false);
      await Promise.resolve();
      await Promise.resolve();

      // Raw chunks arrive before the task finishes — this is what proves it's a live
      // stream rather than something derived from the eventual done/error event.
      rawCb!('hello from agent\n');
      rawCb!('still working...\n');
      expect(writeSpy).toHaveBeenCalledWith('hello from agent\n');
      expect(writeSpy).toHaveBeenCalledWith('still working...\n');
      expect(unsubscribeRaw).not.toHaveBeenCalled();

      outputCb!({ kind: 'done', exitCode: 0 });
      await runPromise;

      // Subscription is torn down once the task completes so it doesn't leak into
      // the next iteration of the sequential loop.
      expect(unsubscribeRaw).toHaveBeenCalledTimes(1);
    } finally {
      writeSpy.mockRestore();
    }
  });

  it('uses ptyCommand "pr" when --with-pr is set', async () => {
    const db = getStorageBackend();
    const ts = new TaskService(db);
    const tbs = new TaskBlockService(db);
    const task = ts.createTask({ title: 'task', status: 'ready', priority: 'medium' });

    let cb: OutputCallback | null = null;
    const subscribeOutput = vi.fn().mockImplementation((_id: number, callback: OutputCallback) => {
      cb = callback;
      return () => {};
    });
    const startProcess = vi.fn().mockResolvedValue(undefined);
    const pty = buildMockPty({ startProcess, subscribeOutput });
    const container = buildContainer(pty, ts, tbs);

    const runPromise = runLoop(container, true);
    await Promise.resolve();
    await Promise.resolve();
    cb!({ kind: 'done', exitCode: 0 });
    await runPromise;

    // Negative lookahead so this doesn't also match the direct-mode prompt's
    // '/agkan-subtask-direct' — proving the pr/direct prompts actually differ, not just
    // that both happen to contain the shared '/agkan-subtask' prefix.
    expect(startProcess).toHaveBeenCalledWith(
      task.id,
      expect.stringMatching(/\/agkan-subtask(?!-direct)/),
      'pr',
      undefined,
      undefined,
      'claude'
    );
  });

  it('resizes the PTY to match a TTY stdout after starting the process', async () => {
    const db = getStorageBackend();
    const ts = new TaskService(db);
    const tbs = new TaskBlockService(db);
    const task = ts.createTask({ title: 'task', status: 'ready', priority: 'medium' });

    let cb: OutputCallback | null = null;
    const subscribeOutput = vi.fn().mockImplementation((_id: number, callback: OutputCallback) => {
      cb = callback;
      return () => {};
    });
    const startProcess = vi.fn().mockResolvedValue(undefined);
    const resize = vi.fn();
    const pty = buildMockPty({ startProcess, subscribeOutput, resize });
    const container = buildContainer(pty, ts, tbs);

    const originalColumns = process.stdout.columns;
    const originalRows = process.stdout.rows;
    process.stdout.columns = 120;
    process.stdout.rows = 40;
    try {
      const runPromise = runLoop(container, false);
      await Promise.resolve();
      await Promise.resolve();
      cb!({ kind: 'done', exitCode: 0 });
      await runPromise;

      expect(resize).toHaveBeenCalledWith(task.id, 120, 40);
    } finally {
      process.stdout.columns = originalColumns;
      process.stdout.rows = originalRows;
    }
  });

  it('does not resize when stdout is not a TTY (columns/rows undefined)', async () => {
    const db = getStorageBackend();
    const ts = new TaskService(db);
    const tbs = new TaskBlockService(db);
    ts.createTask({ title: 'task', status: 'ready', priority: 'medium' });

    let cb: OutputCallback | null = null;
    const subscribeOutput = vi.fn().mockImplementation((_id: number, callback: OutputCallback) => {
      cb = callback;
      return () => {};
    });
    const startProcess = vi.fn().mockResolvedValue(undefined);
    const resize = vi.fn();
    const pty = buildMockPty({ startProcess, subscribeOutput, resize });
    const container = buildContainer(pty, ts, tbs);

    const originalColumns = process.stdout.columns;
    const originalRows = process.stdout.rows;
    process.stdout.columns = undefined;
    process.stdout.rows = undefined;
    try {
      const runPromise = runLoop(container, false);
      await Promise.resolve();
      await Promise.resolve();
      cb!({ kind: 'done', exitCode: 0 });
      await runPromise;

      expect(resize).not.toHaveBeenCalled();
    } finally {
      process.stdout.columns = originalColumns;
      process.stdout.rows = originalRows;
    }
  });

  it('runs multiple ready tasks sequentially until none remain', async () => {
    const db = getStorageBackend();
    const ts = new TaskService(db);
    const tbs = new TaskBlockService(db);
    const task1 = ts.createTask({ title: 'task 1', status: 'ready', priority: 'high' });
    const task2 = ts.createTask({ title: 'task 2', status: 'ready', priority: 'low' });

    const startProcess = vi.fn().mockImplementation(async (taskId: number) => {
      ts.updateTask(taskId, { status: 'in_progress' });
    });
    const outputCallbacks = new Map<number, OutputCallback>();
    const subscribeOutput = vi.fn().mockImplementation((taskId: number, callback: OutputCallback) => {
      outputCallbacks.set(taskId, callback);
      return () => outputCallbacks.delete(taskId);
    });
    const pty = buildMockPty({ startProcess, subscribeOutput });
    const container = buildContainer(pty, ts, tbs);

    const runPromise = runLoop(container, false);
    await Promise.resolve();
    await Promise.resolve();
    outputCallbacks.get(task1.id)?.({ kind: 'done', exitCode: 0 });
    await Promise.resolve();
    await Promise.resolve();
    outputCallbacks.get(task2.id)?.({ kind: 'done', exitCode: 0 });
    const exitCode = await runPromise;

    expect(startProcess).toHaveBeenCalledTimes(2);
    expect(exitCode).toBe(0);
  });

  it('stops the loop and returns a non-zero exit code on an error event', async () => {
    const db = getStorageBackend();
    const ts = new TaskService(db);
    const tbs = new TaskBlockService(db);
    ts.createTask({ title: 'task 1', status: 'ready', priority: 'high' });
    ts.createTask({ title: 'task 2', status: 'ready', priority: 'low' });

    const startProcess = vi.fn().mockResolvedValue(undefined);
    const subscribeOutput = vi.fn().mockImplementation((_id: number, callback: OutputCallback) => {
      callback({ kind: 'error', message: 'boom' });
      return () => {};
    });
    const pty = buildMockPty({ startProcess, subscribeOutput });
    const container = buildContainer(pty, ts, tbs);

    const exitCode = await runLoop(container, false);

    expect(exitCode).toBe(1);
    expect(startProcess).toHaveBeenCalledTimes(1);
  });

  it('stops the loop and returns a non-zero exit code on a non-zero exitCode', async () => {
    const db = getStorageBackend();
    const ts = new TaskService(db);
    const tbs = new TaskBlockService(db);
    ts.createTask({ title: 'task 1', status: 'ready', priority: 'high' });
    ts.createTask({ title: 'task 2', status: 'ready', priority: 'low' });

    const startProcess = vi.fn().mockResolvedValue(undefined);
    const subscribeOutput = vi.fn().mockImplementation((_id: number, callback: OutputCallback) => {
      callback({ kind: 'done', exitCode: 1 });
      return () => {};
    });
    const pty = buildMockPty({ startProcess, subscribeOutput });
    const container = buildContainer(pty, ts, tbs);

    const exitCode = await runLoop(container, false);

    expect(exitCode).toBe(1);
    expect(startProcess).toHaveBeenCalledTimes(1);
  });

  it('does not update task status when a task fails', async () => {
    const db = getStorageBackend();
    const ts = new TaskService(db);
    const tbs = new TaskBlockService(db);
    const task = ts.createTask({ title: 'task 1', status: 'ready', priority: 'high' });
    const updateTaskSpy = vi.spyOn(ts, 'updateTask');

    const startProcess = vi.fn().mockResolvedValue(undefined);
    const subscribeOutput = vi.fn().mockImplementation((_id: number, callback: OutputCallback) => {
      callback({ kind: 'done', exitCode: 1 });
      return () => {};
    });
    const pty = buildMockPty({ startProcess, subscribeOutput });
    const container = buildContainer(pty, ts, tbs);

    await runLoop(container, false);

    expect(updateTaskSpy).not.toHaveBeenCalledWith(task.id, { status: 'done' });
  });

  it('returns 0 immediately when there is nothing ready to run', async () => {
    const db = getStorageBackend();
    const ts = new TaskService(db);
    const tbs = new TaskBlockService(db);
    const startProcess = vi.fn().mockResolvedValue(undefined);
    const pty = buildMockPty({ startProcess });
    const container = buildContainer(pty, ts, tbs);

    const exitCode = await runLoop(container, false);

    expect(exitCode).toBe(0);
    expect(startProcess).not.toHaveBeenCalled();
  });

  it('skips a task whose model is not in the catalog and continues to the next one', async () => {
    const db = getStorageBackend();
    const ts = new TaskService(db);
    const tbs = new TaskBlockService(db);
    const broken = ts.createTask({ title: 'Broken Model Task', status: 'ready', priority: 'critical' });
    ts.updateTask(broken.id, { model_run: 'gpt-5' });
    const healthy = ts.createTask({ title: 'Healthy Task', status: 'ready', priority: 'high' });

    const startProcess = vi.fn().mockResolvedValue(undefined);
    const subscribeOutput = vi.fn().mockImplementation((_id: number, callback: OutputCallback) => {
      callback({ kind: 'done', exitCode: 0 });
      return () => {};
    });
    const pty = buildMockPty({ startProcess, subscribeOutput });
    const container = buildContainer(pty, ts, tbs);

    const exitCode = await runLoop(container, false);

    expect(startProcess).toHaveBeenCalledTimes(1);
    expect(startProcess).toHaveBeenCalledWith(healthy.id, expect.any(String), 'run', undefined, undefined, 'claude');
    expect(exitCode).toBe(0);
  });

  it('stops the whole run with exit code 1 when the modelCatalog itself is invalid', async () => {
    const db = getStorageBackend();
    const ts = new TaskService(db);
    const tbs = new TaskBlockService(db);
    ts.createTask({ title: 'task 1', status: 'ready', priority: 'high' });
    ts.createTask({ title: 'task 2', status: 'ready', priority: 'low' });

    const startProcess = vi.fn().mockResolvedValue(undefined);
    const pty = buildMockPty({ startProcess });
    const container = buildContainer(pty, ts, tbs);

    const tmpCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'agkan-run-all-test-'));
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpCwd);
    try {
      // Structurally invalid modelCatalog entry (unknown cli): resolveModelCatalog throws a
      // plain Error here, not a LaunchSettingsError — every ready task shares this broken
      // config, so skipping would just repeat the same failure for each one.
      fs.writeFileSync(
        path.join(tmpCwd, '.agkan-test.yml'),
        yaml.dump({ modelCatalog: [{ cli: 'bogus', model: 'x', efforts: [] }] })
      );

      const exitCode = await runLoop(container, false);

      expect(exitCode).toBe(1);
      expect(startProcess).not.toHaveBeenCalled();
    } finally {
      cwdSpy.mockRestore();
      fs.rmSync(tmpCwd, { recursive: true, force: true });
    }
  });

  it('excludes tasks with unresolved blockers (shared selection logic matches Board)', async () => {
    const db = getStorageBackend();
    const ts = new TaskService(db);
    const tbs = new TaskBlockService(db);
    const blocker = ts.createTask({ title: 'blocker', status: 'in_progress', priority: 'high' });
    const blocked = ts.createTask({ title: 'blocked', status: 'ready', priority: 'critical' });
    const free = ts.createTask({ title: 'free', status: 'ready', priority: 'low' });
    tbs.addBlock({ blocker_task_id: blocker.id, blocked_task_id: blocked.id });

    const startProcess = vi.fn().mockResolvedValue(undefined);
    const subscribeOutput = vi.fn().mockImplementation((_id: number, callback: OutputCallback) => {
      callback({ kind: 'done', exitCode: 0 });
      return () => {};
    });
    const pty = buildMockPty({ startProcess, subscribeOutput });
    const container = buildContainer(pty, ts, tbs);

    await runLoop(container, false);

    expect(startProcess).toHaveBeenCalledWith(free.id, expect.any(String), 'run', undefined, undefined, 'claude');
    expect(startProcess).not.toHaveBeenCalledWith(
      blocked.id,
      expect.any(String),
      expect.any(String),
      undefined,
      undefined,
      'claude'
    );
  });
});

describe('previewRunOrder', () => {
  it('returns the full ordered run list without launching anything', () => {
    const db = getStorageBackend();
    const ts = new TaskService(db);
    const tbs = new TaskBlockService(db);
    ts.createTask({ title: 'low task', status: 'ready', priority: 'low' });
    const high = ts.createTask({ title: 'high task', status: 'ready', priority: 'high' });
    const medium = ts.createTask({ title: 'medium task', status: 'ready', priority: 'medium' });

    const preview = previewRunOrder(ts, tbs);

    expect(preview.map((t) => t.id)).toEqual([high.id, medium.id, expect.any(Number)]);
  });

  it('includes a task only blocked by another task earlier in this same preview', () => {
    const db = getStorageBackend();
    const ts = new TaskService(db);
    const tbs = new TaskBlockService(db);
    const a = ts.createTask({ title: 'A', status: 'ready', priority: 'high' });
    const b = ts.createTask({ title: 'B', status: 'ready', priority: 'critical' });
    tbs.addBlock({ blocker_task_id: a.id, blocked_task_id: b.id });

    const preview = previewRunOrder(ts, tbs);

    // B outranks A on priority but is blocked by it; A is still 'ready' in the DB (it
    // hasn't actually run), so the preview must simulate A completing to still include B —
    // that's what the real run would do once A actually finishes.
    expect(preview.map((t) => t.id)).toEqual([a.id, b.id]);
  });

  it('returns an empty list when nothing is ready', () => {
    const db = getStorageBackend();
    const ts = new TaskService(db);
    const tbs = new TaskBlockService(db);

    expect(previewRunOrder(ts, tbs)).toEqual([]);
  });
});

vi.mock('../../../../src/cli/utils/service-container', async () => {
  const actual = await vi.importActual<typeof import('../../../../src/cli/utils/service-container')>(
    '../../../../src/cli/utils/service-container'
  );
  return {
    ...actual,
    getServiceContainer: vi.fn(),
  };
});

function buildRunAllProgram(): Command {
  const program = new Command();
  program.exitOverride();
  program.command('task').description('Task management commands');
  setupTaskRunAllCommand(program);
  return program;
}

describe('setupTaskRunAllCommand (CLI wiring)', () => {
  it('registers --with-pr, --dry-run and --json options', () => {
    const program = buildRunAllProgram();
    const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
    const runAllCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'run-all');
    const optionNames = (runAllCommand?.options ?? []).map((opt) => opt.long);

    expect(optionNames).toContain('--with-pr');
    expect(optionNames).toContain('--dry-run');
    expect(optionNames).toContain('--json');
  });

  it('--dry-run prints the preview and does not launch anything, --json produces parseable JSON', async () => {
    const db = getStorageBackend();
    const ts = new TaskService(db);
    const tbs = new TaskBlockService(db);
    const task = ts.createTask({ title: 'dry run task', status: 'ready', priority: 'high' });

    const startProcess = vi.fn().mockResolvedValue(undefined);
    const pty = buildMockPty({ startProcess });
    const container = buildContainer(pty, ts, tbs);

    const { getServiceContainer } = await import('../../../../src/cli/utils/service-container');
    vi.mocked(getServiceContainer).mockReturnValue(container);

    const program = buildRunAllProgram();
    const { logs, exitCode } = await runCommand(program, ['task', 'run-all', '--dry-run', '--json']);

    expect(startProcess).not.toHaveBeenCalled();
    expect(exitCode).toBeUndefined();
    const parsed = JSON.parse(logs.join('\n')) as { dryRun: boolean; tasks: Array<{ id: number }> };
    expect(parsed.dryRun).toBe(true);
    expect(parsed.tasks.map((t) => t.id)).toEqual([task.id]);
  });
});
