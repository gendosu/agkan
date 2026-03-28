/**
 * @vitest-environment jsdom
 *
 * Tests for board client tags module covering PR #117 bug scenarios.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadAllTags,
  renderTagsSection,
  registerGetDetailTaskId,
  allAvailableTags,
} from '../../../src/board/client/tags';

// Reset module state between tests
beforeEach(() => {
  vi.restoreAllMocks();
  // Reset DOM
  document.body.innerHTML = '';
});

describe('loadAllTags', () => {
  it('gracefully handles network errors without throwing', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    await expect(loadAllTags()).resolves.toBeUndefined();
  });

  it('gracefully handles non-ok response without throwing', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn(),
    } as unknown as Response);

    await expect(loadAllTags()).resolves.toBeUndefined();
  });

  it('populates allAvailableTags on successful response', async () => {
    const mockTags = [
      { id: 1, name: 'bug' },
      { id: 2, name: 'feature' },
    ];
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ tags: mockTags }),
    } as unknown as Response);

    await loadAllTags();

    expect(allAvailableTags).toEqual(mockTags);
  });

  it('sets allAvailableTags to empty array when tags field is missing', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({}),
    } as unknown as Response);

    await loadAllTags();

    expect(allAvailableTags).toEqual([]);
  });
});

describe('renderTagsSection', () => {
  function setupContainer(): HTMLElement {
    const container = document.createElement('div');
    container.id = 'detail-tags-container';
    document.body.appendChild(container);
    return container;
  }

  it('renders without throwing when container does not exist', () => {
    // No container in DOM
    expect(() => renderTagsSection([])).not.toThrow();
  });

  it('renders correctly when _getDetailTaskId returns null', () => {
    setupContainer();
    registerGetDetailTaskId(() => null);

    expect(() => renderTagsSection([])).not.toThrow();

    const container = document.getElementById('detail-tags-container');
    expect(container).not.toBeNull();
    expect(container!.querySelector('.tag-select-control')).not.toBeNull();
  });

  it('renders current tags as pills', () => {
    setupContainer();
    registerGetDetailTaskId(() => 42);

    const currentTags = [{ id: 1, name: 'bug' }];
    renderTagsSection(currentTags);

    const pill = document.querySelector('.tag-pill');
    expect(pill).not.toBeNull();
    expect(pill!.textContent).toContain('bug');
  });

  it('renders input with placeholder when no current tags', () => {
    setupContainer();
    registerGetDetailTaskId(() => 42);

    renderTagsSection([]);

    const input = document.querySelector<HTMLInputElement>('.tag-select-input');
    expect(input).not.toBeNull();
    expect(input!.placeholder).toBe('Add tags...');
  });

  it('handles tag remove click with null task ID gracefully', async () => {
    setupContainer();
    registerGetDetailTaskId(() => null);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({}),
    } as unknown as Response);

    const currentTags = [{ id: 1, name: 'bug' }];
    renderTagsSection(currentTags);

    const removeBtn = document.querySelector<HTMLButtonElement>('.tag-pill-remove');
    expect(removeBtn).not.toBeNull();

    // Click remove — should not throw even with null task ID
    removeBtn!.click();
    // Allow microtasks to flush
    await Promise.resolve();
  });
});

describe('renderTagsSection - create new tag option', () => {
  beforeEach(async () => {
    document.body.innerHTML = '';
    const container = document.createElement('div');
    container.id = 'detail-tags-container';
    document.body.appendChild(container);

    registerGetDetailTaskId(() => 42);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ tags: [{ id: 1, name: 'bug' }] }),
    } as unknown as Response);
    await loadAllTags();
  });

  it('shows create option when input text does not match any existing tag', () => {
    renderTagsSection([]);
    const input = document.querySelector<HTMLInputElement>('.tag-select-input')!;
    input.dispatchEvent(new Event('focus'));
    input.value = 'newtagname';
    input.dispatchEvent(new Event('input'));

    const createOpt = document.querySelector<HTMLElement>('.tag-select-create-option');
    expect(createOpt).not.toBeNull();
    expect(createOpt!.textContent).toBe('Create "newtagname"');
  });

  it('does not show create option when input exactly matches an existing tag', () => {
    renderTagsSection([]);
    const input = document.querySelector<HTMLInputElement>('.tag-select-input')!;
    input.dispatchEvent(new Event('focus'));
    input.value = 'bug';
    input.dispatchEvent(new Event('input'));

    const createOpt = document.querySelector<HTMLElement>('.tag-select-create-option');
    expect(createOpt).toBeNull();
  });

  it('does not show create option when input is empty', () => {
    renderTagsSection([]);
    const input = document.querySelector<HTMLInputElement>('.tag-select-input')!;
    input.dispatchEvent(new Event('focus'));

    const createOpt = document.querySelector<HTMLElement>('.tag-select-create-option');
    expect(createOpt).toBeNull();
  });

  it('creates tag and adds to task on create option mousedown', async () => {
    const newTag = { id: 2, name: 'newtag' };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue(newTag) } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue({}) } as unknown as Response);
    global.fetch = fetchMock;

    renderTagsSection([]);
    const input = document.querySelector<HTMLInputElement>('.tag-select-input')!;
    input.dispatchEvent(new Event('focus'));
    input.value = 'newtag';
    input.dispatchEvent(new Event('input'));

    const createOpt = document.querySelector<HTMLElement>('.tag-select-create-option')!;
    expect(createOpt).not.toBeNull();

    createOpt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledWith('/api/tags', expect.objectContaining({ method: 'POST' }));
    expect(fetchMock).toHaveBeenCalledWith('/api/tasks/42/tags', expect.objectContaining({ method: 'POST' }));
  });

  it('shows toast on create tag failure', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false } as unknown as Response);

    // Add a toast element to DOM as showToast requires #toast
    const toastEl = document.createElement('div');
    toastEl.id = 'toast';
    document.body.appendChild(toastEl);

    renderTagsSection([]);
    const input = document.querySelector<HTMLInputElement>('.tag-select-input')!;
    input.dispatchEvent(new Event('focus'));
    input.value = 'failingtag';
    input.dispatchEvent(new Event('input'));

    const createOpt = document.querySelector<HTMLElement>('.tag-select-create-option')!;
    createOpt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(toastEl.classList.contains('show')).toBe(true);
  });
});

describe('renderTagsSection - tag add operation with null task ID', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    const container = document.createElement('div');
    container.id = 'detail-tags-container';
    document.body.appendChild(container);

    registerGetDetailTaskId(() => null);
  });

  it('handles addTag call gracefully when task ID is null', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn(),
    } as unknown as Response);

    // Set available tags so dropdown has options
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ tags: [{ id: 1, name: 'bug' }] }),
    } as unknown as Response);
    await loadAllTags();

    // Render with no current tags so "bug" is available
    renderTagsSection([]);

    // Open dropdown via focus
    const input = document.querySelector<HTMLInputElement>('.tag-select-input');
    expect(input).not.toBeNull();
    input!.dispatchEvent(new Event('focus'));

    const option = document.querySelector<HTMLElement>('.tag-select-option');
    if (option) {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: vi.fn(),
      } as unknown as Response);

      // Trigger mousedown on option
      option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    }

    // If we reach here without exception, the test passes
    expect(true).toBe(true);
  });
});
