/**
 * @vitest-environment jsdom
 *
 * Tests for board client filters module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isFiltersActive,
  applyFilters,
  renderFilterTagPills,
  initFilterBar,
  initFilters,
} from '../../../src/board/client/filters';
import { activeFilters, buildFilterParams } from '../../../src/board/client/boardPolling';

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
  activeFilters.searchText = '';
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

  it('returns true when searchText is set', () => {
    activeFilters.searchText = 'login';
    expect(isFiltersActive()).toBe(true);
  });

  it('returns false when searchText is empty string', () => {
    activeFilters.searchText = '';
    expect(isFiltersActive()).toBe(false);
  });
});

describe('buildFilterParams with search', () => {
  it('includes search param when searchText is set', () => {
    activeFilters.searchText = 'login';
    const params = buildFilterParams();
    expect(params.get('search')).toBe('login');
  });

  it('does not include search param when searchText is empty', () => {
    activeFilters.searchText = '';
    const params = buildFilterParams();
    expect(params.has('search')).toBe(false);
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

  it('clears stale pills before re-rendering', () => {
    document.body.innerHTML = '<div id="filter-tags-control"><span class="filter-tag-pill">stale</span></div>';
    renderFilterTagPills();
    const pills = document.querySelectorAll('.filter-tag-pill');
    expect(pills).toHaveLength(0);
  });

  it('removes tagId from activeFilters and re-renders pills when remove button is clicked', async () => {
    const { allAvailableTags } = await import('../../../src/board/client/tags');
    activeFilters.tagIds = [allAvailableTags[0].id, allAvailableTags[1].id];
    renderFilterTagPills();
    let pills = document.querySelectorAll('.filter-tag-pill');
    expect(pills).toHaveLength(2);

    const removeBtn = pills[0].querySelector<HTMLButtonElement>('.filter-tag-pill-remove')!;
    removeBtn.click();

    expect(activeFilters.tagIds).toEqual([allAvailableTags[1].id]);
    pills = document.querySelectorAll('.filter-tag-pill');
    expect(pills).toHaveLength(1);
    expect(pills[0].textContent).toContain(allAvailableTags[1].name);
  });
});

describe('initFilterBar', () => {
  function setupFilterBarDOM(): void {
    document.body.innerHTML = `
      <button id="filter-clear" class="filter-clear-btn">Clear filters</button>
      <div id="filter-tags-control"></div>
      <button class="filter-priority-btn" data-priority="high">High</button>
      <button class="filter-priority-btn" data-priority="medium">Medium</button>
      <input id="filter-search" type="text" />
      <input id="filter-assignee" type="text" />
    `;
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not throw when none of the filter bar elements exist', () => {
    document.body.innerHTML = '';
    expect(() => initFilterBar()).not.toThrow();
  });

  it('toggles priority filter and active class on button click', () => {
    setupFilterBarDOM();
    initFilterBar();
    const btn = document.querySelector<HTMLButtonElement>('.filter-priority-btn[data-priority="high"]')!;

    btn.click();
    expect(activeFilters.priorities).toContain('high');
    expect(btn.classList.contains('active')).toBe(true);

    btn.click();
    expect(activeFilters.priorities).not.toContain('high');
    expect(btn.classList.contains('active')).toBe(false);
  });

  it('updates searchText after debounce on search input', () => {
    vi.useFakeTimers();
    setupFilterBarDOM();
    initFilterBar();
    const searchInput = document.getElementById('filter-search') as HTMLInputElement;

    searchInput.value = 'login';
    searchInput.dispatchEvent(new Event('input'));
    expect(activeFilters.searchText).toBe('');

    vi.advanceTimersByTime(300);
    expect(activeFilters.searchText).toBe('login');
  });

  it('debounces repeated search input by clearing the previous timer', () => {
    vi.useFakeTimers();
    setupFilterBarDOM();
    initFilterBar();
    const searchInput = document.getElementById('filter-search') as HTMLInputElement;

    searchInput.value = 'lo';
    searchInput.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(100);
    searchInput.value = 'login';
    searchInput.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(300);

    expect(activeFilters.searchText).toBe('login');
  });

  it('updates assignee after debounce on assignee input', () => {
    vi.useFakeTimers();
    setupFilterBarDOM();
    initFilterBar();
    const assigneeInput = document.getElementById('filter-assignee') as HTMLInputElement;

    assigneeInput.value = 'alice';
    assigneeInput.dispatchEvent(new Event('input'));
    expect(activeFilters.assignee).toBe('');

    vi.advanceTimersByTime(300);
    expect(activeFilters.assignee).toBe('alice');
  });

  it('resets all filters and inputs when clear button is clicked', async () => {
    const { allAvailableTags } = await import('../../../src/board/client/tags');
    setupFilterBarDOM();
    initFilterBar();

    const priorityBtn = document.querySelector<HTMLButtonElement>('.filter-priority-btn[data-priority="high"]')!;
    priorityBtn.click();
    activeFilters.tagIds = [allAvailableTags[0].id];
    activeFilters.assignee = 'alice';
    activeFilters.searchText = 'login';
    const searchInput = document.getElementById('filter-search') as HTMLInputElement;
    const assigneeInput = document.getElementById('filter-assignee') as HTMLInputElement;
    searchInput.value = 'login';
    assigneeInput.value = 'alice';

    const clearBtn = document.getElementById('filter-clear')!;
    clearBtn.click();

    expect(activeFilters.tagIds).toEqual([]);
    expect(activeFilters.priorities).toEqual([]);
    expect(activeFilters.assignee).toBe('');
    expect(activeFilters.searchText).toBe('');
    expect(priorityBtn.classList.contains('active')).toBe(false);
    expect(searchInput.value).toBe('');
    expect(assigneeInput.value).toBe('');
  });

  describe('tag dropdown', () => {
    it('opens dropdown listing available tags on add button click, and closes on second click', () => {
      setupFilterBarDOM();
      initFilterBar();
      const tagsControl = document.getElementById('filter-tags-control')!;
      const addBtn = tagsControl.querySelector<HTMLButtonElement>('.filter-tag-add-btn')!;
      const dropdown = tagsControl.querySelector<HTMLElement>('.filter-tag-dropdown')!;

      addBtn.click();
      expect(dropdown.classList.contains('open')).toBe(true);
      const options = dropdown.querySelectorAll('.filter-tag-dropdown-option');
      expect(options.length).toBeGreaterThan(0);

      addBtn.click();
      expect(dropdown.classList.contains('open')).toBe(false);
    });

    it('shows empty message when no tags are available', async () => {
      const { allAvailableTags } = await import('../../../src/board/client/tags');
      activeFilters.tagIds = allAvailableTags.map((t) => t.id);
      setupFilterBarDOM();
      initFilterBar();
      const tagsControl = document.getElementById('filter-tags-control')!;
      const addBtn = tagsControl.querySelector<HTMLButtonElement>('.filter-tag-add-btn')!;

      addBtn.click();
      const empty = tagsControl.querySelector('.filter-tag-dropdown-empty');
      expect(empty).not.toBeNull();
      expect(empty!.textContent).toBe('No tags available');
    });

    it('adds tag to activeFilters and closes dropdown when an option is selected', async () => {
      const { allAvailableTags } = await import('../../../src/board/client/tags');
      setupFilterBarDOM();
      initFilterBar();
      const tagsControl = document.getElementById('filter-tags-control')!;
      const addBtn = tagsControl.querySelector<HTMLButtonElement>('.filter-tag-add-btn')!;
      const dropdown = tagsControl.querySelector<HTMLElement>('.filter-tag-dropdown')!;

      addBtn.click();
      const option = dropdown.querySelector<HTMLElement>('.filter-tag-dropdown-option')!;
      option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

      expect(activeFilters.tagIds).toContain(allAvailableTags[0].id);
      expect(dropdown.classList.contains('open')).toBe(false);
    });

    it('closes dropdown when clicking outside of it', () => {
      setupFilterBarDOM();
      initFilterBar();
      const tagsControl = document.getElementById('filter-tags-control')!;
      const addBtn = tagsControl.querySelector<HTMLButtonElement>('.filter-tag-add-btn')!;
      const dropdown = tagsControl.querySelector<HTMLElement>('.filter-tag-dropdown')!;

      addBtn.click();
      expect(dropdown.classList.contains('open')).toBe(true);

      document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(dropdown.classList.contains('open')).toBe(false);
    });
  });
});

describe('initFilters', () => {
  it('loads tags then initializes the filter bar', async () => {
    document.body.innerHTML = '<button class="filter-priority-btn" data-priority="high">High</button>';
    const { loadAllTags } = await import('../../../src/board/client/tags');
    (loadAllTags as unknown as { mockResolvedValue: (v: undefined) => void }).mockResolvedValue(undefined);

    initFilters();
    await Promise.resolve();
    await Promise.resolve();

    expect(loadAllTags).toHaveBeenCalled();

    const btn = document.querySelector<HTMLButtonElement>('.filter-priority-btn[data-priority="high"]')!;
    btn.click();
    expect(activeFilters.priorities).toContain('high');
    expect(btn.classList.contains('active')).toBe(true);
  });
});
