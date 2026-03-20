// Tag selection and management

import { Tag } from './types';
import { showToast } from './utils';

export let allAvailableTags: Tag[] = [];

// Callback to get the current detail task ID without circular import
let _getDetailTaskId: (() => number | null) | null = null;

export function registerGetDetailTaskId(fn: () => number | null): void {
  _getDetailTaskId = fn;
}

export async function loadAllTags(): Promise<void> {
  try {
    const res = await fetch('/api/tags');
    if (!res.ok) return;
    const data = (await res.json()) as { tags?: Tag[] };
    allAvailableTags = data.tags || [];
  } catch {
    // Ignore errors loading tags
  }
}

export function renderTagsSection(currentTags: Tag[]): void {
  const container = document.getElementById('detail-tags-container');
  if (!container) return;

  container.innerHTML =
    '<div class="tag-select-wrapper"><div class="tag-select-control" id="tag-select-control"></div><div class="tag-select-dropdown" id="tag-select-dropdown"></div></div>';

  const control = document.getElementById('tag-select-control') as HTMLElement;
  const dropdown = document.getElementById('tag-select-dropdown') as HTMLElement;
  let focusedOptionIndex = -1;
  let inputValue = '';

  function getFilteredTags(): Tag[] {
    const currentTagIds = new Set(currentTags.map((t) => t.id));
    const available = allAvailableTags.filter((t) => !currentTagIds.has(t.id));
    if (!inputValue.trim()) return available;
    const q = inputValue.toLowerCase();
    return available.filter((t) => t.name.toLowerCase().includes(q));
  }

  const input = document.createElement('input');
  input.className = 'tag-select-input';
  input.type = 'text';
  input.autocomplete = 'off';
  control.appendChild(input);

  function renderPills(): void {
    control.querySelectorAll('.tag-pill').forEach((p) => p.remove());
    currentTags.forEach((t) => {
      const pill = document.createElement('span');
      pill.className = 'tag-pill';
      pill.dataset.tagId = String(t.id);
      const label = document.createTextNode(t.name);
      const removeBtn = document.createElement('button');
      removeBtn.className = 'tag-pill-remove';
      removeBtn.title = 'Remove tag';
      removeBtn.setAttribute('data-tag-id', String(t.id));
      removeBtn.innerHTML = '&times;';
      removeBtn.addEventListener('click', async (e: MouseEvent) => {
        e.stopPropagation();
        const detailTaskId = _getDetailTaskId ? _getDetailTaskId() : null;
        try {
          const res = await fetch('/api/tasks/' + detailTaskId + '/tags/' + t.id, {
            method: 'DELETE',
          });
          if (!res.ok) throw new Error('Server error');
          const idx = currentTags.findIndex((x) => String(x.id) === String(t.id));
          if (idx !== -1) currentTags.splice(idx, 1);
          renderPills();
          renderDropdown();
        } catch {
          showToast('Failed to remove tag');
        }
      });
      pill.appendChild(label);
      pill.appendChild(removeBtn);
      control.insertBefore(pill, input);
    });
    input.placeholder = currentTags.length === 0 ? 'Add tags...' : '';
  }

  function renderDropdown(): void {
    const filtered = getFilteredTags();
    dropdown.innerHTML = '';
    focusedOptionIndex = -1;
    if (filtered.length === 0) {
      const noOpt = document.createElement('div');
      noOpt.className = 'tag-select-no-options';
      noOpt.textContent = inputValue ? 'No matching tags' : 'No tags available';
      dropdown.appendChild(noOpt);
    } else {
      filtered.forEach((t, i) => {
        const opt = document.createElement('div');
        opt.className = 'tag-select-option';
        opt.dataset.tagId = String(t.id);
        opt.textContent = t.name;
        opt.addEventListener('mouseover', () => setFocusedOption(i));
        opt.addEventListener('mousedown', async (e: MouseEvent) => {
          e.preventDefault();
          await addTag(String(t.id));
        });
        dropdown.appendChild(opt);
      });
    }
  }

  function setFocusedOption(index: number): void {
    const opts = dropdown.querySelectorAll<HTMLElement>('.tag-select-option');
    opts.forEach((o, i) => o.classList.toggle('focused', i === index));
    focusedOptionIndex = index;
  }

  function openDropdown(): void {
    renderDropdown();
    dropdown.classList.add('open');
  }

  function closeDropdown(): void {
    dropdown.classList.remove('open');
    focusedOptionIndex = -1;
  }

  async function addTag(tagId: string): Promise<void> {
    const detailTaskId = _getDetailTaskId ? _getDetailTaskId() : null;
    try {
      const res = await fetch('/api/tasks/' + detailTaskId + '/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagId: Number(tagId) }),
      });
      if (!res.ok) throw new Error('Server error');
      const tag = allAvailableTags.find((t) => String(t.id) === String(tagId));
      if (tag) currentTags.push(tag);
      input.value = '';
      inputValue = '';
      renderPills();
      renderDropdown();
    } catch {
      showToast('Failed to add tag');
    }
  }

  control.addEventListener('click', () => input.focus());
  input.addEventListener('focus', () => openDropdown());
  input.addEventListener('blur', () => setTimeout(() => closeDropdown(), 150));
  input.addEventListener('input', () => {
    inputValue = input.value;
    renderDropdown();
    if (!dropdown.classList.contains('open')) openDropdown();
  });

  input.addEventListener('keydown', async (e: KeyboardEvent) => {
    const filtered = getFilteredTags();
    const opts = dropdown.querySelectorAll<HTMLElement>('.tag-select-option');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedOption(Math.min(focusedOptionIndex + 1, opts.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedOption(Math.max(focusedOptionIndex - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (focusedOptionIndex >= 0 && filtered[focusedOptionIndex]) {
        await addTag(String(filtered[focusedOptionIndex].id));
      }
    } else if (e.key === 'Escape') {
      closeDropdown();
      input.blur();
    } else if (e.key === 'Backspace' && input.value === '' && currentTags.length > 0) {
      e.preventDefault();
      const last = currentTags[currentTags.length - 1];
      const detailTaskId = _getDetailTaskId ? _getDetailTaskId() : null;
      try {
        const res = await fetch('/api/tasks/' + detailTaskId + '/tags/' + last.id, {
          method: 'DELETE',
        });
        if (!res.ok) throw new Error('Server error');
        currentTags.splice(currentTags.length - 1, 1);
        renderPills();
        renderDropdown();
      } catch {
        showToast('Failed to remove tag');
      }
    }
  });

  renderPills();
}
