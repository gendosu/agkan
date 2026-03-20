// Add task modal functionality

import { showToast } from './utils';

interface AddModalElements {
  addModal: HTMLElement;
  addTitle: HTMLInputElement;
  addBody: HTMLTextAreaElement;
  addPriority: HTMLSelectElement;
  addStatus: HTMLInputElement;
}

function openAddModal(elements: AddModalElements, status: string): void {
  elements.addStatus.value = status;
  elements.addTitle.value = '';
  elements.addBody.value = '';
  elements.addPriority.value = '';
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

  try {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        body: elements.addBody.value.trim() || null,
        status,
        priority: elements.addPriority.value || null,
      }),
    });
    if (!res.ok) throw new Error('Server error');
    location.reload();
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
  };

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

  document.getElementById('add-submit')?.addEventListener('click', () => submitAddTask(elements));
}
