/**
 * Tests for task copy command handler
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';
import { setupTaskCopyCommand } from '../../../../src/cli/commands/task/copy';
import { getDatabase } from '../../../../src/db/connection';
import { TaskService } from '../../../../src/services/TaskService';
import { TagService } from '../../../../src/services/TagService';
import { TaskTagService } from '../../../../src/services/TaskTagService';
import { createProgram, runCommand } from '../../../helpers/command-test-utils';

describe('setupTaskCopyCommand', () => {
  let program: Command;
  let taskService: TaskService;
  let tagService: TagService;
  let taskTagService: TaskTagService;

  beforeEach(() => {
    const db = getDatabase();
    db.exec('DELETE FROM task_tags');
    db.exec('DELETE FROM tags');
    db.exec('DELETE FROM task_blocks');
    db.exec('DELETE FROM tasks');
    db.exec("DELETE FROM sqlite_sequence WHERE name='tasks'");
    db.exec("DELETE FROM sqlite_sequence WHERE name='tags'");

    taskService = new TaskService();
    tagService = new TagService();
    taskTagService = new TaskTagService();
    program = createProgram((prog) => {
      prog.command('task').description('Task management commands');
      setupTaskCopyCommand(prog);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should register the copy command', () => {
    const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
    expect(taskCommand).toBeDefined();

    const copyCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'copy');
    expect(copyCommand).toBeDefined();
    expect(copyCommand?.description()).toBe('Copy a task by ID');
  });

  it('should have correct options', () => {
    const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
    const copyCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'copy');
    const options = copyCommand?.options || [];
    const optionNames = options.map((opt) => opt.long);

    expect(optionNames).toContain('--status');
    expect(optionNames).toContain('--no-tags');
    expect(optionNames).toContain('--json');
  });

  it('should throw if task command is not found', () => {
    const emptyProgram = new Command();
    emptyProgram.exitOverride();
    expect(() => setupTaskCopyCommand(emptyProgram)).toThrow('Task command not found');
  });

  describe('ID validation', () => {
    it('should exit with error when ID is not a number', async () => {
      const { exitCode, logs } = await runCommand(program, ['task', 'copy', 'abc']);
      expect(exitCode).toBe(1);
      expect(logs.join('\n')).toContain('Task ID must be a number');
    });

    it('should output JSON error when ID is not a number with --json', async () => {
      const { exitCode, logs } = await runCommand(program, ['task', 'copy', 'abc', '--json']);
      expect(exitCode).toBe(1);
      const output = JSON.parse(logs[0]);
      expect(output.success).toBe(false);
      expect(output.error.message).toContain('Task ID must be a number');
    });

    it('should exit with error when task does not exist', async () => {
      const { exitCode, logs } = await runCommand(program, ['task', 'copy', '99999']);
      expect(exitCode).toBe(1);
      expect(logs.join('\n')).toContain('not found');
    });

    it('should output JSON error when task does not exist with --json', async () => {
      const { exitCode, logs } = await runCommand(program, ['task', 'copy', '99999', '--json']);
      expect(exitCode).toBe(1);
      const output = JSON.parse(logs[0]);
      expect(output.success).toBe(false);
      expect(output.error.message).toContain('not found');
    });
  });

  describe('status validation', () => {
    it('should exit with error for invalid status', async () => {
      const original = taskService.createTask({ title: 'Original Task' });
      const { exitCode, logs } = await runCommand(program, [
        'task',
        'copy',
        original.id.toString(),
        '--status',
        'invalid',
      ]);
      expect(exitCode).toBe(1);
      expect(logs.join('\n')).toContain('Invalid status');
    });
  });

  describe('successful copy', () => {
    it('should copy task with default status backlog', async () => {
      const original = taskService.createTask({ title: 'Original Task', body: 'Some body', status: 'in_progress' });
      const { exitCode, logs } = await runCommand(program, ['task', 'copy', original.id.toString()]);
      expect(exitCode).toBeUndefined();

      const output = logs.join('\n');
      expect(output).toContain('Task copied successfully');
      expect(output).toContain('Original Task');

      const tasks = taskService.listTasks();
      expect(tasks).toHaveLength(2);
      const copied = tasks.find((t) => t.id !== original.id)!;
      expect(copied.title).toBe('Original Task');
      expect(copied.body).toBe('Some body');
      expect(copied.status).toBe('backlog');
    });

    it('should copy task with custom status via --status option', async () => {
      const original = taskService.createTask({ title: 'Task', status: 'done' });
      const { exitCode } = await runCommand(program, ['task', 'copy', original.id.toString(), '--status', 'ready']);
      expect(exitCode).toBeUndefined();

      const tasks = taskService.listTasks();
      const copied = tasks.find((t) => t.id !== original.id)!;
      expect(copied.status).toBe('ready');
    });

    it('should copy author, assignees, priority, and parent_id', async () => {
      const parent = taskService.createTask({ title: 'Parent' });
      const original = taskService.createTask({
        title: 'Task',
        author: 'alice',
        assignees: 'bob,carol',
        priority: 'high',
        parent_id: parent.id,
      });
      const { exitCode } = await runCommand(program, ['task', 'copy', original.id.toString()]);
      expect(exitCode).toBeUndefined();

      const tasks = taskService.listTasks();
      const copied = tasks.find((t) => t.id !== original.id && t.id !== parent.id)!;
      expect(copied.author).toBe('alice');
      expect(copied.assignees).toBe('bob,carol');
      expect(copied.priority).toBe('high');
      expect(copied.parent_id).toBe(parent.id);
    });

    it('should copy tags by default', async () => {
      const original = taskService.createTask({ title: 'Tagged Task' });
      const tag = tagService.createTag({ name: 'urgent' });
      taskTagService.addTagToTask({ task_id: original.id, tag_id: tag.id });

      const { exitCode } = await runCommand(program, ['task', 'copy', original.id.toString()]);
      expect(exitCode).toBeUndefined();

      const tasks = taskService.listTasks();
      const copied = tasks.find((t) => t.id !== original.id)!;
      const copiedTags = taskTagService.getTagsForTask(copied.id);
      expect(copiedTags).toHaveLength(1);
      expect(copiedTags[0].name).toBe('urgent');
    });

    it('should not copy tags when --no-tags is specified', async () => {
      const original = taskService.createTask({ title: 'Tagged Task' });
      const tag = tagService.createTag({ name: 'urgent' });
      taskTagService.addTagToTask({ task_id: original.id, tag_id: tag.id });

      const { exitCode } = await runCommand(program, ['task', 'copy', original.id.toString(), '--no-tags']);
      expect(exitCode).toBeUndefined();

      const tasks = taskService.listTasks();
      const copied = tasks.find((t) => t.id !== original.id)!;
      const copiedTags = taskTagService.getTagsForTask(copied.id);
      expect(copiedTags).toHaveLength(0);
    });

    it('should output JSON when --json is specified', async () => {
      const original = taskService.createTask({ title: 'JSON Task', body: 'body text' });
      const { exitCode, logs } = await runCommand(program, ['task', 'copy', original.id.toString(), '--json']);
      expect(exitCode).toBeUndefined();

      const output = JSON.parse(logs[0]);
      expect(output.success).toBe(true);
      expect(output.task.title).toBe('JSON Task');
      expect(output.task.body).toBe('body text');
      expect(output.task.status).toBe('backlog');
      expect(output.originalId).toBe(original.id);
    });

    it('should include tags in JSON output when tags are copied', async () => {
      const original = taskService.createTask({ title: 'Tagged JSON Task' });
      const tag = tagService.createTag({ name: 'feat' });
      taskTagService.addTagToTask({ task_id: original.id, tag_id: tag.id });

      const { exitCode, logs } = await runCommand(program, ['task', 'copy', original.id.toString(), '--json']);
      expect(exitCode).toBeUndefined();

      const output = JSON.parse(logs[0]);
      expect(output.success).toBe(true);
      expect(output.tags).toHaveLength(1);
      expect(output.tags[0].name).toBe('feat');
    });
  });
});
