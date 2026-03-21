/**
 * Tests for boardRoutes module
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import fs from 'fs';
import path from 'path';
import { resetDatabase } from '../../src/db/reset';
import { TaskService } from '../../src/services/TaskService';
import { TaskTagService } from '../../src/services/TaskTagService';
import { TagService } from '../../src/services/TagService';
import { MetadataService } from '../../src/services/MetadataService';
import { CommentService } from '../../src/services/CommentService';
import { TaskBlockService } from '../../src/services/TaskBlockService';
import { getDatabase } from '../../src/db/connection';
import { registerBoardRoutes, BoardServices } from '../../src/board/boardRoutes';
import { DETAIL_PANE_MAX_WIDTH } from '../../src/board/boardConfig';

const TEST_CONFIG_DIR = path.join(process.cwd(), '.agkan-test-routes-' + process.pid);

function buildServices(): BoardServices {
  const database = getDatabase();
  return {
    ts: new TaskService(),
    tts: new TaskTagService(),
    tags: new TagService(),
    ms: new MetadataService(),
    cs: new CommentService(database),
    tbs: new TaskBlockService(database),
    database,
    configDir: TEST_CONFIG_DIR,
  };
}

function buildApp(services: BoardServices): Hono {
  const app = new Hono();
  registerBoardRoutes(app, services);
  return app;
}

beforeEach(() => {
  resetDatabase();
  if (fs.existsSync(TEST_CONFIG_DIR)) {
    fs.rmSync(TEST_CONFIG_DIR, { recursive: true });
  }
});

afterEach(() => {
  if (fs.existsSync(TEST_CONFIG_DIR)) {
    fs.rmSync(TEST_CONFIG_DIR, { recursive: true });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/tasks
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/tasks', () => {
  it('returns 200 with empty tasks array when no tasks exist', async () => {
    const app = buildApp(buildServices());
    const res = await app.fetch(new Request('http://localhost/api/tasks'));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { tasks: unknown[] };
    expect(data.tasks).toEqual([]);
  });

  it('returns all tasks', async () => {
    const services = buildServices();
    services.ts.createTask({ title: 'Task A', status: 'backlog' });
    services.ts.createTask({ title: 'Task B', status: 'done' });
    const app = buildApp(services);
    const res = await app.fetch(new Request('http://localhost/api/tasks'));
    const data = (await res.json()) as { tasks: Array<{ title: string }> };
    expect(data.tasks).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/tasks
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/tasks', () => {
  it('creates a task and returns 201', async () => {
    const app = buildApp(buildServices());
    const res = await app.fetch(
      new Request('http://localhost/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Task' }),
      })
    );
    expect(res.status).toBe(201);
    const task = (await res.json()) as { title: string };
    expect(task.title).toBe('New Task');
  });

  it('returns 400 when title is missing', async () => {
    const app = buildApp(buildServices());
    const res = await app.fetch(
      new Request('http://localhost/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: 'no title' }),
      })
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain('Title');
  });

  it('returns 400 when title is empty string', async () => {
    const app = buildApp(buildServices());
    const res = await app.fetch(
      new Request('http://localhost/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '   ' }),
      })
    );
    expect(res.status).toBe(400);
  });

  it('creates task with default status backlog when status not provided', async () => {
    const app = buildApp(buildServices());
    const res = await app.fetch(
      new Request('http://localhost/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'No Status Task' }),
      })
    );
    const task = (await res.json()) as { status: string };
    expect(task.status).toBe('backlog');
  });

  it('creates task with specified valid status', async () => {
    const app = buildApp(buildServices());
    const res = await app.fetch(
      new Request('http://localhost/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Done Task', status: 'done' }),
      })
    );
    const task = (await res.json()) as { status: string };
    expect(task.status).toBe('done');
  });

  it('creates task with priority', async () => {
    const app = buildApp(buildServices());
    const res = await app.fetch(
      new Request('http://localhost/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Prio Task', priority: 'high' }),
      })
    );
    const task = (await res.json()) as { priority: string };
    expect(task.priority).toBe('high');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/tasks/:id
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/tasks/:id', () => {
  it('returns 404 when task not found', async () => {
    const app = buildApp(buildServices());
    const res = await app.fetch(new Request('http://localhost/api/tasks/999'));
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid id', async () => {
    const app = buildApp(buildServices());
    const res = await app.fetch(new Request('http://localhost/api/tasks/notanumber'));
    expect(res.status).toBe(400);
  });

  it('returns task with tags, metadata, blockedBy, blocking, parent', async () => {
    const services = buildServices();
    const task = services.ts.createTask({ title: 'Detail Task', status: 'ready' });
    const app = buildApp(services);
    const res = await app.fetch(new Request(`http://localhost/api/tasks/${task.id}`));
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      task: { id: number };
      tags: unknown[];
      metadata: unknown[];
      blockedBy: unknown[];
      blocking: unknown[];
    };
    expect(data.task.id).toBe(task.id);
    expect(Array.isArray(data.tags)).toBe(true);
    expect(Array.isArray(data.metadata)).toBe(true);
    expect(Array.isArray(data.blockedBy)).toBe(true);
    expect(Array.isArray(data.blocking)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/tasks/:id
// ─────────────────────────────────────────────────────────────────────────────
describe('PATCH /api/tasks/:id', () => {
  it('updates task title', async () => {
    const services = buildServices();
    const task = services.ts.createTask({ title: 'Original', status: 'backlog' });
    const app = buildApp(services);
    const res = await app.fetch(
      new Request(`http://localhost/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Updated' }),
      })
    );
    expect(res.status).toBe(200);
    const updated = (await res.json()) as { title: string };
    expect(updated.title).toBe('Updated');
  });

  it('returns 404 for non-existent task', async () => {
    const app = buildApp(buildServices());
    const res = await app.fetch(
      new Request('http://localhost/api/tasks/9999', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Updated' }),
      })
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid id', async () => {
    const app = buildApp(buildServices());
    const res = await app.fetch(
      new Request('http://localhost/api/tasks/abc', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Updated' }),
      })
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for empty title', async () => {
    const services = buildServices();
    const task = services.ts.createTask({ title: 'Original', status: 'backlog' });
    const app = buildApp(services);
    const res = await app.fetch(
      new Request(`http://localhost/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '' }),
      })
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid status', async () => {
    const services = buildServices();
    const task = services.ts.createTask({ title: 'Task', status: 'backlog' });
    const app = buildApp(services);
    const res = await app.fetch(
      new Request(`http://localhost/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'invalid_status' }),
      })
    );
    expect(res.status).toBe(400);
  });

  it('updates task status', async () => {
    const services = buildServices();
    const task = services.ts.createTask({ title: 'Task', status: 'backlog' });
    const app = buildApp(services);
    const res = await app.fetch(
      new Request(`http://localhost/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' }),
      })
    );
    expect(res.status).toBe(200);
    const updated = (await res.json()) as { status: string };
    expect(updated.status).toBe('done');
  });

  it('updates task priority to null when priority is null', async () => {
    const services = buildServices();
    const task = services.ts.createTask({ title: 'Task', status: 'backlog', priority: 'high' });
    const app = buildApp(services);
    const res = await app.fetch(
      new Request(`http://localhost/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority: null }),
      })
    );
    expect(res.status).toBe(200);
    const updated = (await res.json()) as { priority: string | null };
    expect(updated.priority).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/tasks/:id
// ─────────────────────────────────────────────────────────────────────────────
describe('DELETE /api/tasks/:id', () => {
  it('deletes a task and returns success', async () => {
    const services = buildServices();
    const task = services.ts.createTask({ title: 'Delete Me', status: 'backlog' });
    const app = buildApp(services);
    const res = await app.fetch(new Request(`http://localhost/api/tasks/${task.id}`, { method: 'DELETE' }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { success: boolean };
    expect(data.success).toBe(true);
  });

  it('returns 404 for non-existent task', async () => {
    const app = buildApp(buildServices());
    const res = await app.fetch(new Request('http://localhost/api/tasks/9999', { method: 'DELETE' }));
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid id', async () => {
    const app = buildApp(buildServices());
    const res = await app.fetch(new Request('http://localhost/api/tasks/xyz', { method: 'DELETE' }));
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Comment routes
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/tasks/:id/comments', () => {
  it('returns 200 with empty comments for a task with no comments', async () => {
    const services = buildServices();
    const task = services.ts.createTask({ title: 'Task', status: 'backlog' });
    const app = buildApp(services);
    const res = await app.fetch(new Request(`http://localhost/api/tasks/${task.id}/comments`));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { comments: unknown[] };
    expect(data.comments).toEqual([]);
  });

  it('returns 404 when task not found', async () => {
    const app = buildApp(buildServices());
    const res = await app.fetch(new Request('http://localhost/api/tasks/9999/comments'));
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid task id', async () => {
    const app = buildApp(buildServices());
    const res = await app.fetch(new Request('http://localhost/api/tasks/abc/comments'));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/tasks/:id/comments', () => {
  it('creates a comment and returns 201', async () => {
    const services = buildServices();
    const task = services.ts.createTask({ title: 'Task', status: 'backlog' });
    const app = buildApp(services);
    const res = await app.fetch(
      new Request(`http://localhost/api/tasks/${task.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'A comment' }),
      })
    );
    expect(res.status).toBe(201);
    const comment = (await res.json()) as { content: string };
    expect(comment.content).toBe('A comment');
  });

  it('returns 400 when content is missing', async () => {
    const services = buildServices();
    const task = services.ts.createTask({ title: 'Task', status: 'backlog' });
    const app = buildApp(services);
    const res = await app.fetch(
      new Request(`http://localhost/api/tasks/${task.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when task not found', async () => {
    const app = buildApp(buildServices());
    const res = await app.fetch(
      new Request('http://localhost/api/tasks/9999/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'A comment' }),
      })
    );
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/comments/:id', () => {
  it('updates comment content', async () => {
    const services = buildServices();
    const task = services.ts.createTask({ title: 'Task', status: 'backlog' });
    const comment = services.cs.addComment({ task_id: task.id, content: 'Original' });
    const app = buildApp(services);
    const res = await app.fetch(
      new Request(`http://localhost/api/comments/${comment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Updated' }),
      })
    );
    expect(res.status).toBe(200);
    const updated = (await res.json()) as { content: string };
    expect(updated.content).toBe('Updated');
  });

  it('returns 404 when comment not found', async () => {
    const app = buildApp(buildServices());
    const res = await app.fetch(
      new Request('http://localhost/api/comments/9999', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Updated' }),
      })
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 for missing content', async () => {
    const services = buildServices();
    const task = services.ts.createTask({ title: 'Task', status: 'backlog' });
    const comment = services.cs.addComment({ task_id: task.id, content: 'Original' });
    const app = buildApp(services);
    const res = await app.fetch(
      new Request(`http://localhost/api/comments/${comment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/comments/:id', () => {
  it('deletes a comment and returns success', async () => {
    const services = buildServices();
    const task = services.ts.createTask({ title: 'Task', status: 'backlog' });
    const comment = services.cs.addComment({ task_id: task.id, content: 'To delete' });
    const app = buildApp(services);
    const res = await app.fetch(new Request(`http://localhost/api/comments/${comment.id}`, { method: 'DELETE' }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { success: boolean };
    expect(data.success).toBe(true);
  });

  it('returns 404 for non-existent comment', async () => {
    const app = buildApp(buildServices());
    const res = await app.fetch(new Request('http://localhost/api/comments/9999', { method: 'DELETE' }));
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tag routes
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/tags', () => {
  it('returns all tags', async () => {
    const services = buildServices();
    services.tags.createTag({ name: 'frontend' });
    services.tags.createTag({ name: 'backend' });
    const app = buildApp(services);
    const res = await app.fetch(new Request('http://localhost/api/tags'));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { tags: Array<{ name: string }> };
    expect(data.tags).toHaveLength(2);
  });
});

describe('POST /api/tasks/:id/tags', () => {
  it('attaches a tag to a task', async () => {
    const services = buildServices();
    const task = services.ts.createTask({ title: 'Task', status: 'backlog' });
    const tag = services.tags.createTag({ name: 'mytag' });
    const app = buildApp(services);
    const res = await app.fetch(
      new Request(`http://localhost/api/tasks/${task.id}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagId: tag.id }),
      })
    );
    expect(res.status).toBe(201);
    const data = (await res.json()) as { success: boolean };
    expect(data.success).toBe(true);
  });

  it('returns 400 when tagId is missing', async () => {
    const services = buildServices();
    const task = services.ts.createTask({ title: 'Task', status: 'backlog' });
    const app = buildApp(services);
    const res = await app.fetch(
      new Request(`http://localhost/api/tasks/${task.id}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when task not found', async () => {
    const services = buildServices();
    const tag = services.tags.createTag({ name: 'mytag' });
    const app = buildApp(services);
    const res = await app.fetch(
      new Request('http://localhost/api/tasks/9999/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagId: tag.id }),
      })
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when tag not found', async () => {
    const services = buildServices();
    const task = services.ts.createTask({ title: 'Task', status: 'backlog' });
    const app = buildApp(services);
    const res = await app.fetch(
      new Request(`http://localhost/api/tasks/${task.id}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagId: 9999 }),
      })
    );
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/tasks/:id/tags/:tagId', () => {
  it('removes a tag from a task', async () => {
    const services = buildServices();
    const task = services.ts.createTask({ title: 'Task', status: 'backlog' });
    const tag = services.tags.createTag({ name: 'mytag' });
    services.tts.addTagToTask({ task_id: task.id, tag_id: tag.id });
    const app = buildApp(services);
    const res = await app.fetch(
      new Request(`http://localhost/api/tasks/${task.id}/tags/${tag.id}`, { method: 'DELETE' })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { success: boolean };
    expect(data.success).toBe(true);
  });

  it('returns 404 when tag not attached to task', async () => {
    const services = buildServices();
    const task = services.ts.createTask({ title: 'Task', status: 'backlog' });
    const app = buildApp(services);
    const res = await app.fetch(new Request(`http://localhost/api/tasks/${task.id}/tags/9999`, { method: 'DELETE' }));
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Utility routes
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/version', () => {
  it('returns version string', async () => {
    const app = buildApp(buildServices());
    const res = await app.fetch(new Request('http://localhost/api/version'));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { version: string };
    expect(typeof data.version).toBe('string');
    expect(data.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe('POST /api/tasks/purge', () => {
  it('returns count and tasks array', async () => {
    const app = buildApp(buildServices());
    const res = await app.fetch(new Request('http://localhost/api/tasks/purge', { method: 'POST' }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { count: number; tasks: unknown[] };
    expect(typeof data.count).toBe('number');
    expect(Array.isArray(data.tasks)).toBe(true);
  });

  it('returns 400 for invalid beforeDate', async () => {
    const app = buildApp(buildServices());
    const res = await app.fetch(
      new Request('http://localhost/api/tasks/purge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beforeDate: 'not-a-date' }),
      })
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain('beforeDate');
  });

  it('accepts a valid ISO 8601 beforeDate', async () => {
    const app = buildApp(buildServices());
    const res = await app.fetch(
      new Request('http://localhost/api/tasks/purge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beforeDate: '2030-01-01T00:00:00.000Z' }),
      })
    );
    expect(res.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Config routes
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/config', () => {
  it('returns empty board config when no config file exists', async () => {
    const app = buildApp(buildServices());
    const res = await app.fetch(new Request('http://localhost/api/config'));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { board: Record<string, unknown> };
    expect(data.board).toEqual({});
  });
});

describe('PUT /api/config', () => {
  it('returns success when updating detailPaneWidth', async () => {
    const app = buildApp(buildServices());
    const res = await app.fetch(
      new Request('http://localhost/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ board: { detailPaneWidth: 400 } }),
      })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { success: boolean };
    expect(data.success).toBe(true);
  });

  it('returns 400 when detailPaneWidth is not a number', async () => {
    const app = buildApp(buildServices());
    const res = await app.fetch(
      new Request('http://localhost/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ board: { detailPaneWidth: 'wide' } }),
      })
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain('detailPaneWidth');
  });

  it(`returns 400 when detailPaneWidth exceeds DETAIL_PANE_MAX_WIDTH`, async () => {
    const app = buildApp(buildServices());
    const res = await app.fetch(
      new Request('http://localhost/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ board: { detailPaneWidth: DETAIL_PANE_MAX_WIDTH + 1 } }),
      })
    );
    expect(res.status).toBe(400);
  });

  it('returns success when no board body is provided', async () => {
    const app = buildApp(buildServices());
    const res = await app.fetch(
      new Request('http://localhost/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(200);
  });

  it('returns success when updating theme to dark', async () => {
    const app = buildApp(buildServices());
    const res = await app.fetch(
      new Request('http://localhost/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ board: { theme: 'dark' } }),
      })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { success: boolean };
    expect(data.success).toBe(true);
  });

  it('returns success when updating theme to light', async () => {
    const app = buildApp(buildServices());
    const res = await app.fetch(
      new Request('http://localhost/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ board: { theme: 'light' } }),
      })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { success: boolean };
    expect(data.success).toBe(true);
  });

  it('returns success when updating theme to system', async () => {
    const app = buildApp(buildServices());
    const res = await app.fetch(
      new Request('http://localhost/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ board: { theme: 'system' } }),
      })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { success: boolean };
    expect(data.success).toBe(true);
  });

  it('returns 400 when theme is invalid', async () => {
    const app = buildApp(buildServices());
    const res = await app.fetch(
      new Request('http://localhost/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ board: { theme: 'invalid-theme' } }),
      })
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain('theme');
  });

  it('returns 400 when theme is not a string', async () => {
    const app = buildApp(buildServices());
    const res = await app.fetch(
      new Request('http://localhost/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ board: { theme: 123 } }),
      })
    );
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Board-specific routes
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/board/updated-at', () => {
  it('returns updatedAt field', async () => {
    const app = buildApp(buildServices());
    const res = await app.fetch(new Request('http://localhost/api/board/updated-at'));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { updatedAt: string | null };
    expect(data).toHaveProperty('updatedAt');
  });
});

describe('GET /api/board/cards', () => {
  it('returns columns array with all statuses', async () => {
    const app = buildApp(buildServices());
    const res = await app.fetch(new Request('http://localhost/api/board/cards'));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { columns: Array<{ status: string; html: string; count: number }> };
    expect(Array.isArray(data.columns)).toBe(true);
    expect(data.columns).toHaveLength(7);
  });

  it('filters cards by tag when tags query param is provided', async () => {
    const services = buildServices();
    const task = services.ts.createTask({ title: 'Tagged Task', status: 'backlog' });
    const tag = services.tags.createTag({ name: 'important' });
    services.tts.addTagToTask({ task_id: task.id, tag_id: tag.id });
    services.ts.createTask({ title: 'Untagged Task', status: 'backlog' });
    const app = buildApp(services);
    const res = await app.fetch(new Request(`http://localhost/api/board/cards?tags=${tag.id}`));
    const data = (await res.json()) as { columns: Array<{ status: string; count: number }> };
    const backlogCol = data.columns.find((c) => c.status === 'backlog')!;
    expect(backlogCol.count).toBe(1);
  });

  it('filters cards by priority', async () => {
    const services = buildServices();
    services.ts.createTask({ title: 'High Prio', status: 'backlog', priority: 'high' });
    services.ts.createTask({ title: 'Low Prio', status: 'backlog', priority: 'low' });
    const app = buildApp(services);
    const res = await app.fetch(new Request('http://localhost/api/board/cards?priority=high'));
    const data = (await res.json()) as { columns: Array<{ status: string; count: number }> };
    const backlogCol = data.columns.find((c) => c.status === 'backlog')!;
    expect(backlogCol.count).toBe(1);
  });

  it('filters cards by search text matching title', async () => {
    const services = buildServices();
    services.ts.createTask({ title: 'Fix login bug', status: 'backlog' });
    services.ts.createTask({ title: 'Add signup page', status: 'backlog' });
    const app = buildApp(services);
    const res = await app.fetch(new Request('http://localhost/api/board/cards?search=login'));
    const data = (await res.json()) as { columns: Array<{ status: string; count: number }> };
    const backlogCol = data.columns.find((c) => c.status === 'backlog')!;
    expect(backlogCol.count).toBe(1);
  });

  it('filters cards by search text matching body', async () => {
    const services = buildServices();
    services.ts.createTask({ title: 'Task A', body: 'Fix the authentication flow', status: 'backlog' });
    services.ts.createTask({ title: 'Task B', body: 'Improve performance', status: 'backlog' });
    const app = buildApp(services);
    const res = await app.fetch(new Request('http://localhost/api/board/cards?search=authentication'));
    const data = (await res.json()) as { columns: Array<{ status: string; count: number }> };
    const backlogCol = data.columns.find((c) => c.status === 'backlog')!;
    expect(backlogCol.count).toBe(1);
  });

  it('search is case-insensitive', async () => {
    const services = buildServices();
    services.ts.createTask({ title: 'Fix Login Bug', status: 'backlog' });
    const app = buildApp(services);
    const res = await app.fetch(new Request('http://localhost/api/board/cards?search=login'));
    const data = (await res.json()) as { columns: Array<{ status: string; count: number }> };
    const backlogCol = data.columns.find((c) => c.status === 'backlog')!;
    expect(backlogCol.count).toBe(1);
  });

  it('returns all cards when search is empty', async () => {
    const services = buildServices();
    services.ts.createTask({ title: 'Task A', status: 'backlog' });
    services.ts.createTask({ title: 'Task B', status: 'backlog' });
    const app = buildApp(services);
    const res = await app.fetch(new Request('http://localhost/api/board/cards?search='));
    const data = (await res.json()) as { columns: Array<{ status: string; count: number }> };
    const backlogCol = data.columns.find((c) => c.status === 'backlog')!;
    expect(backlogCol.count).toBe(2);
  });
});

describe('GET /', () => {
  it('returns HTML board page', async () => {
    const app = buildApp(buildServices());
    const res = await app.fetch(new Request('http://localhost/'));
    expect(res.status).toBe(200);
    const contentType = res.headers.get('content-type');
    expect(contentType).toContain('text/html');
  });

  it('renders all status columns in HTML', async () => {
    const app = buildApp(buildServices());
    const res = await app.fetch(new Request('http://localhost/'));
    const html = await res.text();
    expect(html).toContain('data-status="backlog"');
    expect(html).toContain('data-status="done"');
  });

  it('includes board title when boardTitle is set', async () => {
    const services = buildServices();
    services.boardTitle = 'My Project Board';
    const app = buildApp(services);
    const res = await app.fetch(new Request('http://localhost/'));
    const html = await res.text();
    expect(html).toContain('My Project Board');
  });
});
