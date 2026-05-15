/**
 * Tests for task block remove command handler
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Command } from 'commander';
import { setupBlockRemoveCommand } from '../../../../src/cli/commands/block/remove';
import { getDatabase } from '../../../../src/db/connection';
import { TaskService, TaskBlockService } from '../../../../src/services';
import * as serviceContainer from '../../../../src/cli/utils/service-container';

function resetDatabase() {
  const db = getDatabase();
  db.exec('DELETE FROM task_tags');
  db.exec('DELETE FROM task_blocks');
  db.exec('DELETE FROM tasks');
  db.exec("DELETE FROM sqlite_sequence WHERE name='tasks'");
}

describe('setupBlockRemoveCommand', () => {
  let program: Command;

  beforeEach(() => {
    resetDatabase();

    program = new Command();
    program.command('task').description('Task management commands');

    setupBlockRemoveCommand(program);
  });

  it('should register the block remove command', () => {
    const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
    expect(taskCommand).toBeDefined();

    const blockCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'block');
    expect(blockCommand).toBeDefined();

    const removeCommand = blockCommand?.commands.find((cmd) => cmd.name() === 'remove');
    expect(removeCommand).toBeDefined();
    expect(removeCommand?.description()).toBe('Remove a blocking relationship between tasks');
  });

  it('should have correct arguments', () => {
    const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
    const blockCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'block');
    const removeCommand = blockCommand?.commands.find((cmd) => cmd.name() === 'remove');

    const args = removeCommand?.registeredArguments || [];
    expect(args).toHaveLength(2);
    expect(args[0].name()).toBe('blocker-id');
    expect(args[1].name()).toBe('blocked-id');
  });

  it('should have correct options', () => {
    const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
    const blockCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'block');
    const removeCommand = blockCommand?.commands.find((cmd) => cmd.name() === 'remove');

    const options = removeCommand?.options || [];
    const optionNames = options.map((opt) => opt.long);

    expect(optionNames).toContain('--json');
  });

  it('should remove blocking relationship successfully', async () => {
    const taskService = new TaskService();
    const blocker = taskService.createTask({ title: 'Blocker task', status: 'ready' });
    const blocked = taskService.createTask({ title: 'Blocked task', status: 'ready' });

    const taskBlockService = new TaskBlockService();
    taskBlockService.addBlock({ blocker_task_id: blocker.id, blocked_task_id: blocked.id });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'block', 'remove', String(blocker.id), String(blocked.id)]);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('✓');

    const blockedIds = taskBlockService.getBlockedTaskIds(blocker.id);
    expect(blockedIds).not.toContain(blocked.id);
  });

  it('should output JSON on success with --json option', async () => {
    const taskService = new TaskService();
    const blocker = taskService.createTask({ title: 'Blocker task', status: 'ready' });
    const blocked = taskService.createTask({ title: 'Blocked task', status: 'ready' });

    const taskBlockService = new TaskBlockService();
    taskBlockService.addBlock({ blocker_task_id: blocker.id, blocked_task_id: blocked.id });

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
        'remove',
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

  it('should show error when relationship does not exist', async () => {
    const taskService = new TaskService();
    const blocker = taskService.createTask({ title: 'Blocker task', status: 'ready' });
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
      await program.parseAsync(['node', 'test', 'task', 'block', 'remove', String(blocker.id), String(blocked.id)]);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toMatch(/does not exist/i);
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
      await program.parseAsync(['node', 'test', 'task', 'block', 'remove', '999', String(blocked.id)]);
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
      await program.parseAsync(['node', 'test', 'task', 'block', 'remove', String(blocker.id), '999']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('999');
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
      await program.parseAsync(['node', 'test', 'task', 'block', 'remove', 'abc', '1']);
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
      await program.parseAsync(['node', 'test', 'task', 'block', 'remove', '1', 'abc']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('number');
  });

  it('should show error with Error message when removeBlock throws an Error', async () => {
    const taskService = new TaskService();
    const blocker = taskService.createTask({ title: 'Blocker task', status: 'ready' });
    const blocked = taskService.createTask({ title: 'Blocked task', status: 'ready' });

    const mockTaskBlockService = new TaskBlockService();
    vi.spyOn(mockTaskBlockService, 'removeBlock').mockImplementation(() => {
      throw new Error('Database error during removal');
    });
    vi.spyOn(serviceContainer, 'getServiceContainer').mockReturnValueOnce({
      taskService: new TaskService(),
      taskBlockService: mockTaskBlockService,
    } as ReturnType<typeof serviceContainer.getServiceContainer>);

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'block', 'remove', String(blocker.id), String(blocked.id)]);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
      vi.restoreAllMocks();
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('Database error during removal');
  });

  it('should show unknown error when non-Error object is thrown from inner catch (removeBlock)', async () => {
    const taskService = new TaskService();
    const blocker = taskService.createTask({ title: 'Blocker task', status: 'ready' });
    const blocked = taskService.createTask({ title: 'Blocked task', status: 'ready' });

    const mockTaskBlockService = new TaskBlockService();
    vi.spyOn(mockTaskBlockService, 'removeBlock').mockImplementation(() => {
      throw { code: 'DB_ERROR' };
    });
    vi.spyOn(serviceContainer, 'getServiceContainer').mockReturnValueOnce({
      taskService: new TaskService(),
      taskBlockService: mockTaskBlockService,
    } as ReturnType<typeof serviceContainer.getServiceContainer>);

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'block', 'remove', String(blocker.id), String(blocked.id)]);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
      vi.restoreAllMocks();
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toMatch(/unknown error/i);
  });

  it('should show unknown error when non-Error object is thrown from outer catch', async () => {
    const mockTaskService = new TaskService();
    vi.spyOn(mockTaskService, 'getTask').mockImplementation(() => {
      throw 'string error thrown from getTask';
    });
    vi.spyOn(serviceContainer, 'getServiceContainer').mockReturnValueOnce({
      taskService: mockTaskService,
      taskBlockService: new TaskBlockService(),
    } as ReturnType<typeof serviceContainer.getServiceContainer>);

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'block', 'remove', '1', '2']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
      vi.restoreAllMocks();
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toMatch(/unknown error/i);
  });

  it('should reuse existing block command when block command already exists under task', () => {
    // Create a new program where task already has a block subcommand (but no 'remove' yet)
    const programWithBlock = new Command();
    const taskCmd = programWithBlock.command('task').description('Task management commands');
    taskCmd.command('block').description('Task blocking relationship commands');

    // setupBlockRemoveCommand should reuse the existing block command (not create a new one)
    expect(() => setupBlockRemoveCommand(programWithBlock)).not.toThrow();

    // Verify remove command was registered under the existing block command
    const blockCommand = taskCmd.commands.find((cmd) => cmd.name() === 'block');
    const removeCommand = blockCommand?.commands.find((cmd) => cmd.name() === 'remove');
    expect(removeCommand).toBeDefined();
  });

  it('should throw when task command does not exist', () => {
    const emptyProgram = new Command();
    expect(() => setupBlockRemoveCommand(emptyProgram)).toThrow('Task command not found');
  });
});
