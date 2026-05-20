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
});
