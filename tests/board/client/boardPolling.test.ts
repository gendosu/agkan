/**
 * @vitest-environment jsdom
 *
 * Tests for board client boardPolling module
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getLastUpdatedAt,
  setLastUpdatedAt,
  activeFilters,
  buildFilterParams,
  registerDetailPanelCallbacks,
  refreshBoardCards,
  pollBoardUpdates,
  applyIncrementalCardUpdate,
} from '../../../src/board/client/boardPolling';
import { updateButtonStates } from '../../../src/board/client/claudeButton';
import * as dragDropModule from '../../../src/board/client/dragDrop';

beforeEach(() => {
  vi.restoreAllMocks();
  // Reset activeFilters state
  activeFilters.tagIds = [];
  activeFilters.priorities = [];
  activeFilters.assignee = '';
  // Reset lastUpdatedAt
  setLastUpdatedAt(null);
  // Reset DOM
  document.body.innerHTML = '';
});

describe('getLastUpdatedAt / setLastUpdatedAt', () => {
  it('returns null by default', () => {
    expect(getLastUpdatedAt()).toBeNull();
  });

  it('returns the value set by setLastUpdatedAt', () => {
    setLastUpdatedAt('2026-01-01T00:00:00.000Z');
    expect(getLastUpdatedAt()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('can be reset to null', () => {
    setLastUpdatedAt('something');
    setLastUpdatedAt(null);
    expect(getLastUpdatedAt()).toBeNull();
  });
});

describe('buildFilterParams', () => {
  it('returns empty URLSearchParams when no filters are active', () => {
    const params = buildFilterParams();
    expect(params.toString()).toBe('');
  });

  it('includes priority when priorities are set', () => {
    activeFilters.priorities = ['high', 'critical'];
    const params = buildFilterParams();
    expect(params.get('priority')).toBe('high,critical');
  });

  it('includes tags when tagIds are set', () => {
    activeFilters.tagIds = [1, 3, 5];
    const params = buildFilterParams();
    expect(params.get('tags')).toBe('1,3,5');
  });

  it('includes assignee when assignee is set', () => {
    activeFilters.assignee = 'alice';
    const params = buildFilterParams();
    expect(params.get('assignee')).toBe('alice');
  });

  it('does not include assignee when assignee is empty string', () => {
    activeFilters.assignee = '';
    const params = buildFilterParams();
    expect(params.has('assignee')).toBe(false);
  });

  it('combines multiple active filters', () => {
    activeFilters.priorities = ['low'];
    activeFilters.tagIds = [2];
    activeFilters.assignee = 'bob';
    const params = buildFilterParams();
    expect(params.get('priority')).toBe('low');
    expect(params.get('tags')).toBe('2');
    expect(params.get('assignee')).toBe('bob');
  });
});

describe('refreshBoardCards', () => {
  beforeEach(() => {
    // Set up minimal DOM needed by refreshBoardCards / updateColumnHtml
    document.body.innerHTML = `
      <div class="column" data-status="backlog">
        <span class="column-count">0</span>
        <div class="column-body" id="col-backlog"></div>
      </div>
    `;
  });

  it('does nothing and does not throw when fetch fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    await expect(refreshBoardCards()).resolves.toBeUndefined();
  });

  it('does nothing when response is not ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false });
    await expect(refreshBoardCards()).resolves.toBeUndefined();
  });

  it('updates column HTML when fetch succeeds', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        columns: [{ status: 'backlog', html: '<div class="card">New Card</div>', count: 1 }],
      }),
    } as unknown as Response);

    await refreshBoardCards();

    const colBody = document.getElementById('col-backlog')!;
    expect(colBody.innerHTML).toContain('New Card');
  });

  it('updates column count when fetch succeeds', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        columns: [{ status: 'backlog', html: '', count: 5 }],
      }),
    } as unknown as Response);

    await refreshBoardCards();

    const countEl = document.querySelector('.column-count')!;
    expect(countEl.textContent).toBe('5');
  });

  it('immediately disables run buttons when a running task exists after DOM update', async () => {
    // Simulate a running task (task id 99) already tracked
    updateButtonStates(new Set([99]));

    // New card with a run-split button for task id 1 arrives via polling
    const newCardHtml = `<div class="card" data-id="1" data-status="ready" data-updated-at="2026-01-01T00:00:00.000Z">
      <div class="claude-run-split" data-task-id="1">
        <button class="claude-run-btn">Run</button>
      </div>
    </div>`;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        columns: [{ status: 'backlog', html: newCardHtml, count: 1 }],
      }),
    } as unknown as Response);

    await refreshBoardCards();

    const runBtn = document.querySelector<HTMLButtonElement>('.claude-run-btn')!;
    expect(runBtn.disabled).toBe(true);
  });

  it('does not refresh detail pane while run-logs tab is active', async () => {
    const renderDetailPanel = vi.fn();

    registerDetailPanelCallbacks({
      openTaskDetail: vi.fn(),
      renderDetailPanel,
      showUpdateWarning: vi.fn(),
      getDetailTaskId: vi.fn().mockReturnValue(1),
      getDetailActiveTab: vi.fn().mockReturnValue('run-logs'),
      setActiveCard: vi.fn(),
    });

    const fetchCalls: string[] = [];
    global.fetch = vi.fn().mockImplementation((url: string) => {
      fetchCalls.push(String(url));
      return Promise.resolve({
        ok: true,
        json: vi.fn().mockResolvedValue({
          columns: [{ status: 'backlog', html: '', count: 0 }],
        }),
      });
    });

    await refreshBoardCards();

    expect(renderDetailPanel).not.toHaveBeenCalled();
    expect(fetchCalls.some((u) => u.includes('/api/tasks/1'))).toBe(false);
  });
});

describe('pollBoardUpdates', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="column" data-status="backlog">
        <span class="column-count">0</span>
        <div class="column-body" id="col-backlog"></div>
      </div>
      <div id="detail-panel"></div>
    `;
  });

  it('does not call location.reload() when an update is detected', async () => {
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { reload: reloadMock },
      writable: true,
    });

    setLastUpdatedAt('2026-01-01T00:00:00.000Z');

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('updated-at')) {
        return Promise.resolve({
          ok: true,
          json: vi.fn().mockResolvedValue({ updatedAt: '2026-01-02T00:00:00.000Z' }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: vi.fn().mockResolvedValue({ columns: [] }),
      });
    });

    await pollBoardUpdates();

    expect(reloadMock).not.toHaveBeenCalled();
  });

  it('calls refreshBoardCards (not reload) when an update is detected with detail panel closed', async () => {
    setLastUpdatedAt('2026-01-01T00:00:00.000Z');

    const fetchCalls: string[] = [];
    global.fetch = vi.fn().mockImplementation((url: string) => {
      fetchCalls.push(String(url));
      if (String(url).includes('updated-at')) {
        return Promise.resolve({
          ok: true,
          json: vi.fn().mockResolvedValue({ updatedAt: '2026-01-02T00:00:00.000Z' }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: vi.fn().mockResolvedValue({ columns: [] }),
      });
    });

    await pollBoardUpdates();

    expect(fetchCalls.some((u) => u.includes('board/cards'))).toBe(true);
  });

  it('skips polling when isPendingStatusUpdate is true', async () => {
    setLastUpdatedAt('2026-01-01T00:00:00.000Z');
    vi.spyOn(dragDropModule, 'isPendingStatusUpdate', 'get').mockReturnValue(true);

    global.fetch = vi.fn();

    await pollBoardUpdates();

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('resumes polling after isPendingStatusUpdate clears to false', async () => {
    setLastUpdatedAt('2026-01-01T00:00:00.000Z');
    vi.spyOn(dragDropModule, 'isPendingStatusUpdate', 'get').mockReturnValue(false);

    const fetchCalls: string[] = [];
    global.fetch = vi.fn().mockImplementation((url: string) => {
      fetchCalls.push(String(url));
      if (String(url).includes('updated-at')) {
        return Promise.resolve({
          ok: true,
          json: vi.fn().mockResolvedValue({ updatedAt: '2026-01-02T00:00:00.000Z' }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: vi.fn().mockResolvedValue({ columns: [] }),
      });
    });

    await pollBoardUpdates();

    expect(fetchCalls.some((u) => u.includes('updated-at'))).toBe(true);
  });
});

describe('registerDetailPanelCallbacks', () => {
  it('registers callbacks without throwing', () => {
    expect(() =>
      registerDetailPanelCallbacks({
        openTaskDetail: vi.fn(),
        renderDetailPanel: vi.fn(),
        showUpdateWarning: vi.fn(),
        getDetailTaskId: vi.fn().mockReturnValue(null),
        getDetailActiveTab: vi.fn().mockReturnValue('details'),
        setActiveCard: vi.fn(),
      })
    ).not.toThrow();
  });
});

describe('applyIncrementalCardUpdate', () => {
  function makeBody(): HTMLElement {
    const body = document.createElement('div');
    body.className = 'column-body';
    document.body.appendChild(body);
    return body;
  }

  function makeCardHtml(id: string, title: string, updatedAt = '2026-01-01T00:00:00.000Z'): string {
    return `<div class="card" data-id="${id}" data-status="backlog" data-updated-at="${updatedAt}"><div class="card-title">${title}</div></div>`;
  }

  it('inserts cards into an empty column body', () => {
    const body = makeBody();
    applyIncrementalCardUpdate(body, makeCardHtml('1', 'Task One'));
    expect(body.querySelectorAll('.card')).toHaveLength(1);
    expect(body.querySelector('[data-id="1"]')?.querySelector('.card-title')?.textContent).toBe('Task One');
  });

  it('does not replace existing card DOM element when content is unchanged', () => {
    const body = makeBody();
    applyIncrementalCardUpdate(body, makeCardHtml('1', 'Task One'));
    const originalCard = body.querySelector('[data-id="1"]') as HTMLElement;

    // Apply same HTML again — existing node should be reused
    applyIncrementalCardUpdate(body, makeCardHtml('1', 'Task One'));
    const afterCard = body.querySelector('[data-id="1"]') as HTMLElement;
    expect(afterCard).toBe(originalCard);
  });

  it('replaces existing card DOM element when updated-at changes', () => {
    const body = makeBody();
    applyIncrementalCardUpdate(body, makeCardHtml('1', 'Task One', '2026-01-01T00:00:00.000Z'));
    const originalCard = body.querySelector('[data-id="1"]') as HTMLElement;

    // Apply with new updated-at — node should be replaced
    applyIncrementalCardUpdate(body, makeCardHtml('1', 'Task One Updated', '2026-01-02T00:00:00.000Z'));
    const afterCard = body.querySelector('[data-id="1"]') as HTMLElement;
    expect(afterCard).not.toBe(originalCard);
    expect(afterCard?.querySelector('.card-title')?.textContent).toBe('Task One Updated');
  });

  it('removes cards that are no longer present in new HTML', () => {
    const body = makeBody();
    const html = makeCardHtml('1', 'Task One') + makeCardHtml('2', 'Task Two');
    applyIncrementalCardUpdate(body, html);
    expect(body.querySelectorAll('.card')).toHaveLength(2);

    // Apply with only card 1 — card 2 should be removed
    applyIncrementalCardUpdate(body, makeCardHtml('1', 'Task One'));
    expect(body.querySelectorAll('.card')).toHaveLength(1);
    expect(body.querySelector('[data-id="2"]')).toBeNull();
  });

  it('adds new cards that appear in new HTML', () => {
    const body = makeBody();
    applyIncrementalCardUpdate(body, makeCardHtml('1', 'Task One'));
    expect(body.querySelectorAll('.card')).toHaveLength(1);

    // Apply with two cards — card 2 should be added
    const html = makeCardHtml('1', 'Task One') + makeCardHtml('2', 'Task Two');
    applyIncrementalCardUpdate(body, html);
    expect(body.querySelectorAll('.card')).toHaveLength(2);
    expect(body.querySelector('[data-id="2"]')).not.toBeNull();
  });

  it('reorders cards to match the new order without replacing unchanged elements', () => {
    const body = makeBody();
    const html = makeCardHtml('1', 'First') + makeCardHtml('2', 'Second');
    applyIncrementalCardUpdate(body, html);
    const card1Before = body.querySelector('[data-id="1"]') as HTMLElement;
    const card2Before = body.querySelector('[data-id="2"]') as HTMLElement;

    // Reverse order — no updated-at change, so elements should be reused but reordered
    const reversedHtml = makeCardHtml('2', 'Second') + makeCardHtml('1', 'First');
    applyIncrementalCardUpdate(body, reversedHtml);

    const cards = body.querySelectorAll('.card');
    expect(cards[0]).toBe(card2Before);
    expect(cards[1]).toBe(card1Before);
  });

  it('clears all cards when new HTML is empty', () => {
    const body = makeBody();
    applyIncrementalCardUpdate(body, makeCardHtml('1', 'Task One') + makeCardHtml('2', 'Task Two'));
    expect(body.querySelectorAll('.card')).toHaveLength(2);

    applyIncrementalCardUpdate(body, '');
    expect(body.querySelectorAll('.card')).toHaveLength(0);
  });

  it('handles cards without data-id by inserting them as new elements', () => {
    const body = makeBody();
    const noIdHtml = `<div class="card" data-status="backlog"><div class="card-title">No ID</div></div>`;
    applyIncrementalCardUpdate(body, noIdHtml);
    expect(body.querySelectorAll('.card')).toHaveLength(1);
  });

  it('preserves existing unchanged cards across multiple rapid updates (no flicker)', () => {
    const body = makeBody();
    const initialHtml = makeCardHtml('1', 'Card 1') + makeCardHtml('2', 'Card 2') + makeCardHtml('3', 'Card 3');
    applyIncrementalCardUpdate(body, initialHtml);

    const card1 = body.querySelector('[data-id="1"]') as HTMLElement;
    const card2 = body.querySelector('[data-id="2"]') as HTMLElement;
    const card3 = body.querySelector('[data-id="3"]') as HTMLElement;

    // Simulate rapid re-polls with no data changes
    applyIncrementalCardUpdate(body, initialHtml);
    applyIncrementalCardUpdate(body, initialHtml);
    applyIncrementalCardUpdate(body, initialHtml);

    // All DOM elements must be the same references (no re-creation = no flicker)
    expect(body.querySelector('[data-id="1"]')).toBe(card1);
    expect(body.querySelector('[data-id="2"]')).toBe(card2);
    expect(body.querySelector('[data-id="3"]')).toBe(card3);
  });
});
