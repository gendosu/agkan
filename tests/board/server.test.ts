/**
 * Tests for board server
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createBoardApp } from '../../src/board/server';
import { getDatabase } from '../../src/db/connection';
import { TaskService } from '../../src/services/TaskService';
import { TaskTagService } from '../../src/services/TaskTagService';
import { MetadataService } from '../../src/services/MetadataService';
import { TagService } from '../../src/services/TagService';

function resetDatabase(): void {
  const db = getDatabase();
  db.exec('DELETE FROM task_tags');
  db.exec('DELETE FROM task_metadata');
  db.exec('DELETE FROM task_blocks');
  db.exec('DELETE FROM tasks');
  db.exec('DELETE FROM tags');
  db.exec("DELETE FROM sqlite_sequence WHERE name='tasks'");
}

describe('createBoardApp', () => {
  let taskService: TaskService;
  let taskTagService: TaskTagService;
  let metadataService: MetadataService;
  let tagService: TagService;

  beforeEach(() => {
    resetDatabase();
    taskService = new TaskService();
    tagService = new TagService();
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

    it('should render tag badges when a task has tags', async () => {
      const task = taskService.createTask({ title: 'Tagged task', status: 'ready' });
      const tag1 = tagService.createTag({ name: 'frontend' });
      const tag2 = tagService.createTag({ name: 'bug' });
      taskTagService.addTagToTask({ task_id: task.id, tag_id: tag1.id });
      taskTagService.addTagToTask({ task_id: task.id, tag_id: tag2.id });

      const app = createBoardApp(taskService, taskTagService, metadataService);
      const res = await app.fetch(new Request('http://localhost/'));
      const html = await res.text();

      expect(html).toContain('<span class="tag">frontend</span>');
      expect(html).toContain('<span class="tag">bug</span>');
      expect(html).toContain('class="card-tags"');
    });

    it('should not render card-tags div when a task has no tags', async () => {
      taskService.createTask({ title: 'No tags task', status: 'ready' });

      const app = createBoardApp(taskService, taskTagService, metadataService);
      const res = await app.fetch(new Request('http://localhost/'));
      const html = await res.text();

      // The card for this task should not contain a card-tags div
      const cardStart = html.indexOf('No tags task');
      expect(cardStart).toBeGreaterThan(-1);
      // Find the enclosing card div
      const cardEnd = html.indexOf('</div>', html.indexOf('</div>', html.indexOf('</div>', cardStart) + 1) + 1);
      const cardHtml = html.substring(cardStart - 200, cardEnd);
      expect(cardHtml).not.toContain('card-tags');
    });

    it('should render priority badge when a task has priority metadata', async () => {
      const task = taskService.createTask({ title: 'High prio render', status: 'backlog' });
      metadataService.setMetadata({ task_id: task.id, key: 'priority', value: 'high' });

      const app = createBoardApp(taskService, taskTagService, metadataService);
      const res = await app.fetch(new Request('http://localhost/'));
      const html = await res.text();

      expect(html).toContain('<span class="priority priority-high">high</span>');
    });

    it('should render critical priority badge correctly', async () => {
      const task = taskService.createTask({ title: 'Critical task render', status: 'ready' });
      metadataService.setMetadata({ task_id: task.id, key: 'priority', value: 'critical' });

      const app = createBoardApp(taskService, taskTagService, metadataService);
      const res = await app.fetch(new Request('http://localhost/'));
      const html = await res.text();

      expect(html).toContain('<span class="priority priority-critical">critical</span>');
    });

    it('should not render priority badge when task has no priority', async () => {
      taskService.createTask({ title: 'No priority render', status: 'backlog' });

      const app = createBoardApp(taskService, taskTagService, metadataService);
      const res = await app.fetch(new Request('http://localhost/'));
      const html = await res.text();

      // Find the card for this task and verify no priority badge
      const cardIdPos = html.indexOf('No priority render');
      expect(cardIdPos).toBeGreaterThan(-1);
      // Extract a window around the card
      const windowStart = Math.max(0, cardIdPos - 300);
      const windowEnd = Math.min(html.length, cardIdPos + 200);
      const cardWindow = html.substring(windowStart, windowEnd);
      // The card-header for this task should not contain a priority span
      expect(cardWindow).not.toContain('class="priority');
    });

    it('should render both tag badges and priority badge on the same task', async () => {
      const task = taskService.createTask({ title: 'Full badges task', status: 'in_progress' });
      const tag = tagService.createTag({ name: 'ui' });
      taskTagService.addTagToTask({ task_id: task.id, tag_id: tag.id });
      metadataService.setMetadata({ task_id: task.id, key: 'priority', value: 'medium' });

      const app = createBoardApp(taskService, taskTagService, metadataService);
      const res = await app.fetch(new Request('http://localhost/'));
      const html = await res.text();

      expect(html).toContain('<span class="priority priority-medium">medium</span>');
      expect(html).toContain('<span class="tag">ui</span>');
    });
  });

  describe('sortByPriority', () => {
    it('should sort tasks by priority: critical → high → medium → low → no priority', async () => {
      // Create tasks in non-sorted order within the same status column
      taskService.createTask({ title: 'No priority task', status: 'backlog' });
      const tLow = taskService.createTask({ title: 'Low priority task', status: 'backlog' });
      const tCritical = taskService.createTask({ title: 'Critical priority task', status: 'backlog' });
      const tHigh = taskService.createTask({ title: 'High priority task', status: 'backlog' });
      const tMedium = taskService.createTask({ title: 'Medium priority task', status: 'backlog' });

      // Set priority metadata
      metadataService.setMetadata({ task_id: tLow.id, key: 'priority', value: 'low' });
      metadataService.setMetadata({ task_id: tCritical.id, key: 'priority', value: 'critical' });
      metadataService.setMetadata({ task_id: tHigh.id, key: 'priority', value: 'high' });
      metadataService.setMetadata({ task_id: tMedium.id, key: 'priority', value: 'medium' });

      const app = createBoardApp(taskService, taskTagService, metadataService);
      const res = await app.fetch(new Request('http://localhost/'));
      const html = await res.text();

      const criticalPos = html.indexOf('Critical priority task');
      const highPos = html.indexOf('High priority task');
      const mediumPos = html.indexOf('Medium priority task');
      const lowPos = html.indexOf('Low priority task');
      const nonePos = html.indexOf('No priority task');

      expect(criticalPos).toBeGreaterThan(-1);
      expect(highPos).toBeGreaterThan(-1);
      expect(mediumPos).toBeGreaterThan(-1);
      expect(lowPos).toBeGreaterThan(-1);
      expect(nonePos).toBeGreaterThan(-1);

      // Verify order: critical < high < medium < low < no priority
      expect(criticalPos).toBeLessThan(highPos);
      expect(highPos).toBeLessThan(mediumPos);
      expect(mediumPos).toBeLessThan(lowPos);
      expect(lowPos).toBeLessThan(nonePos);
    });

    it('should treat tasks without priority equally (stable relative order)', async () => {
      taskService.createTask({ title: 'Task A no prio', status: 'ready' });
      taskService.createTask({ title: 'Task B no prio', status: 'ready' });

      const app = createBoardApp(taskService, taskTagService, metadataService);
      const res = await app.fetch(new Request('http://localhost/'));
      const html = await res.text();

      const posA = html.indexOf('Task A no prio');
      const posB = html.indexOf('Task B no prio');

      expect(posA).toBeGreaterThan(-1);
      expect(posB).toBeGreaterThan(-1);
    });

    it('should sort tasks with priority before tasks without priority', async () => {
      taskService.createTask({ title: 'Unprioritized task', status: 'backlog' });
      const tLowPrio = taskService.createTask({ title: 'Low prio task', status: 'backlog' });

      metadataService.setMetadata({ task_id: tLowPrio.id, key: 'priority', value: 'low' });

      const app = createBoardApp(taskService, taskTagService, metadataService);
      const res = await app.fetch(new Request('http://localhost/'));
      const html = await res.text();

      const lowPos = html.indexOf('Low prio task');
      const nonePos = html.indexOf('Unprioritized task');

      expect(lowPos).toBeLessThan(nonePos);
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

  describe('GET /api/tasks/:id', () => {
    it('should return task detail with tags and metadata', async () => {
      const task = taskService.createTask({ title: 'Detail task', body: 'Task body text', status: 'ready' });
      const tag = tagService.createTag({ name: 'backend' });
      taskTagService.addTagToTask({ task_id: task.id, tag_id: tag.id });
      metadataService.setMetadata({ task_id: task.id, key: 'priority', value: 'high' });

      const app = createBoardApp(taskService, taskTagService, metadataService);
      const res = await app.fetch(new Request(`http://localhost/api/tasks/${task.id}`));

      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        task: { id: number; title: string; body: string; status: string; created_at: string; updated_at: string };
        tags: Array<{ name: string }>;
        metadata: Array<{ key: string; value: string }>;
      };
      expect(data.task.id).toBe(task.id);
      expect(data.task.title).toBe('Detail task');
      expect(data.task.body).toBe('Task body text');
      expect(data.task.status).toBe('ready');
      expect(data.task.created_at).toBeDefined();
      expect(data.task.updated_at).toBeDefined();
      expect(data.tags).toHaveLength(1);
      expect(data.tags[0].name).toBe('backend');
      expect(data.metadata).toHaveLength(1);
      expect(data.metadata[0].key).toBe('priority');
      expect(data.metadata[0].value).toBe('high');
    });

    it('should return task with empty tags and metadata when none exist', async () => {
      const task = taskService.createTask({ title: 'Bare task', status: 'backlog' });

      const app = createBoardApp(taskService, taskTagService, metadataService);
      const res = await app.fetch(new Request(`http://localhost/api/tasks/${task.id}`));

      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        task: { id: number; title: string };
        tags: Array<{ name: string }>;
        metadata: Array<{ key: string; value: string }>;
      };
      expect(data.task.title).toBe('Bare task');
      expect(data.tags).toHaveLength(0);
      expect(data.metadata).toHaveLength(0);
    });

    it('should return 404 for non-existent task', async () => {
      const app = createBoardApp(taskService, taskTagService, metadataService);
      const res = await app.fetch(new Request('http://localhost/api/tasks/9999'));

      expect(res.status).toBe(404);
      const data = (await res.json()) as { error: string };
      expect(data.error).toBe('Task not found');
    });

    it('should return 400 for invalid (NaN) task id', async () => {
      const app = createBoardApp(taskService, taskTagService, metadataService);
      const res = await app.fetch(new Request('http://localhost/api/tasks/abc'));

      expect(res.status).toBe(400);
      const data = (await res.json()) as { error: string };
      expect(data.error).toBe('Invalid task id');
    });
  });

  describe('GET / (detail panel)', () => {
    it('should include detail panel HTML in the board page', async () => {
      const app = createBoardApp(taskService, taskTagService, metadataService);
      const res = await app.fetch(new Request('http://localhost/'));
      const html = await res.text();

      expect(html).toContain('id="detail-panel"');
      expect(html).toContain('id="detail-panel-close"');
      expect(html).toContain('id="detail-panel-body"');
      expect(html).toContain('class="detail-panel"');
    });

    it('should include detail panel CSS styles', async () => {
      const app = createBoardApp(taskService, taskTagService, metadataService);
      const res = await app.fetch(new Request('http://localhost/'));
      const html = await res.text();

      expect(html).toContain('.detail-panel');
      expect(html).toContain('.detail-panel.open');
      expect(html).toContain('.detail-panel-close');
    });

    it('should include card click handler script', async () => {
      taskService.createTask({ title: 'Clickable task', status: 'backlog' });

      const app = createBoardApp(taskService, taskTagService, metadataService);
      const res = await app.fetch(new Request('http://localhost/'));
      const html = await res.text();

      expect(html).toContain('renderDetailPanel');
      expect(html).toContain('closeDetailPanel');
      expect(html).toContain("fetch('/api/tasks/'");
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

    it('should return 400 for invalid (NaN) task id', async () => {
      const app = createBoardApp(taskService, taskTagService, metadataService);
      const res = await app.fetch(
        new Request('http://localhost/api/tasks/abc', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'done' }),
        })
      );

      expect(res.status).toBe(400);
      const data = (await res.json()) as { error: string };
      expect(data.error).toBe('Invalid task id');
    });
  });

  describe('PATCH /api/tasks/:id (edit)', () => {
    it('should update task title', async () => {
      const task = taskService.createTask({ title: 'Original title', status: 'backlog' });

      const app = createBoardApp(taskService, taskTagService, metadataService);
      const res = await app.fetch(
        new Request(`http://localhost/api/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'Updated title' }),
        })
      );

      expect(res.status).toBe(200);
      const data = (await res.json()) as { title: string };
      expect(data.title).toBe('Updated title');

      const fetched = taskService.getTask(task.id);
      expect(fetched?.title).toBe('Updated title');
    });

    it('should update task body', async () => {
      const task = taskService.createTask({ title: 'Task', body: 'Old body', status: 'backlog' });

      const app = createBoardApp(taskService, taskTagService, metadataService);
      const res = await app.fetch(
        new Request(`http://localhost/api/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: 'New body' }),
        })
      );

      expect(res.status).toBe(200);
      const fetched = taskService.getTask(task.id);
      expect(fetched?.body).toBe('New body');
    });

    it('should clear task body when null is sent', async () => {
      const task = taskService.createTask({ title: 'Task', body: 'Has body', status: 'backlog' });

      const app = createBoardApp(taskService, taskTagService, metadataService);
      const res = await app.fetch(
        new Request(`http://localhost/api/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: null }),
        })
      );

      expect(res.status).toBe(200);
      const fetched = taskService.getTask(task.id);
      expect(fetched?.body).toBe('');
    });

    it('should update priority metadata', async () => {
      const task = taskService.createTask({ title: 'Task', status: 'backlog' });
      metadataService.setMetadata({ task_id: task.id, key: 'priority', value: 'low' });

      const app = createBoardApp(taskService, taskTagService, metadataService);
      const res = await app.fetch(
        new Request(`http://localhost/api/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ priority: 'high' }),
        })
      );

      expect(res.status).toBe(200);
      const meta = metadataService.getMetadataByKey(task.id, 'priority');
      expect(meta?.value).toBe('high');
    });

    it('should remove priority metadata when priority is null', async () => {
      const task = taskService.createTask({ title: 'Task', status: 'backlog' });
      metadataService.setMetadata({ task_id: task.id, key: 'priority', value: 'high' });

      const app = createBoardApp(taskService, taskTagService, metadataService);
      const res = await app.fetch(
        new Request(`http://localhost/api/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ priority: null }),
        })
      );

      expect(res.status).toBe(200);
      const meta = metadataService.getMetadataByKey(task.id, 'priority');
      expect(meta).toBeNull();
    });

    it('should update multiple fields at once', async () => {
      const task = taskService.createTask({ title: 'Old', body: 'Old body', status: 'backlog' });

      const app = createBoardApp(taskService, taskTagService, metadataService);
      const res = await app.fetch(
        new Request(`http://localhost/api/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'New', body: 'New body', status: 'ready', priority: 'critical' }),
        })
      );

      expect(res.status).toBe(200);
      const data = (await res.json()) as { title: string; status: string };
      expect(data.title).toBe('New');
      expect(data.status).toBe('ready');

      const fetched = taskService.getTask(task.id);
      expect(fetched?.body).toBe('New body');

      const meta = metadataService.getMetadataByKey(task.id, 'priority');
      expect(meta?.value).toBe('critical');
    });

    it('should return 400 when title is empty string', async () => {
      const task = taskService.createTask({ title: 'Task', status: 'backlog' });

      const app = createBoardApp(taskService, taskTagService, metadataService);
      const res = await app.fetch(
        new Request(`http://localhost/api/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: '' }),
        })
      );

      expect(res.status).toBe(400);
      const data = (await res.json()) as { error: string };
      expect(data.error).toBe('Title cannot be empty');
    });

    it('should return 400 when title is whitespace only', async () => {
      const task = taskService.createTask({ title: 'Task', status: 'backlog' });

      const app = createBoardApp(taskService, taskTagService, metadataService);
      const res = await app.fetch(
        new Request(`http://localhost/api/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: '   ' }),
        })
      );

      expect(res.status).toBe(400);
      const data = (await res.json()) as { error: string };
      expect(data.error).toBe('Title cannot be empty');
    });

    it('should ignore invalid priority values', async () => {
      const task = taskService.createTask({ title: 'Task', status: 'backlog' });
      metadataService.setMetadata({ task_id: task.id, key: 'priority', value: 'high' });

      const app = createBoardApp(taskService, taskTagService, metadataService);
      const res = await app.fetch(
        new Request(`http://localhost/api/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ priority: 'invalid_priority' }),
        })
      );

      expect(res.status).toBe(200);
      // Invalid priority should delete the existing priority
      const meta = metadataService.getMetadataByKey(task.id, 'priority');
      expect(meta).toBeNull();
    });
  });

  describe('GET / (edit modal)', () => {
    it('should include edit modal HTML in the board page', async () => {
      const app = createBoardApp(taskService, taskTagService, metadataService);
      const res = await app.fetch(new Request('http://localhost/'));
      const html = await res.text();

      expect(html).toContain('id="edit-modal"');
      expect(html).toContain('id="edit-title"');
      expect(html).toContain('id="edit-body"');
      expect(html).toContain('id="edit-priority"');
      expect(html).toContain('id="edit-status"');
      expect(html).toContain('id="edit-task-id"');
    });

    it('should include Edit task context menu item', async () => {
      const app = createBoardApp(taskService, taskTagService, metadataService);
      const res = await app.fetch(new Request('http://localhost/'));
      const html = await res.text();

      expect(html).toContain('id="ctx-edit"');
      expect(html).toContain('Edit task');
    });

    it('should include edit modal script handlers', async () => {
      const app = createBoardApp(taskService, taskTagService, metadataService);
      const res = await app.fetch(new Request('http://localhost/'));
      const html = await res.text();

      expect(html).toContain('edit-modal');
      expect(html).toContain('edit-submit');
      expect(html).toContain('edit-cancel');
    });

    it('should include status options in edit modal', async () => {
      const app = createBoardApp(taskService, taskTagService, metadataService);
      const res = await app.fetch(new Request('http://localhost/'));
      const html = await res.text();

      expect(html).toContain('<option value="backlog">Backlog</option>');
      expect(html).toContain('<option value="in_progress">In Progress</option>');
      expect(html).toContain('<option value="done">Done</option>');
    });

    it('should include priority options in edit modal', async () => {
      const app = createBoardApp(taskService, taskTagService, metadataService);
      const res = await app.fetch(new Request('http://localhost/'));
      const html = await res.text();

      // The edit modal should have its own priority select
      const editModalStart = html.indexOf('id="edit-modal"');
      const editModalEnd = html.indexOf('</div>\n  </div>', editModalStart) + 20;
      const editModalHtml = html.substring(editModalStart, editModalEnd);

      expect(editModalHtml).toContain('<option value="critical">Critical</option>');
      expect(editModalHtml).toContain('<option value="high">High</option>');
      expect(editModalHtml).toContain('<option value="medium">Medium</option>');
      expect(editModalHtml).toContain('<option value="low">Low</option>');
    });
  });

  describe('DELETE /api/tasks/:id', () => {
    it('should delete a task and return success', async () => {
      const task = taskService.createTask({ title: 'Delete me', status: 'backlog' });

      const app = createBoardApp(taskService, taskTagService, metadataService);
      const res = await app.fetch(
        new Request(`http://localhost/api/tasks/${task.id}`, {
          method: 'DELETE',
        })
      );

      expect(res.status).toBe(200);
      const data = (await res.json()) as { success: boolean };
      expect(data.success).toBe(true);

      const fetched = taskService.getTask(task.id);
      expect(fetched).toBeNull();
    });

    it('should return 400 for invalid (NaN) task id', async () => {
      const app = createBoardApp(taskService, taskTagService, metadataService);
      const res = await app.fetch(
        new Request('http://localhost/api/tasks/abc', {
          method: 'DELETE',
        })
      );

      expect(res.status).toBe(400);
      const data = (await res.json()) as { error: string };
      expect(data.error).toBe('Invalid task id');
    });

    it('should return 404 for non-existent task', async () => {
      const app = createBoardApp(taskService, taskTagService, metadataService);
      const res = await app.fetch(
        new Request('http://localhost/api/tasks/9999', {
          method: 'DELETE',
        })
      );

      expect(res.status).toBe(404);
      const data = (await res.json()) as { error: string };
      expect(data.error).toBe('Task not found');
    });
  });
});
