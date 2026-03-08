/**
 * Tests for TaskService.purgeTasksBefore
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TaskService } from '../../src/services';
import { getDatabase } from '../../src/db/connection';

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

describe('TaskService.purgeTasksBefore', () => {
  let taskService: TaskService;

  beforeEach(() => {
    resetDatabase();
    taskService = new TaskService();
  });

  it('should delete done tasks updated before the given date', () => {
    const task = taskService.createTask({ title: 'Old done task', status: 'done' });
    setUpdatedAt(task.id, '2025-06-01T00:00:00.000Z');

    const purged = taskService.purgeTasksBefore('2026-01-01T00:00:00.000Z');

    expect(purged).toHaveLength(1);
    expect(purged[0].id).toBe(task.id);
    expect(taskService.getTask(task.id)).toBeNull();
  });

  it('should delete closed tasks updated before the given date', () => {
    const task = taskService.createTask({ title: 'Old closed task', status: 'closed' });
    setUpdatedAt(task.id, '2025-06-01T00:00:00.000Z');

    const purged = taskService.purgeTasksBefore('2026-01-01T00:00:00.000Z');

    expect(purged).toHaveLength(1);
    expect(purged[0].id).toBe(task.id);
    expect(taskService.getTask(task.id)).toBeNull();
  });

  it('should not delete tasks updated on or after the given date', () => {
    const task = taskService.createTask({ title: 'Recent done task', status: 'done' });
    setUpdatedAt(task.id, '2026-06-01T00:00:00.000Z');

    const purged = taskService.purgeTasksBefore('2026-01-01T00:00:00.000Z');

    expect(purged).toHaveLength(0);
    expect(taskService.getTask(task.id)).not.toBeNull();
  });

  it('should not delete tasks whose status is not in the target list', () => {
    const task = taskService.createTask({ title: 'Old ready task', status: 'ready' });
    setUpdatedAt(task.id, '2025-06-01T00:00:00.000Z');

    const purged = taskService.purgeTasksBefore('2026-01-01T00:00:00.000Z');

    expect(purged).toHaveLength(0);
    expect(taskService.getTask(task.id)).not.toBeNull();
  });

  it('should respect custom statuses parameter', () => {
    const doneTask = taskService.createTask({ title: 'Old done task', status: 'done' });
    const closedTask = taskService.createTask({ title: 'Old closed task', status: 'closed' });
    setUpdatedAt(doneTask.id, '2025-06-01T00:00:00.000Z');
    setUpdatedAt(closedTask.id, '2025-06-01T00:00:00.000Z');

    // Only target 'closed'
    const purged = taskService.purgeTasksBefore('2026-01-01T00:00:00.000Z', ['closed']);

    expect(purged).toHaveLength(1);
    expect(purged[0].status).toBe('closed');
    expect(taskService.getTask(doneTask.id)).not.toBeNull();
    expect(taskService.getTask(closedTask.id)).toBeNull();
  });

  it('should return matched tasks without deleting when dryRun is true', () => {
    const task = taskService.createTask({ title: 'Old done task', status: 'done' });
    setUpdatedAt(task.id, '2025-06-01T00:00:00.000Z');

    const purged = taskService.purgeTasksBefore('2026-01-01T00:00:00.000Z', ['done', 'closed'], true);

    expect(purged).toHaveLength(1);
    expect(purged[0].id).toBe(task.id);
    // Task must still exist
    expect(taskService.getTask(task.id)).not.toBeNull();
  });

  it('should return empty array when statuses list is empty', () => {
    const task = taskService.createTask({ title: 'Old done task', status: 'done' });
    setUpdatedAt(task.id, '2025-06-01T00:00:00.000Z');

    const purged = taskService.purgeTasksBefore('2026-01-01T00:00:00.000Z', []);

    expect(purged).toHaveLength(0);
    expect(taskService.getTask(task.id)).not.toBeNull();
  });

  it('should purge multiple tasks at once', () => {
    const task1 = taskService.createTask({ title: 'Old done 1', status: 'done' });
    const task2 = taskService.createTask({ title: 'Old done 2', status: 'done' });
    const task3 = taskService.createTask({ title: 'Recent done', status: 'done' });
    setUpdatedAt(task1.id, '2025-01-01T00:00:00.000Z');
    setUpdatedAt(task2.id, '2025-06-01T00:00:00.000Z');
    setUpdatedAt(task3.id, '2026-06-01T00:00:00.000Z');

    const purged = taskService.purgeTasksBefore('2026-01-01T00:00:00.000Z');

    expect(purged).toHaveLength(2);
    expect(taskService.getTask(task1.id)).toBeNull();
    expect(taskService.getTask(task2.id)).toBeNull();
    expect(taskService.getTask(task3.id)).not.toBeNull();
  });
});
