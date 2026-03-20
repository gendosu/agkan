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
} from '../../../src/board/client/boardPolling';

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
});

describe('registerDetailPanelCallbacks', () => {
  it('registers callbacks without throwing', () => {
    expect(() =>
      registerDetailPanelCallbacks({
        openTaskDetail: vi.fn(),
        renderDetailPanel: vi.fn(),
        showUpdateWarning: vi.fn(),
        getDetailTaskId: vi.fn().mockReturnValue(null),
      })
    ).not.toThrow();
  });
});
