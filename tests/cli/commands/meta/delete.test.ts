/**
 * Tests for task meta delete command handler
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Command } from 'commander';
import { setupMetaDeleteCommand } from '../../../../src/cli/commands/meta/delete';
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

describe('setupMetaDeleteCommand', () => {
  let program: Command;

  beforeEach(() => {
    resetDatabase();

    program = new Command();
    program.exitOverride();
    program.command('task').description('Task management commands');
    setupMetaDeleteCommand(program);
  });

  it('should register the meta delete command', () => {
    const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
    expect(taskCommand).toBeDefined();

    const metaCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'meta');
    expect(metaCommand).toBeDefined();

    const deleteCommand = metaCommand?.commands.find((cmd) => cmd.name() === 'delete');
    expect(deleteCommand).toBeDefined();
    expect(deleteCommand?.description()).toBe('Delete metadata for a task');
  });

  it('should have correct options', () => {
    const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
    const metaCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'meta');
    const deleteCommand = metaCommand?.commands.find((cmd) => cmd.name() === 'delete');

    const options = deleteCommand?.options || [];
    const optionNames = options.map((opt) => opt.long);

    expect(optionNames).toContain('--json');
  });

  it('should delete existing metadata successfully', async () => {
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
      await program.parseAsync(['node', 'test', 'task', 'meta', 'delete', String(task.id), 'priority']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('✓');

    const deleted = metadataService.getMetadataByKey(task.id, 'priority');
    expect(deleted).toBeNull();
  });

  it('should output JSON on success with --json option', async () => {
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
      await program.parseAsync(['node', 'test', 'task', 'meta', 'delete', String(task.id), 'priority', '--json']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const parsed = JSON.parse(consoleLogs[0]);
    expect(parsed.success).toBe(true);
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
      await program.parseAsync(['node', 'test', 'task', 'meta', 'delete', String(task.id), 'nonexistent']);
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
      await program.parseAsync(['node', 'test', 'task', 'meta', 'delete', '999', 'priority']);
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
      await program.parseAsync(['node', 'test', 'task', 'meta', 'delete', 'abc', 'priority']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('number');
  });
});
