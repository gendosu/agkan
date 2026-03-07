/**
 * Tests for board server
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createBoardApp } from '../../src/board/server';
import { getDatabase } from '../../src/db/connection';
import { TaskService } from '../../src/services/TaskService';
import { TaskTagService } from '../../src/services/TaskTagService';
import { MetadataService } from '../../src/services/MetadataService';

function resetDatabase(): void {
  const db = getDatabase();
  db.exec('DELETE FROM task_tags');
  db.exec('DELETE FROM task_metadata');
  db.exec('DELETE FROM task_blocks');
  db.exec('DELETE FROM tasks');
  db.exec("DELETE FROM sqlite_sequence WHERE name='tasks'");
}

describe('createBoardApp', () => {
  let taskService: TaskService;
  let taskTagService: TaskTagService;
  let metadataService: MetadataService;

  beforeEach(() => {
    resetDatabase();
    taskService = new TaskService();
    taskTagService = new TaskTagService();
    metadataService = new MetadataService();
  });

  describe('GET /', () => {
    it('should return HTML with status 200', async () => {
      const app = createBoardApp(taskService, taskTagService, metadataService);
      const res = await app.fetch(new Request('http://localhost/'));

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
    });

    it('should include all status columns in HTML', async () => {
      const app = createBoardApp(taskService, taskTagService, metadataService);
      const res = await app.fetch(new Request('http://localhost/'));
      const html = await res.text();

      expect(html).toContain('data-status="icebox"');
      expect(html).toContain('data-status="backlog"');
      expect(html).toContain('data-status="ready"');
      expect(html).toContain('data-status="in_progress"');
      expect(html).toContain('data-status="review"');
      expect(html).toContain('data-status="done"');
      expect(html).toContain('data-status="closed"');
    });

    it('should include task cards in HTML', async () => {
      taskService.createTask({ title: 'Test task', status: 'backlog' });

      const app = createBoardApp(taskService, taskTagService, metadataService);
      const res = await app.fetch(new Request('http://localhost/'));
      const html = await res.text();

      expect(html).toContain('Test task');
      expect(html).toContain('#1');
    });

    it('should escape HTML in task titles', async () => {
      taskService.createTask({ title: '<script>alert("xss")</script>', status: 'backlog' });

      const app = createBoardApp(taskService, taskTagService, metadataService);
      const res = await app.fetch(new Request('http://localhost/'));
      const html = await res.text();

      expect(html).not.toContain('<script>alert("xss")</script>');
      expect(html).toContain('&lt;script&gt;');
    });
  });

  describe('GET /api/tasks', () => {
    it('should return tasks as JSON', async () => {
      taskService.createTask({ title: 'API task', status: 'ready' });

      const app = createBoardApp(taskService, taskTagService, metadataService);
      const res = await app.fetch(new Request('http://localhost/api/tasks'));

      expect(res.status).toBe(200);
      const data = (await res.json()) as { tasks: Array<{ title: string }> };
      expect(data.tasks).toHaveLength(1);
      expect(data.tasks[0].title).toBe('API task');
    });
  });

  describe('POST /api/tasks', () => {
    it('should create a task and return 201', async () => {
      const app = createBoardApp(taskService, taskTagService, metadataService);
      const res = await app.fetch(
        new Request('http://localhost/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'New task', body: 'Task body', status: 'ready' }),
        })
      );

      expect(res.status).toBe(201);
      const data = (await res.json()) as { id: number; title: string; status: string };
      expect(data.title).toBe('New task');
      expect(data.status).toBe('ready');
      expect(data.id).toBeDefined();

      const fetched = taskService.getTask(data.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.title).toBe('New task');
    });

    it('should return 400 when title is empty', async () => {
      const app = createBoardApp(taskService, taskTagService, metadataService);
      const res = await app.fetch(
        new Request('http://localhost/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: '' }),
        })
      );

      expect(res.status).toBe(400);
      const data = (await res.json()) as { error: string };
      expect(data.error).toBe('Title is required');
    });

    it('should return 400 when title is whitespace only', async () => {
      const app = createBoardApp(taskService, taskTagService, metadataService);
      const res = await app.fetch(
        new Request('http://localhost/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: '   ' }),
        })
      );

      expect(res.status).toBe(400);
      const data = (await res.json()) as { error: string };
      expect(data.error).toBe('Title is required');
    });

    it('should set priority metadata when priority is provided', async () => {
      const app = createBoardApp(taskService, taskTagService, metadataService);
      const res = await app.fetch(
        new Request('http://localhost/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'Priority task', status: 'backlog', priority: 'high' }),
        })
      );

      expect(res.status).toBe(201);
      const data = (await res.json()) as { id: number };
      const meta = metadataService.getMetadataByKey(data.id, 'priority');
      expect(meta).not.toBeNull();
      expect(meta?.value).toBe('high');
    });

    it('should not set priority metadata when priority is invalid', async () => {
      const app = createBoardApp(taskService, taskTagService, metadataService);
      const res = await app.fetch(
        new Request('http://localhost/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'No priority', priority: 'invalid_priority' }),
        })
      );

      expect(res.status).toBe(201);
      const data = (await res.json()) as { id: number };
      const meta = metadataService.getMetadataByKey(data.id, 'priority');
      expect(meta).toBeNull();
    });

    it('should fallback to backlog when status is invalid', async () => {
      const app = createBoardApp(taskService, taskTagService, metadataService);
      const res = await app.fetch(
        new Request('http://localhost/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'Fallback task', status: 'not_a_status' }),
        })
      );

      expect(res.status).toBe(201);
      const data = (await res.json()) as { id: number; status: string };
      expect(data.status).toBe('backlog');
    });

    it('should fallback to backlog when status is not provided', async () => {
      const app = createBoardApp(taskService, taskTagService, metadataService);
      const res = await app.fetch(
        new Request('http://localhost/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'No status task' }),
        })
      );

      expect(res.status).toBe(201);
      const data = (await res.json()) as { id: number; status: string };
      expect(data.status).toBe('backlog');
    });
  });

  describe('PATCH /api/tasks/:id', () => {
    it('should update task status', async () => {
      const task = taskService.createTask({ title: 'Move me', status: 'backlog' });

      const app = createBoardApp(taskService, taskTagService, metadataService);
      const res = await app.fetch(
        new Request(`http://localhost/api/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'ready' }),
        })
      );

      expect(res.status).toBe(200);
      const updated = (await res.json()) as { status: string };
      expect(updated.status).toBe('ready');

      const fetched = taskService.getTask(task.id);
      expect(fetched?.status).toBe('ready');
    });

    it('should return 400 for invalid status', async () => {
      const task = taskService.createTask({ title: 'Task', status: 'backlog' });

      const app = createBoardApp(taskService, taskTagService, metadataService);
      const res = await app.fetch(
        new Request(`http://localhost/api/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'invalid_status' }),
        })
      );

      expect(res.status).toBe(400);
    });

    it('should return 404 for non-existent task', async () => {
      const app = createBoardApp(taskService, taskTagService, metadataService);
      const res = await app.fetch(
        new Request('http://localhost/api/tasks/9999', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'done' }),
        })
      );

      expect(res.status).toBe(404);
    });
  });
});
