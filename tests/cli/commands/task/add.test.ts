/**
 * Tests for task add command handler
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';
import { setupTaskAddCommand } from '../../../../src/cli/commands/task/add';
import { getDatabase } from '../../../../src/db/connection';
import { TaskService } from '../../../../src/services';

function createProgram(): Command {
  const prog = new Command();
  prog.exitOverride();
  prog.command('task').description('Task management commands');
  setupTaskAddCommand(prog);
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

describe('setupTaskAddCommand', () => {
  let program: Command;

  beforeEach(() => {
    // Reset database before each test
    const db = getDatabase();
    db.exec('DELETE FROM tasks');
    db.exec('DELETE FROM task_blocks');
    db.exec("DELETE FROM sqlite_sequence WHERE name='tasks'");

    program = createProgram();
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
    expect(optionNames).toContain('--status');
    expect(optionNames).toContain('--parent');
    expect(optionNames).toContain('--file');
    expect(optionNames).toContain('--blocked-by');
    expect(optionNames).toContain('--blocks');
    expect(optionNames).toContain('--json');
  });

  it('should throw if task command is not found', () => {
    const emptyProgram = new Command();
    emptyProgram.exitOverride();
    expect(() => setupTaskAddCommand(emptyProgram)).toThrow('Task command not found');
  });

  describe('title validation', () => {
    it('should exit with error when title is missing', async () => {
      const { exitCode, logs } = await runCommand(program, ['task', 'add']);
      expect(exitCode).toBe(1);
      expect(logs.join('\n')).toContain('Task title is required');
    });

    it('should output JSON error when title is missing with --json', async () => {
      const { exitCode, logs } = await runCommand(program, ['task', 'add', '--json']);
      expect(exitCode).toBe(1);
      const output = JSON.parse(logs[0]);
      expect(output.success).toBe(false);
      expect(output.error.message).toContain('Task title is required');
    });

    it('should reject title exceeding 200 characters', async () => {
      const longTitle = 'a'.repeat(201);
      const { exitCode, logs } = await runCommand(program, ['task', 'add', longTitle]);
      expect(exitCode).toBe(1);
      expect(logs.join('\n')).toContain('200');

      const taskService = new TaskService();
      expect(taskService.listTasks()).toHaveLength(0);
    });

    it('should reject body exceeding 10000 characters', async () => {
      const longBody = 'b'.repeat(10001);
      const { exitCode, logs } = await runCommand(program, ['task', 'add', 'Valid Title', longBody]);
      expect(exitCode).toBe(1);
      expect(logs.join('\n')).toContain('10000');

      const taskService = new TaskService();
      expect(taskService.listTasks()).toHaveLength(0);
    });

    it('should reject author exceeding 100 characters', async () => {
      const longAuthor = 'c'.repeat(101);
      const { exitCode, logs } = await runCommand(program, ['task', 'add', 'Valid Title', '--author', longAuthor]);
      expect(exitCode).toBe(1);
      expect(logs.join('\n')).toContain('100');

      const taskService = new TaskService();
      expect(taskService.listTasks()).toHaveLength(0);
    });
  });

  describe('status validation', () => {
    it('should reject invalid status', async () => {
      const { exitCode, logs } = await runCommand(program, ['task', 'add', 'Valid Title', '--status', 'invalid']);
      expect(exitCode).toBe(1);
      expect(logs.join('\n')).toContain('Invalid status');
    });

    it('should output JSON error for invalid status with --json', async () => {
      const { exitCode, logs } = await runCommand(program, [
        'task',
        'add',
        'Valid Title',
        '--status',
        'invalid',
        '--json',
      ]);
      expect(exitCode).toBe(1);
      const output = JSON.parse(logs[0]);
      expect(output.success).toBe(false);
      expect(output.error.message).toContain('Invalid status');
    });
  });

  describe('parent validation', () => {
    it('should reject non-numeric parent ID', async () => {
      const { exitCode, logs } = await runCommand(program, ['task', 'add', 'Valid Title', '--parent', 'abc']);
      expect(exitCode).toBe(1);
      expect(logs.join('\n')).toContain('Parent ID must be a number');
    });

    it('should output JSON error for non-numeric parent ID with --json', async () => {
      const { exitCode, logs } = await runCommand(program, ['task', 'add', 'Valid Title', '--parent', 'abc', '--json']);
      expect(exitCode).toBe(1);
      const output = JSON.parse(logs[0]);
      expect(output.success).toBe(false);
      expect(output.error.message).toContain('Parent ID must be a number');
    });
  });

  describe('blocked-by validation', () => {
    it('should reject non-numeric blocked-by IDs', async () => {
      const { exitCode, logs } = await runCommand(program, ['task', 'add', 'Valid Title', '--blocked-by', 'abc']);
      expect(exitCode).toBe(1);
      expect(logs.join('\n')).toContain('Invalid blocked-by IDs');
    });

    it('should output JSON error for non-numeric blocked-by IDs with --json', async () => {
      const { exitCode, logs } = await runCommand(program, [
        'task',
        'add',
        'Valid Title',
        '--blocked-by',
        'abc',
        '--json',
      ]);
      expect(exitCode).toBe(1);
      const output = JSON.parse(logs[0]);
      expect(output.success).toBe(false);
      expect(output.error.message).toContain('Invalid blocked-by IDs');
    });
  });

  describe('blocks validation', () => {
    it('should reject non-numeric blocks IDs', async () => {
      const { exitCode, logs } = await runCommand(program, ['task', 'add', 'Valid Title', '--blocks', 'abc']);
      expect(exitCode).toBe(1);
      expect(logs.join('\n')).toContain('Invalid blocks IDs');
    });

    it('should output JSON error for non-numeric blocks IDs with --json', async () => {
      const { exitCode, logs } = await runCommand(program, ['task', 'add', 'Valid Title', '--blocks', 'abc', '--json']);
      expect(exitCode).toBe(1);
      const output = JSON.parse(logs[0]);
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
      const { exitCode, logs } = await runCommand(program, [
        'task',
        'add',
        'File Task',
        '--file',
        '/nonexistent/path.md',
      ]);
      expect(exitCode).toBe(1);
      expect(logs.join('\n')).toContain('Error reading file');
    });

    it('should output JSON error when file does not exist with --json', async () => {
      const { exitCode, logs } = await runCommand(program, [
        'task',
        'add',
        'File Task',
        '--file',
        '/nonexistent/path.md',
        '--json',
      ]);
      expect(exitCode).toBe(1);
      const output = JSON.parse(logs[0]);
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
      const { exitCode, logs } = await runCommand(program, ['task', 'add', 'New Task', '--blocked-by', '99999']);
      expect(exitCode).toBe(1);
      expect(logs.join('\n')).toContain('Error adding blocked-by relationship');
    });

    it('should exit with error (JSON) when blocked-by task does not exist', async () => {
      const { exitCode, logs } = await runCommand(program, [
        'task',
        'add',
        'New Task',
        '--blocked-by',
        '99999',
        '--json',
      ]);
      expect(exitCode).toBe(1);
      const output = JSON.parse(logs[0]);
      expect(output.success).toBe(false);
      expect(output.error.message).toContain('Error adding blocked-by relationship');
    });

    it('should exit with error when blocks task does not exist', async () => {
      const { exitCode, logs } = await runCommand(program, ['task', 'add', 'New Task', '--blocks', '99999']);
      expect(exitCode).toBe(1);
      expect(logs.join('\n')).toContain('Error adding blocks relationship');
    });

    it('should exit with error (JSON) when blocks task does not exist', async () => {
      const { exitCode, logs } = await runCommand(program, ['task', 'add', 'New Task', '--blocks', '99999', '--json']);
      expect(exitCode).toBe(1);
      const output = JSON.parse(logs[0]);
      expect(output.success).toBe(false);
      expect(output.error.message).toContain('Error adding blocks relationship');
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
});
