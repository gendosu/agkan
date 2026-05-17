// Add task modal functionality

import { showToast } from './utils';
import { allAvailableTags } from './tags';
import type { Tag } from './types';
import { refreshBoardCards } from './boardPolling';

const BRANCH_AUTO_GENERATE = '<auto-generate>';
const BRANCH_AUTO_GENERATE_DISPLAY = '✨ Auto-generate on run';

interface AddModalElements {
  addModal: HTMLElement;
  addTitle: HTMLInputElement;
  addBody: HTMLTextAreaElement;
  addPriority: HTMLSelectElement;
  addStatus: HTMLInputElement;
  addTagControl: HTMLElement;
  addTagDropdown: HTMLElement;
  addMetadataRows: HTMLElement;
}

// State for the add modal tag selector
let selectedTags: Tag[] = [];
let tagInputValue = '';
let tagFocusedIndex = -1;

// State for branch suggestions
let branchSuggestions: string[] = [];
let branchSuggestionsLoaded = false;

// State for branch internal value (sent on submit)
let branchInternalValue: string = BRANCH_AUTO_GENERATE;

async function loadBranchSuggestions(): Promise<void> {
  if (branchSuggestionsLoaded) return;
  try {
    const res = await fetch('/api/git/branches');
    if (!res.ok) throw new Error('Server error');
    const data = (await res.json()) as { branches: string[] };
    branchSuggestions = data.branches;
  } catch {
    branchSuggestions = [];
  }
  branchSuggestionsLoaded = true;
}

function setBranchAutoMode(input: HTMLInputElement): void {
  branchInternalValue = BRANCH_AUTO_GENERATE;
  input.value = BRANCH_AUTO_GENERATE_DISPLAY;
  input.readOnly = true;
  input.classList.add('branch-auto-mode');
}

function setBranchManualMode(input: HTMLInputElement, branch: string): void {
  branchInternalValue = branch;
  input.value = branch;
  input.readOnly = false;
  input.classList.remove('branch-auto-mode');
}

function renderBranchDropdown(dropdown: HTMLElement, inputValue: string): void {
  const input = document.getElementById('add-branch') as HTMLInputElement;
  // When in auto-generate mode, show all suggestions unfiltered
  const isAutoMode = branchInternalValue === BRANCH_AUTO_GENERATE;
  const q = isAutoMode ? '' : inputValue.trim().toLowerCase();
  const filtered = q ? branchSuggestions.filter((b) => b.toLowerCase().includes(q)) : branchSuggestions;

  dropdown.innerHTML = '';

  // Fixed top item: auto-generate
  const autoOpt = document.createElement('div');
  autoOpt.className = 'branch-select-option branch-select-option-auto';
  autoOpt.textContent = BRANCH_AUTO_GENERATE_DISPLAY;
  if (branchInternalValue === BRANCH_AUTO_GENERATE) {
    autoOpt.classList.add('selected');
  }
  autoOpt.addEventListener('mousedown', (e: MouseEvent) => {
    e.preventDefault();
    if (input) setBranchAutoMode(input);
    dropdown.style.display = 'none';
  });
  dropdown.appendChild(autoOpt);

  // Separator
  const separator = document.createElement('div');
  separator.className = 'branch-select-separator';
  dropdown.appendChild(separator);

  // Git branch list
  filtered.forEach((branch) => {
    const opt = document.createElement('div');
    opt.className = 'branch-select-option';
    opt.textContent = branch;
    opt.addEventListener('mousedown', (e: MouseEvent) => {
      e.preventDefault();
      if (input) setBranchManualMode(input, branch);
      dropdown.style.display = 'none';
    });
    dropdown.appendChild(opt);
  });

  dropdown.style.display = 'block';
}

function getFilteredAddTags(): Tag[] {
  const selectedIds = new Set(selectedTags.map((t) => t.id));
  const available = allAvailableTags.filter((t) => !selectedIds.has(t.id));
  if (!tagInputValue.trim()) return available;
  const q = tagInputValue.toLowerCase();
  return available.filter((t) => t.name.toLowerCase().includes(q));
}

