// Add task modal functionality

import { showToast } from './utils';

export function initAddTaskModal(): void {
  const addModal = document.getElementById('add-modal') as HTMLElement;
  const addTitle = document.getElementById('add-title') as HTMLInputElement;
  const addBody = document.getElementById('add-body') as HTMLTextAreaElement;
  const addPriority = document.getElementById('add-priority') as HTMLSelectElement;
  const addStatus = document.getElementById('add-status') as HTMLInputElement;

  document.querySelectorAll<HTMLButtonElement>('.add-btn').forEach((btn) => {
    btn.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      addStatus.value = btn.dataset.status!;
      addTitle.value = '';
      addBody.value = '';
      addPriority.value = '';
      addModal.classList.add('show');
      addTitle.focus();
    });
  });

  document.getElementById('add-cancel')?.addEventListener('click', () => {
    addModal.classList.remove('show');
  });

  addModal.addEventListener('click', (e: MouseEvent) => {
    if (e.target === addModal) addModal.classList.remove('show');
  });

  addTitle.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      (document.getElementById('add-submit') as HTMLButtonElement).click();
    }
  });

  document.getElementById('add-submit')?.addEventListener('click', async () => {
    const title = addTitle.value.trim();
    if (!title) {
      addTitle.focus();
      return;
    }
    const status = addStatus.value;
    addModal.classList.remove('show');

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          body: addBody.value.trim() || null,
          status,
          priority: addPriority.value || null,
        }),
      });
      if (!res.ok) throw new Error('Server error');
      location.reload();
    } catch {
      showToast('Failed to add task');
    }
  });
}
