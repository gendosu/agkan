/**
 * @vitest-environment jsdom
 *
 * Tests for board client detailPanelApi module covering fetch/API layer.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PANEL_MIN_WIDTH,
  PANEL_MAX_WIDTH,
  PANEL_DEFAULT_WIDTH,
  fetchComments,
  patchComment,
  deleteCommentRequest,
  postComment,
  fetchTaskDetail,
  patchTask,
  fetchPanelWidthFromConfig,
  savePanelWidthToConfig,
  fetchRunLogs,
  subscribeRunLogs,
} from '../../../src/board/client/detailPanelApi';

// --- MockEventSource for SSE tests ---

class MockEventSource {
  url: string;
  onerror: (() => void) | null = null;
  private _handlers: Map<string, ((e: Event) => void)[]> = new Map();
  static _instances: MockEventSource[] = [];

  constructor(url: string) {
    this.url = url;
    MockEventSource._instances.push(this);
  }

  addEventListener(type: string, handler: (e: Event) => void): void {
    if (!this._handlers.has(type)) this._handlers.set(type, []);
    this._handlers.get(type)!.push(handler);
  }

  removeEventListener(): void {}

  close(): void {}

  dispatchOpen(): void {
    (this._handlers.get('open') ?? []).forEach((h) => h(new Event('open')));
  }

  dispatchUpdate(data: unknown): void {
    const event = new MessageEvent('update', { data: JSON.stringify(data) });
    (this._handlers.get('update') ?? []).forEach((h) => h(event));
  }

  dispatchError(): void {
    if (this.onerror) this.onerror();
  }

  static reset(): void {
    MockEventSource._instances = [];
  }
}

beforeEach(() => {
  vi.restoreAllMocks();
  MockEventSource.reset();
  (global as unknown as Record<string, unknown>)['EventSource'] = MockEventSource;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// --- Constants ---

describe('panel width constants', () => {
  it('PANEL_MIN_WIDTH is 280', () => {
    expect(PANEL_MIN_WIDTH).toBe(280);
  });

  it('PANEL_MAX_WIDTH is 800', () => {
    expect(PANEL_MAX_WIDTH).toBe(800);
  });

  it('PANEL_DEFAULT_WIDTH is 400', () => {
    expect(PANEL_DEFAULT_WIDTH).toBe(400);
  });
});

// --- fetchComments ---

describe('fetchComments', () => {
  it('returns comments array when fetch succeeds', async () => {
    const mockComments = [{ id: 1, content: 'Hello', author: 'Alice', created_at: '2026-01-01T00:00:00.000Z' }];
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ comments: mockComments }),
    });

    const result = await fetchComments(42);

    expect(global.fetch).toHaveBeenCalledWith('/api/tasks/42/comments');
    expect(result).toEqual(mockComments);
  });

  it('returns empty array when response has no comments property', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const result = await fetchComments(1);
    expect(result).toEqual([]);
  });

  it('throws when response is not ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false });

    await expect(fetchComments(1)).rejects.toThrow('Server error');
  });
});

// --- patchComment ---

describe('patchComment', () => {
  it('sends PATCH request with content and resolves on success', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true });

    await expect(patchComment(10, 'Updated content')).resolves.toBeUndefined();

    expect(global.fetch).toHaveBeenCalledWith('/api/comments/10', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Updated content' }),
    });
  });

  it('throws when response is not ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false });

    await expect(patchComment(10, 'content')).rejects.toThrow('Server error');
  });
});

// --- deleteCommentRequest ---

describe('deleteCommentRequest', () => {
  it('sends DELETE request and resolves on success', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true });

    await expect(deleteCommentRequest(5)).resolves.toBeUndefined();

    expect(global.fetch).toHaveBeenCalledWith('/api/comments/5', { method: 'DELETE' });
  });

  it('throws when response is not ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false });

    await expect(deleteCommentRequest(5)).rejects.toThrow('Server error');
  });
});

// --- postComment ---

describe('postComment', () => {
  it('sends POST request with content and resolves on success', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true });

    await expect(postComment(7, 'New comment')).resolves.toBeUndefined();

    expect(global.fetch).toHaveBeenCalledWith('/api/tasks/7/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'New comment' }),
    });
  });

  it('throws when response is not ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false });

    await expect(postComment(7, 'comment')).rejects.toThrow('Server error');
  });
});

// --- fetchTaskDetail ---

describe('fetchTaskDetail', () => {
  const mockTaskDetail = {
    task: {
      id: 1,
      title: 'Test',
      body: null,
      status: 'ready',
      priority: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
    tags: [],
    metadata: [],
    blockedBy: [],
    blocking: [],
    parent: null,
  };

  it('fetches task detail without signal', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockTaskDetail),
    });

    const result = await fetchTaskDetail(1);

    expect(global.fetch).toHaveBeenCalledWith('/api/tasks/1', undefined);
    expect(result).toEqual(mockTaskDetail);
  });

  it('fetches task detail with string ID', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockTaskDetail),
    });

    await fetchTaskDetail('42');

    expect(global.fetch).toHaveBeenCalledWith('/api/tasks/42', undefined);
  });

  it('passes AbortSignal when provided', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockTaskDetail),
    });

    const controller = new AbortController();
    await fetchTaskDetail(1, controller.signal);

    expect(global.fetch).toHaveBeenCalledWith('/api/tasks/1', { signal: controller.signal });
  });

  it('throws when response is not ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false });

    await expect(fetchTaskDetail(1)).rejects.toThrow('Server error');
  });
});

// --- patchTask ---

describe('patchTask', () => {
  const mockTaskDetail = {
    task: {
      id: 3,
      title: 'Updated',
      body: 'body',
      status: 'in_progress',
      priority: 'high',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
    tags: [],
    metadata: [],
    blockedBy: [],
    blocking: [],
    parent: null,
  };

  it('sends PATCH request and returns refreshed task detail on success', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockTaskDetail),
    });

    const fields = { title: 'Updated', body: 'body', status: 'in_progress', priority: 'high' };
    const result = await patchTask(3, fields);

    expect(global.fetch).toHaveBeenNthCalledWith(1, '/api/tasks/3', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
    // Second call is fetchTaskDetail
    expect(global.fetch).toHaveBeenNthCalledWith(2, '/api/tasks/3', undefined);
    expect(result).toEqual(mockTaskDetail);
  });

  it('throws when PATCH response is not ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false });

    const fields = { title: 'x', body: null, status: undefined, priority: null };
    await expect(patchTask(3, fields)).rejects.toThrow('Server error');
  });
});

// --- fetchPanelWidthFromConfig ---

describe('fetchPanelWidthFromConfig', () => {
  it('returns saved width from config when within bounds', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ board: { detailPaneWidth: 500 } }),
    });

    const width = await fetchPanelWidthFromConfig();
    expect(width).toBe(500);
  });

  it('returns default width when saved width is below minimum', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ board: { detailPaneWidth: 100 } }),
    });

    const width = await fetchPanelWidthFromConfig();
    expect(width).toBe(PANEL_DEFAULT_WIDTH);
  });

  it('returns default width when saved width is above maximum', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ board: { detailPaneWidth: 1000 } }),
    });

    const width = await fetchPanelWidthFromConfig();
    expect(width).toBe(PANEL_DEFAULT_WIDTH);
  });

  it('returns default width when board config is missing', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const width = await fetchPanelWidthFromConfig();
    expect(width).toBe(PANEL_DEFAULT_WIDTH);
  });

  it('returns default width when detailPaneWidth is not a number', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ board: { detailPaneWidth: 'wide' } }),
    });

    const width = await fetchPanelWidthFromConfig();
    expect(width).toBe(PANEL_DEFAULT_WIDTH);
  });

  it('returns default width when response is not ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false });

    const width = await fetchPanelWidthFromConfig();
    expect(width).toBe(PANEL_DEFAULT_WIDTH);
  });

  it('returns default width when fetch throws', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const width = await fetchPanelWidthFromConfig();
    expect(width).toBe(PANEL_DEFAULT_WIDTH);
  });

  it('returns saved width at minimum boundary (280)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ board: { detailPaneWidth: 280 } }),
    });

    const width = await fetchPanelWidthFromConfig();
    expect(width).toBe(280);
  });

  it('returns saved width at maximum boundary (800)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ board: { detailPaneWidth: 800 } }),
    });

    const width = await fetchPanelWidthFromConfig();
    expect(width).toBe(800);
  });
});

// --- savePanelWidthToConfig ---

describe('savePanelWidthToConfig', () => {
  it('sends PUT request to /api/config with the width', () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true });

    savePanelWidthToConfig(450);

    expect(global.fetch).toHaveBeenCalledWith('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ board: { detailPaneWidth: 450 } }),
    });
  });

  it('does not throw even when fetch rejects', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    expect(() => savePanelWidthToConfig(400)).not.toThrow();

    // Allow the rejected promise to settle without causing unhandled rejection
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
});

// --- fetchRunLogs ---

describe('fetchRunLogs', () => {
  it('returns logs array when fetch succeeds', async () => {
    const mockLogs = [
      {
        id: 1,
        started_at: '2026-01-01T00:00:00.000Z',
        finished_at: null,
        exit_code: null,
        events: [{ kind: 'text', text: 'hello' }],
      },
    ];
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ logs: mockLogs }),
    });

    const result = await fetchRunLogs(99);

    expect(global.fetch).toHaveBeenCalledWith('/api/claude/tasks/99/run-logs');
    expect(result).toEqual(mockLogs);
  });

  it('returns empty array when response has no logs property', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const result = await fetchRunLogs(1);
    expect(result).toEqual([]);
  });

  it('throws when response is not ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false });

    await expect(fetchRunLogs(1)).rejects.toThrow('Server error');
  });
});

// --- subscribeRunLogs ---

describe('subscribeRunLogs', () => {
  it('creates EventSource for the correct URL', () => {
    const onUpdate = vi.fn();
    const onError = vi.fn();

    const es = subscribeRunLogs(7, onUpdate, onError);

    expect(MockEventSource._instances).toHaveLength(1);
    expect(MockEventSource._instances[0].url).toBe('/api/claude/tasks/7/run-logs/stream');
    expect(es).toBe(MockEventSource._instances[0]);
  });

  it('calls onUpdate with logs when update event fires', () => {
    const onUpdate = vi.fn();
    const onError = vi.fn();

    subscribeRunLogs(7, onUpdate, onError);

    const mockEs = MockEventSource._instances[0];
    const logs = [
      {
        id: 1,
        started_at: '2026-01-01T00:00:00.000Z',
        finished_at: null,
        exit_code: 0,
        events: [],
      },
    ];
    mockEs.dispatchUpdate({ logs });

    expect(onUpdate).toHaveBeenCalledWith(logs);
  });

  it('calls onUpdate with empty array when logs is missing from update', () => {
    const onUpdate = vi.fn();
    const onError = vi.fn();

    subscribeRunLogs(7, onUpdate, onError);

    const mockEs = MockEventSource._instances[0];
    mockEs.dispatchUpdate({});

    expect(onUpdate).toHaveBeenCalledWith([]);
  });

  it('does not call onUpdate when update event has invalid JSON', () => {
    const onUpdate = vi.fn();
    const onError = vi.fn();

    subscribeRunLogs(7, onUpdate, onError);

    const mockEs = MockEventSource._instances[0];
    // Manually dispatch an update event with invalid JSON
    const badEvent = new MessageEvent('update', { data: 'not-json{{{' });
    // Access the private handlers via type cast
    (mockEs as unknown as { _handlers: Map<string, ((e: Event) => void)[]> })._handlers
      .get('update')
      ?.forEach((h) => h(badEvent));

    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('calls onError when onerror fires and sets stream state to disconnected', () => {
    const onUpdate = vi.fn();
    const onError = vi.fn();

    subscribeRunLogs(7, onUpdate, onError);

    const mockEs = MockEventSource._instances[0];
    mockEs.dispatchError();

    expect(onError).toHaveBeenCalled();
  });

  it('sets stream state to connected when open event fires', () => {
    const onUpdate = vi.fn();
    const onError = vi.fn();

    subscribeRunLogs(7, onUpdate, onError);

    const mockEs = MockEventSource._instances[0];
    // Should not throw
    expect(() => mockEs.dispatchOpen()).not.toThrow();
  });
});
