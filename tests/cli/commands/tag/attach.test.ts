/**
 * Tests for tag attach command handler
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Command } from 'commander';
import { setupTagAttachCommand } from '../../../../src/cli/commands/tag/attach';
import { getDatabase } from '../../../../src/db/connection';
import { TaskService, TagService, TaskTagService } from '../../../../src/services';

describe('setupTagAttachCommand', () => {
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

    // Setup the attach command
    setupTagAttachCommand(program);
  });

  it('should register the attach command', () => {
    const tagCommand = program.commands.find((cmd) => cmd.name() === 'tag');
    expect(tagCommand).toBeDefined();

    const attachCommand = tagCommand?.commands.find((cmd) => cmd.name() === 'attach');
    expect(attachCommand).toBeDefined();
    expect(attachCommand?.description()).toBe('Attach a tag to a task');
  });

  it('should have correct arguments', () => {
    const tagCommand = program.commands.find((cmd) => cmd.name() === 'tag');
    const attachCommand = tagCommand?.commands.find((cmd) => cmd.name() === 'attach');

    expect(attachCommand?.registeredArguments).toHaveLength(2);
    expect(attachCommand?.registeredArguments[0].name()).toBe('task-id');
    expect(attachCommand?.registeredArguments[1].name()).toBe('tag-id-or-name');
  });

  it('should attach a tag to a task', async () => {
    const taskService = new TaskService();
    const tagService = new TagService();
    const taskTagService = new TaskTagService();

    taskService.createTask({ title: 'Test task', body: null, author: null, status: 'ready', parent_id: null });
    tagService.createTag({ name: 'test-tag' });
    const task = taskService.listTasks()[0];
    const tag = tagService.listTags()[0];

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'tag', 'attach', String(task.id), String(tag.id)]);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('✓');

    const attachedTags = taskTagService.getTagsForTask(task.id);
    expect(attachedTags).toHaveLength(1);
    expect(attachedTags[0].id).toBe(tag.id);
  });

  it('should output JSON on successful attach with --json option', async () => {
    const taskService = new TaskService();
    const tagService = new TagService();

    taskService.createTask({ title: 'Task for JSON', body: null, author: null, status: 'ready', parent_id: null });
    tagService.createTag({ name: 'json-attach-tag' });
    const task = taskService.listTasks()[0];
    const tag = tagService.listTags()[0];

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'tag', 'attach', String(task.id), String(tag.id), '--json']);
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
    tagService.createTag({ name: 'orphan-tag' });
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
      await program.parseAsync(['node', 'test', 'tag', 'attach', '999', String(tag.id)]);
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
    taskService.createTask({ title: 'Tagless task', body: null, author: null, status: 'ready', parent_id: null });
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
      await program.parseAsync(['node', 'test', 'tag', 'attach', String(task.id), '999']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('999');
  });

  it('should show error when tag is already attached', async () => {
    const taskService = new TaskService();
    const tagService = new TagService();
    const taskTagService = new TaskTagService();

    taskService.createTask({ title: 'Double attach task', body: null, author: null, status: 'ready', parent_id: null });
    tagService.createTag({ name: 'double-tag' });
    const task = taskService.listTasks()[0];
    const tag = tagService.listTags()[0];
    taskTagService.addTagToTask({ task_id: task.id, tag_id: tag.id });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'tag', 'attach', String(task.id), String(tag.id)]);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('already');
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
      await program.parseAsync(['node', 'test', 'tag', 'attach', 'abc', '1']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('number');
  });

  it('should attach a tag to a task by tag name', async () => {
    const taskService = new TaskService();
    const tagService = new TagService();
    const taskTagService = new TaskTagService();

    taskService.createTask({
      title: 'Task for name attach',
      body: null,
      author: null,
      status: 'ready',
      parent_id: null,
    });
    tagService.createTag({ name: 'feature-tag' });
    const task = taskService.listTasks()[0];

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'tag', 'attach', String(task.id), 'feature-tag']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('✓');

    const attachedTags = taskTagService.getTagsForTask(task.id);
    expect(attachedTags).toHaveLength(1);
    expect(attachedTags[0].name).toBe('feature-tag');
  });

  it('should show error when tag name does not exist', async () => {
    const taskService = new TaskService();
    taskService.createTask({ title: 'Tagless task', body: null, author: null, status: 'ready', parent_id: null });
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
      await program.parseAsync(['node', 'test', 'tag', 'attach', String(task.id), 'nonexistent-tag']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('nonexistent-tag');
  });
});
