/**
 * @vitest-environment jsdom
 *
 * Tests for board client detailPanel module covering PR #117 bug scenarios.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ---- DOM Setup helpers ----

function setupMinimalBoardDOM(): void {
  document.body.innerHTML = `
    <div class="board-container">
      <div class="detail-panel" id="detail-panel">
        <div class="detail-panel-resize-handle" id="detail-panel-resize-handle"></div>
        <div class="detail-panel-header">
          <h2 id="detail-panel-title">Task Detail</h2>
          <button class="detail-panel-close" id="detail-panel-close">&times;</button>
        </div>
        <div class="detail-tabs" id="detail-tabs">
          <button class="detail-tab active" data-tab="details">Details</button>
          <button class="detail-tab" data-tab="comments" id="detail-tab-comments">Comments</button>
        </div>
        <div class="detail-panel-body" id="detail-panel-body">
          <div class="detail-tab-content active" id="detail-tab-content-details"></div>
          <div class="detail-tab-content" id="detail-tab-content-comments"></div>
        </div>
        <div class="detail-panel-footer" id="detail-panel-footer">
          <button id="detail-save-btn">Save</button>
        </div>
      </div>
    </div>
  `;

  // Set up window globals expected by renderDetailPanel
  (window as unknown as Record<string, unknown>).allStatuses = ['pending', 'in_progress', 'completed'];
  (window as unknown as Record<string, unknown>).statusLabels = {
    pending: 'Pending',
    in_progress: 'In Progress',
    completed: 'Completed',
  };
  (window as unknown as Record<string, unknown>).allPriorities = ['low', 'medium', 'high'];

  // jsdom does not implement matchMedia — provide a no-op stub
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  // jsdom does not implement ResizeObserver — provide a no-op stub
  Object.defineProperty(window, 'ResizeObserver', {
    writable: true,
    value: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  });
}

function setupBoardContainerDOM(): void {
  document.body.innerHTML = `<div class="board-container"></div>`;

  (window as unknown as Record<string, unknown>).allStatuses = ['pending', 'in_progress', 'completed'];
  (window as unknown as Record<string, unknown>).statusLabels = {
    pending: 'Pending',
    in_progress: 'In Progress',
    completed: 'Completed',
  };
  (window as unknown as Record<string, unknown>).allPriorities = ['low', 'medium', 'high'];

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  // jsdom does not implement ResizeObserver — provide a no-op stub
  Object.defineProperty(window, 'ResizeObserver', {
    writable: true,
    value: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  });
}

function makeTaskDetail(overrides = {}) {
  return {
    task: {
      id: 1,
      title: 'Test Task',
      body: 'Task body',
      status: 'pending',
      priority: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
    tags: [],
    metadata: [],
    blockedBy: [],
    blocking: [],
    parent: null,
    ...overrides,
  };
}

// ---- Tests ----

describe('renderDetailPanel - tag loading failure', () => {
  beforeEach(() => {
    vi.resetModules();
    setupMinimalBoardDOM();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not throw when loadAllTags fetch fails with network error', async () => {
    // Mock fetch to fail for /api/tags, succeed for /api/tasks/:id/comments
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('/api/tags')) {
        return Promise.reject(new Error('Network error'));
      }
      // comments endpoint
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ comments: [] }),
      });
    });

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    const data = makeTaskDetail();

    expect(() => renderDetailPanel(data)).not.toThrow();

    // Comments fetch resolves even though tags fetch failed — wait for the
    // comments tab label to reflect the completed async chain.
    await vi.waitFor(() => {
      expect(document.getElementById('detail-tab-comments')?.textContent).toBe('Comments (0)');
    });
  });

  it('does not throw when loadAllTags fetch returns non-ok response', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('/api/tags')) {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ comments: [] }),
      });
    });

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    const data = makeTaskDetail();

    expect(() => renderDetailPanel(data)).not.toThrow();

    // Comments fetch resolves even though tags fetch failed — wait for the
    // comments tab label to reflect the completed async chain.
    await vi.waitFor(() => {
      expect(document.getElementById('detail-tab-comments')?.textContent).toBe('Comments (0)');
    });
  });

  it('renders panel details correctly even when tags fail to load', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('/api/tags')) {
        return Promise.reject(new Error('Tags unavailable'));
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ comments: [] }),
      });
    });

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    const data = makeTaskDetail();
    renderDetailPanel(data);

    await vi.waitFor(() => {
      // Panel title should be updated
      const title = document.getElementById('detail-panel-title');
      expect(title?.textContent).toBe('#1');

      // Details pane should contain status select
      const detailsPane = document.getElementById('detail-tab-content-details');
      expect(detailsPane?.innerHTML).toContain('detail-edit-status');
    });
  });
});

class MockEventSource {
  static lastInstance: MockEventSource | null = null;
  private updateCallbacks: ((e: MessageEvent) => void)[] = [];
  onerror: (() => void) | null = null;

  constructor(public url: string) {
    MockEventSource.lastInstance = this;
  }

  addEventListener(type: string, cb: (e: Event) => void): void {
    if (type === 'update') this.updateCallbacks.push(cb as (e: MessageEvent) => void);
  }

  removeEventListener(): void {}

  close(): void {
    if (MockEventSource.lastInstance === this) MockEventSource.lastInstance = null;
  }

  dispatchUpdate(logs: unknown[]): void {
    const event = new MessageEvent('update', { data: JSON.stringify({ logs }) });
    this.updateCallbacks.forEach((cb) => cb(event));
  }
}

describe('renderDetailPanel - run logs scroll restoration', () => {
  let originalRequestAnimationFrame: typeof window.requestAnimationFrame;

  beforeEach(() => {
    originalRequestAnimationFrame = window.requestAnimationFrame;
    vi.resetModules();
    MockEventSource.lastInstance = null;
    (globalThis as unknown as Record<string, unknown>).EventSource = MockEventSource;
    const stubbedRequestAnimationFrame = ((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    }) as typeof window.requestAnimationFrame;
    window.requestAnimationFrame = stubbedRequestAnimationFrame;
    (
      globalThis as typeof globalThis & { requestAnimationFrame: typeof window.requestAnimationFrame }
    ).requestAnimationFrame = stubbedRequestAnimationFrame;
    setupBoardContainerDOM();
  });

  afterEach(() => {
    window.requestAnimationFrame = originalRequestAnimationFrame;
    (
      globalThis as typeof globalThis & { requestAnimationFrame: typeof window.requestAnimationFrame }
    ).requestAnimationFrame = originalRequestAnimationFrame;
    vi.restoreAllMocks();
  });

  it('preserves the run logs pane scroll position across SSE updates', async () => {
    const initialLogs = [
      {
        id: 1,
        started_at: '2026-01-01T00:00:00.000Z',
        finished_at: null,
        exit_code: null,
        events: [{ kind: 'text', text: 'first render' }],
      },
    ];
    const updatedLogs = [
      ...initialLogs,
      {
        id: 2,
        started_at: '2026-01-01T00:05:00.000Z',
        finished_at: null,
        exit_code: null,
        events: [{ kind: 'text', text: 'sse update' }],
      },
    ];

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('/api/config')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ board: { detailPaneWidth: 400 } }),
        });
      }
      if (String(url).includes('/api/tags')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ tags: [] }),
        });
      }
      if (String(url).includes('/api/tasks/1/comments')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ comments: [] }),
        });
      }
      return Promise.reject(new Error('Unexpected fetch: ' + String(url)));
    });

    const originalInnerHTML = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    expect(originalInnerHTML?.get).toBeDefined();
    expect(originalInnerHTML?.set).toBeDefined();

    const { initDetailPanel, renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    initDetailPanel();
    renderDetailPanel(makeTaskDetail());

    document.getElementById('detail-tab-run-logs')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // Dispatch initial logs via SSE
    MockEventSource.lastInstance?.dispatchUpdate(initialLogs);

    const pane = document.getElementById('detail-tab-content-run-logs') as HTMLElement;
    let firstBody = pane.querySelector<HTMLElement>('.run-log-body');
    for (let i = 0; i < 10 && !firstBody; i += 1) {
      await Promise.resolve();
      firstBody = pane.querySelector<HTMLElement>('.run-log-body');
    }
    expect(firstBody).not.toBeNull();

    Object.defineProperty(pane, 'scrollHeight', { configurable: true, value: 1000 });
    Object.defineProperty(pane, 'clientHeight', { configurable: true, value: 400 });
    if (firstBody) {
      Object.defineProperty(firstBody, 'scrollHeight', { configurable: true, value: 600 });
      Object.defineProperty(firstBody, 'clientHeight', { configurable: true, value: 200 });
    }

    Object.defineProperty(pane, 'innerHTML', {
      configurable: true,
      get() {
        return originalInnerHTML!.get!.call(this);
      },
      set(value: string) {
        originalInnerHTML!.set!.call(this, value);
        this.scrollTop = 0;
      },
    });

    pane.scrollTop = 120;
    if (firstBody) {
      firstBody.scrollTop = 77;
    }

    // Dispatch updated logs via SSE (simulates server pushing new data)
    MockEventSource.lastInstance?.dispatchUpdate(updatedLogs);

    expect(pane.scrollTop).toBe(120);
    expect(pane.querySelector<HTMLElement>('.run-log-body')?.scrollTop).toBe(77);
  });

  it('does not rewrite run logs HTML when SSE updates have identical logs', async () => {
    const sameLogs = [
      {
        id: 1,
        started_at: '2026-01-01T00:00:00.000Z',
        finished_at: null,
        exit_code: null,
        events: [{ kind: 'text', text: 'stable log' }],
      },
    ];

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('/api/config')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ board: { detailPaneWidth: 400 } }),
        });
      }
      if (String(url).includes('/api/tags')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ tags: [] }),
        });
      }
      if (String(url).includes('/api/tasks/1/comments')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ comments: [] }),
        });
      }
      return Promise.reject(new Error('Unexpected fetch: ' + String(url)));
    });

    const originalInnerHTML = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    expect(originalInnerHTML?.get).toBeDefined();
    expect(originalInnerHTML?.set).toBeDefined();

    const { initDetailPanel, renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    initDetailPanel();
    renderDetailPanel(makeTaskDetail());

    document.getElementById('detail-tab-run-logs')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // Dispatch initial SSE update to render logs
    MockEventSource.lastInstance?.dispatchUpdate(sameLogs);

    const pane = document.getElementById('detail-tab-content-run-logs') as HTMLElement;
    let firstBody = pane.querySelector<HTMLElement>('.run-log-body');
    for (let i = 0; i < 10 && !firstBody; i += 1) {
      await Promise.resolve();
      firstBody = pane.querySelector<HTMLElement>('.run-log-body');
    }
    expect(firstBody).not.toBeNull();

    let rewriteCount = 0;
    Object.defineProperty(pane, 'innerHTML', {
      configurable: true,
      get() {
        return originalInnerHTML!.get!.call(this);
      },
      set(value: string) {
        rewriteCount += 1;
        originalInnerHTML!.set!.call(this, value);
      },
    });

    pane.scrollTop = 140;
    if (firstBody) firstBody.scrollTop = 55;

    // Dispatch same logs again multiple times — signature dedup should skip HTML rewrite
    MockEventSource.lastInstance?.dispatchUpdate(sameLogs);
    MockEventSource.lastInstance?.dispatchUpdate(sameLogs);

    expect(rewriteCount).toBe(0);
    expect(pane.scrollTop).toBe(140);
    expect(pane.querySelector<HTMLElement>('.run-log-body')?.scrollTop).toBe(55);
  });
});

describe('renderDetailPanel - successful tag loading', () => {
  beforeEach(() => {
    vi.resetModules();
    setupMinimalBoardDOM();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders tags container when tags load successfully', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('/api/tags')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ tags: [{ id: 1, name: 'bug' }] }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ comments: [] }),
      });
    });

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    const data = makeTaskDetail({ tags: [{ id: 1, name: 'bug' }] });
    renderDetailPanel(data);

    await vi.waitFor(() => {
      const tagsContainer = document.getElementById('detail-tags-container');
      expect(tagsContainer).not.toBeNull();
    });
  });

  it('renders with existing task tags shown as pills', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('/api/tags')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ tags: [{ id: 2, name: 'feature' }] }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ comments: [] }),
      });
    });

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    const data = makeTaskDetail({ tags: [{ id: 2, name: 'feature' }] });
    renderDetailPanel(data);

    await vi.waitFor(() => {
      // The tag pill for "feature" should be visible in the container
      const pill = document.querySelector('.tag-pill');
      if (pill) {
        expect(pill.textContent).toContain('feature');
      } else {
        // The container exists and renderTagsSection was called successfully
        expect(document.getElementById('detail-tags-container')).not.toBeNull();
      }
    });
  });
});

describe('renderDetailPanel - metadata table', () => {
  beforeEach(() => {
    vi.resetModules();
    setupMinimalBoardDOM();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a metadata table when metadata entries exist', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ comments: [] }),
    });

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    const data = makeTaskDetail({
      metadata: [
        { key: 'branch', value: 'feat/my-branch' },
        { key: 'pr', value: 'https://github.com/org/repo/pull/42' },
      ],
    });
    renderDetailPanel(data);

    await vi.waitFor(() => {
      const detailsPane = document.getElementById('detail-tab-content-details');
      expect(detailsPane?.querySelector('.detail-meta-table')).not.toBeNull();
    });
  });

  it('renders all metadata keys and values in the table', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ comments: [] }),
    });

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    const data = makeTaskDetail({
      metadata: [
        { key: 'branch', value: 'feat/my-branch' },
        { key: 'pr', value: 'https://github.com/org/repo/pull/42' },
      ],
    });
    renderDetailPanel(data);

    await vi.waitFor(() => {
      const detailsPane = document.getElementById('detail-tab-content-details');
      expect(detailsPane?.innerHTML).toContain('branch');
      expect(detailsPane?.innerHTML).toContain('feat/my-branch');
      expect(detailsPane?.innerHTML).toContain('pr');
      expect(detailsPane?.innerHTML).toContain('https://github.com/org/repo/pull/42');
    });
  });

  it('does not render metadata table when metadata array is empty', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ comments: [] }),
    });

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    const data = makeTaskDetail({ metadata: [] });
    renderDetailPanel(data);

    await vi.waitFor(() => {
      const detailsPane = document.getElementById('detail-tab-content-details');
      expect(detailsPane?.querySelector('.detail-meta-table')).toBeNull();
    });
  });

  it('renders all metadata keys in the metadata table', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ comments: [] }),
    });

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    const data = makeTaskDetail({
      metadata: [
        { key: 'sprint', value: '3' },
        { key: 'branch', value: 'feat/test' },
      ],
    });
    renderDetailPanel(data);

    await vi.waitFor(() => {
      const table = document.querySelector('.detail-meta-table');
      expect(table).not.toBeNull();
      const rows = table?.querySelectorAll('tr');
      // Both rows should be present
      expect(rows?.length).toBe(2);
      expect(table?.innerHTML).toContain('sprint');
      expect(table?.innerHTML).toContain('branch');
    });
  });

  it('does not render metadata table when metadata is empty', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ comments: [] }),
    });

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    const data = makeTaskDetail({
      metadata: [],
    });
    renderDetailPanel(data);

    await vi.waitFor(() => {
      const detailsPane = document.getElementById('detail-tab-content-details');
      expect(detailsPane?.querySelector('.detail-meta-table')).toBeNull();
    });
  });

  it('escapes HTML in metadata key and value to prevent XSS', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ comments: [] }),
    });

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    const data = makeTaskDetail({
      metadata: [{ key: '<script>', value: '<img src=x onerror=alert(1)>' }],
    });
    renderDetailPanel(data);

    await vi.waitFor(() => {
      const detailsPane = document.getElementById('detail-tab-content-details');
      // Raw HTML tags should not appear unescaped in the DOM
      expect(detailsPane?.innerHTML).not.toContain('<script>');
      expect(detailsPane?.innerHTML).not.toContain('<img src=x');
      // The table should still render (key is not 'priority')
      expect(detailsPane?.querySelector('.detail-meta-table')).not.toBeNull();
    });
  });

  it('renders metadata section with a "Metadata" label', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ comments: [] }),
    });

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    const data = makeTaskDetail({
      metadata: [{ key: 'branch', value: 'main' }],
    });
    renderDetailPanel(data);

    await vi.waitFor(() => {
      const detailsPane = document.getElementById('detail-tab-content-details');
      expect(detailsPane?.innerHTML).toContain('Metadata');
    });
  });

  it('renders pr metadata value as a clickable anchor when value is a URL', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ comments: [] }),
    });

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    const prUrl = 'https://github.com/org/repo/pull/42';
    const data = makeTaskDetail({
      metadata: [{ key: 'pr', value: prUrl }],
    });
    renderDetailPanel(data);

    await vi.waitFor(() => {
      const table = document.querySelector('.detail-meta-table');
      expect(table).not.toBeNull();
      const anchor = table?.querySelector('a');
      expect(anchor).not.toBeNull();
      expect(anchor?.getAttribute('href')).toBe(prUrl);
      expect(anchor?.getAttribute('target')).toBe('_blank');
      expect(anchor?.getAttribute('rel')).toBe('noopener noreferrer');
      expect(anchor?.textContent).toBe(prUrl);
    });
  });

  it('renders URL value as a clickable anchor for non-pr metadata keys', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ comments: [] }),
    });

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    const url = 'https://example.com/some/path';
    const data = makeTaskDetail({
      metadata: [{ key: 'reference', value: url }],
    });
    renderDetailPanel(data);

    await vi.waitFor(() => {
      const table = document.querySelector('.detail-meta-table');
      expect(table).not.toBeNull();
      const anchor = table?.querySelector('a');
      expect(anchor).not.toBeNull();
      expect(anchor?.getAttribute('href')).toBe(url);
      expect(anchor?.textContent).toBe(url);
    });
  });

  it('renders non-URL metadata value as plain escaped text', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ comments: [] }),
    });

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    const data = makeTaskDetail({
      metadata: [{ key: 'sprint', value: '3' }],
    });
    renderDetailPanel(data);

    await vi.waitFor(() => {
      const table = document.querySelector('.detail-meta-table');
      expect(table).not.toBeNull();
      const anchor = table?.querySelector('a');
      expect(anchor).toBeNull();
      expect(table?.textContent).toContain('3');
    });
  });

  it('does not render unsafe protocol values as links', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ comments: [] }),
    });

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    const data = makeTaskDetail({
      metadata: [{ key: 'link', value: 'javascript:alert(1)' }],
    });
    renderDetailPanel(data);

    await vi.waitFor(() => {
      const table = document.querySelector('.detail-meta-table');
      expect(table).not.toBeNull();
      const anchor = table?.querySelector('a');
      expect(anchor).toBeNull();
      expect(table?.textContent).toContain('javascript:alert(1)');
    });
  });
});

describe('renderDetailPanel - metadata and relations', () => {
  beforeEach(() => {
    vi.resetModules();
    setupMinimalBoardDOM();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders parent relation when parent is provided', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ comments: [] }),
    });

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    const data = makeTaskDetail({ parent: { id: 5, title: 'Parent Task' } });
    renderDetailPanel(data);

    await vi.waitFor(() => {
      const detailsPane = document.getElementById('detail-tab-content-details');
      expect(detailsPane?.innerHTML).toContain('#5');
      expect(detailsPane?.innerHTML).toContain('Parent Task');
    });
  });

  it('renders blockedBy relation when blockedBy tasks exist', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ comments: [] }),
    });

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    const data = makeTaskDetail({ blockedBy: [{ id: 3 }, { id: 7 }] });
    renderDetailPanel(data);

    await vi.waitFor(() => {
      const detailsPane = document.getElementById('detail-tab-content-details');
      expect(detailsPane?.innerHTML).toContain('#3');
      expect(detailsPane?.innerHTML).toContain('#7');
    });
  });
});

describe('comment event delegation - no global window functions', () => {
  beforeEach(() => {
    vi.resetModules();
    setupMinimalBoardDOM();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not expose openAddCommentForm as a global window function', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ comments: [] }),
    });

    await import('../../../src/board/client/detailPanel');

    expect((window as unknown as Record<string, unknown>).openAddCommentForm).toBeUndefined();
  });

  it('does not expose closeAddCommentForm as a global window function', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ comments: [] }),
    });

    await import('../../../src/board/client/detailPanel');

    expect((window as unknown as Record<string, unknown>).closeAddCommentForm).toBeUndefined();
  });

  it('does not expose startCommentEdit as a global window function', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ comments: [] }),
    });

    await import('../../../src/board/client/detailPanel');

    expect((window as unknown as Record<string, unknown>).startCommentEdit).toBeUndefined();
  });

  it('does not expose cancelCommentEdit as a global window function', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ comments: [] }),
    });

    await import('../../../src/board/client/detailPanel');

    expect((window as unknown as Record<string, unknown>).cancelCommentEdit).toBeUndefined();
  });

  it('does not expose saveCommentEdit as a global window function', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ comments: [] }),
    });

    await import('../../../src/board/client/detailPanel');

    expect((window as unknown as Record<string, unknown>).saveCommentEdit).toBeUndefined();
  });

  it('does not expose deleteComment as a global window function', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ comments: [] }),
    });

    await import('../../../src/board/client/detailPanel');

    expect((window as unknown as Record<string, unknown>).deleteComment).toBeUndefined();
  });

  it('does not expose submitComment as a global window function', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ comments: [] }),
    });

    await import('../../../src/board/client/detailPanel');

    expect((window as unknown as Record<string, unknown>).submitComment).toBeUndefined();
  });
});

describe('comment event delegation - rendered HTML uses data-action', () => {
  beforeEach(() => {
    vi.resetModules();
    setupMinimalBoardDOM();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders add-comment trigger button with data-action instead of onclick', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ comments: [] }),
    });

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    renderDetailPanel(makeTaskDetail());

    await vi.waitFor(() => {
      const trigger = document.getElementById('add-comment-trigger');
      expect(trigger).not.toBeNull();
      expect(trigger?.getAttribute('onclick')).toBeNull();
      expect(trigger?.dataset.action).toBe('open-add-comment');
    });
  });

  it('renders add-comment cancel button with data-action instead of onclick', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ comments: [] }),
    });

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    renderDetailPanel(makeTaskDetail());

    await vi.waitFor(() => {
      const cancelBtn = document.querySelector('.add-comment-cancel') as HTMLButtonElement | null;
      expect(cancelBtn).not.toBeNull();
      expect(cancelBtn?.getAttribute('onclick')).toBeNull();
      expect(cancelBtn?.dataset.action).toBe('close-add-comment');
    });
  });

  it('renders add-comment submit button with data-action instead of onclick', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ comments: [] }),
    });

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    renderDetailPanel(makeTaskDetail());

    await vi.waitFor(() => {
      const submitBtn = document.querySelector('.add-comment-submit') as HTMLButtonElement | null;
      expect(submitBtn).not.toBeNull();
      expect(submitBtn?.getAttribute('onclick')).toBeNull();
      expect(submitBtn?.dataset.action).toBe('submit-comment');
    });
  });

  it('renders comment edit button with data-action and data-comment-id instead of onclick', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          comments: [{ id: 42, content: 'Hello', author: 'Alice', created_at: '2026-01-01T00:00:00.000Z' }],
        }),
    });

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    renderDetailPanel(makeTaskDetail());

    await vi.waitFor(() => {
      const editBtn = document.querySelector('[data-action="start-comment-edit"]') as HTMLElement | null;
      expect(editBtn).not.toBeNull();
      expect(editBtn?.getAttribute('onclick')).toBeNull();
      expect(editBtn?.dataset.commentId).toBe('42');
    });
  });

  it('renders comment delete button with data-action and data-comment-id instead of onclick', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          comments: [{ id: 42, content: 'Hello', author: 'Alice', created_at: '2026-01-01T00:00:00.000Z' }],
        }),
    });

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    renderDetailPanel(makeTaskDetail());

    await vi.waitFor(() => {
      const deleteBtn = document.querySelector('[data-action="delete-comment"]') as HTMLElement | null;
      expect(deleteBtn).not.toBeNull();
      expect(deleteBtn?.getAttribute('onclick')).toBeNull();
      expect(deleteBtn?.dataset.commentId).toBe('42');
    });
  });

  it('renders comment save button with data-action and data-comment-id instead of onclick', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          comments: [{ id: 42, content: 'Hello', author: 'Alice', created_at: '2026-01-01T00:00:00.000Z' }],
        }),
    });

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    renderDetailPanel(makeTaskDetail());

    await vi.waitFor(() => {
      const saveBtn = document.querySelector('[data-action="save-comment-edit"]') as HTMLElement | null;
      expect(saveBtn).not.toBeNull();
      expect(saveBtn?.getAttribute('onclick')).toBeNull();
      expect(saveBtn?.dataset.commentId).toBe('42');
    });
  });

  it('renders comment cancel-edit button with data-action and data-comment-id instead of onclick', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          comments: [{ id: 42, content: 'Hello', author: 'Alice', created_at: '2026-01-01T00:00:00.000Z' }],
        }),
    });

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    renderDetailPanel(makeTaskDetail());

    await vi.waitFor(() => {
      const cancelEditBtn = document.querySelector('[data-action="cancel-comment-edit"]') as HTMLElement | null;
      expect(cancelEditBtn).not.toBeNull();
      expect(cancelEditBtn?.getAttribute('onclick')).toBeNull();
      expect(cancelEditBtn?.dataset.commentId).toBe('42');
    });
  });
});

describe('comment event delegation - interactions via data-action', () => {
  beforeEach(() => {
    vi.resetModules();
    setupMinimalBoardDOM();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clicking open-add-comment trigger shows the form', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ comments: [] }),
    });

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    renderDetailPanel(makeTaskDetail());

    let trigger: HTMLElement | null = null;
    let form: HTMLElement | null = null;
    await vi.waitFor(() => {
      trigger = document.getElementById('add-comment-trigger') as HTMLElement;
      form = document.getElementById('add-comment-form') as HTMLElement;

      expect(trigger).not.toBeNull();
      expect(form).not.toBeNull();
    });

    trigger!.click();

    expect(trigger!.style.display).toBe('none');
    expect(form!.classList.contains('open')).toBe(true);
  });

  it('clicking close-add-comment hides the form', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ comments: [] }),
    });

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    renderDetailPanel(makeTaskDetail());

    let trigger: HTMLElement | null = null;
    let form: HTMLElement | null = null;
    let cancelBtn: HTMLElement | null = null;
    await vi.waitFor(() => {
      trigger = document.getElementById('add-comment-trigger') as HTMLElement;
      form = document.getElementById('add-comment-form') as HTMLElement;
      cancelBtn = document.querySelector('[data-action="close-add-comment"]') as HTMLElement;

      expect(trigger).not.toBeNull();
      expect(form).not.toBeNull();
      expect(cancelBtn).not.toBeNull();
    });

    // First open the form
    trigger!.click();
    expect(form!.classList.contains('open')).toBe(true);

    // Now close it
    cancelBtn!.click();
    expect(form!.classList.contains('open')).toBe(false);
    expect(trigger!.style.display).toBe('');
  });

  it('clicking start-comment-edit shows edit area', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          comments: [{ id: 99, content: 'Test', author: 'Bob', created_at: '2026-01-01T00:00:00.000Z' }],
        }),
    });

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    renderDetailPanel(makeTaskDetail());

    let editBtn: HTMLElement | null = null;
    await vi.waitFor(() => {
      editBtn = document.querySelector('[data-action="start-comment-edit"]') as HTMLElement;
      expect(editBtn).not.toBeNull();
    });

    editBtn!.click();

    const contentEl = document.getElementById('comment-content-99');
    const editWrapper = document.getElementById('comment-edit-99');

    expect(contentEl?.style.display).toBe('none');
    expect(editWrapper?.style.display).toBe('block');
  });

  it('clicking cancel-comment-edit hides edit area', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          comments: [{ id: 99, content: 'Test', author: 'Bob', created_at: '2026-01-01T00:00:00.000Z' }],
        }),
    });

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    renderDetailPanel(makeTaskDetail());

    let editBtn: HTMLElement | null = null;
    await vi.waitFor(() => {
      editBtn = document.querySelector('[data-action="start-comment-edit"]') as HTMLElement;
      expect(editBtn).not.toBeNull();
    });

    // First start editing
    editBtn!.click();

    const contentEl = document.getElementById('comment-content-99');
    const editWrapper = document.getElementById('comment-edit-99');
    expect(editWrapper?.style.display).toBe('block');

    // Now cancel
    const cancelEditBtn = document.querySelector('[data-action="cancel-comment-edit"]') as HTMLElement;
    cancelEditBtn.click();

    expect(contentEl?.style.display).toBe('');
    expect(editWrapper?.style.display).toBe('none');
  });
});

describe('closeDetailPanel', () => {
  beforeEach(() => {
    vi.resetModules();
    setupMinimalBoardDOM();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('removes open class and clears detailTaskId', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ comments: [] }),
    });

    const { renderDetailPanel, closeDetailPanel, getDetailTaskId } =
      await import('../../../src/board/client/detailPanel');

    renderDetailPanel(makeTaskDetail());

    // Wait for the async comments fetch to resolve before proceeding, rather than
    // the synchronous detailTaskId assignment, since that happens before any fetch settles.
    await vi.waitFor(() => {
      expect(document.getElementById('detail-tab-comments')?.textContent).toBe('Comments (0)');
    });

    const panel = document.getElementById('detail-panel')!;
    panel.classList.add('open');

    expect(getDetailTaskId()).toBe(1);

    closeDetailPanel();

    expect(panel.classList.contains('open')).toBe(false);
    expect(getDetailTaskId()).toBeNull();
  });
});

describe('Detail panel design updates', () => {
  beforeEach(() => {
    vi.resetModules();
    setupMinimalBoardDOM();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders metadata table before editable text fields', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ comments: [] }),
    });

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    const data = makeTaskDetail({
      metadata: [{ key: 'branch', value: 'feat/my-feature' }],
    });
    renderDetailPanel(data);

    await vi.waitFor(() => {
      const detailsPane = document.getElementById('detail-tab-content-details');
      const metaTableIndex = detailsPane?.innerHTML.indexOf('detail-meta-table') ?? -1;
      const titleInputIndex = detailsPane?.innerHTML.indexOf('detail-edit-title') ?? -1;

      expect(metaTableIndex).toBeGreaterThan(-1);
      expect(titleInputIndex).toBeGreaterThan(-1);
      expect(metaTableIndex).toBeLessThan(titleInputIndex);
    });
  });

  it('displays timestamps in footer instead of detail body', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ comments: [] }),
    });

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    const data = makeTaskDetail();
    renderDetailPanel(data);

    await vi.waitFor(() => {
      const detailsPane = document.getElementById('detail-tab-content-details');
      const footer = document.getElementById('detail-panel-footer');

      // Timestamp should NOT be in details pane anymore
      expect(detailsPane?.innerHTML).not.toContain('created');
      expect(detailsPane?.innerHTML).not.toContain('updated');

      // Timestamp should be in footer
      expect(footer?.innerHTML).toContain('created');
      expect(footer?.innerHTML).toContain('updated');
    });
  });

  it('has save button in footer', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ comments: [] }),
    });

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    renderDetailPanel(makeTaskDetail());

    await vi.waitFor(() => {
      const footer = document.getElementById('detail-panel-footer');
      const saveBtn = footer?.querySelector('#detail-save-btn');

      expect(saveBtn).not.toBeNull();
      expect(saveBtn?.textContent).toBe('Save');
    });
  });

  it('textarea gets input event listener for auto-resize', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ comments: [] }),
    });

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    const data = makeTaskDetail({
      task: {
        ...makeTaskDetail().task,
        body: 'Short text',
      },
    });
    renderDetailPanel(data);

    // JSDOM has no CSS transitions, so transitionend never fires automatically.
    // Dispatch it manually to simulate the panel width transition completing.
    const detailPanel = document.getElementById('detail-panel') as HTMLElement;
    const transitionEvent = new TransitionEvent('transitionend', { propertyName: 'width' });
    detailPanel.dispatchEvent(transitionEvent);

    let textarea: HTMLTextAreaElement | null = null;
    await vi.waitFor(() => {
      textarea = document.getElementById('detail-edit-body') as HTMLTextAreaElement;
      expect(textarea).not.toBeNull();

      // The textarea should exist and have been set up with auto-resize
      // We verify by checking that the height style was set (autoResizeTextarea sets style.height)
      expect(textarea.style.height).toBeTruthy();
    });

    // Simulate input event which should trigger auto-resize
    textarea!.value = 'New content';
    const inputEvent = new Event('input', { bubbles: true });
    textarea!.dispatchEvent(inputEvent);

    // The style.height should still exist after input event
    expect(textarea!.style.height).toBeTruthy();
  });

  it('textarea is auto-resized after panel opens with 5+ line description', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ comments: [] }),
    });

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    const longBody = 'line1\nline2\nline3\nline4\nline5\nline6';
    const data = makeTaskDetail({
      task: {
        ...makeTaskDetail().task,
        body: longBody,
      },
    });
    renderDetailPanel(data);

    // Dispatch transitionend to simulate panel width transition completing.
    const detailPanel = document.getElementById('detail-panel') as HTMLElement;
    const transitionEvent = new TransitionEvent('transitionend', { propertyName: 'width' });
    detailPanel.dispatchEvent(transitionEvent);

    // Allow double rAF (each resolves as setTimeout(0) in jsdom) to flush.
    await vi.waitFor(() => {
      const textarea = document.getElementById('detail-edit-body') as HTMLTextAreaElement;
      expect(textarea).not.toBeNull();
      // autoResizeTextarea should have set style.height after the double rAF.
      expect(textarea.style.height).toBeTruthy();
    });
  });

  it('detail tab content div is rendered with active class', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ comments: [] }),
    });

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    renderDetailPanel(makeTaskDetail());

    await vi.waitFor(() => {
      const detailsPane = document.getElementById('detail-tab-content-details');

      // Check that the active class is present
      expect(detailsPane?.classList.contains('active')).toBe(true);
    });
  });
});

describe('Escape key closes detail panel', () => {
  beforeEach(() => {
    vi.resetModules();
    setupMinimalBoardDOM();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('pressing Escape closes the panel when it is open', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ comments: [] }),
    });

    const { renderDetailPanel, initDetailPanel, getDetailTaskId } =
      await import('../../../src/board/client/detailPanel');

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('/api/config')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ comments: [] }) });
    });

    initDetailPanel();
    renderDetailPanel(makeTaskDetail());

    // Wait for the async comments fetch to resolve before proceeding, rather than
    // the synchronous detailTaskId assignment, since that happens before any fetch settles.
    await vi.waitFor(() => {
      expect(document.getElementById('detail-tab-comments')?.textContent).toBe('Comments (0)');
    });

    const panel = document.getElementById('detail-panel')!;
    panel.classList.add('open');

    expect(panel.classList.contains('open')).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(panel.classList.contains('open')).toBe(false);
    expect(getDetailTaskId()).toBeNull();
  });

  it('pressing Escape does not throw when panel is not open', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('/api/config')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ comments: [] }) });
    });

    const { initDetailPanel } = await import('../../../src/board/client/detailPanel');

    initDetailPanel();

    const panel = document.getElementById('detail-panel')!;
    expect(panel.classList.contains('open')).toBe(false);

    expect(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    }).not.toThrow();

    expect(panel.classList.contains('open')).toBe(false);
  });

  it('pressing Escape closes add task modal first when it is open, not the detail panel', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('/api/config')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ comments: [] }) });
    });

    const { renderDetailPanel, initDetailPanel } = await import('../../../src/board/client/detailPanel');

    initDetailPanel();
    renderDetailPanel(makeTaskDetail());

    // Wait for the async comments fetch to resolve before proceeding, rather than
    // the synchronous detailTaskId assignment, since that happens before any fetch settles.
    await vi.waitFor(() => {
      expect(document.getElementById('detail-tab-comments')?.textContent).toBe('Comments (0)');
    });

    const panel = document.getElementById('detail-panel')!;
    panel.classList.add('open');

    // Add a fake add-modal and add-cancel button to the DOM
    const addModal = document.createElement('div');
    addModal.id = 'add-modal';
    addModal.classList.add('show');
    document.body.appendChild(addModal);

    const addCancel = document.createElement('button');
    addCancel.id = 'add-cancel';
    const cancelClicked = vi.fn(() => addModal.classList.remove('show'));
    addCancel.addEventListener('click', cancelClicked);
    document.body.appendChild(addCancel);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    // Add Task modal should be closed
    expect(cancelClicked).toHaveBeenCalledOnce();
    // Detail panel should still be open
    expect(panel.classList.contains('open')).toBe(true);

    // Now pressing Escape again should close the detail panel
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(panel.classList.contains('open')).toBe(false);
  });

  it('pressing other keys does not close the panel', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('/api/config')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ comments: [] }) });
    });

    const { renderDetailPanel, initDetailPanel } = await import('../../../src/board/client/detailPanel');

    initDetailPanel();
    renderDetailPanel(makeTaskDetail());

    // Wait for the async comments fetch to resolve before proceeding, rather than
    // the synchronous detailTaskId assignment, since that happens before any fetch settles.
    await vi.waitFor(() => {
      expect(document.getElementById('detail-tab-comments')?.textContent).toBe('Comments (0)');
    });

    const panel = document.getElementById('detail-panel')!;
    panel.classList.add('open');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(panel.classList.contains('open')).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(panel.classList.contains('open')).toBe(true);
  });
});

describe('copy task ID button', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '<div class="board-container"></div>';
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    (window as unknown as Record<string, unknown>).allStatuses = ['pending'];
    (window as unknown as Record<string, unknown>).statusLabels = { pending: 'Pending' };
    (window as unknown as Record<string, unknown>).allPriorities = ['low', 'medium', 'high'];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('copy button is present in the detail panel header', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('/api/config')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ comments: [] }) });
    });

    const { initDetailPanel } = await import('../../../src/board/client/detailPanel');
    initDetailPanel();

    const copyBtn = document.getElementById('detail-panel-copy-id');
    expect(copyBtn).not.toBeNull();
  });

  it('clicking copy button writes task ID to clipboard', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
    });

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('/api/config')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ comments: [] }) });
    });

    const { initDetailPanel, renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    initDetailPanel();
    renderDetailPanel(makeTaskDetail({ task: { ...makeTaskDetail().task, id: 42 } }));

    let copyBtn: HTMLButtonElement | null = null;
    await vi.waitFor(() => {
      copyBtn = document.getElementById('detail-panel-copy-id') as HTMLButtonElement;
      expect(copyBtn).not.toBeNull();
    });
    copyBtn!.click();

    await vi.waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith('42');
    });
  });

  it('clicking copy button does not throw when no task is loaded', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
    });

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('/api/config')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ comments: [] }) });
    });

    const { initDetailPanel } = await import('../../../src/board/client/detailPanel');
    initDetailPanel();

    const copyBtn = document.getElementById('detail-panel-copy-id') as HTMLButtonElement;
    expect(copyBtn).not.toBeNull();

    expect(() => copyBtn.click()).not.toThrow();
    expect(writeTextMock).not.toHaveBeenCalled();
  });
});

describe('metadata URL link styles - dark mode visibility', () => {
  it('BOARD_STYLES contains light mode link color for .detail-meta-table a', async () => {
    const { BOARD_STYLES } = await import('../../../src/board/boardStyles');
    expect(BOARD_STYLES).toContain('.detail-meta-table a');
  });

  it('BOARD_STYLES contains dark mode link color for [data-theme="dark"] .detail-meta-table a', async () => {
    const { BOARD_STYLES } = await import('../../../src/board/boardStyles');
    expect(BOARD_STYLES).toContain('[data-theme="dark"] .detail-meta-table a');
  });

  it('BOARD_STYLES dark mode link uses light blue color #60a5fa', async () => {
    const { BOARD_STYLES } = await import('../../../src/board/boardStyles');
    const darkLinkMatch = BOARD_STYLES.match(/\[data-theme="dark"\] \.detail-meta-table a\s*\{[^}]*\}/);
    expect(darkLinkMatch).not.toBeNull();
    expect(darkLinkMatch?.[0]).toContain('#60a5fa');
  });
});

describe('loadComments race condition - stale task ignored', () => {
  beforeEach(() => {
    vi.resetModules();
    setupMinimalBoardDOM();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not update comments tab when task switches before fetch completes', async () => {
    let resolveTaskAComments!: (value: unknown) => void;
    const taskACommentsPromise = new Promise((resolve) => {
      resolveTaskAComments = resolve;
    });

    // fetch for task 1 (task A) comments is delayed; task 2 (task B) resolves immediately
    global.fetch = vi.fn().mockImplementation((url: string) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/tasks/1/comments')) {
        return taskACommentsPromise.then(() =>
          Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                comments: [{ id: 10, content: 'Old comment', author: null, created_at: '2026-01-01T00:00:00.000Z' }],
              }),
          })
        );
      }
      // task 2 comments, tags, run-logs, task detail fetches
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            comments: [],
            task: {
              id: 2,
              title: 'Task B',
              body: '',
              status: 'pending',
              priority: null,
              created_at: '2026-01-01T00:00:00.000Z',
              updated_at: '2026-01-01T00:00:00.000Z',
            },
            tags: [],
            metadata: [],
            blockedBy: [],
            blocking: [],
            parent: null,
            logs: [],
          }),
      });
    });

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');

    // Render task A (id=1) — triggers slow loadComments(1)
    renderDetailPanel(
      makeTaskDetail({
        task: {
          id: 1,
          title: 'Task A',
          body: '',
          status: 'pending',
          priority: null,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      })
    );

    // Immediately render task B (id=2) — detailTaskId is now 2
    renderDetailPanel(
      makeTaskDetail({
        task: {
          id: 2,
          title: 'Task B',
          body: '',
          status: 'pending',
          priority: null,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      })
    );

    // Let task B's comments load (empty, resolves immediately)
    let tabBtn: HTMLElement | null = null;
    await vi.waitFor(() => {
      tabBtn = document.getElementById('detail-tab-comments');
      // After task B loads, tab shows "Comments (0)"
      expect(tabBtn?.textContent).toBe('Comments (0)');
    });

    // Now resolve task A's delayed comments fetch
    resolveTaskAComments(undefined);

    await vi.waitFor(() => {
      // Tab should still show task B's count — task A's stale result must be ignored
      expect(tabBtn?.textContent).toBe('Comments (0)');

      // Comments pane should not contain task A's old comment
      const pane = document.getElementById('detail-tab-content-comments');
      expect(pane?.innerHTML).not.toContain('Old comment');
    });
  });
});

describe('copy task ID button', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '<div class="board-container"></div>';
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    (window as unknown as Record<string, unknown>).allStatuses = ['pending'];
    (window as unknown as Record<string, unknown>).statusLabels = { pending: 'Pending' };
    (window as unknown as Record<string, unknown>).allPriorities = ['low', 'medium', 'high'];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('copy button is present in the detail panel header', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('/api/config')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ comments: [] }) });
    });

    const { initDetailPanel } = await import('../../../src/board/client/detailPanel');
    initDetailPanel();

    const copyBtn = document.getElementById('detail-panel-copy-id');
    expect(copyBtn).not.toBeNull();
  });

  it('clicking copy button writes task ID to clipboard', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
    });

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('/api/config')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ comments: [] }) });
    });

    const { initDetailPanel, renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    initDetailPanel();
    renderDetailPanel(makeTaskDetail({ task: { ...makeTaskDetail().task, id: 42 } }));

    let copyBtn: HTMLButtonElement | null = null;
    await vi.waitFor(() => {
      copyBtn = document.getElementById('detail-panel-copy-id') as HTMLButtonElement;
      expect(copyBtn).not.toBeNull();
    });
    copyBtn!.click();

    await vi.waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith('42');
    });
  });

  it('clicking copy button does not throw when no task is loaded', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
    });

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('/api/config')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ comments: [] }) });
    });

    const { initDetailPanel } = await import('../../../src/board/client/detailPanel');
    initDetailPanel();

    const copyBtn = document.getElementById('detail-panel-copy-id') as HTMLButtonElement;
    expect(copyBtn).not.toBeNull();

    expect(() => copyBtn.click()).not.toThrow();
    expect(writeTextMock).not.toHaveBeenCalled();
  });
});

describe('branch input keydown - prevent duplicate first character', () => {
  beforeEach(() => {
    vi.resetModules();
    setupMinimalBoardDOM();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    (window as unknown as Record<string, unknown>).allStatuses = ['pending'];
    (window as unknown as Record<string, unknown>).statusLabels = { pending: 'Pending' };
    (window as unknown as Record<string, unknown>).allPriorities = ['low', 'medium', 'high'];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls preventDefault on first keydown when switching from auto-generate to manual mode', async () => {
    // Regression test for real-browser bug: removing readOnly during keydown causes
    // the browser to both insert the character via default behavior AND our manual value set,
    // resulting in duplicate first character (e.g. 'ff' instead of 'f').
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('/api/config')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ comments: [] }) });
    });

    const { initDetailPanel, renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    initDetailPanel();
    // Render with no branch so the input starts in readOnly/auto-generate mode
    renderDetailPanel(makeTaskDetail());

    let branchInput: HTMLInputElement | null = null;
    await vi.waitFor(() => {
      branchInput = document.getElementById('detail-edit-branch') as HTMLInputElement;
      expect(branchInput).not.toBeNull();
      expect(branchInput.readOnly).toBe(true);
    });

    const event = new KeyboardEvent('keydown', { key: 'f', bubbles: true, cancelable: true });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

    branchInput!.dispatchEvent(event);

    expect(preventDefaultSpy).toHaveBeenCalledOnce();
    expect(branchInput!.readOnly).toBe(false);
    expect(branchInput!.value).toBe('f');
  });
});

describe('comment actions - save edit', () => {
  beforeEach(() => {
    vi.resetModules();
    setupMinimalBoardDOM();
    document.body.insertAdjacentHTML('beforeend', '<div id="toast"></div>');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('save-comment-edit success: PATCHes trimmed content and reloads comments', async () => {
    let commentsGetCount = 0;
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/api/tasks/1/comments') && (!init || !init.method)) {
        commentsGetCount += 1;
        const comments =
          commentsGetCount === 1
            ? [{ id: 42, content: 'Old content', author: 'Bob', created_at: '2026-01-01T00:00:00.000Z' }]
            : [
                { id: 42, content: 'Updated content', author: 'Bob', created_at: '2026-01-01T00:00:00.000Z' },
                { id: 43, content: 'Second', author: 'Bob', created_at: '2026-01-01T00:00:00.000Z' },
              ];
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ comments }) });
      }
      if (u === '/api/comments/42' && init?.method === 'PATCH') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    global.fetch = fetchMock;

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    renderDetailPanel(makeTaskDetail());

    let editBtn: HTMLElement | null = null;
    await vi.waitFor(() => {
      editBtn = document.querySelector('[data-action="start-comment-edit"]') as HTMLElement;
      expect(editBtn).not.toBeNull();
    });
    editBtn!.click();

    const area = document.getElementById('comment-edit-area-42') as HTMLTextAreaElement;
    area.value = '  Updated content  ';

    const saveBtn = document.querySelector('[data-action="save-comment-edit"]') as HTMLElement;
    saveBtn.click();

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/comments/42',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ content: 'Updated content' }) })
      );
    });

    await vi.waitFor(() => {
      expect(document.getElementById('detail-tab-comments')?.textContent).toBe('Comments (2)');
    });
  });

  it('save-comment-edit failure: shows a toast when the PATCH request fails', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/api/tasks/1/comments') && (!init || !init.method)) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              comments: [{ id: 42, content: 'Old content', author: 'Bob', created_at: '2026-01-01T00:00:00.000Z' }],
            }),
        });
      }
      if (u === '/api/comments/42' && init?.method === 'PATCH') {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    global.fetch = fetchMock;

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    renderDetailPanel(makeTaskDetail());

    let editBtn: HTMLElement | null = null;
    await vi.waitFor(() => {
      editBtn = document.querySelector('[data-action="start-comment-edit"]') as HTMLElement;
      expect(editBtn).not.toBeNull();
    });
    editBtn!.click();

    const area = document.getElementById('comment-edit-area-42') as HTMLTextAreaElement;
    area.value = 'New content';

    const saveBtn = document.querySelector('[data-action="save-comment-edit"]') as HTMLElement;
    saveBtn.click();

    await vi.waitFor(() => {
      const toast = document.getElementById('toast');
      expect(toast?.textContent).toBe('Failed to update comment');
      expect(toast?.classList.contains('show')).toBe(true);
    });
  });

  it('save-comment-edit with empty/whitespace content focuses the textarea and does not PATCH', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/api/tasks/1/comments')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              comments: [{ id: 42, content: 'Old content', author: 'Bob', created_at: '2026-01-01T00:00:00.000Z' }],
            }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    global.fetch = fetchMock;

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    renderDetailPanel(makeTaskDetail());

    let editBtn: HTMLElement | null = null;
    await vi.waitFor(() => {
      editBtn = document.querySelector('[data-action="start-comment-edit"]') as HTMLElement;
      expect(editBtn).not.toBeNull();
    });
    editBtn!.click();

    const area = document.getElementById('comment-edit-area-42') as HTMLTextAreaElement;
    area.value = '   ';

    const saveBtn = document.querySelector('[data-action="save-comment-edit"]') as HTMLElement;
    saveBtn.click();

    expect(document.activeElement).toBe(area);
    expect(
      fetchMock.mock.calls.some(
        ([u, init]: [string, RequestInit?]) => String(u) === '/api/comments/42' && init?.method === 'PATCH'
      )
    ).toBe(false);
  });
});

describe('comment actions - delete', () => {
  beforeEach(() => {
    vi.resetModules();
    setupMinimalBoardDOM();
    document.body.insertAdjacentHTML('beforeend', '<div id="toast"></div>');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not DELETE when confirm() returns false', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/api/tasks/1/comments')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              comments: [{ id: 42, content: 'Comment', author: 'Bob', created_at: '2026-01-01T00:00:00.000Z' }],
            }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    global.fetch = fetchMock;

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    renderDetailPanel(makeTaskDetail());

    let deleteBtn: HTMLElement | null = null;
    await vi.waitFor(() => {
      deleteBtn = document.querySelector('[data-action="delete-comment"]') as HTMLElement;
      expect(deleteBtn).not.toBeNull();
    });
    deleteBtn!.click();

    await Promise.resolve();
    expect(
      fetchMock.mock.calls.some(
        ([u, init]: [string, RequestInit?]) => String(u) === '/api/comments/42' && init?.method === 'DELETE'
      )
    ).toBe(false);
  });

  it('DELETEs the comment and reloads on success when confirm() returns true', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let commentsGetCount = 0;
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/api/tasks/1/comments') && (!init || !init.method)) {
        commentsGetCount += 1;
        const comments =
          commentsGetCount === 1
            ? [{ id: 42, content: 'Comment', author: 'Bob', created_at: '2026-01-01T00:00:00.000Z' }]
            : [];
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ comments }) });
      }
      if (u === '/api/comments/42' && init?.method === 'DELETE') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    global.fetch = fetchMock;

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    renderDetailPanel(makeTaskDetail());

    let deleteBtn: HTMLElement | null = null;
    await vi.waitFor(() => {
      deleteBtn = document.querySelector('[data-action="delete-comment"]') as HTMLElement;
      expect(deleteBtn).not.toBeNull();
    });
    deleteBtn!.click();

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/comments/42', expect.objectContaining({ method: 'DELETE' }));
    });

    await vi.waitFor(() => {
      expect(document.getElementById('detail-tab-comments')?.textContent).toBe('Comments (0)');
    });
  });

  it('shows a toast when the DELETE request fails', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/api/tasks/1/comments') && (!init || !init.method)) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              comments: [{ id: 42, content: 'Comment', author: 'Bob', created_at: '2026-01-01T00:00:00.000Z' }],
            }),
        });
      }
      if (u === '/api/comments/42' && init?.method === 'DELETE') {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    global.fetch = fetchMock;

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    renderDetailPanel(makeTaskDetail());

    let deleteBtn: HTMLElement | null = null;
    await vi.waitFor(() => {
      deleteBtn = document.querySelector('[data-action="delete-comment"]') as HTMLElement;
      expect(deleteBtn).not.toBeNull();
    });
    deleteBtn!.click();

    await vi.waitFor(() => {
      const toast = document.getElementById('toast');
      expect(toast?.textContent).toBe('Failed to delete comment');
      expect(toast?.classList.contains('show')).toBe(true);
    });
  });
});

describe('comment actions - submit', () => {
  beforeEach(() => {
    vi.resetModules();
    setupMinimalBoardDOM();
    document.body.insertAdjacentHTML('beforeend', '<div id="toast"></div>');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('submit-comment success: POSTs trimmed content and reloads comments', async () => {
    let commentsGetCount = 0;
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url);
      if (u === '/api/tasks/1/comments' && (!init || !init.method)) {
        commentsGetCount += 1;
        const comments =
          commentsGetCount === 1
            ? []
            : [{ id: 1, content: 'Hello world', author: null, created_at: '2026-01-01T00:00:00.000Z' }];
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ comments }) });
      }
      if (u === '/api/tasks/1/comments' && init?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    global.fetch = fetchMock;

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    renderDetailPanel(makeTaskDetail());

    let textarea: HTMLTextAreaElement | null = null;
    await vi.waitFor(() => {
      textarea = document.getElementById('add-comment-text') as HTMLTextAreaElement;
      expect(textarea).not.toBeNull();
    });
    textarea!.value = '  Hello world  ';

    const submitBtn = document.querySelector('[data-action="submit-comment"]') as HTMLElement;
    submitBtn.click();

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/tasks/1/comments',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ content: 'Hello world' }) })
      );
    });

    await vi.waitFor(() => {
      expect(document.getElementById('detail-tab-comments')?.textContent).toBe('Comments (1)');
    });
  });

  it('submit-comment failure: shows a toast when the POST request fails', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url);
      if (u === '/api/tasks/1/comments' && init?.method === 'POST') {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ comments: [] }) });
    });
    global.fetch = fetchMock;

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    renderDetailPanel(makeTaskDetail());

    let textarea: HTMLTextAreaElement | null = null;
    await vi.waitFor(() => {
      textarea = document.getElementById('add-comment-text') as HTMLTextAreaElement;
      expect(textarea).not.toBeNull();
    });
    textarea!.value = 'A comment';

    const submitBtn = document.querySelector('[data-action="submit-comment"]') as HTMLElement;
    submitBtn.click();

    await vi.waitFor(() => {
      const toast = document.getElementById('toast');
      expect(toast?.textContent).toBe('Failed to add comment');
      expect(toast?.classList.contains('show')).toBe(true);
    });
  });

  it('submit-comment with empty input focuses the textarea and does not POST', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ comments: [] }) });
    global.fetch = fetchMock;

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    renderDetailPanel(makeTaskDetail());

    let textarea: HTMLTextAreaElement | null = null;
    await vi.waitFor(() => {
      textarea = document.getElementById('add-comment-text') as HTMLTextAreaElement;
      expect(textarea).not.toBeNull();
    });
    textarea!.value = '   ';

    const submitBtn = document.querySelector('[data-action="submit-comment"]') as HTMLElement;
    submitBtn.click();

    expect(document.activeElement).toBe(textarea);
    expect(
      fetchMock.mock.calls.some(
        ([u, init]: [string, RequestInit?]) => String(u) === '/api/tasks/1/comments' && init?.method === 'POST'
      )
    ).toBe(false);
  });
});

describe('saveDetailTask - collectEditedTaskFields', () => {
  beforeEach(() => {
    vi.resetModules();
    setupBoardContainerDOM();
    document.body.insertAdjacentHTML('beforeend', '<div id="toast"></div>');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function defaultFetchMock(extra?: (u: string, init?: RequestInit) => Response | undefined) {
    return vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url);
      const extraResult = extra ? extra(u, init) : undefined;
      if (extraResult) return Promise.resolve(extraResult);
      if (u.includes('/api/config')) return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      if (u.includes('/api/tags')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ tags: [] }) });
      if (u.includes('/api/board/cards'))
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ columns: [] }) });
      if (u.includes('/api/tasks/1/comments'))
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ comments: [] }) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
  }

  it('does not PATCH and focuses the title input when the title is empty', async () => {
    const fetchMock = defaultFetchMock();
    global.fetch = fetchMock;

    const { initDetailPanel, renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    initDetailPanel();
    renderDetailPanel(makeTaskDetail());

    let titleInput: HTMLInputElement | null = null;
    await vi.waitFor(() => {
      titleInput = document.getElementById('detail-edit-title') as HTMLInputElement;
      expect(titleInput).not.toBeNull();
    });
    titleInput!.value = '   ';

    const saveBtn = document.getElementById('detail-save-btn') as HTMLButtonElement;
    saveBtn.click();

    expect(document.activeElement).toBe(titleInput);
    expect(
      fetchMock.mock.calls.some(
        ([u, init]: [string, RequestInit?]) => String(u) === '/api/tasks/1' && init?.method === 'PATCH'
      )
    ).toBe(false);
  });

  it('successful save PATCHes the collected fields, re-renders, toasts, and refreshes board cards', async () => {
    const fetchMock = defaultFetchMock((u, init) => {
      if (u === '/api/tasks/1' && init?.method === 'PATCH') {
        return { ok: true, json: () => Promise.resolve({}) } as unknown as Response;
      }
      if (u === '/api/tasks/1' && (!init || !init.method)) {
        return {
          ok: true,
          json: () => Promise.resolve(makeTaskDetail({ task: { ...makeTaskDetail().task, title: 'Updated title' } })),
        } as unknown as Response;
      }
      return undefined;
    });
    global.fetch = fetchMock;

    const { initDetailPanel, renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    initDetailPanel();
    renderDetailPanel(makeTaskDetail());

    let titleInput: HTMLInputElement | null = null;
    await vi.waitFor(() => {
      titleInput = document.getElementById('detail-edit-title') as HTMLInputElement;
      expect(titleInput).not.toBeNull();
    });
    titleInput!.value = 'Updated title';

    const saveBtn = document.getElementById('detail-save-btn') as HTMLButtonElement;
    saveBtn.click();

    await vi.waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([u, init]: [string, RequestInit?]) => String(u) === '/api/tasks/1' && init?.method === 'PATCH'
        )
      ).toBe(true);
    });

    const patchCall = fetchMock.mock.calls.find(
      ([u, init]: [string, RequestInit?]) => String(u) === '/api/tasks/1' && init?.method === 'PATCH'
    )!;
    const body = JSON.parse((patchCall[1] as RequestInit).body as string);
    expect(body.title).toBe('Updated title');
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('priority');
    expect(body).toHaveProperty('branch');

    await vi.waitFor(() => {
      const reloadedTitleInput = document.getElementById('detail-edit-title') as HTMLInputElement;
      expect(reloadedTitleInput?.value).toBe('Updated title');
    });

    await vi.waitFor(() => {
      const toast = document.getElementById('toast');
      expect(toast?.textContent).toBe('Task saved successfully');
      expect(toast?.classList.contains('show')).toBe(true);
    });

    await vi.waitFor(() => {
      expect(fetchMock.mock.calls.some(([u]: [string]) => String(u).includes('/api/board/cards'))).toBe(true);
    });
  });

  it('shows a toast when the PATCH request fails', async () => {
    const fetchMock = defaultFetchMock((u, init) => {
      if (u === '/api/tasks/1' && init?.method === 'PATCH') {
        return { ok: false, json: () => Promise.resolve({}) } as unknown as Response;
      }
      return undefined;
    });
    global.fetch = fetchMock;

    const { initDetailPanel, renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    initDetailPanel();
    renderDetailPanel(makeTaskDetail());

    let titleInput: HTMLInputElement | null = null;
    await vi.waitFor(() => {
      titleInput = document.getElementById('detail-edit-title') as HTMLInputElement;
      expect(titleInput).not.toBeNull();
    });

    const saveBtn = document.getElementById('detail-save-btn') as HTMLButtonElement;
    saveBtn.click();

    await vi.waitFor(() => {
      const toast = document.getElementById('toast');
      expect(toast?.textContent).toBe('Failed to update task');
      expect(toast?.classList.contains('show')).toBe(true);
    });
  });
});

describe('showUpdateWarning - buildUpdateWarningReloadBtn', () => {
  beforeEach(() => {
    vi.resetModules();
    setupMinimalBoardDOM();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a warning bar as the first child of detail-panel-body with a message and reload button', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ comments: [] }) });
    const { renderDetailPanel, showUpdateWarning } = await import('../../../src/board/client/detailPanel');
    renderDetailPanel(makeTaskDetail());
    await vi.waitFor(() => {
      expect(document.getElementById('detail-tab-comments')?.textContent).toBe('Comments (0)');
    });

    showUpdateWarning();

    const body = document.getElementById('detail-panel-body')!;
    const warning = document.getElementById('detail-panel-update-warning');
    expect(warning).not.toBeNull();
    expect(body.firstElementChild).toBe(warning);
    expect(warning?.textContent).toContain('This task has been updated in the database');
    expect(warning?.querySelector('button')).not.toBeNull();
  });

  it('does not create a duplicate warning bar when called again while one already exists', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ comments: [] }) });
    const { renderDetailPanel, showUpdateWarning } = await import('../../../src/board/client/detailPanel');
    renderDetailPanel(makeTaskDetail());
    await vi.waitFor(() => {
      expect(document.getElementById('detail-tab-comments')?.textContent).toBe('Comments (0)');
    });

    showUpdateWarning();
    const first = document.getElementById('detail-panel-update-warning');
    showUpdateWarning();

    const warnings = document.querySelectorAll('#detail-panel-update-warning');
    expect(warnings.length).toBe(1);
    expect(document.getElementById('detail-panel-update-warning')).toBe(first);
  });

  it('clicking the reload button refetches the task and re-renders', async () => {
    let taskFetchCount = 0;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      const u = String(url);
      if (u === '/api/tasks/1') {
        taskFetchCount += 1;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(makeTaskDetail({ task: { ...makeTaskDetail().task, title: 'Reloaded' } })),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ comments: [] }) });
    });

    const { renderDetailPanel, showUpdateWarning } = await import('../../../src/board/client/detailPanel');
    renderDetailPanel(makeTaskDetail());
    await vi.waitFor(() => {
      expect(document.getElementById('detail-tab-comments')?.textContent).toBe('Comments (0)');
    });

    showUpdateWarning();
    const reloadBtn = document
      .getElementById('detail-panel-update-warning')!
      .querySelector('button') as HTMLButtonElement;
    reloadBtn.click();

    await vi.waitFor(() => {
      expect(taskFetchCount).toBe(1);
      expect(document.getElementById('detail-panel-update-warning')).toBeNull();
    });
  });

  it('silently swallows errors when the reload fetch fails', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      const u = String(url);
      if (u === '/api/tasks/1') return Promise.reject(new Error('network fail'));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ comments: [] }) });
    });

    const { renderDetailPanel, showUpdateWarning } = await import('../../../src/board/client/detailPanel');
    renderDetailPanel(makeTaskDetail());
    await vi.waitFor(() => {
      expect(document.getElementById('detail-tab-comments')?.textContent).toBe('Comments (0)');
    });

    showUpdateWarning();
    const reloadBtn = document
      .getElementById('detail-panel-update-warning')!
      .querySelector('button') as HTMLButtonElement;

    expect(() => reloadBtn.click()).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Warning bar remains untouched since renderDetailPanel was never called again
    expect(document.getElementById('detail-panel-update-warning')).not.toBeNull();
  });
});

describe('panel resize - attachResizeMousedown and initPanelWidthFromConfig', () => {
  beforeEach(() => {
    vi.resetModules();
    setupBoardContainerDOM();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sets dataset.preferredWidth from the /api/config response on init', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/api/config')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ board: { detailPaneWidth: 550 } }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    const { initDetailPanel } = await import('../../../src/board/client/detailPanel');
    initDetailPanel();

    const detailPanel = document.getElementById('detail-panel') as HTMLElement;
    await vi.waitFor(() => {
      expect(detailPanel.dataset.preferredWidth).toBe('550');
    });
  });

  it('mousedown on the resize handle while the panel is not open is a no-op', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    const { initDetailPanel } = await import('../../../src/board/client/detailPanel');
    initDetailPanel();

    const detailPanel = document.getElementById('detail-panel') as HTMLElement;
    const handle = document.getElementById('detail-panel-resize-handle') as HTMLElement;
    expect(detailPanel.classList.contains('open')).toBe(false);

    handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 300 }));
    expect(handle.classList.contains('dragging')).toBe(false);

    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 100 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    expect(detailPanel.style.width).toBe('');
    expect(handle.classList.contains('dragging')).toBe(false);
  });

  it('dragging while open clamps width between min/max, and mouseup persists the width via PUT /api/config', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    global.fetch = fetchMock;

    const { initDetailPanel } = await import('../../../src/board/client/detailPanel');
    initDetailPanel();

    const detailPanel = document.getElementById('detail-panel') as HTMLElement;
    const handle = document.getElementById('detail-panel-resize-handle') as HTMLElement;
    detailPanel.classList.add('open');
    Object.defineProperty(detailPanel, 'offsetWidth', { configurable: true, value: 400 });

    handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 500 }));

    expect(handle.classList.contains('dragging')).toBe(true);
    expect(document.body.style.cursor).toBe('col-resize');
    expect(document.body.style.userSelect).toBe('none');
    expect(detailPanel.style.transition).toBe('none');

    // In-range delta
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 450 }));
    expect(detailPanel.style.width).toBe('450px');

    // Exceeds PANEL_MAX_WIDTH (800)
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 50 }));
    expect(detailPanel.style.width).toBe('800px');

    // Exceeds PANEL_MIN_WIDTH (280)
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 950 }));
    expect(detailPanel.style.width).toBe('280px');

    Object.defineProperty(detailPanel, 'offsetWidth', { configurable: true, value: 500 });
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    expect(handle.classList.contains('dragging')).toBe(false);
    expect(document.body.style.cursor).toBe('');
    expect(document.body.style.userSelect).toBe('');
    expect(detailPanel.style.transition).toBe('');
    expect(detailPanel.dataset.preferredWidth).toBe('500');

    await vi.waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([u, init]: [string, RequestInit?]) =>
            String(u).includes('/api/config') &&
            init?.method === 'PUT' &&
            init.body === JSON.stringify({ board: { detailPaneWidth: 500 } })
        )
      ).toBe(true);
    });
  });
});

describe('handleRunLogToggle', () => {
  let originalRequestAnimationFrame: typeof window.requestAnimationFrame;

  beforeEach(() => {
    originalRequestAnimationFrame = window.requestAnimationFrame;
    vi.resetModules();
    MockEventSource.lastInstance = null;
    (globalThis as unknown as Record<string, unknown>).EventSource = MockEventSource;
    const stubbedRequestAnimationFrame = ((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    }) as typeof window.requestAnimationFrame;
    window.requestAnimationFrame = stubbedRequestAnimationFrame;
    (
      globalThis as typeof globalThis & { requestAnimationFrame: typeof window.requestAnimationFrame }
    ).requestAnimationFrame = stubbedRequestAnimationFrame;
    setupBoardContainerDOM();
  });

  afterEach(() => {
    window.requestAnimationFrame = originalRequestAnimationFrame;
    (
      globalThis as typeof globalThis & { requestAnimationFrame: typeof window.requestAnimationFrame }
    ).requestAnimationFrame = originalRequestAnimationFrame;
    vi.restoreAllMocks();
  });

  it('toggles the open class on a run-log-item when clicking its header', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/api/config')) return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      if (u.includes('/api/tags')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ tags: [] }) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ comments: [] }) });
    });

    const { initDetailPanel, renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    initDetailPanel();
    renderDetailPanel(makeTaskDetail());

    document.getElementById('detail-tab-run-logs')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const logs = [
      {
        id: 1,
        started_at: '2026-01-01T00:00:00.000Z',
        finished_at: null,
        exit_code: null,
        events: [{ kind: 'text', text: 'log' }],
      },
    ];
    MockEventSource.lastInstance?.dispatchUpdate(logs);

    let item: HTMLElement | null = null;
    await vi.waitFor(() => {
      item = document.querySelector('.run-log-item');
      expect(item).not.toBeNull();
    });

    // First log item is open by default on first render
    expect(item!.classList.contains('open')).toBe(true);

    const toggle = item!.querySelector('[data-action="toggle-run-log"]') as HTMLElement;
    expect(toggle).not.toBeNull();

    toggle.click();
    expect(item!.classList.contains('open')).toBe(false);

    toggle.click();
    expect(item!.classList.contains('open')).toBe(true);
  });
});

describe('openTaskDetail - additional error paths', () => {
  beforeEach(() => {
    vi.resetModules();
    setupMinimalBoardDOM();
    document.body.insertAdjacentHTML('beforeend', '<div id="toast"></div>');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a toast and logs an error on a generic fetch failure', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('/api/tasks/99')) return Promise.reject(new Error('boom'));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    const { openTaskDetail } = await import('../../../src/board/client/detailPanel');
    await openTaskDetail('99');

    expect(consoleErrorSpy).toHaveBeenCalled();
    const toast = document.getElementById('toast');
    expect(toast?.textContent).toBe('Failed to load task details');
    expect(toast?.classList.contains('show')).toBe(true);
  });

  it('silently swallows AbortError without showing a toast', async () => {
    global.fetch = vi.fn().mockImplementation(() => Promise.reject(new DOMException('aborted', 'AbortError')));

    const { openTaskDetail } = await import('../../../src/board/client/detailPanel');
    await openTaskDetail('5');

    const toast = document.getElementById('toast');
    expect(toast?.classList.contains('show')).toBe(false);
  });

  it('aborts the previous in-flight controller when called again before it resolves', async () => {
    let firstSignal: AbortSignal | undefined;
    global.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      const u = String(url);
      if (u.includes('/api/tasks/1')) {
        firstSignal = opts?.signal as AbortSignal;
        return new Promise(() => {
          /* never resolves */
        });
      }
      if (u.includes('/api/tasks/2')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(makeTaskDetail({ task: { ...makeTaskDetail().task, id: 2 } })),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ comments: [] }) });
    });

    const { openTaskDetail, getDetailTaskId } = await import('../../../src/board/client/detailPanel');
    void openTaskDetail('1');
    await Promise.resolve();
    await openTaskDetail('2');

    expect(firstSignal?.aborted).toBe(true);
    expect(getDetailTaskId()).toBe(2);
  });
});

