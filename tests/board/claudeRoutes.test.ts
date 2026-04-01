/**
 * Tests for Claude process management API routes
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
import { ClaudeProcessService, SubscribeCallback } from '../../src/services/ClaudeProcessService';
import { getStorageBackend } from '../../src/db/connection';
import { registerBoardRoutes, BoardServices } from '../../src/board/boardRoutes';

const TEST_CONFIG_DIR = path.join(process.cwd(), '.agkan-test-claude-routes-' + process.pid);

function buildMockClaudeProcessService(): ClaudeProcessService {
  const mock = {
    startProcess: vi.fn(),
    stopProcess: vi.fn().mockReturnValue(true),
    listRunningTasks: vi.fn().mockReturnValue([]),
    subscribeOutput: vi.fn().mockReturnValue(() => {}),
    getOutputBuffer: vi.fn().mockReturnValue([]),
  } as unknown as ClaudeProcessService;
  return mock;
}

function buildServices(claudeProcessService?: ClaudeProcessService): BoardServices {
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
    claudeProcessService,
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
// POST /api/claude/tasks/:taskId/run
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/claude/tasks/:taskId/run', () => {
  it('returns 201 and starts a process for a valid task', async () => {
    const mock = buildMockClaudeProcessService();
    const services = buildServices(mock);
    const task = services.ts.createTask({ title: 'Test Task', status: 'backlog' });
    const app = buildApp(services);

    const res = await app.fetch(
      new Request(`http://localhost/api/claude/tasks/${task.id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'run' }),
      })
    );

    expect(res.status).toBe(201);
    const data = (await res.json()) as { taskId: number; started: boolean };
    expect(data.taskId).toBe(task.id);
    expect(data.started).toBe(true);
    expect(mock.startProcess).toHaveBeenCalledWith(task.id, `Task ID: ${task.id}\n/agkan-subtask-direct`);
  });

  it('uses planning prompt when command is planning', async () => {
    const mock = buildMockClaudeProcessService();
    const services = buildServices(mock);
    const task = services.ts.createTask({ title: 'Planning Task', status: 'backlog' });
    const app = buildApp(services);

    const res = await app.fetch(
      new Request(`http://localhost/api/claude/tasks/${task.id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'planning' }),
      })
    );

    expect(res.status).toBe(201);
    expect(mock.startProcess).toHaveBeenCalledWith(task.id, `Task ID: ${task.id}\n/agkan-planning-subtask`);
  });

  it('defaults to run command when no command specified', async () => {
    const mock = buildMockClaudeProcessService();
    const services = buildServices(mock);
    const task = services.ts.createTask({ title: 'Default Task', status: 'backlog' });
    const app = buildApp(services);

    const res = await app.fetch(
      new Request(`http://localhost/api/claude/tasks/${task.id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
    );

    expect(res.status).toBe(201);
    expect(mock.startProcess).toHaveBeenCalledWith(task.id, `Task ID: ${task.id}\n/agkan-subtask-direct`);
  });

  it('returns 400 for invalid taskId', async () => {
    const mock = buildMockClaudeProcessService();
    const app = buildApp(buildServices(mock));

    const res = await app.fetch(
      new Request('http://localhost/api/claude/tasks/abc/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
    );

    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBeTruthy();
  });

  it('returns 404 when task does not exist', async () => {
    const mock = buildMockClaudeProcessService();
    const app = buildApp(buildServices(mock));

    const res = await app.fetch(
      new Request('http://localhost/api/claude/tasks/9999/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
    );

    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBeTruthy();
  });

  it('returns 409 when process is already running', async () => {
    const mock = buildMockClaudeProcessService();
    (mock.startProcess as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('Process for taskId 1 is already running');
    });
    const services = buildServices(mock);
    const task = services.ts.createTask({ title: 'Running Task', status: 'backlog' });
    const app = buildApp(services);

    const res = await app.fetch(
      new Request(`http://localhost/api/claude/tasks/${task.id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
    );

    expect(res.status).toBe(409);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBeTruthy();
  });

  it('returns 404 when claudeProcessService is not configured', async () => {
    const services = buildServices(undefined);
    const task = services.ts.createTask({ title: 'Task', status: 'backlog' });
    const app = buildApp(services);

    const res = await app.fetch(
      new Request(`http://localhost/api/claude/tasks/${task.id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
    );

    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/claude/tasks/:taskId/run
// ─────────────────────────────────────────────────────────────────────────────
describe('DELETE /api/claude/tasks/:taskId/run', () => {
  it('returns 200 and stops the process', async () => {
    const mock = buildMockClaudeProcessService();
    (mock.stopProcess as ReturnType<typeof vi.fn>).mockReturnValue(true);
    const app = buildApp(buildServices(mock));

    const res = await app.fetch(
      new Request('http://localhost/api/claude/tasks/1/run', {
        method: 'DELETE',
      })
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as { success: boolean };
    expect(data.success).toBe(true);
    expect(mock.stopProcess).toHaveBeenCalledWith(1);
  });

  it('returns 400 for invalid taskId', async () => {
    const mock = buildMockClaudeProcessService();
    const app = buildApp(buildServices(mock));

    const res = await app.fetch(
      new Request('http://localhost/api/claude/tasks/abc/run', {
        method: 'DELETE',
      })
    );

    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBeTruthy();
  });

  it('returns 404 when process does not exist', async () => {
    const mock = buildMockClaudeProcessService();
    (mock.stopProcess as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const app = buildApp(buildServices(mock));

    const res = await app.fetch(
      new Request('http://localhost/api/claude/tasks/999/run', {
        method: 'DELETE',
      })
    );

    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBeTruthy();
  });

  it('returns 404 when claudeProcessService is not configured', async () => {
    const app = buildApp(buildServices(undefined));

    const res = await app.fetch(
      new Request('http://localhost/api/claude/tasks/1/run', {
        method: 'DELETE',
      })
    );

    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/claude/running-tasks
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/claude/running-tasks', () => {
  it('returns 200 with empty tasks array when nothing is running', async () => {
    const mock = buildMockClaudeProcessService();
    (mock.listRunningTasks as ReturnType<typeof vi.fn>).mockReturnValue([]);
    const app = buildApp(buildServices(mock));

    const res = await app.fetch(new Request('http://localhost/api/claude/running-tasks'));

    expect(res.status).toBe(200);
    const data = (await res.json()) as { tasks: number[] };
    expect(data.tasks).toEqual([]);
  });

  it('returns list of running task IDs', async () => {
    const mock = buildMockClaudeProcessService();
    (mock.listRunningTasks as ReturnType<typeof vi.fn>).mockReturnValue([1, 2, 3]);
    const app = buildApp(buildServices(mock));

    const res = await app.fetch(new Request('http://localhost/api/claude/running-tasks'));

    expect(res.status).toBe(200);
    const data = (await res.json()) as { tasks: number[] };
    expect(data.tasks).toEqual([1, 2, 3]);
  });

  it('returns 404 when claudeProcessService is not configured', async () => {
    const app = buildApp(buildServices(undefined));

    const res = await app.fetch(new Request('http://localhost/api/claude/running-tasks'));

    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/claude/tasks/:taskId/stream (SSE)
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/claude/tasks/:taskId/stream', () => {
  it('returns SSE response with correct headers', async () => {
    const mock = buildMockClaudeProcessService();
    const app = buildApp(buildServices(mock));

    const res = await app.fetch(new Request('http://localhost/api/claude/tasks/1/stream'));

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    expect(res.headers.get('Cache-Control')).toBe('no-cache');
    expect(res.headers.get('Connection')).toBe('keep-alive');
  });

  it('returns 400 for invalid taskId', async () => {
    const mock = buildMockClaudeProcessService();
    const app = buildApp(buildServices(mock));

    const res = await app.fetch(new Request('http://localhost/api/claude/tasks/abc/stream'));

    expect(res.status).toBe(400);
  });

  it('sends SSE events from subscribeOutput callback', async () => {
    let capturedCallback: SubscribeCallback | null = null;
    const mock = buildMockClaudeProcessService();
    (mock.subscribeOutput as ReturnType<typeof vi.fn>).mockImplementation((_taskId: number, cb: SubscribeCallback) => {
      capturedCallback = cb;
      return () => {};
    });

    const app = buildApp(buildServices(mock));
    const res = await app.fetch(new Request('http://localhost/api/claude/tasks/1/stream'));

    expect(res.status).toBe(200);
    expect(mock.subscribeOutput).toHaveBeenCalledWith(1, expect.any(Function));

    // Emit a text event and read it
    if (capturedCallback && res.body) {
      capturedCallback({ kind: 'text', text: 'hello' });

      const reader = res.body.getReader();
      const { value } = await reader.read();
      const text = new TextDecoder().decode(value);
      expect(text).toContain('event: text');
      expect(text).toContain('"hello"');
    }
  });

  it('returns 404 when claudeProcessService is not configured', async () => {
    const app = buildApp(buildServices(undefined));

    const res = await app.fetch(new Request('http://localhost/api/claude/tasks/1/stream'));

    expect(res.status).toBe(404);
  });
});
