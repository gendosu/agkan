/**
 * Tests for task delete command handler
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Command } from 'commander';
import { setupTaskDeleteCommand } from '../../../../src/cli/commands/task/delete';
import { getDatabase } from '../../../../src/db/connection';
import { TaskService } from '../../../../src/services';

describe('setupTaskDeleteCommand', () => {
  let program: Command;

  beforeEach(() => {
    // Reset database before each test
    const db = getDatabase();
    db.exec('DELETE FROM tasks');
    db.exec('DELETE FROM task_blocks');
    db.exec("DELETE FROM sqlite_sequence WHERE name='tasks'");

    // Create a fresh program with task command
    program = new Command();
    program.exitOverride();
    program.command('task').description('Task management commands');

    // Setup the delete command
    setupTaskDeleteCommand(program);
  });

  it('should register the delete command', () => {
    const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
    expect(taskCommand).toBeDefined();

    const deleteCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'delete');
    expect(deleteCommand).toBeDefined();
    expect(deleteCommand?.description()).toBe('Delete a task');
  });

  it('should have --json option', () => {
    const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
    const deleteCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'delete');

    const options = deleteCommand?.options || [];
    const optionNames = options.map((opt) => opt.long);

    expect(optionNames).toContain('--json');
  });

  it('should delete an existing task', async () => {
    const taskService = new TaskService();
    taskService.createTask({ title: 'Test task', body: null, author: null, status: 'ready', parent_id: null });
    const task = taskService.listTasks()[0];
    expect(task).toBeDefined();

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'delete', String(task.id)]);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('✓');

    const deletedTask = taskService.getTask(task.id);
    expect(deletedTask).toBeNull();
  });

  it('should output JSON on successful delete with --json option', async () => {
    const taskService = new TaskService();
    taskService.createTask({ title: 'Test task', body: null, author: null, status: 'ready', parent_id: null });
    const task = taskService.listTasks()[0];

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'delete', String(task.id), '--json']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    const parsed = JSON.parse(output);
    expect(parsed.success).toBe(true);
    expect(parsed.id).toBe(task.id);
  });

  it('should show error when task does not exist', async () => {
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'delete', '999']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('999');
    expect(exitCode).toBe(1);
  });

  it('should show JSON error when task does not exist with --json option', async () => {
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'delete', '999', '--json']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const parsed = JSON.parse(consoleLogs[0]);
    expect(parsed.success).toBe(false);
  });

  it('should show error when ID is not a number', async () => {
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'delete', 'abc']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('number');
    expect(exitCode).toBe(1);
  });
});
