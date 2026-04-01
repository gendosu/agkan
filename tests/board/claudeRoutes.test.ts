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
    getRunLogs: vi.fn().mockReturnValue([]),
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
// POST /api/claude/tasks/:taskId/run — status auto-update on done
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/claude/tasks/:taskId/run - status auto-update', () => {
  it('updates status to done when run command completes with exitCode 0', async () => {
    let capturedCallback: SubscribeCallback | null = null;
    const mock = buildMockClaudeProcessService();
    (mock.subscribeOutput as ReturnType<typeof vi.fn>).mockImplementation((_taskId: number, cb: SubscribeCallback) => {
      capturedCallback = cb;
      return () => {};
    });

    const services = buildServices(mock);
    const task = services.ts.createTask({ title: 'Test Task', status: 'in_progress' });
    const app = buildApp(services);

    await app.fetch(
      new Request(`http://localhost/api/claude/tasks/${task.id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'run' }),
      })
    );

    expect(capturedCallback).not.toBeNull();
    capturedCallback!({ kind: 'done', exitCode: 0 });

    const updated = services.ts.getTask(task.id);
    expect(updated?.status).toBe('done');
  });

  it('updates status to review when pr command completes with exitCode 0', async () => {
    let capturedCallback: SubscribeCallback | null = null;
    const mock = buildMockClaudeProcessService();
    (mock.subscribeOutput as ReturnType<typeof vi.fn>).mockImplementation((_taskId: number, cb: SubscribeCallback) => {
      capturedCallback = cb;
      return () => {};
    });

    const services = buildServices(mock);
    const task = services.ts.createTask({ title: 'PR Task', status: 'in_progress' });
    const app = buildApp(services);

    await app.fetch(
      new Request(`http://localhost/api/claude/tasks/${task.id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'pr' }),
      })
    );

    expect(capturedCallback).not.toBeNull();
    capturedCallback!({ kind: 'done', exitCode: 0 });

    const updated = services.ts.getTask(task.id);
    expect(updated?.status).toBe('review');
  });

  it('does not update status when exitCode is non-zero', async () => {
    let capturedCallback: SubscribeCallback | null = null;
    const mock = buildMockClaudeProcessService();
    (mock.subscribeOutput as ReturnType<typeof vi.fn>).mockImplementation((_taskId: number, cb: SubscribeCallback) => {
      capturedCallback = cb;
      return () => {};
    });

    const services = buildServices(mock);
    const task = services.ts.createTask({ title: 'Failing Task', status: 'in_progress' });
    const app = buildApp(services);

    await app.fetch(
      new Request(`http://localhost/api/claude/tasks/${task.id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'run' }),
      })
    );

    expect(capturedCallback).not.toBeNull();
    capturedCallback!({ kind: 'done', exitCode: 1 });

    const updated = services.ts.getTask(task.id);
    expect(updated?.status).toBe('in_progress');
  });

  it('does not update status for planning command', async () => {
    const mock = buildMockClaudeProcessService();
    const services = buildServices(mock);
    const task = services.ts.createTask({ title: 'Planning Task', status: 'ready' });
    const app = buildApp(services);

    await app.fetch(
      new Request(`http://localhost/api/claude/tasks/${task.id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'planning' }),
      })
    );

    // subscribeOutput should not be called for planning
    expect(mock.subscribeOutput).not.toHaveBeenCalled();

    const updated = services.ts.getTask(task.id);
    expect(updated?.status).toBe('ready');
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
    const data = (await res.json()) as { taskIds: number[] };
    expect(data.taskIds).toEqual([]);
  });

  it('returns list of running task IDs', async () => {
    const mock = buildMockClaudeProcessService();
    (mock.listRunningTasks as ReturnType<typeof vi.fn>).mockReturnValue([1, 2, 3]);
    const app = buildApp(buildServices(mock));

    const res = await app.fetch(new Request('http://localhost/api/claude/running-tasks'));

    expect(res.status).toBe(200);
    const data = (await res.json()) as { taskIds: number[] };
    expect(data.taskIds).toEqual([1, 2, 3]);
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
    const cb = capturedCallback as SubscribeCallback | null;
    if (cb && res.body) {
      cb({ kind: 'text', text: 'hello' });

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

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/claude/tasks/:taskId/run-logs
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/claude/tasks/:taskId/run-logs', () => {
  it('returns 200 with empty logs when no runs exist', async () => {
    const mock = buildMockClaudeProcessService();
    const services = buildServices(mock);
    const task = services.ts.createTask({ title: 'Test Task', status: 'done' });
    const app = buildApp(services);

    const res = await app.fetch(new Request(`http://localhost/api/claude/tasks/${task.id}/run-logs`));

    expect(res.status).toBe(200);
    const data = (await res.json()) as { logs: unknown[] };
    expect(data.logs).toEqual([]);
    expect(mock.getRunLogs).toHaveBeenCalledWith(task.id);
  });

  it('returns 200 with logs from getRunLogs', async () => {
    const mock = buildMockClaudeProcessService();
    const fakeLogs = [
      {
        id: 1,
        task_id: 1,
        started_at: '2026-03-27T10:00:00.000Z',
        finished_at: '2026-03-27T10:01:00.000Z',
        exit_code: 0,
        events: [{ kind: 'text', text: 'hello' }],
      },
    ];
    (mock.getRunLogs as ReturnType<typeof vi.fn>).mockReturnValue(fakeLogs);

    const services = buildServices(mock);
    const task = services.ts.createTask({ title: 'Logged Task', status: 'done' });
    const app = buildApp(services);

    const res = await app.fetch(new Request(`http://localhost/api/claude/tasks/${task.id}/run-logs`));

    expect(res.status).toBe(200);
    const data = (await res.json()) as { logs: typeof fakeLogs };
    expect(data.logs).toHaveLength(1);
    expect(data.logs[0].exit_code).toBe(0);
    expect(data.logs[0].events[0]).toEqual({ kind: 'text', text: 'hello' });
  });

  it('returns 400 for invalid taskId', async () => {
    const mock = buildMockClaudeProcessService();
    const app = buildApp(buildServices(mock));

    const res = await app.fetch(new Request('http://localhost/api/claude/tasks/abc/run-logs'));

    expect(res.status).toBe(400);
  });

  it('returns 404 when task does not exist', async () => {
    const mock = buildMockClaudeProcessService();
    const app = buildApp(buildServices(mock));

    const res = await app.fetch(new Request('http://localhost/api/claude/tasks/9999/run-logs'));

    expect(res.status).toBe(404);
  });

  it('returns 404 when claudeProcessService is not configured', async () => {
    const services = buildServices(undefined);
    const task = services.ts.createTask({ title: 'Task', status: 'done' });
    const app = buildApp(services);

    const res = await app.fetch(new Request(`http://localhost/api/claude/tasks/${task.id}/run-logs`));

    expect(res.status).toBe(404);
  });
});
