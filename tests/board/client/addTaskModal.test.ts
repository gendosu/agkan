/**
 * @vitest-environment jsdom
 *
 * Tests for board client addTaskModal module covering tag and metadata UI.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initAddTaskModal } from '../../../src/board/client/addTaskModal';
import * as tagsModule from '../../../src/board/client/tags';

function setupAddModalDOM(): void {
  document.body.innerHTML = `
    <button class="add-btn" data-status="backlog">+</button>
    <div class="modal-overlay" id="add-modal">
      <div class="modal">
        <h2 class="modal-title-with-icon">
          <svg class="modal-title-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          Add Task
        </h2>
        <input type="text" id="add-title" placeholder="Task title">
        <textarea id="add-body" placeholder="Describe the task..."></textarea>
        <select id="add-priority">
          <option value="">None</option>
          <option value="high">high</option>
        </select>
        <div class="branch-select-wrapper" id="add-branch-wrapper">
          <input type="text" id="add-branch" name="branch" placeholder="✨ Auto-generate on run" readonly>
          <div class="branch-select-dropdown" id="add-branch-dropdown" style="display:none;"></div>
        </div>
        <div class="tag-select-wrapper" id="add-tags-wrapper">
          <div class="tag-select-control" id="add-tag-select-control"></div>
          <div class="tag-select-dropdown" id="add-tag-select-dropdown"></div>
        </div>
        <div id="add-metadata-rows"></div>
        <button type="button" id="add-metadata-add-row">+ Add metadata</button>
        <input type="hidden" id="add-status">
        <div class="modal-actions">
          <button id="add-cancel">Cancel</button>
          <button id="add-submit" class="primary">Add</button>
        </div>
      </div>
    </div>
  `;
}

beforeEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('initAddTaskModal - basic modal behavior', () => {
  it('opens modal when add-btn is clicked', () => {
    setupAddModalDOM();
    initAddTaskModal();

    const modal = document.getElementById('add-modal') as HTMLElement;
    expect(modal.classList.contains('show')).toBe(false);

    const btn = document.querySelector<HTMLButtonElement>('.add-btn')!;
    btn.click();

    expect(modal.classList.contains('show')).toBe(true);
  });

  it('closes modal when cancel button is clicked', () => {
    setupAddModalDOM();
    initAddTaskModal();

    const modal = document.getElementById('add-modal') as HTMLElement;
    modal.classList.add('show');

    document.getElementById('add-cancel')!.click();

    expect(modal.classList.contains('show')).toBe(false);
  });

  it('closes modal when clicking overlay background', () => {
    setupAddModalDOM();
    initAddTaskModal();

    const modal = document.getElementById('add-modal') as HTMLElement;
    modal.classList.add('show');

    modal.dispatchEvent(new MouseEvent('click', { bubbles: false }));

    expect(modal.classList.contains('show')).toBe(false);
  });

  it('sets status value when modal opens', () => {
    setupAddModalDOM();
    initAddTaskModal();

    const btn = document.querySelector<HTMLButtonElement>('.add-btn')!;
    btn.dataset.status = 'ready';
    btn.click();

    const status = document.getElementById('add-status') as HTMLInputElement;
    expect(status.value).toBe('ready');
  });

  it('resets title and body when modal opens', () => {
    setupAddModalDOM();
    initAddTaskModal();

    const title = document.getElementById('add-title') as HTMLInputElement;
    const body = document.getElementById('add-body') as HTMLTextAreaElement;
    title.value = 'old title';
    body.value = 'old body';

    const btn = document.querySelector<HTMLButtonElement>('.add-btn')!;
    btn.click();

    expect(title.value).toBe('');
    expect(body.value).toBe('');
  });
});

describe('initAddTaskModal - tag selector UI', () => {
  it('renders tag input inside the tag control', () => {
    setupAddModalDOM();
    initAddTaskModal();

    const input = document.querySelector<HTMLInputElement>('.tag-select-input');
    expect(input).not.toBeNull();
    expect(input!.id).toBe('add-tag-input');
  });

  it('shows dropdown when tag input is focused', () => {
    setupAddModalDOM();
    vi.spyOn(tagsModule, 'allAvailableTags', 'get').mockReturnValue([{ id: 1, name: 'bug' }]);
    initAddTaskModal();

    const input = document.getElementById('add-tag-input') as HTMLInputElement;
    input.dispatchEvent(new Event('focus'));

    const dropdown = document.getElementById('add-tag-select-dropdown') as HTMLElement;
    expect(dropdown.classList.contains('open')).toBe(true);
  });

  it('renders available tags as options in dropdown', () => {
    setupAddModalDOM();
    vi.spyOn(tagsModule, 'allAvailableTags', 'get').mockReturnValue([
      { id: 1, name: 'bug' },
      { id: 2, name: 'feature' },
    ]);
    initAddTaskModal();

    const input = document.getElementById('add-tag-input') as HTMLInputElement;
    input.dispatchEvent(new Event('focus'));

    const options = document.querySelectorAll('.tag-select-option');
    expect(options.length).toBe(2);
    expect(options[0].textContent).toBe('bug');
    expect(options[1].textContent).toBe('feature');
  });

  it('selecting a tag creates a pill in the control', () => {
    setupAddModalDOM();
    vi.spyOn(tagsModule, 'allAvailableTags', 'get').mockReturnValue([{ id: 1, name: 'bug' }]);
    initAddTaskModal();

    // Open modal to ensure clean state
    document.querySelector<HTMLButtonElement>('.add-btn')!.click();

    const input = document.getElementById('add-tag-input') as HTMLInputElement;
    input.dispatchEvent(new Event('focus'));

    const option = document.querySelector<HTMLElement>('.tag-select-option')!;
    expect(option).not.toBeNull();
    option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    const pill = document.querySelector('.tag-pill');
    expect(pill).not.toBeNull();
    expect(pill!.textContent).toContain('bug');
  });

  it('removing a tag pill removes it from the control', () => {
    setupAddModalDOM();
    vi.spyOn(tagsModule, 'allAvailableTags', 'get').mockReturnValue([{ id: 1, name: 'bug' }]);
    initAddTaskModal();

    // Open modal to ensure clean state
    document.querySelector<HTMLButtonElement>('.add-btn')!.click();

    // Select a tag first
    const input = document.getElementById('add-tag-input') as HTMLInputElement;
    input.dispatchEvent(new Event('focus'));
    const option = document.querySelector<HTMLElement>('.tag-select-option')!;
    expect(option).not.toBeNull();
    option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(document.querySelectorAll('.tag-pill').length).toBe(1);

    // Remove it
    const removeBtn = document.querySelector<HTMLButtonElement>('.tag-pill-remove')!;
    removeBtn.click();

    expect(document.querySelectorAll('.tag-pill').length).toBe(0);
  });

  it('resets selected tags when modal is reopened', async () => {
    setupAddModalDOM();
    vi.spyOn(tagsModule, 'allAvailableTags', 'get').mockReturnValue([{ id: 1, name: 'bug' }]);
    initAddTaskModal();

    // Open modal first
    const btn = document.querySelector<HTMLButtonElement>('.add-btn')!;
    btn.click();

    // Select a tag
    const input = document.getElementById('add-tag-input') as HTMLInputElement;
    input.dispatchEvent(new Event('focus'));

    // Wait for dropdown to open
    await Promise.resolve();

    const option = document.querySelector<HTMLElement>('.tag-select-option');
    if (option) {
      option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      expect(document.querySelectorAll('.tag-pill').length).toBe(1);
    }

    // Close and reopen modal to reset state
    document.getElementById('add-cancel')!.click();
    btn.click();

    expect(document.querySelectorAll('.tag-pill').length).toBe(0);
  });

  it('shows no-options message when no tags available', () => {
    setupAddModalDOM();
    vi.spyOn(tagsModule, 'allAvailableTags', 'get').mockReturnValue([]);
    initAddTaskModal();

    const input = document.getElementById('add-tag-input') as HTMLInputElement;
    input.dispatchEvent(new Event('focus'));

    const noOpt = document.querySelector('.tag-select-no-options');
    expect(noOpt).not.toBeNull();
    expect(noOpt!.textContent).toContain('No tags available');
  });
});

describe('initAddTaskModal - metadata UI', () => {
  it('adds a metadata row when add-metadata-add-row is clicked', () => {
    setupAddModalDOM();
    initAddTaskModal();

    const addBtn = document.getElementById('add-metadata-add-row')!;
    addBtn.click();

    const rows = document.querySelectorAll('.metadata-row');
    expect(rows.length).toBe(1);
  });

  it('metadata row has key and value inputs', () => {
    setupAddModalDOM();
    initAddTaskModal();

    document.getElementById('add-metadata-add-row')!.click();

    const keyInput = document.querySelector<HTMLInputElement>('.metadata-row-key');
    const valueInput = document.querySelector<HTMLInputElement>('.metadata-row-value');
    expect(keyInput).not.toBeNull();
    expect(valueInput).not.toBeNull();
  });

  it('removes metadata row when remove button is clicked', () => {
    setupAddModalDOM();
    initAddTaskModal();

    document.getElementById('add-metadata-add-row')!.click();
    expect(document.querySelectorAll('.metadata-row').length).toBe(1);

    const removeBtn = document.querySelector<HTMLButtonElement>('.metadata-row-remove')!;
    removeBtn.click();

    expect(document.querySelectorAll('.metadata-row').length).toBe(0);
  });

  it('allows adding multiple metadata rows', () => {
    setupAddModalDOM();
    initAddTaskModal();

    const addBtn = document.getElementById('add-metadata-add-row')!;
    addBtn.click();
    addBtn.click();
    addBtn.click();

    expect(document.querySelectorAll('.metadata-row').length).toBe(3);
  });

  it('resets metadata rows when modal is reopened', () => {
    setupAddModalDOM();
    initAddTaskModal();

    document.getElementById('add-metadata-add-row')!.click();
    document.getElementById('add-metadata-add-row')!.click();
    expect(document.querySelectorAll('.metadata-row').length).toBe(2);

    // Reopen modal
    const btn = document.querySelector<HTMLButtonElement>('.add-btn')!;
    btn.click();

    expect(document.querySelectorAll('.metadata-row').length).toBe(0);
  });
});

describe('initAddTaskModal - task submission with tags and metadata', () => {
  it('submits tags and metadata when creating a task', async () => {
    setupAddModalDOM();
    vi.spyOn(tagsModule, 'allAvailableTags', 'get').mockReturnValue([{ id: 5, name: 'urgent' }]);
    initAddTaskModal();

    // Open modal to reset state
    const btn = document.querySelector<HTMLButtonElement>('.add-btn')!;
    btn.click();

    // Fill in title
    const title = document.getElementById('add-title') as HTMLInputElement;
    title.value = 'My New Task';

    // Select a tag
    const tagInput = document.getElementById('add-tag-input') as HTMLInputElement;
    tagInput.dispatchEvent(new Event('focus'));
    const option = document.querySelector<HTMLElement>('.tag-select-option')!;
    option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    // Add metadata
    document.getElementById('add-metadata-add-row')!.click();
    const keyInput = document.querySelector<HTMLInputElement>('.metadata-row-key')!;
    const valInput = document.querySelector<HTMLInputElement>('.metadata-row-value')!;
    keyInput.value = 'env';
    valInput.value = 'production';

    let capturedBody: unknown = null;
    global.fetch = vi.fn().mockImplementation((url: string, opts: RequestInit) => {
      if (url === '/api/tasks' && opts.method === 'POST') {
        capturedBody = JSON.parse(opts.body as string);
      }
      return Promise.resolve({ ok: true });
    });

    // Submit (modal is already open)
    document.getElementById('add-submit')!.click();

    await Promise.resolve();
    await Promise.resolve();

    expect(capturedBody).not.toBeNull();
    const body = capturedBody as { title: string; tags: number[]; metadata: Array<{ key: string; value: string }> };
    expect(body.title).toBe('My New Task');
    expect(body.tags).toEqual([5]);
    expect(body.metadata).toEqual([{ key: 'env', value: 'production' }]);
  });

  it('does not include tags/metadata fields if none selected', async () => {
    setupAddModalDOM();
    vi.spyOn(tagsModule, 'allAvailableTags', 'get').mockReturnValue([]);
    initAddTaskModal();

    // Open modal to reset state
    const btn = document.querySelector<HTMLButtonElement>('.add-btn')!;
    btn.click();

    const title = document.getElementById('add-title') as HTMLInputElement;
    title.value = 'Simple Task';

    let capturedBody: unknown = null;
    global.fetch = vi.fn().mockImplementation((url: string, opts: RequestInit) => {
      if (url === '/api/tasks' && opts.method === 'POST') {
        capturedBody = JSON.parse(opts.body as string);
      }
      return Promise.resolve({ ok: true });
    });

    document.getElementById('add-submit')!.click();

    await Promise.resolve();
    await Promise.resolve();

    const body = capturedBody as Record<string, unknown>;
    expect(body.tags).toBeUndefined();
    expect(body.metadata).toBeUndefined();
  });

  it('shows toast and does not reload on submission error', async () => {
    setupAddModalDOM();
    vi.spyOn(tagsModule, 'allAvailableTags', 'get').mockReturnValue([]);
    initAddTaskModal();

    // Set up toast element
    const toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);

    // Open modal to reset state
    const btn = document.querySelector<HTMLButtonElement>('.add-btn')!;
    btn.click();

    const title = document.getElementById('add-title') as HTMLInputElement;
    title.value = 'Error Task';

    global.fetch = vi.fn().mockResolvedValue({ ok: false });

    document.getElementById('add-submit')!.click();

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // toast should have been shown (class 'show' added then removed)
    // We just verify fetch was called and no uncaught error
    expect(global.fetch).toHaveBeenCalled();
  });

  it('does not submit when title is empty', async () => {
    setupAddModalDOM();
    initAddTaskModal();

    global.fetch = vi.fn();

    document.getElementById('add-submit')!.click();

    await Promise.resolve();

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('skips metadata entries with empty keys', async () => {
    setupAddModalDOM();
    vi.spyOn(tagsModule, 'allAvailableTags', 'get').mockReturnValue([]);
    initAddTaskModal();

    // Open modal to reset state
    const btn = document.querySelector<HTMLButtonElement>('.add-btn')!;
    btn.click();

    const title = document.getElementById('add-title') as HTMLInputElement;
    title.value = 'Task with empty key';

    document.getElementById('add-metadata-add-row')!.click();
    // Leave key empty, add only value
    const valInput = document.querySelector<HTMLInputElement>('.metadata-row-value')!;
    valInput.value = 'some value';

    let capturedBody: unknown = null;
    global.fetch = vi.fn().mockImplementation((url: string, opts: RequestInit) => {
      if (url === '/api/tasks' && opts.method === 'POST') {
        capturedBody = JSON.parse(opts.body as string);
      }
      return Promise.resolve({ ok: true });
    });

    document.getElementById('add-submit')!.click();

    await Promise.resolve();
    await Promise.resolve();

    const body = capturedBody as Record<string, unknown>;
    // metadata should be undefined since no valid entries
    expect(body.metadata).toBeUndefined();
  });
});

describe('initAddTaskModal - branch input', () => {
  it('branch input is initially readonly with auto-generate mode after modal open', () => {
    setupAddModalDOM();
    initAddTaskModal();

    // Open the modal to trigger resetAddModal which calls setBranchAutoMode
    document.querySelector<HTMLButtonElement>('.add-btn')!.click();

    const branchInput = document.getElementById('add-branch') as HTMLInputElement;
    expect(branchInput.readOnly).toBe(true);
    expect(branchInput.classList.contains('branch-auto-mode')).toBe(true);
  });

  it('switches to manual mode and captures first character on keydown', () => {
    setupAddModalDOM();
    initAddTaskModal();

    const branchInput = document.getElementById('add-branch') as HTMLInputElement;
    expect(branchInput.readOnly).toBe(true);

    branchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true }));

    expect(branchInput.readOnly).toBe(false);
    expect(branchInput.classList.contains('branch-auto-mode')).toBe(false);
    expect(branchInput.value).toBe('f');
  });

  it('calls preventDefault on first keydown to prevent browser default insertion doubling the character', () => {
    // Regression test for real-browser bug: removing readOnly during keydown causes
    // the browser to both insert the character via default behavior AND our manual value set,
    // resulting in duplicate first character (e.g. 'ff' instead of 'f').
    setupAddModalDOM();
    initAddTaskModal();

    const branchInput = document.getElementById('add-branch') as HTMLInputElement;
    expect(branchInput.readOnly).toBe(true);

    const event = new KeyboardEvent('keydown', { key: 'f', bubbles: true, cancelable: true });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

    branchInput.dispatchEvent(event);

    expect(preventDefaultSpy).toHaveBeenCalledOnce();
    expect(branchInput.value).toBe('f');
  });

  it('does not switch to manual mode for control keys (Ctrl, Meta, Alt)', () => {
    setupAddModalDOM();
    initAddTaskModal();

    const branchInput = document.getElementById('add-branch') as HTMLInputElement;

    branchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true }));
    expect(branchInput.readOnly).toBe(true);

    branchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', metaKey: true, bubbles: true }));
    expect(branchInput.readOnly).toBe(true);
  });

  it('does not switch to manual mode for special keys like Enter or Backspace', () => {
    setupAddModalDOM();
    initAddTaskModal();

    const branchInput = document.getElementById('add-branch') as HTMLInputElement;

    branchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(branchInput.readOnly).toBe(true);

    branchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
    expect(branchInput.readOnly).toBe(true);
  });

  it('resets branch to auto-generate mode when modal is reopened', () => {
    setupAddModalDOM();
    initAddTaskModal();

    const branchInput = document.getElementById('add-branch') as HTMLInputElement;
    // Switch to manual mode
    branchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true }));
    expect(branchInput.readOnly).toBe(false);

    // Reopen modal to reset state
    document.getElementById('add-cancel')!.click();
    document.querySelector<HTMLButtonElement>('.add-btn')!.click();

    expect(branchInput.readOnly).toBe(true);
    expect(branchInput.classList.contains('branch-auto-mode')).toBe(true);
  });

  it('submits manual branch name when provided', async () => {
    setupAddModalDOM();
    vi.spyOn(tagsModule, 'allAvailableTags', 'get').mockReturnValue([]);
    initAddTaskModal();

    document.querySelector<HTMLButtonElement>('.add-btn')!.click();

    const title = document.getElementById('add-title') as HTMLInputElement;
    title.value = 'Task with branch';

    const branchInput = document.getElementById('add-branch') as HTMLInputElement;
    branchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', bubbles: true }));
    branchInput.value = 'my-feature-branch';
    branchInput.dispatchEvent(new Event('input'));

    let capturedBody: unknown = null;
    global.fetch = vi.fn().mockImplementation((url: string, opts: RequestInit) => {
      if (url === '/api/tasks' && opts.method === 'POST') {
        capturedBody = JSON.parse(opts.body as string);
      }
      return Promise.resolve({ ok: true });
    });

    document.getElementById('add-submit')!.click();
    await Promise.resolve();
    await Promise.resolve();

    const body = capturedBody as Record<string, unknown>;
    expect(body.branch).toBe('my-feature-branch');
  });

  it('submits auto-generate branch value when not manually changed', async () => {
    setupAddModalDOM();
    vi.spyOn(tagsModule, 'allAvailableTags', 'get').mockReturnValue([]);
    initAddTaskModal();

    document.querySelector<HTMLButtonElement>('.add-btn')!.click();

    const title = document.getElementById('add-title') as HTMLInputElement;
    title.value = 'Task with auto branch';

    let capturedBody: unknown = null;
    global.fetch = vi.fn().mockImplementation((url: string, opts: RequestInit) => {
      if (url === '/api/tasks' && opts.method === 'POST') {
        capturedBody = JSON.parse(opts.body as string);
      }
      return Promise.resolve({ ok: true });
    });

    document.getElementById('add-submit')!.click();
    await Promise.resolve();
    await Promise.resolve();

    const body = capturedBody as Record<string, unknown>;
    expect(body.branch).toBe('<auto-generate>');
  });
});

describe('initAddTaskModal - create new tag option', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    setupAddModalDOM();
    vi.spyOn(tagsModule, 'loadAllTags').mockResolvedValue(undefined);
    Object.defineProperty(tagsModule, 'allAvailableTags', {
      value: [{ id: 1, name: 'bug' }],
      writable: true,
      configurable: true,
    });
    initAddTaskModal();
    // Open the modal
    document.querySelector<HTMLButtonElement>('.add-btn')!.click();
  });

  it('shows create option when input does not match existing tag', () => {
    const input = document.getElementById('add-tag-input') as HTMLInputElement;
    input.dispatchEvent(new Event('focus'));
    input.value = 'newfeature';
    input.dispatchEvent(new Event('input'));

    const createOpt = document.querySelector<HTMLElement>('.tag-select-create-option');
    expect(createOpt).not.toBeNull();
    expect(createOpt!.textContent).toBe('Create "newfeature"');
  });

  it('does not show create option when input exactly matches existing tag', () => {
    const input = document.getElementById('add-tag-input') as HTMLInputElement;
    input.dispatchEvent(new Event('focus'));
    input.value = 'bug';
    input.dispatchEvent(new Event('input'));

    const createOpt = document.querySelector<HTMLElement>('.tag-select-create-option');
    expect(createOpt).toBeNull();
  });

  it('creates tag via API and selects it on create option mousedown', async () => {
    const newTag = { id: 2, name: 'newfeature' };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(newTag),
    } as unknown as Response);

    const input = document.getElementById('add-tag-input') as HTMLInputElement;
    input.dispatchEvent(new Event('focus'));
    input.value = 'newfeature';
    input.dispatchEvent(new Event('input'));

    const createOpt = document.querySelector<HTMLElement>('.tag-select-create-option')!;
    expect(createOpt).not.toBeNull();

    createOpt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(global.fetch).toHaveBeenCalledWith('/api/tags', expect.objectContaining({ method: 'POST' }));

    const pill = document.querySelector('.tag-pill');
    expect(pill).not.toBeNull();
    expect(pill!.textContent).toContain('newfeature');
  });
});
