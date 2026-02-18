/**
 * Tests for task meta list command handler
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Command } from 'commander';
import { setupMetaListCommand } from '../../../../src/cli/commands/meta/list';
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

describe('setupMetaListCommand', () => {
  let program: Command;

  beforeEach(() => {
    resetDatabase();

    program = new Command();
    program.exitOverride();
    program.command('task').description('Task management commands');
    setupMetaListCommand(program);
  });

  it('should register the meta list command', () => {
    const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
    expect(taskCommand).toBeDefined();

    const metaCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'meta');
    expect(metaCommand).toBeDefined();

    const listCommand = metaCommand?.commands.find((cmd) => cmd.name() === 'list');
    expect(listCommand).toBeDefined();
    expect(listCommand?.description()).toBe('List all metadata for a task');
  });

  it('should have correct options', () => {
    const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
    const metaCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'meta');
    const listCommand = metaCommand?.commands.find((cmd) => cmd.name() === 'list');

    const options = listCommand?.options || [];
    const optionNames = options.map((opt) => opt.long);

    expect(optionNames).toContain('--json');
  });

  it('should list all metadata for a task', async () => {
    const taskService = new TaskService();
    const task = taskService.createTask({ title: 'Test task', status: 'ready' });

    const metadataService = new MetadataService();
    metadataService.setMetadata({ task_id: task.id, key: 'priority', value: 'high' });
    metadataService.setMetadata({ task_id: task.id, key: 'category', value: 'backend' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'meta', 'list', String(task.id)]);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('priority');
    expect(output).toContain('high');
    expect(output).toContain('category');
    expect(output).toContain('backend');
  });

  it('should output JSON with metadata array', async () => {
    const taskService = new TaskService();
    const task = taskService.createTask({ title: 'Test task', status: 'ready' });

    const metadataService = new MetadataService();
    metadataService.setMetadata({ task_id: task.id, key: 'priority', value: 'high' });
    metadataService.setMetadata({ task_id: task.id, key: 'category', value: 'backend' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'meta', 'list', String(task.id), '--json']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const parsed = JSON.parse(consoleLogs[0]);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toHaveLength(2);
    const keys = parsed.data.map((m: { key: string }) => m.key);
    expect(keys).toContain('priority');
    expect(keys).toContain('category');
  });

  it('should show message when no metadata exists', async () => {
    const taskService = new TaskService();
    const task = taskService.createTask({ title: 'Test task', status: 'ready' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'meta', 'list', String(task.id)]);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('No metadata');
  });

  it('should output empty array JSON when no metadata exists', async () => {
    const taskService = new TaskService();
    const task = taskService.createTask({ title: 'Test task', status: 'ready' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'meta', 'list', String(task.id), '--json']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const parsed = JSON.parse(consoleLogs[0]);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toHaveLength(0);
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
      await program.parseAsync(['node', 'test', 'task', 'meta', 'list', '999']);
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
      await program.parseAsync(['node', 'test', 'task', 'meta', 'list', 'abc']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('number');
  });
});
