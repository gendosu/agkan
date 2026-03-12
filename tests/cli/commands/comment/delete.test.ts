/**
 * Tests for task comment delete command handler
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Command } from 'commander';
import { setupCommentDeleteCommand } from '../../../../src/cli/commands/comment/delete';
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

describe('setupCommentDeleteCommand', () => {
  let program: Command;

  beforeEach(() => {
    resetDatabase();

    program = new Command();
    program.exitOverride();
    program.command('task').description('Task management commands');
    setupCommentDeleteCommand(program);
  });

  it('should register the comment delete command', () => {
    const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
    expect(taskCommand).toBeDefined();

    const commentCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'comment');
    expect(commentCommand).toBeDefined();

    const deleteCommand = commentCommand?.commands.find((cmd) => cmd.name() === 'delete');
    expect(deleteCommand).toBeDefined();
    expect(deleteCommand?.description()).toBe('Delete a comment by ID');
  });

  it('should have --json option', () => {
    const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
    const commentCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'comment');
    const deleteCommand = commentCommand?.commands.find((cmd) => cmd.name() === 'delete');

    const options = deleteCommand?.options || [];
    const optionNames = options.map((opt) => opt.long);
    expect(optionNames).toContain('--json');
  });

  it('should delete a comment successfully', async () => {
    const taskService = new TaskService();
    const commentService = new CommentService();
    const task = taskService.createTask({ title: 'Test task', status: 'ready' });
    const comment = commentService.addComment({ task_id: task.id, content: 'To delete' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'comment', 'delete', String(comment.id)]);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('Comment deleted successfully');

    const fetched = commentService.getComment(comment.id);
    expect(fetched).toBeNull();
  });

  it('should output JSON when --json flag is used', async () => {
    const taskService = new TaskService();
    const commentService = new CommentService();
    const task = taskService.createTask({ title: 'Test task', status: 'ready' });
    const comment = commentService.addComment({ task_id: task.id, content: 'JSON delete' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'comment', 'delete', String(comment.id), '--json']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    const parsed = JSON.parse(output);
    expect(parsed.success).toBe(true);
    expect(parsed.message).toBe('Comment deleted');
  });

  it('should show error when comment does not exist', async () => {
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'comment', 'delete', '99999']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('99999');
  });

  it('should show error when comment ID is not a number', async () => {
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'comment', 'delete', 'abc']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('number');
  });
});
