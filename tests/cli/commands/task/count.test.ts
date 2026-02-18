/**
 * Tests for task count command handler
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Command } from 'commander';
import { setupTaskCountCommand } from '../../../../src/cli/commands/task/count';
import { getDatabase } from '../../../../src/db/connection';
import { TaskService } from '../../../../src/services';

function resetDatabase() {
  const db = getDatabase();
  db.exec('DELETE FROM task_tags');
  db.exec('DELETE FROM task_blocks');
  db.exec('DELETE FROM tasks');
  db.exec("DELETE FROM sqlite_sequence WHERE name='tasks'");
}

describe('setupTaskCountCommand', () => {
  let program: Command;

  beforeEach(() => {
    resetDatabase();

    program = new Command();
    program.exitOverride();
    program.command('task').description('Task management commands');
    setupTaskCountCommand(program);
  });

  it('should register the count command', () => {
    const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
    expect(taskCommand).toBeDefined();

    const countCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'count');
    expect(countCommand).toBeDefined();
    expect(countCommand?.description()).toBe('Show task count by status');
  });

  it('should have correct options', () => {
    const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
    const countCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'count');

    const options = countCommand?.options || [];
    const optionNames = options.map((opt) => opt.long);

    expect(optionNames).toContain('--status');
    expect(optionNames).toContain('--quiet');
    expect(optionNames).toContain('--json');
  });

  it('should count all tasks by status', async () => {
    const taskService = new TaskService();
    taskService.createTask({ title: 'Task A', status: 'ready' });
    taskService.createTask({ title: 'Task B', status: 'ready' });
    taskService.createTask({ title: 'Task C', status: 'backlog' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'count']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('ready');
    expect(output).toContain('backlog');
  });

  it('should count tasks by specific status with --status', async () => {
    const taskService = new TaskService();
    taskService.createTask({ title: 'Task A', status: 'ready' });
    taskService.createTask({ title: 'Task B', status: 'ready' });
    taskService.createTask({ title: 'Task C', status: 'backlog' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'count', '--status', 'ready']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('ready');
    expect(output).toContain('2');
  });

  it('should output JSON format with --json option', async () => {
    const taskService = new TaskService();
    taskService.createTask({ title: 'Task A', status: 'ready' });
    taskService.createTask({ title: 'Task B', status: 'backlog' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'count', '--json']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const parsed = JSON.parse(consoleLogs[0]);
    expect(parsed.counts).toBeDefined();
    expect(parsed.total).toBe(2);
    expect(parsed.counts.ready).toBe(1);
    expect(parsed.counts.backlog).toBe(1);
  });

  it('should output JSON with status filter', async () => {
    const taskService = new TaskService();
    taskService.createTask({ title: 'Task A', status: 'ready' });
    taskService.createTask({ title: 'Task B', status: 'ready' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'count', '--status', 'ready', '--json']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const parsed = JSON.parse(consoleLogs[0]);
    expect(parsed.status).toBe('ready');
    expect(parsed.count).toBe(2);
  });

  it('should output only the count number with --quiet and --status', async () => {
    const taskService = new TaskService();
    taskService.createTask({ title: 'Task A', status: 'ready' });
    taskService.createTask({ title: 'Task B', status: 'ready' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'count', '--status', 'ready', '--quiet']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(consoleLogs[0].trim()).toBe('2');
  });

  it('should show error when --quiet is used without --status', async () => {
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'count', '--quiet']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('quiet');
  });

  it('should show error on invalid status', async () => {
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'count', '--status', 'invalid_status']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('Invalid status');
  });
});
