/**
 * Tests for export/import board API routes
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
import { getStorageBackend } from '../../src/db/connection';
import { registerBoardRoutes, BoardServices } from '../../src/board/boardRoutes';
import { ExportData } from '../../src/services/ExportImportService';

const TEST_CONFIG_DIR = path.join(process.cwd(), '.agkan-test-export-import-' + process.pid);

function buildServices(): BoardServices {
  const database = getStorageBackend();
  return {
    ts: new TaskService(database),
    tts: new TaskTagService(database),
    tags: new TagService(database),
    ms: new MetadataService(database),
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
// GET /api/export
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/export', () => {
  it('returns 200 with valid export JSON structure', async () => {
    const services = buildServices();
    services.ts.createTask({ title: 'Task A', status: 'ready' });
    const app = buildApp(services);

    const res = await app.fetch(new Request('http://localhost/api/export'));
    expect(res.status).toBe(200);

    const data = (await res.json()) as ExportData;
    expect(data).toHaveProperty('version');
    expect(data).toHaveProperty('exported_at');
    expect(data).toHaveProperty('tasks');
    expect(Array.isArray(data.tasks)).toBe(true);
    expect(data.tasks).toHaveLength(1);
    expect(data.tasks[0].title).toBe('Task A');
  });

  it('returns Content-Disposition header for file download', async () => {
    const app = buildApp(buildServices());
    const res = await app.fetch(new Request('http://localhost/api/export'));

    const disposition = res.headers.get('Content-Disposition');
    expect(disposition).toBeTruthy();
    expect(disposition).toContain('attachment');
    expect(disposition).toContain('.json');
  });

  it('returns empty tasks array when no tasks exist', async () => {
    const app = buildApp(buildServices());
    const res = await app.fetch(new Request('http://localhost/api/export'));

    const data = (await res.json()) as ExportData;
    expect(data.tasks).toHaveLength(0);
  });

  it('exports tasks with tags, metadata, and comments', async () => {
    const services = buildServices();
    const task = services.ts.createTask({ title: 'Rich Task' });
    const tag = services.tags.createTag({ name: 'test-tag' });
    services.tts.addTagToTask({ task_id: task.id, tag_id: tag.id });
    services.ms.setMetadata({ task_id: task.id, key: 'key1', value: 'val1' });
    services.cs.addComment({ task_id: task.id, content: 'A comment' });
    const app = buildApp(services);

    const res = await app.fetch(new Request('http://localhost/api/export'));
    const data = (await res.json()) as ExportData;

    expect(data.tasks[0].tags).toContain('test-tag');
    expect(data.tasks[0].metadata).toEqual({ key1: 'val1' });
    expect(data.tasks[0].comments).toHaveLength(1);
    expect(data.tasks[0].comments[0].content).toBe('A comment');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/import
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/import', () => {
  it('returns 200 and imports tasks successfully', async () => {
    const services = buildServices();
    const app = buildApp(services);

    const importData: ExportData = {
      version: '1.0.0',
      exported_at: '2026-01-01T00:00:00.000Z',
      tasks: [
        {
          id: 1,
          title: 'Imported Task',
          body: null,
          author: null,
          assignees: null,
          status: 'backlog',
          parent_id: null,
          created_at: '2026-01-01T10:00:00.000Z',
          updated_at: '2026-01-01T10:00:00.000Z',
          tags: [],
          metadata: {},
          comments: [],
          blocked_by: [],
        },
      ],
    };

    const res = await app.fetch(
      new Request('http://localhost/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(importData),
      })
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as { success: boolean; importedCount: number };
    expect(data.success).toBe(true);
    expect(data.importedCount).toBe(1);

    const tasks = services.ts.listTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('Imported Task');
  });

  it('returns 400 when tasks array is missing', async () => {
    const app = buildApp(buildServices());

    const res = await app.fetch(
      new Request('http://localhost/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: '1.0.0', exported_at: '2026-01-01T00:00:00.000Z' }),
      })
    );

    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain('missing tasks array');
  });

  it('returns 200 and imports multiple tasks', async () => {
    const services = buildServices();
    const app = buildApp(services);

    const importData: ExportData = {
      version: '1.0.0',
      exported_at: '2026-01-01T00:00:00.000Z',
      tasks: [
        {
          id: 1,
          title: 'Task One',
          body: null,
          author: null,
          assignees: null,
          status: 'backlog',
          parent_id: null,
          created_at: '2026-01-01T10:00:00.000Z',
          updated_at: '2026-01-01T10:00:00.000Z',
          tags: [],
          metadata: {},
          comments: [],
          blocked_by: [],
        },
        {
          id: 2,
          title: 'Task Two',
          body: null,
          author: null,
          assignees: null,
          status: 'ready',
          parent_id: null,
          created_at: '2026-01-01T11:00:00.000Z',
          updated_at: '2026-01-01T11:00:00.000Z',
          tags: [],
          metadata: {},
          comments: [],
          blocked_by: [],
        },
      ],
    };

    const res = await app.fetch(
      new Request('http://localhost/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(importData),
      })
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as { importedCount: number };
    expect(data.importedCount).toBe(2);

    const tasks = services.ts.listTasks();
    expect(tasks).toHaveLength(2);
  });

  it('imports tasks with tags, creating new ones if needed', async () => {
    const services = buildServices();
    const app = buildApp(services);

    const importData: ExportData = {
      version: '1.0.0',
      exported_at: '2026-01-01T00:00:00.000Z',
      tasks: [
        {
          id: 1,
          title: 'Tagged Task',
          body: null,
          author: null,
          assignees: null,
          status: 'backlog',
          parent_id: null,
          created_at: '2026-01-01T10:00:00.000Z',
          updated_at: '2026-01-01T10:00:00.000Z',
          tags: ['new-tag-from-import'],
          metadata: {},
          comments: [],
          blocked_by: [],
        },
      ],
    };

    const res = await app.fetch(
      new Request('http://localhost/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(importData),
      })
    );

    expect(res.status).toBe(200);

    const tasks = services.ts.listTasks();
    const importedTags = services.tts.getTagsForTask(tasks[0].id);
    expect(importedTags.map((t) => t.name)).toContain('new-tag-from-import');
  });
});
