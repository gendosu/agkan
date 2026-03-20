// Context menu functionality

import { showToast } from './utils';
import { updateCount } from './dragDrop';

async function deleteCard(card: HTMLElement): Promise<void> {
  const taskId = card.dataset.id!;
  const status = card.dataset.status!;
  if (!confirm('Delete task #' + taskId + '?')) return;

  card.remove();
  updateCount(status);

  try {
    const res = await fetch('/api/tasks/' + taskId, { method: 'DELETE' });
    if (!res.ok) throw new Error('Server error');
  } catch {
    location.reload();
    showToast('Failed to delete task');
  }
}

export function initContextMenu(): void {
  const ctxMenu = document.getElementById('context-menu') as HTMLElement;
  let ctxTargetCard: HTMLElement | null = null;

  document.addEventListener('contextmenu', (e: MouseEvent) => {
    const card = (e.target as HTMLElement).closest<HTMLElement>('.card');
    if (!card) {
      ctxMenu.style.display = 'none';
      return;
    }
    e.preventDefault();
    ctxTargetCard = card;
    ctxMenu.style.left = e.clientX + 'px';
    ctxMenu.style.top = e.clientY + 'px';
    ctxMenu.style.display = 'block';
  });

  document.addEventListener('click', (e: MouseEvent) => {
    if (!(e.target as HTMLElement).closest('#context-menu')) {
      ctxMenu.style.display = 'none';
      ctxTargetCard = null;
    }
  });

  document.getElementById('ctx-delete')?.addEventListener('click', async (e: MouseEvent) => {
    e.stopPropagation();
    ctxMenu.style.display = 'none';
    if (!ctxTargetCard) return;
    const card = ctxTargetCard;
    ctxTargetCard = null;
    await deleteCard(card);
  });
}
