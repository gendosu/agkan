/**
 * @vitest-environment jsdom
 *
 * Tests for board client filters module
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isFiltersActive, applyFilters, renderFilterTagPills } from '../../../src/board/client/filters';
import { activeFilters } from '../../../src/board/client/boardPolling';

// Mock boardPolling.refreshBoardCards to avoid actual fetch calls
vi.mock('../../../src/board/client/boardPolling', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/board/client/boardPolling')>();
  return {
    ...actual,
    refreshBoardCards: vi.fn().mockResolvedValue(undefined),
  };
});

// Mock tags.loadAllTags to avoid fetch in initFilters
vi.mock('../../../src/board/client/tags', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/board/client/tags')>();
  return {
    ...actual,
    loadAllTags: vi.fn().mockResolvedValue(undefined),
    allAvailableTags: [
      { id: 1, name: 'bug' },
      { id: 2, name: 'feature' },
    ],
  };
});

function setupDOM(): void {
  document.body.innerHTML = `
    <button id="filter-clear" class="filter-clear-btn">Clear filters</button>
    <div id="filter-tags-control"></div>
  `;
}

beforeEach(() => {
  vi.restoreAllMocks();
  activeFilters.tagIds = [];
  activeFilters.priorities = [];
  activeFilters.assignee = '';
  setupDOM();
});

describe('isFiltersActive', () => {
  it('returns false when no filters are active', () => {
    expect(isFiltersActive()).toBe(false);
  });

  it('returns true when priorities are set', () => {
    activeFilters.priorities = ['high'];
    expect(isFiltersActive()).toBe(true);
  });

  it('returns true when tagIds are set', () => {
    activeFilters.tagIds = [1];
    expect(isFiltersActive()).toBe(true);
  });

  it('returns true when assignee is set', () => {
    activeFilters.assignee = 'alice';
    expect(isFiltersActive()).toBe(true);
  });

  it('returns false when all filters are cleared', () => {
    activeFilters.priorities = ['high'];
    activeFilters.priorities = [];
    expect(isFiltersActive()).toBe(false);
  });
});

describe('applyFilters', () => {
  it('adds "visible" class to clear button when filters are active', () => {
    activeFilters.priorities = ['high'];
    applyFilters();
    const btn = document.getElementById('filter-clear')!;
    expect(btn.classList.contains('visible')).toBe(true);
  });

  it('removes "visible" class from clear button when no filters are active', () => {
    const btn = document.getElementById('filter-clear')!;
    btn.classList.add('visible');
    applyFilters();
    expect(btn.classList.contains('visible')).toBe(false);
  });

  it('does not throw when filter-clear button does not exist', () => {
    document.body.innerHTML = '';
    expect(() => applyFilters()).not.toThrow();
  });
});

describe('renderFilterTagPills', () => {
  it('does not throw when filter-tags-control does not exist', () => {
    document.body.innerHTML = '';
    expect(() => renderFilterTagPills()).not.toThrow();
  });

  it('renders no pills when tagIds is empty', () => {
    renderFilterTagPills();
    const pills = document.querySelectorAll('.filter-tag-pill');
    expect(pills).toHaveLength(0);
  });

  it('renders pills for each active tag that exists in allAvailableTags', async () => {
    // Re-import with the mock in place
    const { allAvailableTags } = await import('../../../src/board/client/tags');
    activeFilters.tagIds = [allAvailableTags[0].id];
    renderFilterTagPills();
    const pills = document.querySelectorAll('.filter-tag-pill');
    expect(pills).toHaveLength(1);
    expect(pills[0].textContent).toContain(allAvailableTags[0].name);
  });

  it('skips tags not found in allAvailableTags', () => {
    activeFilters.tagIds = [9999];
    renderFilterTagPills();
    const pills = document.querySelectorAll('.filter-tag-pill');
    expect(pills).toHaveLength(0);
  });
});
