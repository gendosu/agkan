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
});
