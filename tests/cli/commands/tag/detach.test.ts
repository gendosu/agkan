/**
 * Tests for tag detach command handler
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Command } from 'commander';
import { setupTagDetachCommand } from '../../../../src/cli/commands/tag/detach';
import { getDatabase } from '../../../../src/db/connection';
import { TaskService, TagService, TaskTagService } from '../../../../src/services';

describe('setupTagDetachCommand', () => {
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

    // Setup the detach command
    setupTagDetachCommand(program);
  });

  it('should register the detach command', () => {
    const tagCommand = program.commands.find((cmd) => cmd.name() === 'tag');
    expect(tagCommand).toBeDefined();

    const detachCommand = tagCommand?.commands.find((cmd) => cmd.name() === 'detach');
    expect(detachCommand).toBeDefined();
    expect(detachCommand?.description()).toBe('Detach a tag from a task');
  });

  it('should have correct arguments', () => {
    const tagCommand = program.commands.find((cmd) => cmd.name() === 'tag');
    const detachCommand = tagCommand?.commands.find((cmd) => cmd.name() === 'detach');

    expect(detachCommand?.registeredArguments).toHaveLength(2);
    expect(detachCommand?.registeredArguments[0].name()).toBe('task-id');
    expect(detachCommand?.registeredArguments[1].name()).toBe('tag-id-or-name');
  });

  it('should detach a tag from a task', async () => {
    const taskService = new TaskService();
    const tagService = new TagService();
    const taskTagService = new TaskTagService();

    taskService.createTask({ title: 'Tagged task', body: null, author: null, status: 'ready', parent_id: null });
    tagService.createTag({ name: 'remove-tag' });
    const task = taskService.listTasks()[0];
    const tag = tagService.listTags()[0];
    taskTagService.addTagToTask({ task_id: task.id, tag_id: tag.id });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'tag', 'detach', String(task.id), String(tag.id)]);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('✓');

    const remainingTags = taskTagService.getTagsForTask(task.id);
    expect(remainingTags).toHaveLength(0);
  });

  it('should output JSON on successful detach with --json option', async () => {
    const taskService = new TaskService();
    const tagService = new TagService();
    const taskTagService = new TaskTagService();

    taskService.createTask({ title: 'JSON detach task', body: null, author: null, status: 'ready', parent_id: null });
    tagService.createTag({ name: 'json-detach-tag' });
    const task = taskService.listTasks()[0];
    const tag = tagService.listTags()[0];
    taskTagService.addTagToTask({ task_id: task.id, tag_id: tag.id });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'tag', 'detach', String(task.id), String(tag.id), '--json']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const parsed = JSON.parse(consoleLogs.join(''));
    expect(parsed.success).toBe(true);
    expect(parsed.task.id).toBe(task.id);
    expect(parsed.tag.id).toBe(tag.id);
  });

  it('should show error when task does not exist', async () => {
    const tagService = new TagService();
    tagService.createTag({ name: 'some-tag' });
    const tag = tagService.listTags()[0];

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'tag', 'detach', '999', String(tag.id)]);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('999');
  });

  it('should show error when tag does not exist', async () => {
    const taskService = new TaskService();
    taskService.createTask({ title: 'No tag task', body: null, author: null, status: 'ready', parent_id: null });
    const task = taskService.listTasks()[0];

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'tag', 'detach', String(task.id), '999']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('999');
  });

  it('should show error when tag is not attached to task', async () => {
    const taskService = new TaskService();
    const tagService = new TagService();

    taskService.createTask({ title: 'Untagged task', body: null, author: null, status: 'ready', parent_id: null });
    tagService.createTag({ name: 'unattached-tag' });
    const task = taskService.listTasks()[0];
    const tag = tagService.listTags()[0];

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'tag', 'detach', String(task.id), String(tag.id)]);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('not attached');
  });

  it('should show error when tag name does not exist', async () => {
    const taskService = new TaskService();
    taskService.createTask({ title: 'No tag task', body: null, author: null, status: 'ready', parent_id: null });
    const task = taskService.listTasks()[0];

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'tag', 'detach', String(task.id), 'nonexistent-tag']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('nonexistent-tag');
  });

  it('should detach a tag from a task by tag name', async () => {
    const taskService = new TaskService();
    const tagService = new TagService();
    const taskTagService = new TaskTagService();

    taskService.createTask({ title: 'Name detach task', body: null, author: null, status: 'ready', parent_id: null });
    tagService.createTag({ name: 'detach-by-name' });
    const task = taskService.listTasks()[0];
    const tag = tagService.listTags()[0];
    taskTagService.addTagToTask({ task_id: task.id, tag_id: tag.id });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'tag', 'detach', String(task.id), 'detach-by-name']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('✓');

    const remainingTags = taskTagService.getTagsForTask(task.id);
    expect(remainingTags).toHaveLength(0);
  });
});