function renderAddTagPills(control: HTMLElement, input: HTMLInputElement): void {
  control.querySelectorAll('.tag-pill').forEach((p) => p.remove());
  selectedTags.forEach((t) => {
    const pill = document.createElement('span');
    pill.className = 'tag-pill';
    pill.dataset.tagId = String(t.id);
    const label = document.createTextNode(t.name);
    const removeBtn = document.createElement('button');
    removeBtn.className = 'tag-pill-remove';
    removeBtn.title = 'Remove tag';
    removeBtn.innerHTML = '&times;';
    removeBtn.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      const idx = selectedTags.findIndex((x) => x.id === t.id);
      if (idx !== -1) selectedTags.splice(idx, 1);
      renderAddTagPills(control, input);
    });
    pill.appendChild(label);
    pill.appendChild(removeBtn);
    control.insertBefore(pill, input);
  });
  input.placeholder = selectedTags.length === 0 ? 'Add tags...' : '';
}

function renderAddTagDropdown(dropdown: HTMLElement): void {
  const filtered = getFilteredAddTags();
  dropdown.innerHTML = '';
  tagFocusedIndex = -1;
  const hasInput = tagInputValue.trim() !== '';
  const exactMatch =
    hasInput && allAvailableTags.some((t) => t.name.toLowerCase() === tagInputValue.trim().toLowerCase());
  const showCreate = hasInput && !exactMatch;
  if (filtered.length === 0 && !showCreate) {
    const noOpt = document.createElement('div');
    noOpt.className = 'tag-select-no-options';
    noOpt.textContent = hasInput ? 'No matching tags' : 'No tags available';
    dropdown.appendChild(noOpt);
  } else {
    filtered.forEach((t, i) => {
      const opt = document.createElement('div');
      opt.className = 'tag-select-option';
      opt.dataset.tagId = String(t.id);
      opt.textContent = t.name;
      opt.addEventListener('mouseover', () => setAddTagFocused(dropdown, i));
      opt.addEventListener('mousedown', (e: MouseEvent) => {
        e.preventDefault();
        selectAddTag(t.id, dropdown, document.getElementById('add-tag-input') as HTMLInputElement);
      });
      dropdown.appendChild(opt);
    });
    if (showCreate) {
      const createOpt = document.createElement('div');
      createOpt.className = 'tag-select-option tag-select-create-option';
      createOpt.dataset.create = 'true';
      createOpt.textContent = `Create "${tagInputValue.trim()}"`;
      createOpt.addEventListener('mouseover', () => setAddTagFocused(dropdown, filtered.length));
      createOpt.addEventListener('mousedown', async (e: MouseEvent) => {
        e.preventDefault();
        const input = document.getElementById('add-tag-input') as HTMLInputElement;
        await createAndSelectAddTag(tagInputValue.trim(), dropdown, input);
      });
      dropdown.appendChild(createOpt);
    }
  }
}

function setAddTagFocused(dropdown: HTMLElement, index: number): void {
  const opts = dropdown.querySelectorAll<HTMLElement>('.tag-select-option');
  opts.forEach((o, i) => o.classList.toggle('focused', i === index));
  tagFocusedIndex = index;
}

function selectAddTag(tagId: number, dropdown: HTMLElement, input: HTMLInputElement): void {
  const tag = allAvailableTags.find((t) => t.id === tagId);
  if (!tag) return;
  selectedTags.push(tag);
  input.value = '';
  tagInputValue = '';
  const control = document.getElementById('add-tag-select-control') as HTMLElement;
  renderAddTagPills(control, input);
  renderAddTagDropdown(dropdown);
}