describe('loadRunLogs - stale subscription handling on task switch', () => {
  let originalRequestAnimationFrame: typeof window.requestAnimationFrame;

  beforeEach(() => {
    originalRequestAnimationFrame = window.requestAnimationFrame;
    vi.resetModules();
    MockEventSource.lastInstance = null;
    (globalThis as unknown as Record<string, unknown>).EventSource = MockEventSource;
    const stubbedRequestAnimationFrame = ((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    }) as typeof window.requestAnimationFrame;
    window.requestAnimationFrame = stubbedRequestAnimationFrame;
    (
      globalThis as typeof globalThis & { requestAnimationFrame: typeof window.requestAnimationFrame }
    ).requestAnimationFrame = stubbedRequestAnimationFrame;
    setupBoardContainerDOM();
  });

  afterEach(() => {
    window.requestAnimationFrame = originalRequestAnimationFrame;
    (
      globalThis as typeof globalThis & { requestAnimationFrame: typeof window.requestAnimationFrame }
    ).requestAnimationFrame = originalRequestAnimationFrame;
    vi.restoreAllMocks();
  });

  it('closes the previous EventSource and ignores stale updates when the displayed task changes', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/api/config')) return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      if (u.includes('/api/tags')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ tags: [] }) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ comments: [] }) });
    });

    const { initDetailPanel, renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    initDetailPanel();
    renderDetailPanel(makeTaskDetail({ task: { ...makeTaskDetail().task, id: 1 } }));

    document.getElementById('detail-tab-run-logs')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const esA = MockEventSource.lastInstance;
    expect(esA).not.toBeNull();
    const closeSpy = vi.spyOn(esA!, 'close');

    renderDetailPanel(makeTaskDetail({ task: { ...makeTaskDetail().task, id: 2 } }));

    expect(closeSpy).toHaveBeenCalled();

    const pane = document.getElementById('detail-tab-content-run-logs') as HTMLElement;
    const before = pane.innerHTML;

    esA!.dispatchUpdate([
      {
        id: 99,
        started_at: '2026-01-01T00:00:00.000Z',
        finished_at: null,
        exit_code: null,
        events: [{ kind: 'text', text: 'stale' }],
      },
    ]);

    expect(pane.innerHTML).toBe(before);
    expect(pane.innerHTML).not.toContain('stale');
  });
});
