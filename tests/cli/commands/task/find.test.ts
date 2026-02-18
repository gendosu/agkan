/**
 * Tests for task find command handler
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Command } from 'commander';
import { setupTaskFindCommand } from '../../../../src/cli/commands/task/find';
import { getDatabase } from '../../../../src/db/connection';
import { TaskService } from '../../../../src/services';

function resetDatabase() {
  const db = getDatabase();
  db.exec('DELETE FROM task_tags');
  db.exec('DELETE FROM task_blocks');
  db.exec('DELETE FROM tasks');
  db.exec("DELETE FROM sqlite_sequence WHERE name='tasks'");
}

describe('setupTaskFindCommand', () => {
  let program: Command;

  beforeEach(() => {
    resetDatabase();

    program = new Command();
    program.exitOverride();
    program.command('task').description('Task management commands');
    setupTaskFindCommand(program);
  });

  it('should register the find command', () => {
    const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
    expect(taskCommand).toBeDefined();

    const findCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'find');
    expect(findCommand).toBeDefined();
    expect(findCommand?.description()).toBe('Search tasks by keyword (excludes done/closed by default)');
  });

  it('should have correct options', () => {
    const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
    const findCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'find');

    const options = findCommand?.options || [];
    const optionNames = options.map((opt) => opt.long);

    expect(optionNames).toContain('--all');
    expect(optionNames).toContain('--json');
  });

  it('should find tasks matching keyword', async () => {
    const taskService = new TaskService();
    taskService.createTask({ title: 'Fix login bug', status: 'ready' });
    taskService.createTask({ title: 'Add new feature', status: 'ready' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'find', 'login']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('Fix login bug');
    expect(output).not.toContain('Add new feature');
  });

  it('should show no tasks found when no match', async () => {
    const taskService = new TaskService();
    taskService.createTask({ title: 'Fix login bug', status: 'ready' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'find', 'nonexistent_keyword']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('No tasks found');
  });

  it('should exclude done/closed by default', async () => {
    const taskService = new TaskService();
    taskService.createTask({ title: 'Active task', status: 'ready' });
    taskService.createTask({ title: 'Done task', status: 'done' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'find', 'task']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('Active task');
    expect(output).not.toContain('Done task');
  });

  it('should include done/closed tasks with --all option', async () => {
    const taskService = new TaskService();
    taskService.createTask({ title: 'Active task', status: 'ready' });
    taskService.createTask({ title: 'Done task', status: 'done' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'find', 'task', '--all']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('Active task');
    expect(output).toContain('Done task');
  });

  it('should output JSON format with --json option', async () => {
    const taskService = new TaskService();
    taskService.createTask({ title: 'Search me', status: 'ready' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'find', 'Search me', '--json']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const parsed = JSON.parse(consoleLogs[0]);
    expect(parsed.totalCount).toBe(1);
    expect(parsed.tasks[0].title).toBe('Search me');
    expect(parsed.keyword).toBe('Search me');
    expect(parsed.excludeDoneClosed).toBe(true);
  });

  it('should output empty JSON when no tasks match with --json', async () => {
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'find', 'nonexistent', '--json']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const parsed = JSON.parse(consoleLogs[0]);
    expect(parsed.totalCount).toBe(0);
    expect(parsed.tasks).toHaveLength(0);
  });

  it('should search in body text', async () => {
    const taskService = new TaskService();
    taskService.createTask({ title: 'Task title', body: 'Unique body content here', status: 'ready' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'find', 'Unique body content']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('Task title');
  });
});