async function createAndSelectAddTag(name: string, dropdown: HTMLElement, input: HTMLInputElement): Promise<void> {
  try {
    const res = await fetch('/api/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error('Server error');
    const newTag = (await res.json()) as Tag;
    allAvailableTags.push(newTag);
    selectAddTag(newTag.id, dropdown, input);
  } catch {
    showToast('Failed to create tag');
  }
}

function initAddTagSelector(): void {
  const control = document.getElementById('add-tag-select-control') as HTMLElement;
  const dropdown = document.getElementById('add-tag-select-dropdown') as HTMLElement;
  if (!control || !dropdown) return;

  // Create the input element
  const input = document.createElement('input');
  input.className = 'tag-select-input';
  input.id = 'add-tag-input';
  input.type = 'text';
  input.autocomplete = 'off';
  control.appendChild(input);

  control.addEventListener('click', () => input.focus());

  input.addEventListener('focus', () => {
    renderAddTagDropdown(dropdown);
    dropdown.classList.add('open');
  });

  input.addEventListener('blur', () =>
    setTimeout(() => {
      dropdown.classList.remove('open');
      tagFocusedIndex = -1;
    }, 150)
  );

  input.addEventListener('input', () => {
    tagInputValue = input.value;
    renderAddTagDropdown(dropdown);
    if (!dropdown.classList.contains('open')) dropdown.classList.add('open');
  });

  input.addEventListener('keydown', async (e: KeyboardEvent) => {
    const filtered = getFilteredAddTags();
    const opts = dropdown.querySelectorAll<HTMLElement>('.tag-select-option');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAddTagFocused(dropdown, Math.min(tagFocusedIndex + 1, opts.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAddTagFocused(dropdown, Math.max(tagFocusedIndex - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (tagFocusedIndex >= 0 && filtered[tagFocusedIndex]) {
        selectAddTag(filtered[tagFocusedIndex].id, dropdown, input);
      } else if (tagFocusedIndex >= 0 && tagInputValue.trim()) {
        await createAndSelectAddTag(tagInputValue.trim(), dropdown, input);
      }
    } else if (e.key === 'Escape') {
      dropdown.classList.remove('open');
      input.blur();
    } else if (e.key === 'Backspace' && input.value === '' && selectedTags.length > 0) {
      e.preventDefault();
      selectedTags.splice(selectedTags.length - 1, 1);
      renderAddTagPills(control, input);
      renderAddTagDropdown(dropdown);
    }
  });
}

function addMetadataRow(container: HTMLElement): void {
  const row = document.createElement('div');
  row.className = 'metadata-row';

  const keyInput = document.createElement('input');
  keyInput.type = 'text';
  keyInput.className = 'metadata-row-key';
  keyInput.placeholder = 'Key';

  const valueInput = document.createElement('input');
  valueInput.type = 'text';
  valueInput.className = 'metadata-row-value';
  valueInput.placeholder = 'Value';

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'metadata-row-remove';
  removeBtn.title = 'Remove';
  removeBtn.innerHTML = '&times;';
  removeBtn.addEventListener('click', () => {
    row.remove();
  });

  row.appendChild(keyInput);
  row.appendChild(valueInput);
  row.appendChild(removeBtn);
  container.appendChild(row);
}

function collectMetadata(container: HTMLElement): Array<{ key: string; value: string }> {
  const rows = container.querySelectorAll<HTMLElement>('.metadata-row');
  const result: Array<{ key: string; value: string }> = [];
  rows.forEach((row) => {
    const key = (row.querySelector<HTMLInputElement>('.metadata-row-key')?.value ?? '').trim();
    const value = (row.querySelector<HTMLInputElement>('.metadata-row-value')?.value ?? '').trim();
    if (key) result.push({ key, value });
  });
  return result;
}

function resetAddModal(elements: AddModalElements): void {
  elements.addTitle.value = '';
  elements.addBody.value = '';
  elements.addPriority.value = 'medium';
  // Reset tags
  selectedTags = [];
  tagInputValue = '';
  tagFocusedIndex = -1;
  const control = document.getElementById('add-tag-select-control') as HTMLElement;
  const input = document.getElementById('add-tag-input') as HTMLInputElement;
  if (control && input) {
    renderAddTagPills(control, input);
  }
  // Reset branch to auto-generate default
  const branchInput = document.getElementById('add-branch') as HTMLInputElement;
  if (branchInput) setBranchAutoMode(branchInput);
  const branchDropdown = document.getElementById('add-branch-dropdown') as HTMLElement;
  if (branchDropdown) branchDropdown.style.display = 'none';
  // Reset metadata rows
  elements.addMetadataRows.innerHTML = '';
}

function openAddModal(elements: AddModalElements, status: string): void {
  elements.addStatus.value = status;
  resetAddModal(elements);
  elements.addModal.classList.add('show');
  elements.addTitle.focus();
}

async function submitAddTask(elements: AddModalElements): Promise<void> {
  const title = elements.addTitle.value.trim();
  if (!title) {
    elements.addTitle.focus();
    return;
  }
  const status = elements.addStatus.value;
  elements.addModal.classList.remove('show');

  const tags = selectedTags.map((t) => t.id);
  const metadata = collectMetadata(elements.addMetadataRows);

  try {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        body: elements.addBody.value.trim() || null,
        status,
        priority: elements.addPriority.value || null,
        tags: tags.length > 0 ? tags : undefined,
        metadata: metadata.length > 0 ? metadata : undefined,
        branch: branchInternalValue || undefined,
      }),
    });
    if (!res.ok) throw new Error('Server error');
    await refreshBoardCards();
  } catch {
    showToast('Failed to add task');
  }
}

