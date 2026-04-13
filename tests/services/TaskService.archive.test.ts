/**
 * Tests for TaskService.archiveTasksBefore
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TaskService } from '../../src/services';
import { getDatabase, getStorageBackend } from '../../src/db/connection';

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

describe('TaskService.archiveTasksBefore', () => {
  let taskService: TaskService;

  beforeEach(() => {
    resetDatabase();
    taskService = new TaskService();
  });

  it('should archive done tasks updated before the given date', () => {
    const task = taskService.createTask({ title: 'Old done task', status: 'done' });
    setUpdatedAt(task.id, '2025-06-01T00:00:00.000Z');

    const archived = taskService.archiveTasksBefore('2026-01-01T00:00:00.000Z');

    expect(archived).toHaveLength(1);
    expect(archived[0].id).toBe(task.id);
    // Task still exists (not deleted)
    const found = taskService.getTask(task.id);
    expect(found).not.toBeNull();
    expect(found!.is_archived).toBe(1);
  });

  it('should archive closed tasks updated before the given date', () => {
    const task = taskService.createTask({ title: 'Old closed task', status: 'closed' });
    setUpdatedAt(task.id, '2025-06-01T00:00:00.000Z');

    const archived = taskService.archiveTasksBefore('2026-01-01T00:00:00.000Z');

    expect(archived).toHaveLength(1);
    expect(archived[0].id).toBe(task.id);
    const found = taskService.getTask(task.id);
    expect(found).not.toBeNull();
    expect(found!.is_archived).toBe(1);
  });

  it('should not archive tasks updated on or after the given date', () => {
    const task = taskService.createTask({ title: 'Recent done task', status: 'done' });
    setUpdatedAt(task.id, '2026-06-01T00:00:00.000Z');

    const archived = taskService.archiveTasksBefore('2026-01-01T00:00:00.000Z');

    expect(archived).toHaveLength(0);
    const found = taskService.getTask(task.id);
    expect(found).not.toBeNull();
    expect(found!.is_archived).toBe(0);
  });

  it('should not archive tasks whose status is not in the target list', () => {
    const task = taskService.createTask({ title: 'Old ready task', status: 'ready' });
    setUpdatedAt(task.id, '2025-06-01T00:00:00.000Z');

    const archived = taskService.archiveTasksBefore('2026-01-01T00:00:00.000Z');

    expect(archived).toHaveLength(0);
    const found = taskService.getTask(task.id);
    expect(found).not.toBeNull();
    expect(found!.is_archived).toBe(0);
  });

  it('should respect custom statuses parameter', () => {
    const doneTask = taskService.createTask({ title: 'Old done task', status: 'done' });
    const closedTask = taskService.createTask({ title: 'Old closed task', status: 'closed' });
    setUpdatedAt(doneTask.id, '2025-06-01T00:00:00.000Z');
    setUpdatedAt(closedTask.id, '2025-06-01T00:00:00.000Z');

    const archived = taskService.archiveTasksBefore('2026-01-01T00:00:00.000Z', ['closed']);

    expect(archived).toHaveLength(1);
    expect(archived[0].status).toBe('closed');
    expect(taskService.getTask(doneTask.id)!.is_archived).toBe(0);
    expect(taskService.getTask(closedTask.id)!.is_archived).toBe(1);
  });

  it('should return matched tasks without archiving when dryRun is true', () => {
    const task = taskService.createTask({ title: 'Old done task', status: 'done' });
    setUpdatedAt(task.id, '2025-06-01T00:00:00.000Z');

    const archived = taskService.archiveTasksBefore('2026-01-01T00:00:00.000Z', ['done', 'closed'], true);

    expect(archived).toHaveLength(1);
    expect(archived[0].id).toBe(task.id);
    // Task must not be archived
    expect(taskService.getTask(task.id)!.is_archived).toBe(0);
  });

  it('should return empty array when statuses list is empty', () => {
    const task = taskService.createTask({ title: 'Old done task', status: 'done' });
    setUpdatedAt(task.id, '2025-06-01T00:00:00.000Z');

    const archived = taskService.archiveTasksBefore('2026-01-01T00:00:00.000Z', []);

    expect(archived).toHaveLength(0);
    expect(taskService.getTask(task.id)!.is_archived).toBe(0);
  });

  it('should archive multiple tasks at once', () => {
    const task1 = taskService.createTask({ title: 'Old done 1', status: 'done' });
    const task2 = taskService.createTask({ title: 'Old done 2', status: 'done' });
    const task3 = taskService.createTask({ title: 'Recent done', status: 'done' });
    setUpdatedAt(task1.id, '2025-01-01T00:00:00.000Z');
    setUpdatedAt(task2.id, '2025-06-01T00:00:00.000Z');
    setUpdatedAt(task3.id, '2026-06-01T00:00:00.000Z');

    const archived = taskService.archiveTasksBefore('2026-01-01T00:00:00.000Z');

    expect(archived).toHaveLength(2);
    expect(taskService.getTask(task1.id)!.is_archived).toBe(1);
    expect(taskService.getTask(task2.id)!.is_archived).toBe(1);
    expect(taskService.getTask(task3.id)!.is_archived).toBe(0);
  });

  it('should not re-archive already archived tasks', () => {
    const task = taskService.createTask({ title: 'Already archived task', status: 'done' });
    setUpdatedAt(task.id, '2025-06-01T00:00:00.000Z');
    // Archive the task first
    taskService.archiveTasksBefore('2026-01-01T00:00:00.000Z');
    expect(taskService.getTask(task.id)!.is_archived).toBe(1);

    // Archiving again should find no eligible tasks (already archived)
    const archivedAgain = taskService.archiveTasksBefore('2026-06-01T00:00:00.000Z');
    expect(archivedAgain).toHaveLength(0);
  });

  it('should exclude archived tasks from listTasks by default', () => {
    const visibleTask = taskService.createTask({ title: 'Visible task', status: 'done' });
    const archivedTask = taskService.createTask({ title: 'Archived task', status: 'done' });
    setUpdatedAt(archivedTask.id, '2025-06-01T00:00:00.000Z');

    taskService.archiveTasksBefore('2026-01-01T00:00:00.000Z');

    const tasks = taskService.listTasks();
    const ids = tasks.map((t) => t.id);
    expect(ids).toContain(visibleTask.id);
    expect(ids).not.toContain(archivedTask.id);
  });
});

describe('getBoardUpdatedAtSignature changes after archiveTasksBefore', () => {
  let taskService: TaskService;

  beforeEach(() => {
    const db = getDatabase();
    db.exec('DELETE FROM task_tags');
    db.exec('DELETE FROM task_blocks');
    db.exec('DELETE FROM tasks');
    db.exec("DELETE FROM sqlite_sequence WHERE name='tasks'");
    taskService = new TaskService();
  });

  it('should change getBoardUpdatedAtSignature after archiving tasks', () => {
    const task = taskService.createTask({ title: 'Old done task', status: 'done' });
    const db = getDatabase();
    db.prepare('UPDATE tasks SET updated_at = ? WHERE id = ?').run('2025-06-01T00:00:00.000Z', task.id);

    const backend = getStorageBackend();
    const signatureBefore = backend.getBoardUpdatedAtSignature();

    taskService.archiveTasksBefore('2026-01-01T00:00:00.000Z');

    const signatureAfter = backend.getBoardUpdatedAtSignature();

    expect(signatureAfter).not.toBe(signatureBefore);
  });
});
