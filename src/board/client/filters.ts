// Filter bar functionality

import { activeFilters, refreshBoardCards } from './boardPolling';
import { allAvailableTags, loadAllTags } from './tags';

export function isFiltersActive(): boolean {
  return (
    activeFilters.priorities.length > 0 ||
    activeFilters.tagIds.length > 0 ||
    activeFilters.assignee !== '' ||
    activeFilters.searchText !== ''
  );
}

export function applyFilters(): void {
  const clearBtn = document.getElementById('filter-clear');
  if (clearBtn) {
    if (isFiltersActive()) {
      clearBtn.classList.add('visible');
    } else {
      clearBtn.classList.remove('visible');
    }
  }
  refreshBoardCards();
}

export function renderFilterTagPills(): void {
  const container = document.getElementById('filter-tags-control');
  if (!container) return;
  // Remove existing pills
  container.querySelectorAll('.filter-tag-pill').forEach((p) => p.remove());
  // Add pills for active tag filters
  activeFilters.tagIds.forEach((tagId) => {
    const tag = allAvailableTags.find((t) => t.id === tagId);
    if (!tag) return;
    const pill = document.createElement('span');
    pill.className = 'filter-tag-pill';
    const label = document.createTextNode(tag.name);
    const removeBtn = document.createElement('button');
    removeBtn.className = 'filter-tag-pill-remove';
    removeBtn.title = 'Remove tag filter';
    removeBtn.innerHTML = '&times;';
    removeBtn.addEventListener('click', () => {
      const idx = activeFilters.tagIds.indexOf(tagId);
      if (idx !== -1) activeFilters.tagIds.splice(idx, 1);
      renderFilterTagPills();
      applyFilters();
    });
    pill.appendChild(label);
    pill.appendChild(removeBtn);
    container.insertBefore(pill, container.querySelector('.filter-tag-dropdown-wrapper'));
  });
}

export function initFilterBar(): void {
  // Priority toggle buttons
  document.querySelectorAll<HTMLButtonElement>('.filter-priority-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const priority = btn.dataset.priority!;
      const idx = activeFilters.priorities.indexOf(priority);
      if (idx === -1) {
        activeFilters.priorities.push(priority);
        btn.classList.add('active');
      } else {
        activeFilters.priorities.splice(idx, 1);
        btn.classList.remove('active');
      }
      applyFilters();
    });
  });

  // Search text input with debounce
  const searchInput = document.getElementById('filter-search') as HTMLInputElement | null;
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        activeFilters.searchText = searchInput.value.trim();
        applyFilters();
      }, 300);
    });
  }

  // Assignee input with debounce
  const assigneeInput = document.getElementById('filter-assignee') as HTMLInputElement | null;
  let assigneeTimer: ReturnType<typeof setTimeout> | null = null;
  if (assigneeInput) {
    assigneeInput.addEventListener('input', () => {
      if (assigneeTimer) clearTimeout(assigneeTimer);
      assigneeTimer = setTimeout(() => {
        activeFilters.assignee = assigneeInput.value.trim();
        applyFilters();
      }, 300);
    });
  }

  // Clear button
  const clearBtn = document.getElementById('filter-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      activeFilters.tagIds = [];
      activeFilters.priorities = [];
      activeFilters.assignee = '';
      activeFilters.searchText = '';
      document
        .querySelectorAll<HTMLButtonElement>('.filter-priority-btn')
        .forEach((btn) => btn.classList.remove('active'));
      if (searchInput) searchInput.value = '';
      if (assigneeInput) assigneeInput.value = '';
      renderFilterTagPills();
      applyFilters();
    });
  }

  // Tag filter dropdown
  const tagsControl = document.getElementById('filter-tags-control');
  if (tagsControl) {
    const dropdownWrapper = document.createElement('div');
    dropdownWrapper.className = 'filter-tag-dropdown-wrapper';

    const addBtn = document.createElement('button');
    addBtn.className = 'filter-tag-add-btn';
    addBtn.textContent = '+ Tag';

    const dropdown = document.createElement('div');
    dropdown.className = 'filter-tag-dropdown';

    dropdownWrapper.appendChild(addBtn);
    dropdownWrapper.appendChild(dropdown);
    tagsControl.appendChild(dropdownWrapper);

    function renderTagDropdown(): void {
      dropdown.innerHTML = '';
      const available = allAvailableTags.filter((t) => !activeFilters.tagIds.includes(t.id));
      if (available.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'filter-tag-dropdown-empty';
        empty.textContent = 'No tags available';
        dropdown.appendChild(empty);
      } else {
        available.forEach((tag) => {
          const opt = document.createElement('div');
          opt.className = 'filter-tag-dropdown-option';
          opt.textContent = tag.name;
          opt.addEventListener('mousedown', (e: MouseEvent) => {
            e.preventDefault();
            activeFilters.tagIds.push(tag.id);
            dropdown.classList.remove('open');
            renderFilterTagPills();
            applyFilters();
          });
          dropdown.appendChild(opt);
        });
      }
    }

    addBtn.addEventListener('click', () => {
      if (dropdown.classList.contains('open')) {
        dropdown.classList.remove('open');
      } else {
        renderTagDropdown();
        const rect = addBtn.getBoundingClientRect();
        dropdown.style.top = rect.bottom + 2 + 'px';
        dropdown.style.left = rect.left + 'px';
        dropdown.classList.add('open');
      }
    });

    document.addEventListener('click', (e: MouseEvent) => {
      if (!dropdownWrapper.contains(e.target as Node)) {
        dropdown.classList.remove('open');
      }
    });
  }
}

export function initFilters(): void {
  // Initialize filter bar after tags are loaded
  loadAllTags().then(() => {
    initFilterBar();
  });
}
