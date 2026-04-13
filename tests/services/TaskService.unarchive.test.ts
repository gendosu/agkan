/**
 * Tests for TaskService.unarchiveTask
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

function archiveTask(taskId: number) {
  const db = getDatabase();
  db.prepare('UPDATE tasks SET is_archived = 1 WHERE id = ?').run(taskId);
}

describe('TaskService.unarchiveTask', () => {
  let taskService: TaskService;

  beforeEach(() => {
    resetDatabase();
    taskService = new TaskService();
  });

  it('should unarchive an archived task', () => {
    const task = taskService.createTask({ title: 'Task to unarchive', status: 'done' });
    archiveTask(task.id);

    const found = taskService.getTask(task.id);
    expect(found!.is_archived).toBe(1);

    const unarchived = taskService.unarchiveTask(task.id);

    expect(unarchived).not.toBeNull();
    expect(unarchived!.id).toBe(task.id);
    expect(unarchived!.is_archived).toBe(0);
  });

  it('should return the unarchived task with updated_at field updated', () => {
    const task = taskService.createTask({ title: 'Task to unarchive', status: 'done' });
    archiveTask(task.id);

    const originalUpdatedAt = taskService.getTask(task.id)!.updated_at;

    // Wait a tiny bit to ensure timestamp difference
    const unarchived = taskService.unarchiveTask(task.id);

    expect(unarchived).not.toBeNull();
    expect(unarchived!.updated_at).not.toBe(originalUpdatedAt);
  });

  it('should return null if task is not found', () => {
    const result = taskService.unarchiveTask(9999);
    expect(result).toBeNull();
  });

  it('should unarchive a non-archived task (idempotent)', () => {
    const task = taskService.createTask({ title: 'Not archived task', status: 'done' });

    expect(taskService.getTask(task.id)!.is_archived).toBe(0);

    const unarchived = taskService.unarchiveTask(task.id);

    expect(unarchived).not.toBeNull();
    expect(unarchived!.is_archived).toBe(0);
  });

  it('should allow unarchived task to appear in listTasks', () => {
    const task = taskService.createTask({ title: 'Task to unarchive', status: 'done' });
    archiveTask(task.id);

    // Before unarchive, task should not be in list
    let tasks = taskService.listTasks();
    expect(tasks.map((t) => t.id)).not.toContain(task.id);

    // Unarchive
    taskService.unarchiveTask(task.id);

    // After unarchive, task should be in list
    tasks = taskService.listTasks();
    expect(tasks.map((t) => t.id)).toContain(task.id);
  });

  it('should unarchive multiple archived tasks', () => {
    const task1 = taskService.createTask({ title: 'Task 1', status: 'done' });
    const task2 = taskService.createTask({ title: 'Task 2', status: 'done' });
    archiveTask(task1.id);
    archiveTask(task2.id);

    taskService.unarchiveTask(task1.id);
    taskService.unarchiveTask(task2.id);

    expect(taskService.getTask(task1.id)!.is_archived).toBe(0);
    expect(taskService.getTask(task2.id)!.is_archived).toBe(0);
  });
});

describe('getBoardUpdatedAtSignature changes after unarchiveTask', () => {
  let taskService: TaskService;

  beforeEach(() => {
    resetDatabase();
    taskService = new TaskService();
  });

  it('should change getBoardUpdatedAtSignature after unarchiving a task', () => {
    const task = taskService.createTask({ title: 'Task to unarchive', status: 'done' });
    archiveTask(task.id);

    const backend = getStorageBackend();
    const signatureBefore = backend.getBoardUpdatedAtSignature();

    taskService.unarchiveTask(task.id);

    const signatureAfter = backend.getBoardUpdatedAtSignature();

    expect(signatureAfter).not.toBe(signatureBefore);
  });
});
