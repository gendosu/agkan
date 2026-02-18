/**
 * Tests for tag show command handler
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Command } from 'commander';
import { setupTagShowCommand } from '../../../../src/cli/commands/tag/show';
import { getDatabase } from '../../../../src/db/connection';
import { TaskService, TagService, TaskTagService } from '../../../../src/services';

describe('setupTagShowCommand', () => {
  let program: Command;

  beforeEach(() => {
    // Reset database before each test
    const db = getDatabase();
    db.exec('DELETE FROM tasks');
    db.exec('DELETE FROM tags');
    db.exec('DELETE FROM task_tags');
    db.exec("DELETE FROM sqlite_sequence WHERE name='tasks'");
    db.exec("DELETE FROM sqlite_sequence WHERE name='tags'");

    // Create a fresh program with top-level tag command
    program = new Command();
    program.command('tag').description('Tag management commands');

    // Setup the show command
    setupTagShowCommand(program);
  });

  it('should register the show command', () => {
    const tagCommand = program.commands.find((cmd) => cmd.name() === 'tag');
    expect(tagCommand).toBeDefined();

    const showCommand = tagCommand?.commands.find((cmd) => cmd.name() === 'show');
    expect(showCommand).toBeDefined();
    expect(showCommand?.description()).toBe('Show all tags attached to a task');
  });

  it('should have correct arguments and options', () => {
    const tagCommand = program.commands.find((cmd) => cmd.name() === 'tag');
    const showCommand = tagCommand?.commands.find((cmd) => cmd.name() === 'show');

    expect(showCommand?.registeredArguments).toHaveLength(1);
    expect(showCommand?.registeredArguments[0].name()).toBe('task-id');

    const options = showCommand?.options || [];
    const optionNames = options.map((opt) => opt.long);
    expect(optionNames).toContain('--json');
  });

  it('should show "No tags attached" when task has no tags', async () => {
    const taskService = new TaskService();
    taskService.createTask({ title: 'Untagged task', body: null, author: null, status: 'ready', parent_id: null });
    const task = taskService.listTasks()[0];

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'tag', 'show', String(task.id)]);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('No tags attached');
  });

  it('should show attached tags for a task', async () => {
    const taskService = new TaskService();
    const tagService = new TagService();
    const taskTagService = new TaskTagService();

    taskService.createTask({ title: 'Tagged task', body: null, author: null, status: 'ready', parent_id: null });
    tagService.createTag({ name: 'visible-tag' });
    const task = taskService.listTasks()[0];
    const tag = tagService.listTags()[0];
    taskTagService.addTagToTask({ task_id: task.id, tag_id: tag.id });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'tag', 'show', String(task.id)]);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('visible-tag');
  });

  it('should output JSON with tags for task with --json option', async () => {
    const taskService = new TaskService();
    const tagService = new TagService();
    const taskTagService = new TaskTagService();

    taskService.createTask({ title: 'JSON show task', body: null, author: null, status: 'ready', parent_id: null });
    tagService.createTag({ name: 'json-show-tag' });
    const task = taskService.listTasks()[0];
    const tag = tagService.listTags()[0];
    taskTagService.addTagToTask({ task_id: task.id, tag_id: tag.id });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'tag', 'show', String(task.id), '--json']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const parsed = JSON.parse(consoleLogs.join(''));
    expect(parsed.task.id).toBe(task.id);
    expect(parsed.tags).toHaveLength(1);
    expect(parsed.tags[0].name).toBe('json-show-tag');
  });

  it('should output JSON with empty tags array for task with no tags', async () => {
    const taskService = new TaskService();
    taskService.createTask({ title: 'Empty tag task', body: null, author: null, status: 'ready', parent_id: null });
    const task = taskService.listTasks()[0];

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'tag', 'show', String(task.id), '--json']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const parsed = JSON.parse(consoleLogs.join(''));
    expect(parsed.task.id).toBe(task.id);
    expect(parsed.tags).toHaveLength(0);
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
      await program.parseAsync(['node', 'test', 'tag', 'show', '999']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('999');
  });

  it('should show JSON error when task does not exist with --json option', async () => {
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'tag', 'show', '999', '--json']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const parsed = JSON.parse(consoleLogs[0]);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toBeDefined();
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
      await program.parseAsync(['node', 'test', 'tag', 'show', 'abc']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('number');
  });
});
