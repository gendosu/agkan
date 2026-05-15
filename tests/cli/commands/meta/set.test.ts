/**
 * Tests for task meta set command handler
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Command } from 'commander';
import { setupMetaSetCommand } from '../../../../src/cli/commands/meta/set';
import { getDatabase } from '../../../../src/db/connection';
import { TaskService, MetadataService } from '../../../../src/services';
import * as serviceContainer from '../../../../src/cli/utils/service-container';

function resetDatabase() {
  const db = getDatabase();
  db.exec('DELETE FROM task_metadata');
  db.exec('DELETE FROM task_tags');
  db.exec('DELETE FROM task_blocks');
  db.exec('DELETE FROM tasks');
  db.exec("DELETE FROM sqlite_sequence WHERE name='tasks'");
}

describe('setupMetaSetCommand', () => {
  let program: Command;

  beforeEach(() => {
    resetDatabase();

    program = new Command();
    program.exitOverride();
    program.command('task').description('Task management commands');
    setupMetaSetCommand(program);
  });

  it('should register the meta set command', () => {
    const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
    expect(taskCommand).toBeDefined();

    const metaCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'meta');
    expect(metaCommand).toBeDefined();

    const setCommand = metaCommand?.commands.find((cmd) => cmd.name() === 'set');
    expect(setCommand).toBeDefined();
    expect(setCommand?.description()).toBe('Set metadata for a task');
  });

  it('should have correct options', () => {
    const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
    const metaCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'meta');
    const setCommand = metaCommand?.commands.find((cmd) => cmd.name() === 'set');

    const options = setCommand?.options || [];
    const optionNames = options.map((opt) => opt.long);

    expect(optionNames).toContain('--json');
  });

  it('should set metadata successfully', async () => {
    const taskService = new TaskService();
    const task = taskService.createTask({ title: 'Test task', status: 'ready' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'meta', 'set', String(task.id), 'priority', 'high']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('✓');

    const metadataService = new MetadataService();
    const metadata = metadataService.getMetadataByKey(task.id, 'priority');
    expect(metadata).not.toBeNull();
    expect(metadata?.value).toBe('high');
  });

  it('should output JSON on success with --json option', async () => {
    const taskService = new TaskService();
    const task = taskService.createTask({ title: 'Test task', status: 'ready' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'meta', 'set', String(task.id), 'priority', 'high', '--json']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const parsed = JSON.parse(consoleLogs[0]);
    expect(parsed.success).toBe(true);
    expect(parsed.data.key).toBe('priority');
    expect(parsed.data.value).toBe('high');
  });

  it('should update existing metadata', async () => {
    const taskService = new TaskService();
    const task = taskService.createTask({ title: 'Test task', status: 'ready' });

    const metadataService = new MetadataService();
    metadataService.setMetadata({ task_id: task.id, key: 'priority', value: 'low' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'meta', 'set', String(task.id), 'priority', 'high']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const updated = metadataService.getMetadataByKey(task.id, 'priority');
    expect(updated?.value).toBe('high');
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
      await program.parseAsync(['node', 'test', 'task', 'meta', 'set', '999', 'key', 'value']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('999');
  });

  it('should show error when key exceeds 50 characters', async () => {
    const taskService = new TaskService();
    const task = taskService.createTask({ title: 'Test task', status: 'ready' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    const longKey = 'k'.repeat(51);

    try {
      await program.parseAsync(['node', 'test', 'task', 'meta', 'set', String(task.id), longKey, 'value']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('50');
  });

  it('should show error when value exceeds 500 characters', async () => {
    const taskService = new TaskService();
    const task = taskService.createTask({ title: 'Test task', status: 'ready' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    const longValue = 'v'.repeat(501);

    try {
      await program.parseAsync(['node', 'test', 'task', 'meta', 'set', String(task.id), 'key', longValue]);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('500');
  });

  it('should show error when task ID is not a number', async () => {
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'meta', 'set', 'abc', 'key', 'value']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('number');
  });

  it('should create task command when it does not exist in program', () => {
    const emptyProgram = new Command();
    emptyProgram.exitOverride();
    setupMetaSetCommand(emptyProgram);

    const taskCommand = emptyProgram.commands.find((cmd) => cmd.name() === 'task');
    expect(taskCommand).toBeDefined();

    const metaCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'meta');
    expect(metaCommand).toBeDefined();

    const setCommand = metaCommand?.commands.find((cmd) => cmd.name() === 'set');
    expect(setCommand).toBeDefined();
  });

  it('should reuse existing meta command when it already exists', () => {
    const reuseProgram = new Command();
    reuseProgram.exitOverride();
    const taskCmd = reuseProgram.command('task').description('Task management commands');
    taskCmd.command('meta').description('Task metadata commands');
    setupMetaSetCommand(reuseProgram);

    const taskCommand = reuseProgram.commands.find((cmd) => cmd.name() === 'task');
    const metaCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'meta');
    expect(metaCommand).toBeDefined();

    const setCommand = metaCommand?.commands.find((cmd) => cmd.name() === 'set');
    expect(setCommand).toBeDefined();
  });

  it('should output JSON error when task does not exist with --json option', async () => {
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'meta', 'set', '999', 'key', 'value', '--json']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const parsed = JSON.parse(consoleLogs[0]);
    expect(parsed.success).toBe(false);
    expect(parsed.error.message).toContain('999');
  });

  it('should output JSON error when key exceeds 50 characters with --json option', async () => {
    const taskService = new TaskService();
    const task = taskService.createTask({ title: 'Test task', status: 'ready' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    const longKey = 'k'.repeat(51);

    try {
      await program.parseAsync(['node', 'test', 'task', 'meta', 'set', String(task.id), longKey, 'value', '--json']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const parsed = JSON.parse(consoleLogs[0]);
    expect(parsed.success).toBe(false);
    expect(parsed.error.message).toContain('50');
  });

  it('should output JSON error when value exceeds 500 characters with --json option', async () => {
    const taskService = new TaskService();
    const task = taskService.createTask({ title: 'Test task', status: 'ready' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    const longValue = 'v'.repeat(501);

    try {
      await program.parseAsync(['node', 'test', 'task', 'meta', 'set', String(task.id), 'key', longValue, '--json']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const parsed = JSON.parse(consoleLogs[0]);
    expect(parsed.success).toBe(false);
    expect(parsed.error.message).toContain('500');
  });

  it('should handle non-Error thrown objects in catch block', async () => {
    const spy = vi.spyOn(serviceContainer, 'getServiceContainer').mockImplementation(() => {
      throw 'string error';
    });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'meta', 'set', '1', 'key', 'value']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
      spy.mockRestore();
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('Unknown error');
  });
});
