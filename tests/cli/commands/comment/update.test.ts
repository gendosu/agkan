/**
 * Tests for task comment update command handler
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Command } from 'commander';
import { setupCommentUpdateCommand } from '../../../../src/cli/commands/comment/update';
import { getDatabase } from '../../../../src/db/connection';
import { TaskService, CommentService } from '../../../../src/services';

function resetDatabase() {
  const db = getDatabase();
  db.exec('DELETE FROM task_comments');
  db.exec('DELETE FROM task_metadata');
  db.exec('DELETE FROM task_tags');
  db.exec('DELETE FROM task_blocks');
  db.exec('DELETE FROM tasks');
  db.exec("DELETE FROM sqlite_sequence WHERE name='tasks'");
  db.exec("DELETE FROM sqlite_sequence WHERE name='task_comments'");
}

describe('setupCommentUpdateCommand', () => {
  let program: Command;

  beforeEach(() => {
    resetDatabase();

    program = new Command();
    program.exitOverride();
    program.command('task').description('Task management commands');
    setupCommentUpdateCommand(program);
  });

  it('should register the comment update command', () => {
    const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
    expect(taskCommand).toBeDefined();

    const commentCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'comment');
    expect(commentCommand).toBeDefined();

    const updateCommand = commentCommand?.commands.find((cmd) => cmd.name() === 'update');
    expect(updateCommand).toBeDefined();
    expect(updateCommand?.description()).toBe('Update a comment by ID');
  });

  it('should have --json option', () => {
    const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
    const commentCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'comment');
    const updateCommand = commentCommand?.commands.find((cmd) => cmd.name() === 'update');

    const options = updateCommand?.options || [];
    const optionNames = options.map((opt) => opt.long);
    expect(optionNames).toContain('--json');
  });

  it('should update a comment successfully', async () => {
    const taskService = new TaskService();
    const commentService = new CommentService();
    const task = taskService.createTask({ title: 'Test task', status: 'ready' });
    const comment = commentService.addComment({ task_id: task.id, content: 'Original content' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'comment', 'update', String(comment.id), 'Updated content']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('Comment updated successfully');
    expect(output).toContain('Updated content');

    const fetched = commentService.getComment(comment.id);
    expect(fetched?.content).toBe('Updated content');
  });

  it('should output JSON when --json flag is used', async () => {
    const taskService = new TaskService();
    const commentService = new CommentService();
    const task = taskService.createTask({ title: 'Test task', status: 'ready' });
    const comment = commentService.addComment({ task_id: task.id, content: 'Original content' });

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
        'comment',
        'update',
        String(comment.id),
        'JSON updated content',
        '--json',
      ]);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    const parsed = JSON.parse(output);
    expect(parsed.success).toBe(true);
    expect(parsed.data.content).toBe('JSON updated content');
  });

  it('should show error when comment does not exist', async () => {
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const consoleErrors: string[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => consoleErrors.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'comment', 'update', '99999', 'New content']);
    } finally {
      console.log = originalLog;
      console.error = originalError;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleErrors.join('\n');
    expect(output).toContain('99999');
  });

  it('should show error when comment ID is not a number', async () => {
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const consoleErrors: string[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => consoleErrors.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'comment', 'update', 'abc', 'New content']);
    } finally {
      console.log = originalLog;
      console.error = originalError;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleErrors.join('\n');
    expect(output).toContain('number');
  });

  it('should show error when content is empty', async () => {
    const taskService = new TaskService();
    const commentService = new CommentService();
    const task = taskService.createTask({ title: 'Test task', status: 'ready' });
    const comment = commentService.addComment({ task_id: task.id, content: 'Original content' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const consoleErrors: string[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => consoleErrors.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'comment', 'update', String(comment.id), '']);
    } finally {
      console.log = originalLog;
      console.error = originalError;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleErrors.join('\n');
    expect(output).toContain('required');
  });

  it('should create task command when it does not exist', () => {
    const programWithoutTask = new Command();
    programWithoutTask.exitOverride();
    setupCommentUpdateCommand(programWithoutTask);

    const taskCommand = programWithoutTask.commands.find((cmd) => cmd.name() === 'task');
    expect(taskCommand).toBeDefined();

    const commentCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'comment');
    expect(commentCommand).toBeDefined();

    const updateCommand = commentCommand?.commands.find((cmd) => cmd.name() === 'update');
    expect(updateCommand).toBeDefined();
  });

  it('should handle non-Error thrown in catch block', async () => {
    const { vi } = await import('vitest');
    const serviceContainerModule = await import('../../../../src/cli/utils/service-container');
    const getServiceContainerSpy = vi.spyOn(serviceContainerModule, 'getServiceContainer');
    getServiceContainerSpy.mockImplementation(() => {
      throw 'string error';
    });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const consoleErrors: string[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => consoleErrors.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'comment', 'update', '1', 'content']);
    } finally {
      console.log = originalLog;
      console.error = originalError;
      process.exit = originalExit;
      getServiceContainerSpy.mockRestore();
    }

    expect(exitCode).toBe(1);
    const output = consoleErrors.join('\n');
    expect(output).toContain('Unknown error');
  });
});
