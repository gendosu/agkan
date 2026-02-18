/**
 * Tests for task update-parent command handler
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Command } from 'commander';
import { setupTaskUpdateParentCommand } from '../../../../src/cli/commands/task/update-parent';
import { getDatabase } from '../../../../src/db/connection';
import { TaskService } from '../../../../src/services';

function resetDatabase() {
  const db = getDatabase();
  db.exec('DELETE FROM task_tags');
  db.exec('DELETE FROM task_blocks');
  db.exec('DELETE FROM tasks');
  db.exec("DELETE FROM sqlite_sequence WHERE name='tasks'");
}

describe('setupTaskUpdateParentCommand', () => {
  let program: Command;

  beforeEach(() => {
    resetDatabase();

    program = new Command();
    program.exitOverride();
    program.command('task').description('Task management commands');
    setupTaskUpdateParentCommand(program);
  });

  it('should register the update-parent command', () => {
    const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
    expect(taskCommand).toBeDefined();

    const updateParentCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'update-parent');
    expect(updateParentCommand).toBeDefined();
    expect(updateParentCommand?.description()).toBe('Update task parent');
  });

  it('should have correct options', () => {
    const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
    const updateParentCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'update-parent');

    const options = updateParentCommand?.options || [];
    const optionNames = options.map((opt) => opt.long);

    expect(optionNames).toContain('--json');
  });

  it('should update parent of task', async () => {
    const taskService = new TaskService();
    const parent = taskService.createTask({ title: 'Parent Task', status: 'ready' });
    const child = taskService.createTask({ title: 'Child Task', status: 'ready' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'update-parent', String(child.id), String(parent.id)]);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('✓');

    const updatedTask = taskService.getTask(child.id);
    expect(updatedTask?.parent_id).toBe(parent.id);
  });

  it('should remove parent with "null"', async () => {
    const taskService = new TaskService();
    const parent = taskService.createTask({ title: 'Parent Task', status: 'ready' });
    const child = taskService.createTask({ title: 'Child Task', status: 'ready', parent_id: parent.id });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'update-parent', String(child.id), 'null']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('✓');

    const updatedTask = taskService.getTask(child.id);
    expect(updatedTask?.parent_id).toBeNull();
  });

  it('should remove parent with "none"', async () => {
    const taskService = new TaskService();
    const parent = taskService.createTask({ title: 'Parent Task', status: 'ready' });
    const child = taskService.createTask({ title: 'Child Task', status: 'ready', parent_id: parent.id });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'update-parent', String(child.id), 'none']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const updatedTask = taskService.getTask(child.id);
    expect(updatedTask?.parent_id).toBeNull();
  });

  it('should output JSON on success with --json option', async () => {
    const taskService = new TaskService();
    const parent = taskService.createTask({ title: 'Parent Task', status: 'ready' });
    const child = taskService.createTask({ title: 'Child Task', status: 'ready' });

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
        'update-parent',
        String(child.id),
        String(parent.id),
        '--json',
      ]);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const parsed = JSON.parse(consoleLogs[0]);
    expect(parsed.success).toBe(true);
    expect(parsed.task.id).toBe(child.id);
    expect(parsed.task.parent_id).toBe(parent.id);
    expect(parsed.parent).toBeDefined();
    expect(parsed.parent.id).toBe(parent.id);
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
      await program.parseAsync(['node', 'test', 'task', 'update-parent', '999', '1']);
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
      await program.parseAsync(['node', 'test', 'task', 'update-parent', 'abc', '1']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('number');
  });

  it('should show error when parent ID is not a number or null/none', async () => {
    const taskService = new TaskService();
    const child = taskService.createTask({ title: 'Child Task', status: 'ready' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'update-parent', String(child.id), 'invalid_parent']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('number');
  });
});
