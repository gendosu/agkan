/**
 * Tests for task block list command handler
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Command } from 'commander';
import { setupBlockListCommand } from '../../../../src/cli/commands/block/list';
import { getDatabase } from '../../../../src/db/connection';
import { TaskService, TaskBlockService } from '../../../../src/services';

function resetDatabase() {
  const db = getDatabase();
  db.exec('DELETE FROM task_tags');
  db.exec('DELETE FROM task_blocks');
  db.exec('DELETE FROM tasks');
  db.exec("DELETE FROM sqlite_sequence WHERE name='tasks'");
}

describe('setupBlockListCommand', () => {
  let program: Command;

  beforeEach(() => {
    resetDatabase();

    program = new Command();
    program.command('task').description('Task management commands');

    setupBlockListCommand(program);
  });

  it('should register the block list command', () => {
    const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
    expect(taskCommand).toBeDefined();

    const blockCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'block');
    expect(blockCommand).toBeDefined();

    const listCommand = blockCommand?.commands.find((cmd) => cmd.name() === 'list');
    expect(listCommand).toBeDefined();
    expect(listCommand?.description()).toBe('List all blocking relationships for a task');
  });

  it('should have correct arguments', () => {
    const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
    const blockCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'block');
    const listCommand = blockCommand?.commands.find((cmd) => cmd.name() === 'list');

    const args = listCommand?.registeredArguments || [];
    expect(args).toHaveLength(1);
    expect(args[0].name()).toBe('id');
  });

  it('should have correct options', () => {
    const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
    const blockCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'block');
    const listCommand = blockCommand?.commands.find((cmd) => cmd.name() === 'list');

    const options = listCommand?.options || [];
    const optionNames = options.map((opt) => opt.long);

    expect(optionNames).toContain('--json');
  });

  it('should list blocking relationships for a task', async () => {
    const taskService = new TaskService();
    const task = taskService.createTask({ title: 'Main task', status: 'ready' });
    const blocker = taskService.createTask({ title: 'Blocking task', status: 'ready' });
    const blocked = taskService.createTask({ title: 'Blocked by main', status: 'ready' });

    const taskBlockService = new TaskBlockService();
    taskBlockService.addBlock({ blocker_task_id: blocker.id, blocked_task_id: task.id });
    taskBlockService.addBlock({ blocker_task_id: task.id, blocked_task_id: blocked.id });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'block', 'list', String(task.id)]);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('Blocking task');
    expect(output).toContain('Blocked by main');
  });

  it('should output JSON with blocking relationships', async () => {
    const taskService = new TaskService();
    const task = taskService.createTask({ title: 'Main task', status: 'ready' });
    const blocker = taskService.createTask({ title: 'Blocker', status: 'ready' });
    const blocked = taskService.createTask({ title: 'Blocked', status: 'ready' });

    const taskBlockService = new TaskBlockService();
    taskBlockService.addBlock({ blocker_task_id: blocker.id, blocked_task_id: task.id });
    taskBlockService.addBlock({ blocker_task_id: task.id, blocked_task_id: blocked.id });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'block', 'list', String(task.id), '--json']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const parsed = JSON.parse(consoleLogs[0]);
    expect(parsed.task.id).toBe(task.id);
    expect(parsed.blockedBy).toHaveLength(1);
    expect(parsed.blockedBy[0].id).toBe(blocker.id);
    expect(parsed.blocking).toHaveLength(1);
    expect(parsed.blocking[0].id).toBe(blocked.id);
  });

  it('should show empty relationships when task has none', async () => {
    const taskService = new TaskService();
    const task = taskService.createTask({ title: 'Isolated task', status: 'ready' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'block', 'list', String(task.id), '--json']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const parsed = JSON.parse(consoleLogs[0]);
    expect(parsed.blockedBy).toHaveLength(0);
    expect(parsed.blocking).toHaveLength(0);
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
      await program.parseAsync(['node', 'test', 'task', 'block', 'list', '999']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('999');
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
      await program.parseAsync(['node', 'test', 'task', 'block', 'list', 'abc']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('number');
  });
});