export function initAddTaskModal(): void {
  const elements: AddModalElements = {
    addModal: document.getElementById('add-modal') as HTMLElement,
    addTitle: document.getElementById('add-title') as HTMLInputElement,
    addBody: document.getElementById('add-body') as HTMLTextAreaElement,
    addPriority: document.getElementById('add-priority') as HTMLSelectElement,
    addStatus: document.getElementById('add-status') as HTMLInputElement,
    addTagControl: document.getElementById('add-tag-select-control') as HTMLElement,
    addTagDropdown: document.getElementById('add-tag-select-dropdown') as HTMLElement,
    addMetadataRows: document.getElementById('add-metadata-rows') as HTMLElement,
  };

  initAddTagSelector();

  // Wire branch input events
  const branchInput = document.getElementById('add-branch') as HTMLInputElement;
  const branchDropdown = document.getElementById('add-branch-dropdown') as HTMLElement;

  if (branchInput && branchDropdown) {
    branchInput.addEventListener('focus', async () => {
      await loadBranchSuggestions();
      renderBranchDropdown(branchDropdown, branchInput.value);
    });

    branchInput.addEventListener('input', () => {
      // If user starts typing while in auto-generate mode, switch to manual mode
      if (branchInternalValue === BRANCH_AUTO_GENERATE) {
        branchInput.readOnly = false;
        branchInput.classList.remove('branch-auto-mode');
      }
      branchInternalValue = branchInput.value;
      renderBranchDropdown(branchDropdown, branchInput.value);
    });

    branchInput.addEventListener('blur', () => {
      setTimeout(() => {
        branchDropdown.style.display = 'none';
      }, 150);
    });
  }

  document.querySelectorAll<HTMLButtonElement>('.add-btn').forEach((btn) => {
    btn.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      openAddModal(elements, btn.dataset.status!);
    });
  });

  document.getElementById('add-cancel')?.addEventListener('click', () => {
    elements.addModal.classList.remove('show');
  });

  elements.addModal.addEventListener('click', (e: MouseEvent) => {
    if (e.target === elements.addModal) elements.addModal.classList.remove('show');
  });

  elements.addTitle.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      (document.getElementById('add-submit') as HTMLButtonElement).click();
    }
  });

  document.getElementById('add-metadata-add-row')?.addEventListener('click', () => {
    addMetadataRow(elements.addMetadataRows);
  });

  document.getElementById('add-submit')?.addEventListener('click', () => submitAddTask(elements));
}
