/**
 * Tests for task purge command handler
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Command } from 'commander';
import { setupTaskPurgeCommand } from '../../../../src/cli/commands/task/purge';
import { getDatabase } from '../../../../src/db/connection';
import { TaskService } from '../../../../src/services';

function resetDatabase() {
  const db = getDatabase();
  db.exec('DELETE FROM task_tags');
  db.exec('DELETE FROM task_blocks');
  db.exec('DELETE FROM tasks');
  db.exec("DELETE FROM sqlite_sequence WHERE name='tasks'");
}

/**
 * Force-set updated_at on a task to simulate an old update time.
 */
function setUpdatedAt(taskId: number, updatedAt: string) {
  const db = getDatabase();
  db.prepare('UPDATE tasks SET updated_at = ? WHERE id = ?').run(updatedAt, taskId);
}

describe('setupTaskPurgeCommand', () => {
  let program: Command;
  let taskService: TaskService;

  beforeEach(() => {
    resetDatabase();

    program = new Command();
    program.exitOverride();
    program.command('task').description('Task management commands');
    setupTaskPurgeCommand(program);

    taskService = new TaskService();
  });

  it('should register the purge command', () => {
    const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
    expect(taskCommand).toBeDefined();

    const purgeCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'purge');
    expect(purgeCommand).toBeDefined();
    expect(purgeCommand?.description()).toContain('done/closed');
  });

  it('should have --before, --status, --dry-run, and --json options', () => {
    const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
    const purgeCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'purge');

    const optionNames = (purgeCommand?.options || []).map((opt) => opt.long);
    expect(optionNames).toContain('--before');
    expect(optionNames).toContain('--status');
    expect(optionNames).toContain('--dry-run');
    expect(optionNames).toContain('--json');
  });

  it('should purge done tasks older than --before date', async () => {
    const task = taskService.createTask({ title: 'Old done task', status: 'done' });
    setUpdatedAt(task.id, '2025-06-01T00:00:00.000Z');

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'purge', '--before', '2026-01-01']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('Purged');
    expect(output).toContain('Old done task');

    expect(taskService.getTask(task.id)).toBeNull();
  });

  it('should not purge tasks updated after --before date', async () => {
    const task = taskService.createTask({ title: 'Recent done task', status: 'done' });
    setUpdatedAt(task.id, '2026-06-01T00:00:00.000Z');

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'purge', '--before', '2026-01-01']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('No tasks matched');

    expect(taskService.getTask(task.id)).not.toBeNull();
  });

  it('should not purge tasks with non-target status', async () => {
    const task = taskService.createTask({ title: 'Old ready task', status: 'ready' });
    setUpdatedAt(task.id, '2025-06-01T00:00:00.000Z');

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'purge', '--before', '2026-01-01']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('No tasks matched');

    expect(taskService.getTask(task.id)).not.toBeNull();
  });

  it('should purge only tasks matching --status filter', async () => {
    const doneTask = taskService.createTask({ title: 'Old done task', status: 'done' });
    const closedTask = taskService.createTask({ title: 'Old closed task', status: 'closed' });
    setUpdatedAt(doneTask.id, '2025-06-01T00:00:00.000Z');
    setUpdatedAt(closedTask.id, '2025-06-01T00:00:00.000Z');

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'purge', '--before', '2026-01-01', '--status', 'closed']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    // done task should survive; closed task should be gone
    expect(taskService.getTask(doneTask.id)).not.toBeNull();
    expect(taskService.getTask(closedTask.id)).toBeNull();
  });

  it('should preview tasks with --dry-run and not delete them', async () => {
    const task = taskService.createTask({ title: 'Old done task', status: 'done' });
    setUpdatedAt(task.id, '2025-06-01T00:00:00.000Z');

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'purge', '--before', '2026-01-01', '--dry-run']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('Dry Run');
    expect(output).toContain('Old done task');

    // Task must still exist
    expect(taskService.getTask(task.id)).not.toBeNull();
  });

  it('should output JSON with --json option', async () => {
    const task = taskService.createTask({ title: 'Old done task', status: 'done' });
    setUpdatedAt(task.id, '2025-06-01T00:00:00.000Z');

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'purge', '--before', '2026-01-01', '--json']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const parsed = JSON.parse(consoleLogs[0]);
    expect(parsed.count).toBe(1);
    expect(parsed.dryRun).toBe(false);
    expect(parsed.tasks[0].id).toBe(task.id);
    expect(parsed.tasks[0].status).toBe('done');
  });

  it('should output JSON with --dry-run and --json options', async () => {
    const task = taskService.createTask({ title: 'Old done task', status: 'done' });
    setUpdatedAt(task.id, '2025-06-01T00:00:00.000Z');

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'purge', '--before', '2026-01-01', '--dry-run', '--json']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const parsed = JSON.parse(consoleLogs[0]);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.count).toBe(1);

    // Task must still exist because dry-run
    expect(taskService.getTask(task.id)).not.toBeNull();
  });

  it('should show error on invalid --before date', async () => {
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'purge', '--before', 'not-a-date']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('Invalid date');
  });

  it('should show error on invalid --status value', async () => {
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'purge', '--before', '2026-01-01', '--status', 'invalid']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('Invalid status');
  });
});
