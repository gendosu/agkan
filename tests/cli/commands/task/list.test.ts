/**
 * Tests for task list command handler
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Command } from 'commander';
import { setupTaskListCommand } from '../../../../src/cli/commands/task/list';
import { getDatabase } from '../../../../src/db/connection';
import { TaskService, MetadataService } from '../../../../src/services';

function resetDatabase() {
  const db = getDatabase();
  db.exec('DELETE FROM task_metadata');
  db.exec('DELETE FROM task_tags');
  db.exec('DELETE FROM task_blocks');
  db.exec('DELETE FROM tasks');
  db.exec("DELETE FROM sqlite_sequence WHERE name='tasks'");
}

describe('setupTaskListCommand', () => {
  let program: Command;

  beforeEach(() => {
    resetDatabase();

    program = new Command();
    program.exitOverride();
    program.command('task').description('Task management commands');
    setupTaskListCommand(program);
  });

  it('should register the list command', () => {
    const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
    expect(taskCommand).toBeDefined();

    const listCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'list');
    expect(listCommand).toBeDefined();
    expect(listCommand?.description()).toBe('List all tasks');
  });

  it('should have correct options', () => {
    const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
    const listCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'list');

    const options = listCommand?.options || [];
    const optionNames = options.map((opt) => opt.long);

    expect(optionNames).toContain('--status');
    expect(optionNames).toContain('--author');
    expect(optionNames).toContain('--tag');
    expect(optionNames).toContain('--all');
    expect(optionNames).toContain('--tree');
    expect(optionNames).toContain('--root-only');
    expect(optionNames).toContain('--json');
  });

  it('should list all tasks', async () => {
    const taskService = new TaskService();
    taskService.createTask({ title: 'Task A', status: 'ready' });
    taskService.createTask({ title: 'Task B', status: 'backlog' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'list']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('Task A');
    expect(output).toContain('Task B');
  });

  it('should filter tasks by status', async () => {
    const taskService = new TaskService();
    taskService.createTask({ title: 'Ready Task', status: 'ready' });
    taskService.createTask({ title: 'Backlog Task', status: 'backlog' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'list', '--status', 'ready']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('Ready Task');
    expect(output).not.toContain('Backlog Task');
  });

  it('should filter tasks by author', async () => {
    const taskService = new TaskService();
    taskService.createTask({ title: 'Alice Task', author: 'alice', status: 'ready' });
    taskService.createTask({ title: 'Bob Task', author: 'bob', status: 'ready' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'list', '--author', 'alice']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('Alice Task');
    expect(output).not.toContain('Bob Task');
  });

  it('should exclude done and closed tasks by default', async () => {
    const taskService = new TaskService();
    taskService.createTask({ title: 'Active Task', status: 'ready' });
    taskService.createTask({ title: 'Done Task', status: 'done' });
    taskService.createTask({ title: 'Closed Task', status: 'closed' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'list']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('Active Task');
    expect(output).not.toContain('Done Task');
    expect(output).not.toContain('Closed Task');
  });

  it('should include done and closed tasks with --all option', async () => {
    const taskService = new TaskService();
    taskService.createTask({ title: 'Active Task', status: 'ready' });
    taskService.createTask({ title: 'Done Task', status: 'done' });
    taskService.createTask({ title: 'Closed Task', status: 'closed' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'list', '--all']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('Active Task');
    expect(output).toContain('Done Task');
    expect(output).toContain('Closed Task');
  });

  it('should output JSON format with --json option', async () => {
    const taskService = new TaskService();
    taskService.createTask({ title: 'JSON Task', status: 'ready' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'list', '--json']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const parsed = JSON.parse(consoleLogs[0]);
    expect(parsed.totalCount).toBe(1);
    expect(parsed.tasks).toHaveLength(1);
    expect(parsed.tasks[0].title).toBe('JSON Task');
  });

  it('should output empty JSON when no tasks found', async () => {
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'list', '--json']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const parsed = JSON.parse(consoleLogs[0]);
    expect(parsed.totalCount).toBe(0);
    expect(parsed.tasks).toHaveLength(0);
  });

  it('should show message when no tasks found', async () => {
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'list']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('No tasks found');
  });

  it('should show only root tasks with --root-only option', async () => {
    const taskService = new TaskService();
    const parent = taskService.createTask({ title: 'Parent Task', status: 'ready' });
    taskService.createTask({ title: 'Child Task', status: 'ready', parent_id: parent.id });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'list', '--root-only']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('Parent Task');
    expect(output).not.toContain('Child Task');
  });

  it('should display tree structure with --tree option', async () => {
    const taskService = new TaskService();
    const parent = taskService.createTask({ title: 'Root Task', status: 'ready' });
    taskService.createTask({ title: 'Child Task', status: 'ready', parent_id: parent.id });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'list', '--tree']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('Root Task');
    expect(output).toContain('Child Task');
  });

  it('should show error on invalid status', async () => {
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'list', '--status', 'invalid_status']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('Invalid status');
  });

  it('should output tree JSON with --tree and --json options', async () => {
    const taskService = new TaskService();
    const parent = taskService.createTask({ title: 'Root Task', status: 'ready' });
    taskService.createTask({ title: 'Child Task', status: 'ready', parent_id: parent.id });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'list', '--tree', '--json']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const parsed = JSON.parse(consoleLogs[0]);
    expect(parsed.viewMode).toBe('tree');
    expect(parsed.tasks).toBeDefined();
    const rootTask = parsed.tasks.find((t: { title: string }) => t.title === 'Root Task');
    expect(rootTask).toBeDefined();
    expect(rootTask.children).toHaveLength(1);
    expect(rootTask.children[0].title).toBe('Child Task');
  });

  it('should display metadata in normal list view', async () => {
    const taskService = new TaskService();
    const metadataService = new MetadataService();
    const task = taskService.createTask({ title: 'Task With Meta', status: 'ready' });
    metadataService.setMetadata({ task_id: task.id, key: 'priority', value: 'high' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'list']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('Task With Meta');
    expect(output).toContain('Metadata:');
    expect(output).toContain('priority');
    expect(output).toContain('high');
  });

  it('should not display metadata section when task has no metadata', async () => {
    const taskService = new TaskService();
    taskService.createTask({ title: 'Task Without Meta', status: 'ready' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'list']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('Task Without Meta');
    expect(output).not.toContain('Metadata:');
  });

  it('should include metadata in JSON output', async () => {
    const taskService = new TaskService();
    const metadataService = new MetadataService();
    const task = taskService.createTask({ title: 'JSON Meta Task', status: 'ready' });
    metadataService.setMetadata({ task_id: task.id, key: 'priority', value: 'medium' });
    metadataService.setMetadata({ task_id: task.id, key: 'assignee', value: 'alice' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'list', '--json']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const parsed = JSON.parse(consoleLogs[0]);
    expect(parsed.tasks).toHaveLength(1);
    const taskData = parsed.tasks[0];
    expect(taskData.metadata).toBeDefined();
    expect(taskData.metadata).toHaveLength(2);
    const priorityMeta = taskData.metadata.find((m: { key: string }) => m.key === 'priority');
    expect(priorityMeta).toBeDefined();
    expect(priorityMeta.value).toBe('medium');
  });

  it('should include metadata in tree JSON output', async () => {
    const taskService = new TaskService();
    const metadataService = new MetadataService();
    const parent = taskService.createTask({ title: 'Root With Meta', status: 'ready' });
    metadataService.setMetadata({ task_id: parent.id, key: 'priority', value: 'high' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'list', '--tree', '--json']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const parsed = JSON.parse(consoleLogs[0]);
    const rootTask = parsed.tasks.find((t: { title: string }) => t.title === 'Root With Meta');
    expect(rootTask).toBeDefined();
    expect(rootTask.metadata).toBeDefined();
    expect(rootTask.metadata).toHaveLength(1);
    expect(rootTask.metadata[0].key).toBe('priority');
    expect(rootTask.metadata[0].value).toBe('high');
  });
});
