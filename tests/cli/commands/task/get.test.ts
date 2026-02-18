/**
 * Tests for task get command handler
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';
import { setupTaskGetCommand } from '../../../../src/cli/commands/task/get';
import { getDatabase } from '../../../../src/db/connection';
import { TaskService, TaskBlockService, TaskTagService, TagService } from '../../../../src/services';

function resetDatabase() {
  const db = getDatabase();
  db.exec('DELETE FROM task_tags');
  db.exec('DELETE FROM task_blocks');
  db.exec('DELETE FROM tasks');
  db.exec('DELETE FROM tags');
  db.exec("DELETE FROM sqlite_sequence WHERE name='tasks'");
  db.exec("DELETE FROM sqlite_sequence WHERE name='tags'");
}

function createProgram(): Command {
  const prog = new Command();
  prog.exitOverride();
  prog.command('task').description('Task management commands');
  setupTaskGetCommand(prog);
  return prog;
}

async function runCommand(program: Command, args: string[]): Promise<{ logs: string[]; exitCode: number | undefined }> {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...a: unknown[]) => logs.push(a.join(' '));

  let exitCode: number | undefined;
  const originalExit = process.exit;
  process.exit = ((code?: number) => {
    exitCode = code;
  }) as never;

  try {
    await program.parseAsync(['node', 'test', ...args]);
  } finally {
    console.log = originalLog;
    process.exit = originalExit;
  }

  return { logs, exitCode };
}

describe('setupTaskGetCommand', () => {
  let program: Command;

  beforeEach(() => {
    resetDatabase();
    program = createProgram();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should register the get command', () => {
    const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
    expect(taskCommand).toBeDefined();

    const getCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'get');
    expect(getCommand).toBeDefined();
    expect(getCommand?.description()).toBe('Get a task by ID');
  });

  it('should have correct options', () => {
    const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
    const getCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'get');

    const options = getCommand?.options || [];
    const optionNames = options.map((opt) => opt.long);

    expect(optionNames).toContain('--json');
  });

  it('should throw if task command is not found', () => {
    const emptyProgram = new Command();
    emptyProgram.exitOverride();
    expect(() => setupTaskGetCommand(emptyProgram)).toThrow('Task command not found');
  });

  describe('ID validation', () => {
    it('should show error when ID is not a number (non-JSON)', async () => {
      const { exitCode, logs } = await runCommand(program, ['task', 'get', 'abc']);
      expect(exitCode).toBe(1);
      expect(logs.join('\n')).toContain('number');
    });

    it('should show JSON error when ID is not a number (--json)', async () => {
      const { exitCode, logs } = await runCommand(program, ['task', 'get', 'abc', '--json']);
      expect(exitCode).toBe(1);
      const parsed = JSON.parse(logs[0]);
      expect(parsed.success).toBe(false);
      expect(parsed.error.message).toContain('Task ID must be a number');
    });
  });

  describe('task not found', () => {
    it('should show error when task does not exist (non-JSON)', async () => {
      const { exitCode, logs } = await runCommand(program, ['task', 'get', '999']);
      expect(exitCode).toBe(1);
      expect(logs.join('\n')).toContain('999');
    });

    it('should show JSON error when task does not exist (--json)', async () => {
      const { exitCode, logs } = await runCommand(program, ['task', 'get', '999', '--json']);
      expect(exitCode).toBe(1);
      const parsed = JSON.parse(logs[0]);
      expect(parsed.success).toBe(false);
    });
  });

  describe('normal text output', () => {
    it('should display task title and body', async () => {
      const taskService = new TaskService();
      const task = taskService.createTask({ title: 'Test Task', body: 'Test body', status: 'ready' });

      const { exitCode, logs } = await runCommand(program, ['task', 'get', String(task.id)]);
      expect(exitCode).toBeUndefined();

      const output = logs.join('\n');
      expect(output).toContain('Test Task');
      expect(output).toContain('Test body');
    });

    it('should display author when set', async () => {
      const taskService = new TaskService();
      const task = taskService.createTask({ title: 'Task with Author', author: 'alice', status: 'ready' });

      const { exitCode, logs } = await runCommand(program, ['task', 'get', String(task.id)]);
      expect(exitCode).toBeUndefined();

      const output = logs.join('\n');
      expect(output).toContain('alice');
      expect(output).toContain('Author');
    });

    it('should display parent task when set', async () => {
      const taskService = new TaskService();
      const parent = taskService.createTask({ title: 'Parent Task', status: 'ready' });
      const child = taskService.createTask({ title: 'Child Task', status: 'ready', parent_id: parent.id });

      const { exitCode, logs } = await runCommand(program, ['task', 'get', String(child.id)]);
      expect(exitCode).toBeUndefined();

      const output = logs.join('\n');
      expect(output).toContain('Parent');
      expect(output).toContain('Parent Task');
    });

    it('should display child tasks when present', async () => {
      const taskService = new TaskService();
      const parent = taskService.createTask({ title: 'Parent Task', status: 'ready' });
      taskService.createTask({ title: 'Child Task 1', status: 'ready', parent_id: parent.id });
      taskService.createTask({ title: 'Child Task 2', status: 'ready', parent_id: parent.id });

      const { exitCode, logs } = await runCommand(program, ['task', 'get', String(parent.id)]);
      expect(exitCode).toBeUndefined();

      const output = logs.join('\n');
      expect(output).toContain('Children');
      expect(output).toContain('Child Task 1');
      expect(output).toContain('Child Task 2');
    });

    it('should display blocked-by tasks when present', async () => {
      const taskService = new TaskService();
      const blocker = taskService.createTask({ title: 'Blocker Task', status: 'ready' });
      const blocked = taskService.createTask({ title: 'Blocked Task', status: 'ready' });

      const taskBlockService = new TaskBlockService();
      taskBlockService.addBlock({ blocker_task_id: blocker.id, blocked_task_id: blocked.id });

      const { exitCode, logs } = await runCommand(program, ['task', 'get', String(blocked.id)]);
      expect(exitCode).toBeUndefined();

      const output = logs.join('\n');
      expect(output).toContain('Blocked By');
      expect(output).toContain('Blocker Task');
    });

    it('should display blocking tasks when present', async () => {
      const taskService = new TaskService();
      const blocker = taskService.createTask({ title: 'Blocker Task', status: 'ready' });
      const blocked = taskService.createTask({ title: 'Blocked Task', status: 'ready' });

      const taskBlockService = new TaskBlockService();
      taskBlockService.addBlock({ blocker_task_id: blocker.id, blocked_task_id: blocked.id });

      const { exitCode, logs } = await runCommand(program, ['task', 'get', String(blocker.id)]);
      expect(exitCode).toBeUndefined();

      const output = logs.join('\n');
      expect(output).toContain('Blocking');
      expect(output).toContain('Blocked Task');
    });

    it('should display tags when attached', async () => {
      const taskService = new TaskService();
      const task = taskService.createTask({ title: 'Tagged Task', status: 'ready' });

      const tagService = new TagService();
      const tag = tagService.createTag({ name: 'my-tag' });

      const taskTagService = new TaskTagService();
      taskTagService.addTagToTask({ task_id: task.id, tag_id: tag.id });

      const { exitCode, logs } = await runCommand(program, ['task', 'get', String(task.id)]);
      expect(exitCode).toBeUndefined();

      const output = logs.join('\n');
      expect(output).toContain('Tags');
      expect(output).toContain('my-tag');
    });
  });

  describe('JSON output', () => {
    it('should output JSON for existing task', async () => {
      const taskService = new TaskService();
      const task = taskService.createTask({ title: 'JSON Task', status: 'ready' });

      const { exitCode, logs } = await runCommand(program, ['task', 'get', String(task.id), '--json']);
      expect(exitCode).toBeUndefined();

      const parsed = JSON.parse(logs[0]);
      expect(parsed.success).toBe(true);
      expect(parsed.task.id).toBe(task.id);
      expect(parsed.task.title).toBe('JSON Task');
      expect(parsed.children).toBeDefined();
      expect(parsed.blockedBy).toBeDefined();
      expect(parsed.blocking).toBeDefined();
      expect(parsed.tags).toBeDefined();
    });

    it('should include parent in JSON output when task has parent', async () => {
      const taskService = new TaskService();
      const parent = taskService.createTask({ title: 'Parent', status: 'ready' });
      const child = taskService.createTask({ title: 'Child', status: 'ready', parent_id: parent.id });

      const { exitCode, logs } = await runCommand(program, ['task', 'get', String(child.id), '--json']);
      expect(exitCode).toBeUndefined();

      const parsed = JSON.parse(logs[0]);
      expect(parsed.parent).not.toBeNull();
      expect(parsed.parent.id).toBe(parent.id);
    });

    it('should include children in JSON output', async () => {
      const taskService = new TaskService();
      const parent = taskService.createTask({ title: 'Parent Task', status: 'ready' });
      taskService.createTask({ title: 'Child Task', status: 'ready', parent_id: parent.id });

      const { exitCode, logs } = await runCommand(program, ['task', 'get', String(parent.id), '--json']);
      expect(exitCode).toBeUndefined();

      const parsed = JSON.parse(logs[0]);
      expect(parsed.children).toHaveLength(1);
      expect(parsed.children[0].title).toBe('Child Task');
    });

    it('should include blockedBy and blocking in JSON output', async () => {
      const taskService = new TaskService();
      const blocker = taskService.createTask({ title: 'Blocker', status: 'ready' });
      const blocked = taskService.createTask({ title: 'Blocked', status: 'ready' });

      const taskBlockService = new TaskBlockService();
      taskBlockService.addBlock({ blocker_task_id: blocker.id, blocked_task_id: blocked.id });

      const { exitCode: e1, logs: l1 } = await runCommand(program, ['task', 'get', String(blocked.id), '--json']);
      expect(e1).toBeUndefined();
      const blockedParsed = JSON.parse(l1[0]);
      expect(blockedParsed.blockedBy).toHaveLength(1);
      expect(blockedParsed.blockedBy[0].id).toBe(blocker.id);

      const prog2 = createProgram();
      const { exitCode: e2, logs: l2 } = await runCommand(prog2, ['task', 'get', String(blocker.id), '--json']);
      expect(e2).toBeUndefined();
      const blockerParsed = JSON.parse(l2[0]);
      expect(blockerParsed.blocking).toHaveLength(1);
      expect(blockerParsed.blocking[0].id).toBe(blocked.id);
    });

    it('should include tags in JSON output', async () => {
      const taskService = new TaskService();
      const task = taskService.createTask({ title: 'Tagged Task', status: 'ready' });

      const tagService = new TagService();
      const tag = tagService.createTag({ name: 'json-tag' });

      const taskTagService = new TaskTagService();
      taskTagService.addTagToTask({ task_id: task.id, tag_id: tag.id });

      const { exitCode, logs } = await runCommand(program, ['task', 'get', String(task.id), '--json']);
      expect(exitCode).toBeUndefined();

      const parsed = JSON.parse(logs[0]);
      expect(parsed.tags).toHaveLength(1);
      expect(parsed.tags[0].name).toBe('json-tag');
    });
  });
});
