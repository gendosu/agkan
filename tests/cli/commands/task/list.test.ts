/**
 * Tests for task list command handler
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Command } from 'commander';
import { setupTaskListCommand } from '../../../../src/cli/commands/task/list';
import { getDatabase } from '../../../../src/db/connection';
import { TaskService, MetadataService, TaskBlockService } from '../../../../src/services';

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
    expect(optionNames).toContain('--priority');
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

  it('should include assignees in tree JSON output', async () => {
    const taskService = new TaskService();
    const parent = taskService.createTask({ title: 'Root Assignees Task', status: 'ready', assignees: 'alice,bob' });
    taskService.createTask({
      title: 'Child Assignees Task',
      status: 'ready',
      parent_id: parent.id,
      assignees: 'charlie',
    });

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
    const rootTask = parsed.tasks.find((t: { title: string }) => t.title === 'Root Assignees Task');
    expect(rootTask).toBeDefined();
    expect(rootTask.assignees).toBe('alice,bob');
    expect(rootTask.children).toHaveLength(1);
    expect(rootTask.children[0].assignees).toBe('charlie');
  });

  it('should include null assignees in tree JSON output when not set', async () => {
    const taskService = new TaskService();
    taskService.createTask({ title: 'No Assignees Tree Task', status: 'ready' });

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
    const task = parsed.tasks.find((t: { title: string }) => t.title === 'No Assignees Tree Task');
    expect(task).toBeDefined();
    expect(task).toHaveProperty('assignees');
    expect(task.assignees).toBeNull();
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

  it('should display metadata in tree view', async () => {
    const taskService = new TaskService();
    const metadataService = new MetadataService();
    const task = taskService.createTask({ title: 'Tree Meta Task', status: 'ready' });
    metadataService.setMetadata({ task_id: task.id, key: 'priority', value: 'high' });

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
    expect(output).toContain('Tree Meta Task');
    expect(output).toContain('Metadata:');
    expect(output).toContain('priority');
    expect(output).toContain('high');
  });

  it('should not display metadata section in tree view when task has no metadata', async () => {
    const taskService = new TaskService();
    taskService.createTask({ title: 'Tree No Meta Task', status: 'ready' });

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
    expect(output).toContain('Tree No Meta Task');
    expect(output).not.toContain('Metadata:');
  });

  it('should display metadata for child tasks in tree view', async () => {
    const taskService = new TaskService();
    const metadataService = new MetadataService();
    const parent = taskService.createTask({ title: 'Parent Task Tree', status: 'ready' });
    const child = taskService.createTask({ title: 'Child Task Tree', status: 'ready', parent_id: parent.id });
    metadataService.setMetadata({ task_id: child.id, key: 'priority', value: 'medium' });

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
    expect(output).toContain('Parent Task Tree');
    expect(output).toContain('Child Task Tree');
    expect(output).toContain('Metadata:');
    expect(output).toContain('priority');
    expect(output).toContain('medium');
  });

  it('should include assignees in JSON output', async () => {
    const taskService = new TaskService();
    taskService.createTask({ title: 'Assignees Task', status: 'ready', assignees: 'user1,user2' });

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
    expect(parsed.tasks[0].assignees).toBe('user1,user2');
  });

  it('should have --sort and --order options', () => {
    const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
    const listCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'list');

    const options = listCommand?.options || [];
    const optionNames = options.map((opt) => opt.long);

    expect(optionNames).toContain('--sort');
    expect(optionNames).toContain('--order');
  });

  it('should sort tasks by title ascending with --sort title --order asc', async () => {
    const taskService = new TaskService();
    taskService.createTask({ title: 'Charlie Task', status: 'ready' });
    taskService.createTask({ title: 'Alice Task', status: 'ready' });
    taskService.createTask({ title: 'Bob Task', status: 'ready' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'list', '--sort', 'title', '--order', 'asc', '--json']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const parsed = JSON.parse(consoleLogs[0]);
    expect(parsed.tasks).toHaveLength(3);
    expect(parsed.tasks[0].title).toBe('Alice Task');
    expect(parsed.tasks[1].title).toBe('Bob Task');
    expect(parsed.tasks[2].title).toBe('Charlie Task');
    expect(parsed.sort).toBe('title');
    expect(parsed.order).toBe('asc');
  });

  it('should sort tasks by id ascending with --sort id --order asc', async () => {
    const taskService = new TaskService();
    taskService.createTask({ title: 'Task 1', status: 'ready' });
    taskService.createTask({ title: 'Task 2', status: 'ready' });
    taskService.createTask({ title: 'Task 3', status: 'ready' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'list', '--sort', 'id', '--order', 'asc', '--json']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const parsed = JSON.parse(consoleLogs[0]);
    expect(parsed.tasks).toHaveLength(3);
    expect(parsed.tasks[0].title).toBe('Task 1');
    expect(parsed.tasks[1].title).toBe('Task 2');
    expect(parsed.tasks[2].title).toBe('Task 3');
  });

  it('should show error on invalid sort field', async () => {
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'list', '--sort', 'invalid_field']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('Invalid sort field');
  });

  it('should show error on invalid sort order', async () => {
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'list', '--order', 'invalid_order']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('Invalid sort order');
  });

  it('should default to created_at desc when no sort options provided (JSON)', async () => {
    const taskService = new TaskService();
    taskService.createTask({ title: 'First', status: 'ready' });
    taskService.createTask({ title: 'Second', status: 'ready' });

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
    expect(parsed.sort).toBe('created_at');
    expect(parsed.order).toBe('desc');
    // Default: newest first
    expect(parsed.tasks[0].title).toBe('Second');
    expect(parsed.tasks[1].title).toBe('First');
  });

  it('should sort tasks by priority descending with --sort priority --order desc', async () => {
    const taskService = new TaskService();
    taskService.createTask({ title: 'Low Task', status: 'ready', priority: 'low' });
    taskService.createTask({ title: 'No Priority Task', status: 'ready' });
    taskService.createTask({ title: 'Critical Task', status: 'ready', priority: 'critical' });
    taskService.createTask({ title: 'High Task', status: 'ready', priority: 'high' });
    taskService.createTask({ title: 'Medium Task', status: 'ready', priority: 'medium' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'list', '--sort', 'priority', '--order', 'desc', '--json']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const parsed = JSON.parse(consoleLogs[0]);
    expect(parsed.tasks).toHaveLength(5);
    expect(parsed.tasks[0].title).toBe('Critical Task');
    expect(parsed.tasks[1].title).toBe('High Task');
    expect(parsed.tasks[2].title).toBe('Medium Task');
    expect(parsed.tasks[3].title).toBe('Low Task');
    expect(parsed.tasks[4].title).toBe('No Priority Task');
    expect(parsed.sort).toBe('priority');
    expect(parsed.order).toBe('desc');
  });

  it('should sort tasks by priority ascending with --sort priority --order asc', async () => {
    const taskService = new TaskService();
    taskService.createTask({ title: 'Low Task', status: 'ready', priority: 'low' });
    taskService.createTask({ title: 'No Priority Task', status: 'ready' });
    taskService.createTask({ title: 'Critical Task', status: 'ready', priority: 'critical' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'list', '--sort', 'priority', '--order', 'asc', '--json']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const parsed = JSON.parse(consoleLogs[0]);
    expect(parsed.tasks).toHaveLength(3);
    expect(parsed.tasks[0].title).toBe('No Priority Task');
    expect(parsed.tasks[1].title).toBe('Low Task');
    expect(parsed.tasks[2].title).toBe('Critical Task');
    expect(parsed.sort).toBe('priority');
    expect(parsed.order).toBe('asc');
  });

  it('should display assignees in console output when assignees is set', async () => {
    const taskService = new TaskService();
    taskService.createTask({ title: 'Assignees Display Task', status: 'ready', assignees: 'alice,bob' });

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
    expect(output).toContain('alice,bob');
  });

  it('should filter tasks by multiple statuses (comma-separated)', async () => {
    const taskService = new TaskService();
    taskService.createTask({ title: 'Ready Task', status: 'ready' });
    taskService.createTask({ title: 'Backlog Task', status: 'backlog' });
    taskService.createTask({ title: 'Done Task', status: 'done' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));
    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'list', '--status', 'ready,backlog']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('Ready Task');
    expect(output).toContain('Backlog Task');
    expect(output).not.toContain('Done Task');
  });

  it('should show error on invalid status in comma-separated list', async () => {
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));
    const originalExit = process.exit;
    let exitCode: number | undefined;
    process.exit = ((code: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'list', '--status', 'ready,invalid_status']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('Invalid status');
  });

  it('should output JSON format with multiple statuses', async () => {
    const taskService = new TaskService();
    taskService.createTask({ title: 'Ready Task', status: 'ready' });
    taskService.createTask({ title: 'In Progress Task', status: 'in_progress' });
    taskService.createTask({ title: 'Done Task', status: 'done' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));
    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'list', '--status', 'ready,in_progress', '--json']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    const jsonOutput = JSON.parse(output);
    expect(jsonOutput.totalCount).toBe(2);
    expect(jsonOutput.tasks.some((t: { status: string }) => t.status === 'ready')).toBe(true);
    expect(jsonOutput.tasks.some((t: { status: string }) => t.status === 'in_progress')).toBe(true);
    expect(jsonOutput.tasks.every((t: { status: string }) => t.status !== 'done')).toBe(true);
  });

  it('should have --dep-tree option', () => {
    const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
    const listCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'list');

    const options = listCommand?.options || [];
    const optionNames = options.map((opt) => opt.long);

    expect(optionNames).toContain('--dep-tree');
  });

  it('should display dependency tree with --dep-tree option', async () => {
    const taskService = new TaskService();
    const taskBlockService = new TaskBlockService();

    const taskA = taskService.createTask({ title: 'Task A Blocker', status: 'ready' });
    const taskB = taskService.createTask({ title: 'Task B Blocked', status: 'ready' });
    taskBlockService.addBlock({ blocker_task_id: taskA.id, blocked_task_id: taskB.id });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));
    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'list', '--dep-tree']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('dependency tree view');
    expect(output).toContain('Task A Blocker');
    expect(output).toContain('Task B Blocked');
  });

  it('should show blocker as root and blocked as child in dep-tree', async () => {
    const taskService = new TaskService();
    const taskBlockService = new TaskBlockService();

    const blocker = taskService.createTask({ title: 'Root Blocker', status: 'ready' });
    const blocked = taskService.createTask({ title: 'Blocked Child', status: 'backlog' });
    taskBlockService.addBlock({ blocker_task_id: blocker.id, blocked_task_id: blocked.id });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));
    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'list', '--dep-tree']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    // Root blocker should appear; blocked child should appear indented beneath it
    expect(output).toContain('Root Blocker');
    expect(output).toContain('Blocked Child');
  });

  it('should output dep-tree JSON with --dep-tree --json options', async () => {
    const taskService = new TaskService();
    const taskBlockService = new TaskBlockService();

    const taskA = taskService.createTask({ title: 'Dep Root', status: 'ready' });
    const taskB = taskService.createTask({ title: 'Dep Child', status: 'ready' });
    taskBlockService.addBlock({ blocker_task_id: taskA.id, blocked_task_id: taskB.id });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'list', '--dep-tree', '--json']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const parsed = JSON.parse(consoleLogs[0]);
    expect(parsed.viewMode).toBe('dep-tree');
    expect(parsed.tasks).toBeDefined();

    // Task A (blocker) should be a root with Task B as a child in blocks
    const rootTask = parsed.tasks.find((t: { title: string }) => t.title === 'Dep Root');
    expect(rootTask).toBeDefined();
    expect(rootTask.blocks).toHaveLength(1);
    expect(rootTask.blocks[0].title).toBe('Dep Child');
  });

  it('should display multi-level dependency chain in dep-tree', async () => {
    const taskService = new TaskService();
    const taskBlockService = new TaskBlockService();

    const taskA = taskService.createTask({ title: 'Chain A', status: 'ready' });
    const taskB = taskService.createTask({ title: 'Chain B', status: 'ready' });
    const taskC = taskService.createTask({ title: 'Chain C', status: 'ready' });
    taskBlockService.addBlock({ blocker_task_id: taskA.id, blocked_task_id: taskB.id });
    taskBlockService.addBlock({ blocker_task_id: taskB.id, blocked_task_id: taskC.id });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'list', '--dep-tree', '--json']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const parsed = JSON.parse(consoleLogs[0]);
    const rootTask = parsed.tasks.find((t: { title: string }) => t.title === 'Chain A');
    expect(rootTask).toBeDefined();
    expect(rootTask.blocks).toHaveLength(1);
    expect(rootTask.blocks[0].title).toBe('Chain B');
    expect(rootTask.blocks[0].blocks).toHaveLength(1);
    expect(rootTask.blocks[0].blocks[0].title).toBe('Chain C');
  });

  it('should show tasks without block relationships as standalone roots in dep-tree', async () => {
    const taskService = new TaskService();
    const taskBlockService = new TaskBlockService();

    taskService.createTask({ title: 'Standalone Task', status: 'ready' });
    const taskB = taskService.createTask({ title: 'Blocker Task', status: 'ready' });
    const taskC = taskService.createTask({ title: 'Blocked Task', status: 'ready' });
    taskBlockService.addBlock({ blocker_task_id: taskB.id, blocked_task_id: taskC.id });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'list', '--dep-tree', '--json']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const parsed = JSON.parse(consoleLogs[0]);
    // Standalone Task should be a root (not blocked by anyone)
    const standalone = parsed.tasks.find((t: { title: string }) => t.title === 'Standalone Task');
    expect(standalone).toBeDefined();
    expect(standalone.blocks).toHaveLength(0);

    // Blocker Task should be a root with Blocked Task as child
    const blocker = parsed.tasks.find((t: { title: string }) => t.title === 'Blocker Task');
    expect(blocker).toBeDefined();
    expect(blocker.blocks).toHaveLength(1);

    // Blocked Task should NOT be a root
    const blocked = parsed.tasks.find((t: { title: string }) => t.title === 'Blocked Task');
    expect(blocked).toBeUndefined();
  });

  it('should have --priority option', () => {
    const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
    const listCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'list');

    const options = listCommand?.options || [];
    const optionNames = options.map((opt) => opt.long);

    expect(optionNames).toContain('--priority');
  });

  it('should filter tasks by single priority', async () => {
    const taskService = new TaskService();
    taskService.createTask({ title: 'High Priority Task', status: 'ready', priority: 'high' });
    taskService.createTask({ title: 'Low Priority Task', status: 'ready', priority: 'low' });
    taskService.createTask({ title: 'No Priority Task', status: 'ready' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));
    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'list', '--priority', 'high']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('High Priority Task');
    expect(output).not.toContain('Low Priority Task');
    expect(output).not.toContain('No Priority Task');
  });

  it('should filter tasks by multiple priorities (comma-separated)', async () => {
    const taskService = new TaskService();
    taskService.createTask({ title: 'Critical Task', status: 'ready', priority: 'critical' });
    taskService.createTask({ title: 'High Task', status: 'ready', priority: 'high' });
    taskService.createTask({ title: 'Medium Task', status: 'ready', priority: 'medium' });
    taskService.createTask({ title: 'Low Task', status: 'ready', priority: 'low' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));
    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'list', '--priority', 'critical,high']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('Critical Task');
    expect(output).toContain('High Task');
    expect(output).not.toContain('Medium Task');
    expect(output).not.toContain('Low Task');
  });

  it('should show error on invalid priority', async () => {
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));
    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'list', '--priority', 'invalid_priority']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('Invalid priority');
  });

  it('should include priority in JSON output filters', async () => {
    const taskService = new TaskService();
    taskService.createTask({ title: 'High Task JSON', status: 'ready', priority: 'high' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));
    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'list', '--priority', 'high', '--json']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const parsed = JSON.parse(consoleLogs[0]);
    expect(parsed.filters.priority).toBe('high');
    expect(parsed.tasks).toHaveLength(1);
    expect(parsed.tasks[0].title).toBe('High Task JSON');
  });

  it('should include priority filter in empty JSON output', async () => {
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));
    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'list', '--priority', 'critical', '--json']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const parsed = JSON.parse(consoleLogs[0]);
    expect(parsed.totalCount).toBe(0);
    expect(parsed.filters.priority).toBe('critical');
    expect(parsed.tasks).toHaveLength(0);
  });
});
