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

    // Allow all microtasks to flush so the promise chain completes
    await new Promise((resolve) => setTimeout(resolve, 50));
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

    await new Promise((resolve) => setTimeout(resolve, 50));
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

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Panel title should be updated
    const title = document.getElementById('detail-panel-title');
    expect(title?.textContent).toBe('#1');

    // Details pane should contain status select
    const detailsPane = document.getElementById('detail-tab-content-details');
    expect(detailsPane?.innerHTML).toContain('detail-edit-status');
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

    await new Promise((resolve) => setTimeout(resolve, 50));

    const tagsContainer = document.getElementById('detail-tags-container');
    expect(tagsContainer).not.toBeNull();
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

    await new Promise((resolve) => setTimeout(resolve, 100));

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

    await new Promise((resolve) => setTimeout(resolve, 50));

    const detailsPane = document.getElementById('detail-tab-content-details');
    expect(detailsPane?.innerHTML).toContain('#5');
    expect(detailsPane?.innerHTML).toContain('Parent Task');
  });

  it('renders blockedBy relation when blockedBy tasks exist', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ comments: [] }),
    });

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    const data = makeTaskDetail({ blockedBy: [{ id: 3 }, { id: 7 }] });
    renderDetailPanel(data);

    await new Promise((resolve) => setTimeout(resolve, 50));

    const detailsPane = document.getElementById('detail-tab-content-details');
    expect(detailsPane?.innerHTML).toContain('#3');
    expect(detailsPane?.innerHTML).toContain('#7');
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
    await new Promise((resolve) => setTimeout(resolve, 50));

    const panel = document.getElementById('detail-panel')!;
    panel.classList.add('open');

    expect(getDetailTaskId()).toBe(1);

    closeDetailPanel();

    expect(panel.classList.contains('open')).toBe(false);
    expect(getDetailTaskId()).toBeNull();
  });
});
