import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskService } from '../../src/services/TaskService';
import { BoardEventService } from '../../src/services/BoardEventService';
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

describe('TaskService + BoardEventService integration', () => {
  let taskService: TaskService;
  let boardEventService: BoardEventService;
  let notifySpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetDatabase();
    boardEventService = new BoardEventService();
    notifySpy = vi.spyOn(boardEventService, 'notify');
    taskService = new TaskService(getStorageBackend(), boardEventService);
  });

  it('calls notify after createTask', () => {
    taskService.createTask({ title: 'test task', status: 'backlog' });
    expect(notifySpy).toHaveBeenCalledOnce();
  });

  it('calls notify after updateTask', () => {
    const task = taskService.createTask({ title: 'test task', status: 'backlog' });
    notifySpy.mockClear();
    taskService.updateTask(task.id, { title: 'updated' });
    expect(notifySpy).toHaveBeenCalledOnce();
  });

  it('calls notify after deleteTask', () => {
    const task = taskService.createTask({ title: 'test task', status: 'backlog' });
    notifySpy.mockClear();
    taskService.deleteTask(task.id);
    expect(notifySpy).toHaveBeenCalledOnce();
  });

  it('works without boardEventService (backward compat)', () => {
    const ts = new TaskService();
    expect(() => ts.createTask({ title: 'test', status: 'backlog' })).not.toThrow();
  });

  it('calls notify after purgeTasksBefore purges tasks', () => {
    const task = taskService.createTask({ title: 'Old done task', status: 'done' });
    setUpdatedAt(task.id, '2025-06-01T00:00:00.000Z');
    notifySpy.mockClear();

    taskService.purgeTasksBefore('2026-01-01T00:00:00.000Z');

    expect(notifySpy).toHaveBeenCalledOnce();
  });

  it('does not call notify when purgeTasksBefore is a dryRun', () => {
    const task = taskService.createTask({ title: 'Old done task', status: 'done' });
    setUpdatedAt(task.id, '2025-06-01T00:00:00.000Z');
    notifySpy.mockClear();

    taskService.purgeTasksBefore('2026-01-01T00:00:00.000Z', ['done', 'closed'], true);

    expect(notifySpy).not.toHaveBeenCalled();
  });

  it('does not call notify when purgeTasksBefore matches no tasks', () => {
    notifySpy.mockClear();

    taskService.purgeTasksBefore('2026-01-01T00:00:00.000Z');

    expect(notifySpy).not.toHaveBeenCalled();
  });

  it('calls notify after archiveTasksBefore archives tasks', () => {
    const task = taskService.createTask({ title: 'Old done task', status: 'done' });
    setUpdatedAt(task.id, '2025-06-01T00:00:00.000Z');
    notifySpy.mockClear();

    taskService.archiveTasksBefore('2026-01-01T00:00:00.000Z');

    expect(notifySpy).toHaveBeenCalledOnce();
  });

  it('does not call notify when archiveTasksBefore is a dryRun', () => {
    const task = taskService.createTask({ title: 'Old done task', status: 'done' });
    setUpdatedAt(task.id, '2025-06-01T00:00:00.000Z');
    notifySpy.mockClear();

    taskService.archiveTasksBefore('2026-01-01T00:00:00.000Z', ['done', 'closed'], true);

    expect(notifySpy).not.toHaveBeenCalled();
  });

  it('does not call notify when archiveTasksBefore matches no tasks', () => {
    notifySpy.mockClear();

    taskService.archiveTasksBefore('2026-01-01T00:00:00.000Z');

    expect(notifySpy).not.toHaveBeenCalled();
  });

  it('calls notify after unarchiveTask', () => {
    const task = taskService.createTask({ title: 'test task', status: 'done' });
    taskService.archiveTasksBefore('2099-01-01T00:00:00.000Z', ['done']);
    notifySpy.mockClear();

    taskService.unarchiveTask(task.id);

    expect(notifySpy).toHaveBeenCalledOnce();
  });

  it('does not call notify when unarchiveTask target does not exist', () => {
    notifySpy.mockClear();

    taskService.unarchiveTask(9999);

    expect(notifySpy).not.toHaveBeenCalled();
  });
});
