/**
 * Tests for task update command handler
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { setupTaskUpdateCommand } from '../../../../src/cli/commands/task/update';
import { getDatabase } from '../../../../src/db/connection';
import { TaskService } from '../../../../src/services';

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

describe('setupTaskUpdateCommand', () => {
  let program: Command;

  beforeEach(() => {
    // Reset database before each test
    const db = getDatabase();
    db.exec('DELETE FROM tasks');
    db.exec('DELETE FROM task_blocks');
    db.exec("DELETE FROM sqlite_sequence WHERE name='tasks'");

    program = new Command();
    program.exitOverride();
    program.command('task').description('Task management commands');
    setupTaskUpdateCommand(program);
  });

  afterEach(() => {
    // cleanup if needed
  });

  it('should register the update command', () => {
    const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
    expect(taskCommand).toBeDefined();

    const updateCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'update');
    expect(updateCommand).toBeDefined();
    expect(updateCommand?.description()).toBe('Update a task field');
  });

  it('should update status field successfully', async () => {
    const taskService = new TaskService();
    taskService.createTask({ title: 'Test task', status: 'backlog' });
    const task = taskService.listTasks()[0];

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'update', String(task.id), 'status', 'ready']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('✓');

    const updatedTask = taskService.getTask(task.id);
    expect(updatedTask?.status).toBe('ready');
  });

  it('should update title field successfully', async () => {
    const taskService = new TaskService();
    taskService.createTask({ title: 'Original title', status: 'backlog' });
    const task = taskService.listTasks()[0];

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'update', String(task.id), 'title', 'New title']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('✓');

    const updatedTask = taskService.getTask(task.id);
    expect(updatedTask?.title).toBe('New title');
  });

  it('should update body field successfully', async () => {
    const taskService = new TaskService();
    taskService.createTask({ title: 'Test task', status: 'backlog' });
    const task = taskService.listTasks()[0];

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'update', String(task.id), 'body', 'New description']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('✓');

    const updatedTask = taskService.getTask(task.id);
    expect(updatedTask?.body).toBe('New description');
  });

  it('should update author field successfully', async () => {
    const taskService = new TaskService();
    taskService.createTask({ title: 'Test task', status: 'backlog' });
    const task = taskService.listTasks()[0];

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'update', String(task.id), 'author', 'new-author']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('✓');

    const updatedTask = taskService.getTask(task.id);
    expect(updatedTask?.author).toBe('new-author');
  });

  it('should update assignees field successfully', async () => {
    const taskService = new TaskService();
    taskService.createTask({ title: 'Test task', status: 'backlog' });
    const task = taskService.listTasks()[0];

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'update', String(task.id), 'assignees', 'user1,user2,user3']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('✓');

    const updatedTask = taskService.getTask(task.id);
    expect(updatedTask?.assignees).toBe('user1,user2,user3');
  });

  it('should show error when title exceeds 200 characters', async () => {
    const taskService = new TaskService();
    taskService.createTask({ title: 'Test task', status: 'backlog' });
    const task = taskService.listTasks()[0];

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    const longTitle = 'a'.repeat(201);

    try {
      await program.parseAsync(['node', 'test', 'task', 'update', String(task.id), 'title', longTitle]);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('200');
    expect(exitCode).toBe(1);
  });

  it('should show error when body exceeds 10000 characters', async () => {
    const taskService = new TaskService();
    taskService.createTask({ title: 'Test task', status: 'backlog' });
    const task = taskService.listTasks()[0];

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    const longBody = 'a'.repeat(10001);

    try {
      await program.parseAsync(['node', 'test', 'task', 'update', String(task.id), 'body', longBody]);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('10000');
    expect(exitCode).toBe(1);
  });

  it('should show error when author exceeds 100 characters', async () => {
    const taskService = new TaskService();
    taskService.createTask({ title: 'Test task', status: 'backlog' });
    const task = taskService.listTasks()[0];

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    const longAuthor = 'a'.repeat(101);

    try {
      await program.parseAsync(['node', 'test', 'task', 'update', String(task.id), 'author', longAuthor]);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('100');
    expect(exitCode).toBe(1);
  });

  it('should show error when assignees exceeds 500 characters', async () => {
    const taskService = new TaskService();
    taskService.createTask({ title: 'Test task', status: 'backlog' });
    const task = taskService.listTasks()[0];

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    const longAssignees = 'a'.repeat(501);

    try {
      await program.parseAsync(['node', 'test', 'task', 'update', String(task.id), 'assignees', longAssignees]);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('500');
    expect(exitCode).toBe(1);
  });

  it('should show error when field is not supported', async () => {
    const taskService = new TaskService();
    taskService.createTask({ title: 'Test task', status: 'backlog' });
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
      await program.parseAsync(['node', 'test', 'task', 'update', String(task.id), 'unknown_field', 'value']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('unknown_field');
    expect(exitCode).toBe(1);
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
      await program.parseAsync(['node', 'test', 'task', 'update', '999', 'status', 'ready']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('999');
    expect(exitCode).toBe(1);
  });

  it('should show error when ID is not a number', async () => {
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'update', 'abc', 'status', 'ready']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('number');
    expect(exitCode).toBe(1);
  });

  describe('--json flag', () => {
    it('should output JSON format when updating assignees with --json flag', async () => {
      const taskService = new TaskService();
      taskService.createTask({ title: 'Test task', status: 'backlog' });
      const task = taskService.listTasks()[0];

      const { exitCode, logs } = await runCommand(program, [
        'task',
        'update',
        String(task.id),
        'assignees',
        'user1,user2,user3',
        '--json',
      ]);
      expect(exitCode).toBeUndefined();

      const parsed = JSON.parse(logs[0]);
      expect(parsed.success).toBe(true);
      expect(parsed.task.id).toBe(task.id);
      expect(parsed.task.assignees).toBe('user1,user2,user3');
      expect(parsed.counts).toBeDefined();
      expect(parsed.counts.backlog).toBeGreaterThanOrEqual(1);
    });

    it('should output JSON format when updating status with --json flag', async () => {
      const taskService = new TaskService();
      taskService.createTask({ title: 'Test task', status: 'backlog' });
      const task = taskService.listTasks()[0];

      const { exitCode, logs } = await runCommand(program, [
        'task',
        'update',
        String(task.id),
        'status',
        'ready',
        '--json',
      ]);
      expect(exitCode).toBeUndefined();

      const parsed = JSON.parse(logs[0]);
      expect(parsed.success).toBe(true);
      expect(parsed.task.id).toBe(task.id);
      expect(parsed.task.status).toBe('ready');
    });

    it('should output JSON format when updating title with --json flag', async () => {
      const taskService = new TaskService();
      taskService.createTask({ title: 'Original title', status: 'backlog' });
      const task = taskService.listTasks()[0];

      const { exitCode, logs } = await runCommand(program, [
        'task',
        'update',
        String(task.id),
        'title',
        'Updated title',
        '--json',
      ]);
      expect(exitCode).toBeUndefined();

      const parsed = JSON.parse(logs[0]);
      expect(parsed.success).toBe(true);
      expect(parsed.task.title).toBe('Updated title');
    });

    it('should output JSON error when task does not exist with --json flag', async () => {
      const { exitCode, logs } = await runCommand(program, ['task', 'update', '999', 'status', 'ready', '--json']);
      expect(exitCode).toBe(1);

      const parsed = JSON.parse(logs[0]);
      expect(parsed.success).toBe(false);
      expect(parsed.error.message).toContain('999');
    });

    it('should output JSON error when field is not supported with --json flag', async () => {
      const taskService = new TaskService();
      taskService.createTask({ title: 'Test task', status: 'backlog' });
      const task = taskService.listTasks()[0];

      const { exitCode, logs } = await runCommand(program, [
        'task',
        'update',
        String(task.id),
        'invalid_field',
        'value',
        '--json',
      ]);
      expect(exitCode).toBe(1);

      const parsed = JSON.parse(logs[0]);
      expect(parsed.success).toBe(false);
      expect(parsed.error.message).toContain('invalid_field');
    });

    it('should output JSON error when ID is not a number with --json flag', async () => {
      const { exitCode, logs } = await runCommand(program, ['task', 'update', 'abc', 'status', 'ready', '--json']);
      expect(exitCode).toBe(1);

      const parsed = JSON.parse(logs[0]);
      expect(parsed.success).toBe(false);
      expect(parsed.error.message).toContain('number');
    });
  });

  describe('--file option for body update', () => {
    it('should have --file option registered on update command', () => {
      const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
      const updateCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'update');
      const options = updateCommand?.options || [];
      const optionNames = options.map((opt) => opt.long);
      expect(optionNames).toContain('--file');
    });

    it('should update body from file when --file is specified', async () => {
      const fs = await import('fs');
      const os = await import('os');
      const path = await import('path');

      const taskService = new TaskService();
      taskService.createTask({ title: 'Test task', status: 'backlog' });
      const task = taskService.listTasks()[0];

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-update-test-'));
      const filePath = path.join(tmpDir, 'body.md');
      fs.writeFileSync(filePath, '# Body from file');

      try {
        const { exitCode } = await runCommand(program, ['task', 'update', String(task.id), 'body', '--file', filePath]);
        expect(exitCode).toBeUndefined();

        const updatedTask = taskService.getTask(task.id);
        expect(updatedTask?.body).toBe('# Body from file');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('should update body from file without providing <value> argument', async () => {
      const fs = await import('fs');
      const os = await import('os');
      const path = await import('path');

      const taskService = new TaskService();
      taskService.createTask({ title: 'Test task', status: 'backlog' });
      const task = taskService.listTasks()[0];

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-update-test-'));
      const filePath = path.join(tmpDir, 'body.md');
      fs.writeFileSync(filePath, '# Content without value arg');

      try {
        // No <value> argument provided - only --file option
        const { exitCode, logs } = await runCommand(program, [
          'task',
          'update',
          String(task.id),
          'body',
          '--file',
          filePath,
        ]);
        expect(exitCode).toBeUndefined();
        expect(logs.join('\n')).toContain('✓');

        const updatedTask = taskService.getTask(task.id);
        expect(updatedTask?.body).toBe('# Content without value arg');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('should exit with error when --file is specified but file does not exist', async () => {
      const taskService = new TaskService();
      taskService.createTask({ title: 'Test task', status: 'backlog' });
      const task = taskService.listTasks()[0];

      const { exitCode, logs } = await runCommand(program, [
        'task',
        'update',
        String(task.id),
        'body',
        '--file',
        '/nonexistent/path.md',
      ]);
      expect(exitCode).toBe(1);
      expect(logs.join('\n')).toContain('Error reading file');
    });

    it('should exit with error when body field and --file is not specified and value is missing', async () => {
      const taskService = new TaskService();
      taskService.createTask({ title: 'Test task', status: 'backlog' });
      const task = taskService.listTasks()[0];

      const { exitCode, logs } = await runCommand(program, ['task', 'update', String(task.id), 'body']);
      expect(exitCode).toBe(1);
      expect(logs.join('\n')).toContain('value');
    });

    it('should exit with error when --file is used with non-body field', async () => {
      const taskService = new TaskService();
      taskService.createTask({ title: 'Test task', status: 'backlog' });
      const task = taskService.listTasks()[0];

      const fs = await import('fs');
      const os = await import('os');
      const path = await import('path');

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-update-test-'));
      const filePath = path.join(tmpDir, 'content.md');
      fs.writeFileSync(filePath, 'some content');

      try {
        const { exitCode, logs } = await runCommand(program, [
          'task',
          'update',
          String(task.id),
          'title',
          '--file',
          filePath,
        ]);
        expect(exitCode).toBe(1);
        expect(logs.join('\n')).toContain('--file');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('flag-based multi-field update', () => {
    it('should update multiple fields simultaneously with flags', async () => {
      const taskService = new TaskService();
      taskService.createTask({ title: 'Original title', status: 'backlog' });
      const task = taskService.listTasks()[0];

      const { exitCode, logs } = await runCommand(program, [
        'task',
        'update',
        String(task.id),
        '--title',
        'New title',
        '--status',
        'ready',
        '--author',
        'alice',
      ]);
      expect(exitCode).toBeUndefined();
      expect(logs.join('\n')).toContain('✓');

      const updatedTask = taskService.getTask(task.id);
      expect(updatedTask?.title).toBe('New title');
      expect(updatedTask?.status).toBe('ready');
      expect(updatedTask?.author).toBe('alice');
    });

    it('should update title and body simultaneously', async () => {
      const taskService = new TaskService();
      taskService.createTask({ title: 'Original', status: 'backlog' });
      const task = taskService.listTasks()[0];

      const { exitCode } = await runCommand(program, [
        'task',
        'update',
        String(task.id),
        '--title',
        'Updated title',
        '--body',
        'Updated body content',
      ]);
      expect(exitCode).toBeUndefined();

      const updatedTask = taskService.getTask(task.id);
      expect(updatedTask?.title).toBe('Updated title');
      expect(updatedTask?.body).toBe('Updated body content');
    });

    it('should update all fields simultaneously', async () => {
      const taskService = new TaskService();
      taskService.createTask({ title: 'Original', status: 'backlog' });
      const task = taskService.listTasks()[0];

      const { exitCode } = await runCommand(program, [
        'task',
        'update',
        String(task.id),
        '--title',
        'All fields',
        '--status',
        'in_progress',
        '--body',
        'New body',
        '--author',
        'bob',
        '--assignees',
        'alice,charlie',
      ]);
      expect(exitCode).toBeUndefined();

      const updatedTask = taskService.getTask(task.id);
      expect(updatedTask?.title).toBe('All fields');
      expect(updatedTask?.status).toBe('in_progress');
      expect(updatedTask?.body).toBe('New body');
      expect(updatedTask?.author).toBe('bob');
      expect(updatedTask?.assignees).toBe('alice,charlie');
    });

    it('should update a single field with flag syntax', async () => {
      const taskService = new TaskService();
      taskService.createTask({ title: 'Original', status: 'backlog' });
      const task = taskService.listTasks()[0];

      const { exitCode } = await runCommand(program, ['task', 'update', String(task.id), '--title', 'Flag title']);
      expect(exitCode).toBeUndefined();

      const updatedTask = taskService.getTask(task.id);
      expect(updatedTask?.title).toBe('Flag title');
      expect(updatedTask?.status).toBe('backlog'); // unchanged
    });

    it('should show error for invalid status in flag mode', async () => {
      const taskService = new TaskService();
      taskService.createTask({ title: 'Test', status: 'backlog' });
      const task = taskService.listTasks()[0];

      const { exitCode, logs } = await runCommand(program, [
        'task',
        'update',
        String(task.id),
        '--status',
        'invalid_status',
      ]);
      expect(exitCode).toBe(1);
      expect(logs.join('\n')).toContain('Invalid status');
    });

    it('should show error when no fields specified (no flags and no positional args)', async () => {
      const taskService = new TaskService();
      taskService.createTask({ title: 'Test', status: 'backlog' });
      const task = taskService.listTasks()[0];

      const { exitCode, logs } = await runCommand(program, ['task', 'update', String(task.id)]);
      expect(exitCode).toBe(1);
      expect(logs.join('\n')).toContain('No fields specified');
    });

    it('should use --file with flag mode for body', async () => {
      const fs = await import('fs');
      const os = await import('os');
      const path = await import('path');

      const taskService = new TaskService();
      taskService.createTask({ title: 'Test', status: 'backlog' });
      const task = taskService.listTasks()[0];

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-update-flag-'));
      const filePath = path.join(tmpDir, 'body.md');
      fs.writeFileSync(filePath, '# Flag mode body from file');

      try {
        const { exitCode } = await runCommand(program, [
          'task',
          'update',
          String(task.id),
          '--title',
          'Updated with file',
          '--file',
          filePath,
        ]);
        expect(exitCode).toBeUndefined();

        const updatedTask = taskService.getTask(task.id);
        expect(updatedTask?.title).toBe('Updated with file');
        expect(updatedTask?.body).toBe('# Flag mode body from file');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('should show error when both --body and --file are specified in flag mode', async () => {
      const fs = await import('fs');
      const os = await import('os');
      const path = await import('path');

      const taskService = new TaskService();
      taskService.createTask({ title: 'Test', status: 'backlog' });
      const task = taskService.listTasks()[0];

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-update-flag-'));
      const filePath = path.join(tmpDir, 'body.md');
      fs.writeFileSync(filePath, 'file content');

      try {
        const { exitCode, logs } = await runCommand(program, [
          'task',
          'update',
          String(task.id),
          '--body',
          'inline body',
          '--file',
          filePath,
        ]);
        expect(exitCode).toBe(1);
        expect(logs.join('\n')).toContain('Cannot specify both --body and --file');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('should update body from file using --file alone in flag mode (without positional args)', async () => {
      const fs = await import('fs');
      const os = await import('os');
      const path = await import('path');

      const taskService = new TaskService();
      taskService.createTask({ title: 'Test', status: 'backlog' });
      const task = taskService.listTasks()[0];

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-update-flag-'));
      const filePath = path.join(tmpDir, 'body.md');
      fs.writeFileSync(filePath, '# Body from file only');

      try {
        // --file alone (no positional args, no --body) should set body from file
        const { exitCode } = await runCommand(program, ['task', 'update', String(task.id), '--file', filePath]);
        expect(exitCode).toBeUndefined();

        const updatedTask = taskService.getTask(task.id);
        expect(updatedTask?.body).toBe('# Body from file only');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('should maintain backward compatibility with positional syntax', async () => {
      const taskService = new TaskService();
      taskService.createTask({ title: 'Compat test', status: 'backlog' });
      const task = taskService.listTasks()[0];

      // Old-style positional update still works
      const { exitCode } = await runCommand(program, ['task', 'update', String(task.id), 'status', 'ready']);
      expect(exitCode).toBeUndefined();

      const updatedTask = taskService.getTask(task.id);
      expect(updatedTask?.status).toBe('ready');
    });

    it('should update priority with --priority flag', async () => {
      const taskService = new TaskService();
      const task = taskService.createTask({ title: 'Priority test' });

      const { exitCode } = await runCommand(program, ['task', 'update', String(task.id), '--priority', 'high']);
      expect(exitCode).toBeUndefined();

      const updatedTask = taskService.getTask(task.id);
      expect(updatedTask?.priority).toBe('high');
    });

    it('should show error for invalid priority in flag mode', async () => {
      const taskService = new TaskService();
      const task = taskService.createTask({ title: 'Priority test' });

      const { exitCode, logs } = await runCommand(program, [
        'task',
        'update',
        String(task.id),
        '--priority',
        'invalid',
      ]);
      expect(exitCode).toBe(1);
      expect(logs.join('\n')).toContain('Invalid priority');
    });

    it('should update priority with positional syntax', async () => {
      const taskService = new TaskService();
      const task = taskService.createTask({ title: 'Priority test' });

      const { exitCode } = await runCommand(program, ['task', 'update', String(task.id), 'priority', 'critical']);
      expect(exitCode).toBeUndefined();

      const updatedTask = taskService.getTask(task.id);
      expect(updatedTask?.priority).toBe('critical');
    });
  });
});
