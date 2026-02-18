/**
 * Tests for task meta get command handler
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Command } from 'commander';
import { setupMetaGetCommand } from '../../../../src/cli/commands/meta/get';
import { getDatabase } from '../../../../src/db/connection';
import { TaskService, MetadataService } from '../../../../src/services';

function resetDatabase() {
  const db = getDatabase();
  db.exec('DELETE FROM task_metadata');
  db.exec('DELETE FROM task_tags');
  db.exec('DELETE FROM task_blocks');
  db.exec('DELETE FROM tasks');
  db.exec("DELETE FROM sqlite_sequence WHERE name='tasks'");
}

describe('setupMetaGetCommand', () => {
  let program: Command;

  beforeEach(() => {
    resetDatabase();

    program = new Command();
    program.exitOverride();
    program.command('task').description('Task management commands');
    setupMetaGetCommand(program);
  });

  it('should register the meta get command', () => {
    const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
    expect(taskCommand).toBeDefined();

    const metaCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'meta');
    expect(metaCommand).toBeDefined();

    const getCommand = metaCommand?.commands.find((cmd) => cmd.name() === 'get');
    expect(getCommand).toBeDefined();
    expect(getCommand?.description()).toBe('Get metadata for a task');
  });

  it('should have correct options', () => {
    const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
    const metaCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'meta');
    const getCommand = metaCommand?.commands.find((cmd) => cmd.name() === 'get');

    const options = getCommand?.options || [];
    const optionNames = options.map((opt) => opt.long);

    expect(optionNames).toContain('--json');
  });

  it('should get existing metadata', async () => {
    const taskService = new TaskService();
    const task = taskService.createTask({ title: 'Test task', status: 'ready' });

    const metadataService = new MetadataService();
    metadataService.setMetadata({ task_id: task.id, key: 'priority', value: 'high' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'meta', 'get', String(task.id), 'priority']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('priority');
    expect(output).toContain('high');
  });

  it('should output JSON with metadata on success with --json option', async () => {
    const taskService = new TaskService();
    const task = taskService.createTask({ title: 'Test task', status: 'ready' });

    const metadataService = new MetadataService();
    metadataService.setMetadata({ task_id: task.id, key: 'priority', value: 'high' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'meta', 'get', String(task.id), 'priority', '--json']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const parsed = JSON.parse(consoleLogs[0]);
    expect(parsed.success).toBe(true);
    expect(parsed.data.key).toBe('priority');
    expect(parsed.data.value).toBe('high');
    expect(parsed.data.task_id).toBe(task.id);
  });

  it('should show error when metadata key does not exist', async () => {
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

    try {
      await program.parseAsync(['node', 'test', 'task', 'meta', 'get', String(task.id), 'nonexistent']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('nonexistent');
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
      await program.parseAsync(['node', 'test', 'task', 'meta', 'get', '999', 'priority']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('999');
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
      await program.parseAsync(['node', 'test', 'task', 'meta', 'get', 'abc', 'priority']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('number');
  });
});
