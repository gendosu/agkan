/**
 * Tests for task archive command handler
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Command } from 'commander';
import { setupTaskArchiveCommand } from '../../../../src/cli/commands/task/archive';
import { getDatabase } from '../../../../src/db/connection';
import { TaskService } from '../../../../src/services';

function resetDatabase() {
  const db = getDatabase();
  db.exec('DELETE FROM task_tags');
  db.exec('DELETE FROM task_blocks');
  db.exec('DELETE FROM tasks');
  db.exec("DELETE FROM sqlite_sequence WHERE name='tasks'");
}

function setUpdatedAt(taskId: number, updatedAt: string) {
  const db = getDatabase();
  db.prepare('UPDATE tasks SET updated_at = ? WHERE id = ?').run(updatedAt, taskId);
}

describe('setupTaskArchiveCommand', () => {
  let program: Command;
  let taskService: TaskService;

  beforeEach(() => {
    resetDatabase();

    program = new Command();
    program.exitOverride();
    program.command('task').description('Task management commands');
    setupTaskArchiveCommand(program);

    taskService = new TaskService();
  });

  it('should register the archive command', () => {
    const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
    expect(taskCommand).toBeDefined();

    const archiveCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'archive');
    expect(archiveCommand).toBeDefined();
    expect(archiveCommand?.description()).toContain('Archive');
  });

  it('should have --before, --status, --dry-run, and --json options', () => {
    const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
    const archiveCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'archive');

    const optionNames = (archiveCommand?.options || []).map((opt) => opt.long);
    expect(optionNames).toContain('--before');
    expect(optionNames).toContain('--status');
    expect(optionNames).toContain('--dry-run');
    expect(optionNames).toContain('--json');
  });

  it('should archive done tasks older than --before date', async () => {
    const task = taskService.createTask({ title: 'Old done task', status: 'done' });
    setUpdatedAt(task.id, '2025-06-01T00:00:00.000Z');

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'archive', '--before', '2026-01-01']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('Archived');
    expect(output).toContain('Old done task');

    // Task still exists, but is archived
    const found = taskService.getTask(task.id);
    expect(found).not.toBeNull();
    expect(found!.is_archived).toBe(1);
  });

  it('should not archive tasks updated after --before date', async () => {
    const task = taskService.createTask({ title: 'Recent done task', status: 'done' });
    setUpdatedAt(task.id, '2026-06-01T00:00:00.000Z');

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'archive', '--before', '2026-01-01']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('No tasks matched');

    expect(taskService.getTask(task.id)!.is_archived).toBe(0);
  });

  it('should archive only tasks matching --status filter', async () => {
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
      await program.parseAsync(['node', 'test', 'task', 'archive', '--before', '2026-01-01', '--status', 'closed']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(taskService.getTask(doneTask.id)!.is_archived).toBe(0);
    expect(taskService.getTask(closedTask.id)!.is_archived).toBe(1);
  });

  it('should preview tasks with --dry-run and not archive them', async () => {
    const task = taskService.createTask({ title: 'Old done task', status: 'done' });
    setUpdatedAt(task.id, '2025-06-01T00:00:00.000Z');

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'archive', '--before', '2026-01-01', '--dry-run']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('Dry Run');
    expect(output).toContain('Old done task');

    // Task must not be archived
    expect(taskService.getTask(task.id)!.is_archived).toBe(0);
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
      await program.parseAsync(['node', 'test', 'task', 'archive', '--before', '2026-01-01', '--json']);
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
      await program.parseAsync(['node', 'test', 'task', 'archive', '--before', 'not-a-date']);
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
      await program.parseAsync(['node', 'test', 'task', 'archive', '--before', '2026-01-01', '--status', 'invalid']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('Invalid status');
  });
});
