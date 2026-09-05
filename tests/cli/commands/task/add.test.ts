/**
 * Tests for task add command handler
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';
import fs from 'fs';
import os from 'os';
import path from 'path';
import yaml from 'js-yaml';
import { setupTaskAddCommand } from '../../../../src/cli/commands/task/add';
import { getDatabase } from '../../../../src/db/connection';
import { TaskService, TagService } from '../../../../src/services';
import { createProgram, runCommand } from '../../../helpers/command-test-utils';
import type { ModelCatalogEntry } from '../../../../src/db/modelCatalog';

const CATALOG_WITH_CODEX: ModelCatalogEntry[] = [
  { cli: 'claude', model: 'fable', efforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
  { cli: 'claude', model: 'opus', efforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
  { cli: 'claude', model: 'sonnet', efforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
  { cli: 'claude', model: 'haiku', efforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
  { cli: 'codex', model: 'gpt-5.6-sol', efforts: ['none', 'low', 'medium', 'high', 'xhigh'] },
];

describe('setupTaskAddCommand', () => {
  let program: Command;

  beforeEach(() => {
    // Reset database before each test
    const db = getDatabase();
    db.exec('DELETE FROM task_tags');
    db.exec('DELETE FROM task_blocks');
    db.exec('DELETE FROM tasks');
    db.exec('DELETE FROM tags');
    db.exec("DELETE FROM sqlite_sequence WHERE name='tasks'");
    db.exec("DELETE FROM sqlite_sequence WHERE name='tags'");

    program = createProgram((prog) => {
      prog.command('task').description('Task management commands');
      setupTaskAddCommand(prog);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should register the add command', () => {
    const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
    expect(taskCommand).toBeDefined();

    const addCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'add');
    expect(addCommand).toBeDefined();
    expect(addCommand?.description()).toBe('Add a new task');
  });

  it('should have correct options', () => {
    const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
    const addCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'add');

    const options = addCommand?.options || [];
    const optionNames = options.map((opt) => opt.long);

    expect(optionNames).toContain('--author');
    expect(optionNames).toContain('--assignees');
    expect(optionNames).toContain('--status');
    expect(optionNames).toContain('--parent');
    expect(optionNames).toContain('--file');
    expect(optionNames).toContain('--blocked-by');
    expect(optionNames).toContain('--blocks');
    expect(optionNames).toContain('--tag');
    expect(optionNames).toContain('--json');
  });

  it('should throw if task command is not found', () => {
    const emptyProgram = new Command();
    emptyProgram.exitOverride();
    expect(() => setupTaskAddCommand(emptyProgram)).toThrow('Task command not found');
  });

  describe('title validation', () => {
    it('should exit with error when title is missing', async () => {
      const { exitCode, errors } = await runCommand(program, ['task', 'add']);
      expect(exitCode).toBe(1);
      expect(errors.join('\n')).toContain('Task title is required');
    });

    it('should output JSON error when title is missing with --json', async () => {
      const { exitCode, errors } = await runCommand(program, ['task', 'add', '--json']);
      expect(exitCode).toBe(1);
      const output = JSON.parse(errors[0]);
      expect(output.success).toBe(false);
      expect(output.error.message).toContain('Task title is required');
    });

    it('should reject title exceeding 200 characters', async () => {
      const longTitle = 'a'.repeat(201);
      const { exitCode, errors } = await runCommand(program, ['task', 'add', longTitle]);
      expect(exitCode).toBe(1);
      expect(errors.join('\n')).toContain('200');

      const taskService = new TaskService();
      expect(taskService.listTasks()).toHaveLength(0);
    });

    it('should reject body exceeding 10000 characters', async () => {
      const longBody = 'b'.repeat(10001);
      const { exitCode, errors } = await runCommand(program, ['task', 'add', 'Valid Title', longBody]);
      expect(exitCode).toBe(1);
      expect(errors.join('\n')).toContain('10000');

      const taskService = new TaskService();
      expect(taskService.listTasks()).toHaveLength(0);
    });

    it('should reject author exceeding 100 characters', async () => {
      const longAuthor = 'c'.repeat(101);
      const { exitCode, errors } = await runCommand(program, ['task', 'add', 'Valid Title', '--author', longAuthor]);
      expect(exitCode).toBe(1);
      expect(errors.join('\n')).toContain('100');

      const taskService = new TaskService();
      expect(taskService.listTasks()).toHaveLength(0);
    });

    it('should reject assignees exceeding 500 characters', async () => {
      const longAssignees = 'a'.repeat(501);
      const { exitCode, errors } = await runCommand(program, [
        'task',
        'add',
        'Valid Title',
        '--assignees',
        longAssignees,
      ]);
      expect(exitCode).toBe(1);
      expect(errors.join('\n')).toContain('500');

      const taskService = new TaskService();
      expect(taskService.listTasks()).toHaveLength(0);
    });
  });

  describe('status validation', () => {
    it('should reject invalid status', async () => {
      const { exitCode, errors } = await runCommand(program, ['task', 'add', 'Valid Title', '--status', 'invalid']);
      expect(exitCode).toBe(1);
      expect(errors.join('\n')).toContain('Invalid status');
    });

    it('should output JSON error for invalid status with --json', async () => {
      const { exitCode, errors } = await runCommand(program, [
        'task',
        'add',
        'Valid Title',
        '--status',
        'invalid',
        '--json',
      ]);
      expect(exitCode).toBe(1);
      const output = JSON.parse(errors[0]);
      expect(output.success).toBe(false);
      expect(output.error.message).toContain('Invalid status');
    });
  });

  describe('parent validation', () => {
    it('should reject non-numeric parent ID', async () => {
      const { exitCode, errors } = await runCommand(program, ['task', 'add', 'Valid Title', '--parent', 'abc']);
      expect(exitCode).toBe(1);
      expect(errors.join('\n')).toContain('Parent ID must be a number');
    });

    it('should output JSON error for non-numeric parent ID with --json', async () => {
      const { exitCode, errors } = await runCommand(program, [
        'task',
        'add',
        'Valid Title',
        '--parent',
        'abc',
        '--json',
      ]);
      expect(exitCode).toBe(1);
      const output = JSON.parse(errors[0]);
      expect(output.success).toBe(false);
      expect(output.error.message).toContain('Parent ID must be a number');
    });
  });

  describe('blocked-by validation', () => {
    it('should reject non-numeric blocked-by IDs', async () => {
      const { exitCode, errors } = await runCommand(program, ['task', 'add', 'Valid Title', '--blocked-by', 'abc']);
      expect(exitCode).toBe(1);
      expect(errors.join('\n')).toContain('Invalid blocked-by IDs');
    });

    it('should output JSON error for non-numeric blocked-by IDs with --json', async () => {
      const { exitCode, errors } = await runCommand(program, [
        'task',
        'add',
        'Valid Title',
        '--blocked-by',
        'abc',
        '--json',
      ]);
      expect(exitCode).toBe(1);
      const output = JSON.parse(errors[0]);
      expect(output.success).toBe(false);
      expect(output.error.message).toContain('Invalid blocked-by IDs');
    });
  });

  describe('blocks validation', () => {
    it('should reject non-numeric blocks IDs', async () => {
      const { exitCode, errors } = await runCommand(program, ['task', 'add', 'Valid Title', '--blocks', 'abc']);
      expect(exitCode).toBe(1);
      expect(errors.join('\n')).toContain('Invalid blocks IDs');
    });

    it('should output JSON error for non-numeric blocks IDs with --json', async () => {
      const { exitCode, errors } = await runCommand(program, [
        'task',
        'add',
        'Valid Title',
        '--blocks',
        'abc',
        '--json',
      ]);
      expect(exitCode).toBe(1);
      const output = JSON.parse(errors[0]);
      expect(output.success).toBe(false);
      expect(output.error.message).toContain('Invalid blocks IDs');
    });
  });

  describe('file option', () => {
    it('should read body from file when --file is specified', async () => {
      const fs = await import('fs');
      const os = await import('os');
      const path = await import('path');

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-add-test-'));
      const filePath = path.join(tmpDir, 'body.md');
      fs.writeFileSync(filePath, '# Task body from file');

      try {
        const { exitCode } = await runCommand(program, ['task', 'add', 'File Task', '--file', filePath]);
        expect(exitCode).toBeUndefined();

        const taskService = new TaskService();
        const tasks = taskService.listTasks();
        expect(tasks).toHaveLength(1);
        expect(tasks[0].body).toBe('# Task body from file');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('should exit with error when file does not exist', async () => {
      const { exitCode, errors } = await runCommand(program, [
        'task',
        'add',
        'File Task',
        '--file',
        '/nonexistent/path.md',
      ]);
      expect(exitCode).toBe(1);
      expect(errors.join('\n')).toContain('Error reading file');
    });

    it('should output JSON error when file does not exist with --json', async () => {
      const { exitCode, errors } = await runCommand(program, [
        'task',
        'add',
        'File Task',
        '--file',
        '/nonexistent/path.md',
        '--json',
      ]);
      expect(exitCode).toBe(1);
      const output = JSON.parse(errors[0]);
      expect(output.success).toBe(false);
      expect(output.error.message).toContain('Error reading file');
    });
  });

  describe('successful task creation', () => {
    it('should create task with valid inputs (normal output)', async () => {
      const { exitCode, logs } = await runCommand(program, ['task', 'add', 'Valid Task Title']);
      expect(exitCode).toBeUndefined();

      const output = logs.join('\n');
      expect(output).toContain('Task created successfully');
      expect(output).toContain('Valid Task Title');

      const taskService = new TaskService();
      const tasks = taskService.listTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('Valid Task Title');
    });

    it('should create task with all options (normal output)', async () => {
      const { exitCode, logs } = await runCommand(program, [
        'task',
        'add',
        'Full Task',
        'Task body',
        '--author',
        'alice',
        '--status',
        'ready',
      ]);
      expect(exitCode).toBeUndefined();

      const output = logs.join('\n');
      expect(output).toContain('Task created successfully');
      expect(output).toContain('Full Task');
      expect(output).toContain('alice');

      const taskService = new TaskService();
      const tasks = taskService.listTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].author).toBe('alice');
      expect(tasks[0].status).toBe('ready');
    });

    it('should create task with --assignees option', async () => {
      const { exitCode } = await runCommand(program, [
        'task',
        'add',
        'Task with Assignees',
        '--assignees',
        'user1,user2',
      ]);
      expect(exitCode).toBeUndefined();

      const taskService = new TaskService();
      const tasks = taskService.listTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].assignees).toBe('user1,user2');
    });

    it('should show Assignees in console output when --assignees is specified', async () => {
      const { exitCode, logs } = await runCommand(program, [
        'task',
        'add',
        'Task with Assignees Output',
        '--assignees',
        'user1,user2',
      ]);
      expect(exitCode).toBeUndefined();

      const output = logs.join('\n');
      expect(output).toContain('Assignees:');
      expect(output).toContain('user1,user2');
    });

    it('should create task with parent (normal output shows parent)', async () => {
      // Create parent task first
      const taskService = new TaskService();
      const parent = taskService.createTask({ title: 'Parent Task' });

      const { exitCode, logs } = await runCommand(program, [
        'task',
        'add',
        'Child Task',
        '--parent',
        parent.id.toString(),
      ]);
      expect(exitCode).toBeUndefined();

      const output = logs.join('\n');
      expect(output).toContain('Parent');
      expect(output).toContain('Parent Task');
    });

    it('should output JSON format when --json flag is used', async () => {
      const { exitCode, logs } = await runCommand(program, ['task', 'add', 'JSON Task', '--json']);
      expect(exitCode).toBeUndefined();

      const output = JSON.parse(logs[0]);
      expect(output.success).toBe(true);
      expect(output.task.title).toBe('JSON Task');
      expect(output.parent).toBeNull();
      expect(output.blockedBy).toEqual([]);
      expect(output.blocking).toEqual([]);
    });

    it('should include assignees in JSON output when --assignees is specified', async () => {
      const { exitCode, logs } = await runCommand(program, [
        'task',
        'add',
        'Assignees Task',
        '--assignees',
        'user1,user2',
        '--json',
      ]);
      expect(exitCode).toBeUndefined();

      const output = JSON.parse(logs[0]);
      expect(output.success).toBe(true);
      expect(output.task.assignees).toBe('user1,user2');
    });

    it('should create task with blocked-by relationship', async () => {
      const taskService = new TaskService();
      const blocker = taskService.createTask({ title: 'Blocker Task' });

      const { exitCode, logs } = await runCommand(program, [
        'task',
        'add',
        'Blocked Task',
        '--blocked-by',
        blocker.id.toString(),
      ]);
      expect(exitCode).toBeUndefined();

      const output = logs.join('\n');
      expect(output).toContain('Blocked By');
    });

    it('should include blockedBy in JSON output', async () => {
      const taskService = new TaskService();
      const blocker = taskService.createTask({ title: 'Blocker' });

      const { exitCode, logs } = await runCommand(program, [
        'task',
        'add',
        'New Task',
        '--blocked-by',
        blocker.id.toString(),
        '--json',
      ]);
      expect(exitCode).toBeUndefined();

      const output = JSON.parse(logs[0]);
      expect(output.success).toBe(true);
      expect(output.blockedBy).toHaveLength(1);
      expect(output.blockedBy[0].id).toBe(blocker.id);
    });

    it('should create task with blocks relationship', async () => {
      const taskService = new TaskService();
      const blocked = taskService.createTask({ title: 'Will Be Blocked' });

      const { exitCode, logs } = await runCommand(program, [
        'task',
        'add',
        'Blocker Task',
        '--blocks',
        blocked.id.toString(),
      ]);
      expect(exitCode).toBeUndefined();

      const output = logs.join('\n');
      expect(output).toContain('Blocking');
    });

    it('should include blocking in JSON output', async () => {
      const taskService = new TaskService();
      const blocked = taskService.createTask({ title: 'Will Be Blocked' });

      const { exitCode, logs } = await runCommand(program, [
        'task',
        'add',
        'Blocker Task',
        '--blocks',
        blocked.id.toString(),
        '--json',
      ]);
      expect(exitCode).toBeUndefined();

      const output = JSON.parse(logs[0]);
      expect(output.success).toBe(true);
      expect(output.blocking).toHaveLength(1);
      expect(output.blocking[0].id).toBe(blocked.id);
    });

    it('should exit with error when blocked-by task does not exist', async () => {
      const { exitCode, errors } = await runCommand(program, ['task', 'add', 'New Task', '--blocked-by', '99999']);
      expect(exitCode).toBe(1);
      expect(errors.join('\n')).toContain('Error adding blocked-by relationship');
    });

    it('should exit with error (JSON) when blocked-by task does not exist', async () => {
      const { exitCode, errors } = await runCommand(program, [
        'task',
        'add',
        'New Task',
        '--blocked-by',
        '99999',
        '--json',
      ]);
      expect(exitCode).toBe(1);
      const output = JSON.parse(errors[0]);
      expect(output.success).toBe(false);
      expect(output.error.message).toContain('Error adding blocked-by relationship');
    });

    it('should not leave an orphaned task when blocked-by task does not exist', async () => {
      const { exitCode } = await runCommand(program, ['task', 'add', 'New Task', '--blocked-by', '99999']);
      expect(exitCode).toBe(1);

      const taskService = new TaskService();
      expect(taskService.listTasks()).toHaveLength(0);
    });

    it('should exit with error when blocks task does not exist', async () => {
      const { exitCode, errors } = await runCommand(program, ['task', 'add', 'New Task', '--blocks', '99999']);
      expect(exitCode).toBe(1);
      expect(errors.join('\n')).toContain('Error adding blocks relationship');
    });

    it('should exit with error (JSON) when blocks task does not exist', async () => {
      const { exitCode, errors } = await runCommand(program, [
        'task',
        'add',
        'New Task',
        '--blocks',
        '99999',
        '--json',
      ]);
      expect(exitCode).toBe(1);
      const output = JSON.parse(errors[0]);
      expect(output.success).toBe(false);
      expect(output.error.message).toContain('Error adding blocks relationship');
    });

    it('should not leave an orphaned task when blocks task does not exist', async () => {
      const { exitCode } = await runCommand(program, ['task', 'add', 'New Task', '--blocks', '99999']);
      expect(exitCode).toBe(1);

      const taskService = new TaskService();
      expect(taskService.listTasks()).toHaveLength(0);
    });

    it('should not leave an orphaned task when a circular block relationship is attempted', async () => {
      const taskService = new TaskService();
      const existing = taskService.createTask({ title: 'Existing Task' });

      // Making the new task block the existing task, while also being blocked by it,
      // would create a cycle once addBlock validates the second relationship.
      const { exitCode } = await runCommand(program, [
        'task',
        'add',
        'New Task',
        '--blocked-by',
        existing.id.toString(),
        '--blocks',
        existing.id.toString(),
      ]);
      expect(exitCode).toBe(1);

      const tasks = taskService.listTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe(existing.id);
    });

    it('should include parent in JSON output when --parent is given', async () => {
      const taskService = new TaskService();
      const parent = taskService.createTask({ title: 'Parent Task' });

      const { exitCode, logs } = await runCommand(program, [
        'task',
        'add',
        'Child Task',
        '--parent',
        parent.id.toString(),
        '--json',
      ]);
      expect(exitCode).toBeUndefined();

      const output = JSON.parse(logs[0]);
      expect(output.success).toBe(true);
      expect(output.parent).not.toBeNull();
      expect(output.parent.id).toBe(parent.id);
    });
  });

  describe('--priority option', () => {
    it('should have --priority option registered', () => {
      const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
      const addCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'add');
      const options = addCommand?.options || [];
      const optionNames = options.map((opt) => opt.long);
      expect(optionNames).toContain('--priority');
    });

    it('should create task with priority', async () => {
      const { exitCode, logs } = await runCommand(program, [
        'task',
        'add',
        'Priority Task',
        '--priority',
        'high',
        '--json',
      ]);
      expect(exitCode).toBeUndefined();
      const output = JSON.parse(logs[0]);
      expect(output.success).toBe(true);
      expect(output.task.priority).toBe('high');
    });

    it('should exit with error for invalid priority', async () => {
      const { exitCode, errors } = await runCommand(program, ['task', 'add', 'Task', '--priority', 'invalid']);
      expect(exitCode).toBe(1);
      expect(errors.join('\n')).toContain('Invalid priority');
    });
  });

  describe('--branch option', () => {
    it('should have --branch option registered', () => {
      const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
      const addCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'add');
      const options = addCommand?.options || [];
      const optionNames = options.map((opt) => opt.long);
      expect(optionNames).toContain('--branch');
    });

    it('should create task with branch', async () => {
      const { exitCode, logs } = await runCommand(program, [
        'task',
        'add',
        'Branch Task',
        '--branch',
        'feature/my-branch',
        '--json',
      ]);
      expect(exitCode).toBeUndefined();
      const output = JSON.parse(logs[0]);
      expect(output.success).toBe(true);
      expect(output.task.branch).toBe('feature/my-branch');
    });

    it('should persist branch in database', async () => {
      await runCommand(program, ['task', 'add', 'Branch Task', '--branch', 'feature/my-branch']);
      const taskService = new TaskService();
      const tasks = taskService.listTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].branch).toBe('feature/my-branch');
    });

    it('should set branch to null when --branch is not specified', async () => {
      await runCommand(program, ['task', 'add', 'No Branch Task']);
      const taskService = new TaskService();
      const tasks = taskService.listTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].branch).toBeNull();
    });
  });

  describe('model/effort override options', () => {
    it('should have the four override options registered', () => {
      const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
      const addCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'add');
      const optionNames = addCommand?.options.map((o) => o.long) ?? [];
      expect(optionNames).toContain('--model-planning');
      expect(optionNames).toContain('--model-run');
      expect(optionNames).toContain('--effort-planning');
      expect(optionNames).toContain('--effort-run');
    });

    it('should create a task with all four overrides', async () => {
      const { logs } = await runCommand(program, [
        'task',
        'add',
        'Override Task',
        '--model-planning',
        'opus',
        '--model-run',
        'sonnet',
        '--effort-planning',
        'low',
        '--effort-run',
        'xhigh',
        '--json',
      ]);

      const output = JSON.parse(logs[0]);
      expect(output.task.model_planning).toBe('opus');
      expect(output.task.model_run).toBe('sonnet');
      expect(output.task.effort_planning).toBe('low');
      expect(output.task.effort_run).toBe('xhigh');
    });

    it('should persist the overrides in the database', async () => {
      await runCommand(program, ['task', 'add', 'Persisted Overrides', '--model-run', 'haiku']);

      const taskService = new TaskService();
      const tasks = taskService.listTasks();
      expect(tasks[0].model_run).toBe('haiku');
    });

    it('should default the overrides to null when the flags are omitted', async () => {
      await runCommand(program, ['task', 'add', 'No Overrides']);

      const taskService = new TaskService();
      const tasks = taskService.listTasks();
      expect(tasks[0].model_planning).toBeNull();
      expect(tasks[0].model_run).toBeNull();
      expect(tasks[0].effort_planning).toBeNull();
      expect(tasks[0].effort_run).toBeNull();
    });

    it('should reject an invalid model alias and not create the task', async () => {
      const { exitCode, errors } = await runCommand(program, ['task', 'add', 'Bad Model', '--model-run', 'gpt-5']);
      expect(exitCode).toBe(1);
      expect(errors.join('\n')).toContain('Invalid model "gpt-5"');

      const taskService = new TaskService();
      expect(taskService.listTasks()).toHaveLength(0);
    });

    it('should reject an invalid effort level and not create the task', async () => {
      const { exitCode, errors } = await runCommand(program, [
        'task',
        'add',
        'Bad Effort',
        '--effort-planning',
        'ultra',
      ]);
      expect(exitCode).toBe(1);
      expect(errors.join('\n')).toContain('Invalid effort "ultra"');

      const taskService = new TaskService();
      expect(taskService.listTasks()).toHaveLength(0);
    });

    it('should accept a codex model from the catalog with a codex-only effort', async () => {
      const tmpCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'agkan-task-add-test-'));
      const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpCwd);
      try {
        fs.writeFileSync(path.join(tmpCwd, '.agkan-test.yml'), yaml.dump({ modelCatalog: CATALOG_WITH_CODEX }));
        const { exitCode } = await runCommand(program, [
          'task',
          'add',
          'Codex Task',
          '--model-run',
          'gpt-5.6-sol',
          '--effort-run',
          'none',
        ]);
        expect(exitCode).toBeUndefined();

        const taskService = new TaskService();
        const tasks = taskService.listTasks();
        expect(tasks[0].model_run).toBe('gpt-5.6-sol');
        expect(tasks[0].effort_run).toBe('none');
      } finally {
        cwdSpy.mockRestore();
        fs.rmSync(tmpCwd, { recursive: true, force: true });
      }
    });

    it('should reject an effort that does not belong to the selected model row', async () => {
      const { exitCode, errors } = await runCommand(program, [
        'task',
        'add',
        'Mismatched',
        '--model-run',
        'opus',
        '--effort-run',
        'none',
      ]);
      expect(exitCode).toBe(1);
      expect(errors.join('\n')).toContain('Invalid effort "none" for model "opus"');

      const taskService = new TaskService();
      expect(taskService.listTasks()).toHaveLength(0);
    });

    // loadConfig() reads '<cwd>/.agkan-test.yml' in test mode. Other test files
    // (e.g. boardRoutes.test.ts, claudeRoutes.test.ts) write that same
    // repo-root path, and vitest runs test files concurrently across forks
    // (vitest.config.ts: pool: 'forks'), so writing there too would race with
    // their beforeEach/afterEach unlinking it mid-test. Isolate by mocking
    // process.cwd() to a private tmp dir per test, matching the pattern in
    // tests/board/claudePromptBuilder.test.ts (resolveLaunchSettings) and
    // tests/db/config.test.ts.
    describe('with an invalid modelCatalog config', () => {
      let tmpCwd: string;
      let cwdSpy: ReturnType<typeof vi.spyOn>;

      beforeEach(() => {
        tmpCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'agkan-task-add-test-'));
        cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpCwd);
        // A string instead of an array: resolveModelCatalog() throws on this.
        fs.writeFileSync(path.join(tmpCwd, '.agkan-test.yml'), yaml.dump({ modelCatalog: 'claude' }));
      });

      afterEach(() => {
        cwdSpy.mockRestore();
        fs.rmSync(tmpCwd, { recursive: true, force: true });
      });

      it('creates the task when no model/effort flags are given', async () => {
        const { exitCode } = await runCommand(program, ['task', 'add', 'No Overrides, Broken Catalog Config']);
        expect(exitCode).toBeUndefined();

        const taskService = new TaskService();
        expect(taskService.listTasks()).toHaveLength(1);
      });

      it('fails when a model/effort flag is given', async () => {
        const { exitCode } = await runCommand(program, [
          'task',
          'add',
          'Broken Catalog Config, Override Given',
          '--model-run',
          'haiku',
        ]);
        expect(exitCode).toBe(1);

        const taskService = new TaskService();
        expect(taskService.listTasks()).toHaveLength(0);
      });
    });
  });

  describe('--tag option', () => {
    it('should attach a tag specified by name', async () => {
      const tagService = new TagService();
      tagService.createTag({ name: 'bug' });

      const { exitCode, logs } = await runCommand(program, ['task', 'add', 'Tagged Task', '--tag', 'bug', '--json']);
      expect(exitCode).toBeUndefined();
      const output = JSON.parse(logs[0]);
      expect(output.success).toBe(true);
      expect(output.tags).toHaveLength(1);
      expect(output.tags[0].name).toBe('bug');
    });

    it('should attach a tag specified by ID', async () => {
      const tagService = new TagService();
      const tag = tagService.createTag({ name: 'feature' });

      const { exitCode, logs } = await runCommand(program, [
        'task',
        'add',
        'Tagged Task',
        '--tag',
        tag.id.toString(),
        '--json',
      ]);
      expect(exitCode).toBeUndefined();
      const output = JSON.parse(logs[0]);
      expect(output.success).toBe(true);
      expect(output.tags).toHaveLength(1);
      expect(output.tags[0].id).toBe(tag.id);
    });

    it('should attach multiple comma-separated tags', async () => {
      const tagService = new TagService();
      const bug = tagService.createTag({ name: 'bug' });
      tagService.createTag({ name: 'feature' });

      const { exitCode, logs } = await runCommand(program, [
        'task',
        'add',
        'Multi Tagged Task',
        '--tag',
        `${bug.id},feature`,
        '--json',
      ]);
      expect(exitCode).toBeUndefined();
      const output = JSON.parse(logs[0]);
      expect(output.success).toBe(true);
      expect(output.tags).toHaveLength(2);
      const tagNames = output.tags.map((t: { name: string }) => t.name).sort();
      expect(tagNames).toEqual(['bug', 'feature']);
    });

    it('should show Tags in console output when --tag is specified', async () => {
      const tagService = new TagService();
      tagService.createTag({ name: 'bug' });

      const { exitCode, logs } = await runCommand(program, ['task', 'add', 'Tagged Task', '--tag', 'bug']);
      expect(exitCode).toBeUndefined();
      const output = logs.join('\n');
      expect(output).toContain('Tags:');
      expect(output).toContain('bug');
    });

    it('should exit with error when tag name does not exist', async () => {
      const { exitCode, errors } = await runCommand(program, ['task', 'add', 'New Task', '--tag', 'nonexistent']);
      expect(exitCode).toBe(1);
      expect(errors.join('\n')).toContain('Tag with name "nonexistent" not found');

      const taskService = new TaskService();
      expect(taskService.listTasks()).toHaveLength(0);
    });

    it('should exit with error when tag ID does not exist', async () => {
      const { exitCode, errors } = await runCommand(program, ['task', 'add', 'New Task', '--tag', '99999']);
      expect(exitCode).toBe(1);
      expect(errors.join('\n')).toContain('Tag with ID "99999" not found');

      const taskService = new TaskService();
      expect(taskService.listTasks()).toHaveLength(0);
    });

    it('should output JSON error when tag is unresolved with --json', async () => {
      const { exitCode, errors } = await runCommand(program, [
        'task',
        'add',
        'New Task',
        '--tag',
        'nonexistent',
        '--json',
      ]);
      expect(exitCode).toBe(1);
      const output = JSON.parse(errors[0]);
      expect(output.success).toBe(false);
      expect(output.error.message).toContain('Tag with name "nonexistent" not found');
    });

    it('should not create a task when one of multiple tags is unresolved', async () => {
      const tagService = new TagService();
      tagService.createTag({ name: 'bug' });

      const { exitCode } = await runCommand(program, ['task', 'add', 'New Task', '--tag', 'bug,nonexistent']);
      expect(exitCode).toBe(1);

      const taskService = new TaskService();
      expect(taskService.listTasks()).toHaveLength(0);
    });

    it('should deduplicate repeated tag references without erroring', async () => {
      const tagService = new TagService();
      const tag = tagService.createTag({ name: 'bug' });

      const { exitCode, logs } = await runCommand(program, [
        'task',
        'add',
        'Deduped Tags Task',
        '--tag',
        `bug,${tag.id}`,
        '--json',
      ]);
      expect(exitCode).toBeUndefined();
      const output = JSON.parse(logs[0]);
      expect(output.success).toBe(true);
      expect(output.tags).toHaveLength(1);
      expect(output.tags[0].id).toBe(tag.id);
    });

    it('should include empty tags array in JSON output when --tag is not specified', async () => {
      const { exitCode, logs } = await runCommand(program, ['task', 'add', 'No Tag Task', '--json']);
      expect(exitCode).toBeUndefined();
      const output = JSON.parse(logs[0]);
      expect(output.success).toBe(true);
      expect(output.tags).toEqual([]);
    });
  });
});
