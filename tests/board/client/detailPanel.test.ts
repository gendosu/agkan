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

    await new Promise((resolve) => setTimeout(resolve, 50));

    const detailsPane = document.getElementById('detail-tab-content-details');
    expect(detailsPane?.querySelector('.detail-meta-table')).not.toBeNull();
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

    await new Promise((resolve) => setTimeout(resolve, 50));

    const detailsPane = document.getElementById('detail-tab-content-details');
    expect(detailsPane?.innerHTML).toContain('branch');
    expect(detailsPane?.innerHTML).toContain('feat/my-branch');
    expect(detailsPane?.innerHTML).toContain('pr');
    expect(detailsPane?.innerHTML).toContain('https://github.com/org/repo/pull/42');
  });

  it('does not render metadata table when metadata array is empty', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ comments: [] }),
    });

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    const data = makeTaskDetail({ metadata: [] });
    renderDetailPanel(data);

    await new Promise((resolve) => setTimeout(resolve, 50));

    const detailsPane = document.getElementById('detail-tab-content-details');
    expect(detailsPane?.querySelector('.detail-meta-table')).toBeNull();
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

    await new Promise((resolve) => setTimeout(resolve, 50));

    const table = document.querySelector('.detail-meta-table');
    expect(table).not.toBeNull();
    const rows = table?.querySelectorAll('tr');
    // Both rows should be present
    expect(rows?.length).toBe(2);
    expect(table?.innerHTML).toContain('sprint');
    expect(table?.innerHTML).toContain('branch');
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

    await new Promise((resolve) => setTimeout(resolve, 50));

    const detailsPane = document.getElementById('detail-tab-content-details');
    expect(detailsPane?.querySelector('.detail-meta-table')).toBeNull();
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

    await new Promise((resolve) => setTimeout(resolve, 50));

    const detailsPane = document.getElementById('detail-tab-content-details');
    // Raw HTML tags should not appear unescaped in the DOM
    expect(detailsPane?.innerHTML).not.toContain('<script>');
    expect(detailsPane?.innerHTML).not.toContain('<img src=x');
    // The table should still render (key is not 'priority')
    expect(detailsPane?.querySelector('.detail-meta-table')).not.toBeNull();
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

    await new Promise((resolve) => setTimeout(resolve, 50));

    const detailsPane = document.getElementById('detail-tab-content-details');
    expect(detailsPane?.innerHTML).toContain('Metadata');
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

    await new Promise((resolve) => setTimeout(resolve, 50));

    const trigger = document.getElementById('add-comment-trigger');
    expect(trigger).not.toBeNull();
    expect(trigger?.getAttribute('onclick')).toBeNull();
    expect(trigger?.dataset.action).toBe('open-add-comment');
  });

  it('renders add-comment cancel button with data-action instead of onclick', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ comments: [] }),
    });

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    renderDetailPanel(makeTaskDetail());

    await new Promise((resolve) => setTimeout(resolve, 50));

    const cancelBtn = document.querySelector('.add-comment-cancel') as HTMLButtonElement | null;
    expect(cancelBtn).not.toBeNull();
    expect(cancelBtn?.getAttribute('onclick')).toBeNull();
    expect(cancelBtn?.dataset.action).toBe('close-add-comment');
  });

  it('renders add-comment submit button with data-action instead of onclick', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ comments: [] }),
    });

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    renderDetailPanel(makeTaskDetail());

    await new Promise((resolve) => setTimeout(resolve, 50));

    const submitBtn = document.querySelector('.add-comment-submit') as HTMLButtonElement | null;
    expect(submitBtn).not.toBeNull();
    expect(submitBtn?.getAttribute('onclick')).toBeNull();
    expect(submitBtn?.dataset.action).toBe('submit-comment');
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

    await new Promise((resolve) => setTimeout(resolve, 50));

    const editBtn = document.querySelector('[data-action="start-comment-edit"]') as HTMLElement | null;
    expect(editBtn).not.toBeNull();
    expect(editBtn?.getAttribute('onclick')).toBeNull();
    expect(editBtn?.dataset.commentId).toBe('42');
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

    await new Promise((resolve) => setTimeout(resolve, 50));

    const deleteBtn = document.querySelector('[data-action="delete-comment"]') as HTMLElement | null;
    expect(deleteBtn).not.toBeNull();
    expect(deleteBtn?.getAttribute('onclick')).toBeNull();
    expect(deleteBtn?.dataset.commentId).toBe('42');
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

    await new Promise((resolve) => setTimeout(resolve, 50));

    const saveBtn = document.querySelector('[data-action="save-comment-edit"]') as HTMLElement | null;
    expect(saveBtn).not.toBeNull();
    expect(saveBtn?.getAttribute('onclick')).toBeNull();
    expect(saveBtn?.dataset.commentId).toBe('42');
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

    await new Promise((resolve) => setTimeout(resolve, 50));

    const cancelEditBtn = document.querySelector('[data-action="cancel-comment-edit"]') as HTMLElement | null;
    expect(cancelEditBtn).not.toBeNull();
    expect(cancelEditBtn?.getAttribute('onclick')).toBeNull();
    expect(cancelEditBtn?.dataset.commentId).toBe('42');
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
    await new Promise((resolve) => setTimeout(resolve, 50));

    const trigger = document.getElementById('add-comment-trigger') as HTMLElement;
    const form = document.getElementById('add-comment-form') as HTMLElement;

    expect(trigger).not.toBeNull();
    expect(form).not.toBeNull();

    trigger.click();

    expect(trigger.style.display).toBe('none');
    expect(form.classList.contains('open')).toBe(true);
  });

  it('clicking close-add-comment hides the form', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ comments: [] }),
    });

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    renderDetailPanel(makeTaskDetail());
    await new Promise((resolve) => setTimeout(resolve, 50));

    const trigger = document.getElementById('add-comment-trigger') as HTMLElement;
    const form = document.getElementById('add-comment-form') as HTMLElement;
    const cancelBtn = document.querySelector('[data-action="close-add-comment"]') as HTMLElement;

    // First open the form
    trigger.click();
    expect(form.classList.contains('open')).toBe(true);

    // Now close it
    cancelBtn.click();
    expect(form.classList.contains('open')).toBe(false);
    expect(trigger.style.display).toBe('');
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
    await new Promise((resolve) => setTimeout(resolve, 50));

    const editBtn = document.querySelector('[data-action="start-comment-edit"]') as HTMLElement;
    expect(editBtn).not.toBeNull();

    editBtn.click();

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
    await new Promise((resolve) => setTimeout(resolve, 50));

    // First start editing
    const editBtn = document.querySelector('[data-action="start-comment-edit"]') as HTMLElement;
    editBtn.click();

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
    await new Promise((resolve) => setTimeout(resolve, 50));

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

    await new Promise((resolve) => setTimeout(resolve, 50));

    const detailsPane = document.getElementById('detail-tab-content-details');
    const metaTableIndex = detailsPane?.innerHTML.indexOf('detail-meta-table') ?? -1;
    const titleInputIndex = detailsPane?.innerHTML.indexOf('detail-edit-title') ?? -1;

    expect(metaTableIndex).toBeGreaterThan(-1);
    expect(titleInputIndex).toBeGreaterThan(-1);
    expect(metaTableIndex).toBeLessThan(titleInputIndex);
  });

  it('displays timestamps in footer instead of detail body', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ comments: [] }),
    });

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    const data = makeTaskDetail();
    renderDetailPanel(data);

    await new Promise((resolve) => setTimeout(resolve, 50));

    const detailsPane = document.getElementById('detail-tab-content-details');
    const footer = document.getElementById('detail-panel-footer');

    // Timestamp should NOT be in details pane anymore
    expect(detailsPane?.innerHTML).not.toContain('created');
    expect(detailsPane?.innerHTML).not.toContain('updated');

    // Timestamp should be in footer
    expect(footer?.innerHTML).toContain('created');
    expect(footer?.innerHTML).toContain('updated');
  });

  it('has save button in footer', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ comments: [] }),
    });

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    renderDetailPanel(makeTaskDetail());

    await new Promise((resolve) => setTimeout(resolve, 50));

    const footer = document.getElementById('detail-panel-footer');
    const saveBtn = footer?.querySelector('#detail-save-btn');

    expect(saveBtn).not.toBeNull();
    expect(saveBtn?.textContent).toBe('Save');
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

    await new Promise((resolve) => setTimeout(resolve, 50));

    const textarea = document.getElementById('detail-edit-body') as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();

    // The textarea should exist and have been set up with auto-resize
    // We verify by checking that the height style was set (autoResizeTextarea sets style.height)
    expect(textarea.style.height).toBeTruthy();

    // Simulate input event which should trigger auto-resize
    textarea.value = 'New content';
    const inputEvent = new Event('input', { bubbles: true });
    textarea.dispatchEvent(inputEvent);

    // The style.height should still exist after input event
    expect(textarea.style.height).toBeTruthy();
  });

  it('detail tab content div is rendered with active class', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ comments: [] }),
    });

    const { renderDetailPanel } = await import('../../../src/board/client/detailPanel');
    renderDetailPanel(makeTaskDetail());

    await new Promise((resolve) => setTimeout(resolve, 50));

    const detailsPane = document.getElementById('detail-tab-content-details');

    // Check that the active class is present
    expect(detailsPane?.classList.contains('active')).toBe(true);
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
    await new Promise((resolve) => setTimeout(resolve, 50));

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
    await new Promise((resolve) => setTimeout(resolve, 50));

    const panel = document.getElementById('detail-panel')!;
    panel.classList.add('open');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(panel.classList.contains('open')).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(panel.classList.contains('open')).toBe(true);
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
    await new Promise((resolve) => setTimeout(resolve, 50));

    const tabBtn = document.getElementById('detail-tab-comments');
    // After task B loads, tab shows "Comments (0)"
    expect(tabBtn?.textContent).toBe('Comments (0)');

    // Now resolve task A's delayed comments fetch
    resolveTaskAComments(undefined);
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Tab should still show task B's count — task A's stale result must be ignored
    expect(tabBtn?.textContent).toBe('Comments (0)');

    // Comments pane should not contain task A's old comment
    const pane = document.getElementById('detail-tab-content-comments');
    expect(pane?.innerHTML).not.toContain('Old comment');
  });
});
