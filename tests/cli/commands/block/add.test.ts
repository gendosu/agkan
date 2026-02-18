/**
 * Tests for task block add command handler
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Command } from 'commander';
import { setupBlockAddCommand } from '../../../../src/cli/commands/block/add';
import { getDatabase } from '../../../../src/db/connection';
import { TaskService, TaskBlockService } from '../../../../src/services';

function resetDatabase() {
  const db = getDatabase();
  db.exec('DELETE FROM task_tags');
  db.exec('DELETE FROM task_blocks');
  db.exec('DELETE FROM tasks');
  db.exec("DELETE FROM sqlite_sequence WHERE name='tasks'");
}

describe('setupBlockAddCommand', () => {
  let program: Command;

  beforeEach(() => {
    resetDatabase();

    program = new Command();
    program.command('task').description('Task management commands');

    setupBlockAddCommand(program);
  });

  it('should register the block add command', () => {
    const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
    expect(taskCommand).toBeDefined();

    const blockCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'block');
    expect(blockCommand).toBeDefined();

    const addCommand = blockCommand?.commands.find((cmd) => cmd.name() === 'add');
    expect(addCommand).toBeDefined();
    expect(addCommand?.description()).toBe('Add a blocking relationship between tasks');
  });

  it('should have correct arguments', () => {
    const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
    const blockCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'block');
    const addCommand = blockCommand?.commands.find((cmd) => cmd.name() === 'add');

    const args = addCommand?.registeredArguments || [];
    expect(args).toHaveLength(2);
    expect(args[0].name()).toBe('blocker-id');
    expect(args[1].name()).toBe('blocked-id');
  });

  it('should have correct options', () => {
    const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
    const blockCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'block');
    const addCommand = blockCommand?.commands.find((cmd) => cmd.name() === 'add');

    const options = addCommand?.options || [];
    const optionNames = options.map((opt) => opt.long);

    expect(optionNames).toContain('--json');
  });

  it('should add blocking relationship successfully', async () => {
    const taskService = new TaskService();
    const blocker = taskService.createTask({ title: 'Blocker task', status: 'ready' });
    const blocked = taskService.createTask({ title: 'Blocked task', status: 'ready' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'block', 'add', String(blocker.id), String(blocked.id)]);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('✓');

    const taskBlockService = new TaskBlockService();
    const blockedIds = taskBlockService.getBlockedTaskIds(blocker.id);
    expect(blockedIds).toContain(blocked.id);
  });

  it('should output JSON on success with --json option', async () => {
    const taskService = new TaskService();
    const blocker = taskService.createTask({ title: 'Blocker task', status: 'ready' });
    const blocked = taskService.createTask({ title: 'Blocked task', status: 'ready' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync([
        'node',
        'test',
        'task',
        'block',
        'add',
        String(blocker.id),
        String(blocked.id),
        '--json',
      ]);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const parsed = JSON.parse(consoleLogs[0]);
    expect(parsed.success).toBe(true);
    expect(parsed.blocker.id).toBe(blocker.id);
    expect(parsed.blocked.id).toBe(blocked.id);
  });

  it('should show error when blocker task does not exist', async () => {
    const taskService = new TaskService();
    const blocked = taskService.createTask({ title: 'Blocked task', status: 'ready' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'block', 'add', '999', String(blocked.id)]);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('999');
  });

  it('should show error when blocked task does not exist', async () => {
    const taskService = new TaskService();
    const blocker = taskService.createTask({ title: 'Blocker task', status: 'ready' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'block', 'add', String(blocker.id), '999']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('999');
  });

  it('should show error when task tries to block itself', async () => {
    const taskService = new TaskService();
    const task = taskService.createTask({ title: 'Task', status: 'ready' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'block', 'add', String(task.id), String(task.id)]);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('itself');
  });

  it('should show error when blocker ID is not a number', async () => {
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'block', 'add', 'abc', '1']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('number');
  });

  it('should show error when blocked ID is not a number', async () => {
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'block', 'add', '1', 'abc']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('number');
  });

  it('should show error when relationship already exists', async () => {
    const taskService = new TaskService();
    const blocker = taskService.createTask({ title: 'Blocker task', status: 'ready' });
    const blocked = taskService.createTask({ title: 'Blocked task', status: 'ready' });

    const taskBlockService = new TaskBlockService();
    taskBlockService.addBlock({ blocker_task_id: blocker.id, blocked_task_id: blocked.id });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'block', 'add', String(blocker.id), String(blocked.id)]);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toMatch(/already exists/i);
  });
});
