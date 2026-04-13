/**
 * Tests for task unarchive command handler
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Command } from 'commander';
import { setupTaskUnarchiveCommand } from '../../../../src/cli/commands/task/unarchive';
import { getDatabase } from '../../../../src/db/connection';
import { TaskService } from '../../../../src/services';

function resetDatabase() {
  const db = getDatabase();
  db.exec('DELETE FROM task_tags');
  db.exec('DELETE FROM task_blocks');
  db.exec('DELETE FROM tasks');
  db.exec("DELETE FROM sqlite_sequence WHERE name='tasks'");
}

function archiveTask(taskId: number) {
  const db = getDatabase();
  db.prepare('UPDATE tasks SET is_archived = 1 WHERE id = ?').run(taskId);
}

describe('setupTaskUnarchiveCommand', () => {
  let program: Command;
  let taskService: TaskService;

  beforeEach(() => {
    resetDatabase();

    program = new Command();
    program.exitOverride();
    program.command('task').description('Task management commands');
    setupTaskUnarchiveCommand(program);

    taskService = new TaskService();
  });

  it('should register the unarchive command', () => {
    const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
    expect(taskCommand).toBeDefined();

    const unarchiveCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'unarchive');
    expect(unarchiveCommand).toBeDefined();
    expect(unarchiveCommand?.description()).toContain('Unarchive');
  });

  it('should have <id> argument, --dry-run, and --json options', () => {
    const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
    const unarchiveCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'unarchive');

    expect(unarchiveCommand?.registeredArguments).toBeDefined();
    const args = unarchiveCommand?.registeredArguments || [];
    expect(args[0].name()).toBe('id');

    const optionNames = (unarchiveCommand?.options || []).map((opt) => opt.long);
    expect(optionNames).toContain('--dry-run');
    expect(optionNames).toContain('--json');
  });

  it('should unarchive an archived task', async () => {
    const task = taskService.createTask({ title: 'Task to unarchive', status: 'done' });
    archiveTask(task.id);

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'unarchive', task.id.toString()]);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('Unarchived');
    expect(output).toContain('Task to unarchive');

    // Verify task is unarchived in database
    const found = taskService.getTask(task.id);
    expect(found).not.toBeNull();
    expect(found!.is_archived).toBe(0);
  });

  it('should show error for invalid task ID', async () => {
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'unarchive', 'not-a-number']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('Invalid task ID');
  });

  it('should show error when task not found', async () => {
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'unarchive', '9999']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('not found');
  });

  it('should preview unarchive with --dry-run and not modify the task', async () => {
    const task = taskService.createTask({ title: 'Task to unarchive', status: 'done' });
    archiveTask(task.id);

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'unarchive', task.id.toString(), '--dry-run']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('Dry Run');
    expect(output).toContain('Task to unarchive');

    // Task must still be archived
    expect(taskService.getTask(task.id)!.is_archived).toBe(1);
  });

  it('should output JSON with --json option', async () => {
    const task = taskService.createTask({ title: 'Task to unarchive', status: 'done' });
    archiveTask(task.id);

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'unarchive', task.id.toString(), '--json']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const parsed = JSON.parse(consoleLogs[0]);
    expect(parsed.dryRun).toBe(false);
    expect(parsed.task.id).toBe(task.id);
    expect(parsed.task.status).toBe('done');
    expect(parsed.task.is_archived).toBe(0);
  });

  it('should unarchive a non-archived task (idempotent)', async () => {
    const task = taskService.createTask({ title: 'Non-archived task', status: 'done' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'unarchive', task.id.toString()]);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('Unarchived');

    // Task should still be not archived
    const found = taskService.getTask(task.id);
    expect(found!.is_archived).toBe(0);
  });
});
