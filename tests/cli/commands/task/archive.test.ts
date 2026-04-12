/**
 * Tests for task archive command handler
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Command } from 'commander';
import { setupTaskArchiveCommand } from '../../../../src/cli/commands/task/archive';
import { getDatabase } from '../../../../src/db/connection';
import { TaskService } from '../../../../src/services';

function resetDatabase() {
  const db = getDatabase();
  db.exec('DELETE FROM task_tags');
  db.exec('DELETE FROM task_blocks');
  db.exec('DELETE FROM tasks');
  db.exec("DELETE FROM sqlite_sequence WHERE name='tasks'");
}

function setUpdatedAt(taskId: number, updatedAt: string) {
  const db = getDatabase();
  db.prepare('UPDATE tasks SET updated_at = ? WHERE id = ?').run(updatedAt, taskId);
}

describe('setupTaskArchiveCommand', () => {
  let program: Command;
  let taskService: TaskService;

  beforeEach(() => {
    resetDatabase();

    program = new Command();
    program.exitOverride();
    program.command('task').description('Task management commands');
    setupTaskArchiveCommand(program);

    taskService = new TaskService();
  });

  it('should register the archive command', () => {
    const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
    expect(taskCommand).toBeDefined();

    const archiveCommand = taskCommand?.commands.find((cmd) => cmd.name() === 'archive');
    expect(archiveCommand).toBeDefined();
    expect(archiveCommand?.description()).toContain('Archive done/closed');
  });

  it('should archive done tasks older than --before date', async () => {
    const task = taskService.createTask({ title: 'Old done task', status: 'done' });
    setUpdatedAt(task.id, '2025-06-01T00:00:00.000Z');

    const originalLog = console.log;
    console.log = (() => {}) as typeof console.log;
    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'archive', '--before', '2026-01-01']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(taskService.getTask(task.id)?.status).toBe('archive');
  });

  it('should not change status in dry-run mode', async () => {
    const task = taskService.createTask({ title: 'Old done task', status: 'done' });
    setUpdatedAt(task.id, '2025-06-01T00:00:00.000Z');

    const originalLog = console.log;
    console.log = (() => {}) as typeof console.log;
    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'archive', '--before', '2026-01-01', '--dry-run']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(taskService.getTask(task.id)?.status).toBe('done');
  });

  it('should output JSON with --json option', async () => {
    const task = taskService.createTask({ title: 'Old done task', status: 'done' });
    setUpdatedAt(task.id, '2025-06-01T00:00:00.000Z');

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'task', 'archive', '--before', '2026-01-01', '--json']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const parsed = JSON.parse(consoleLogs[0]);
    expect(parsed.count).toBe(1);
    expect(parsed.tasks[0].id).toBe(task.id);
    expect(taskService.getTask(task.id)?.status).toBe('archive');
  });
});
