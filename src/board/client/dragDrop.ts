// Drag and drop functionality

import { showToast } from './utils';

let _redrawDependencies: (() => void) | null = null;

export function registerDependencyRedrawCallback(callback: () => void): void {
  _redrawDependencies = callback;
}

export let draggedCard: HTMLElement | null = null;
export let sourceBody: HTMLElement | null = null;

export function updateCount(status: string): void {
  const col = document.querySelector(`.column[data-status="${status}"]`);
  if (!col) return;
  const countEl = col.querySelector('.column-count');
  const bodyEl = col.querySelector('.column-body');
  if (countEl && bodyEl) {
    countEl.textContent = String(bodyEl.children.length);
  }
}

async function handleDrop(e: DragEvent, newStatus: string, colEl: HTMLElement): Promise<void> {
  e.preventDefault();
  colEl.classList.remove('drag-over');
  if (!draggedCard) return;
  const taskId = (draggedCard as HTMLElement).dataset.id;
  const oldStatus = (draggedCard as HTMLElement).dataset.status;
  if (oldStatus === newStatus) return;

  const targetBody = document.getElementById('col-' + newStatus) as HTMLElement;
  const prevBody = sourceBody;
  targetBody.appendChild(draggedCard);
  (draggedCard as HTMLElement).dataset.status = newStatus;
  updateCount(oldStatus!);
  updateCount(newStatus);

  try {
    const res = await fetch('/api/tasks/' + taskId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!res.ok) throw new Error('Server error');
    // Redraw dependencies after successful drop
    if (_redrawDependencies) {
      _redrawDependencies();
    }
  } catch {
    if (prevBody && draggedCard) {
      prevBody.appendChild(draggedCard);
      (draggedCard as HTMLElement).dataset.status = oldStatus!;
      updateCount(oldStatus!);
      updateCount(newStatus);
    }
    showToast();
  }
}

export function attachDragListeners(card: HTMLElement): void {
  card.addEventListener('dragstart', (e: DragEvent) => {
    draggedCard = card;
    sourceBody = card.parentElement;
    card.classList.add('dragging');
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  });
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    draggedCard = null;
    sourceBody = null;
  });
}

export function initDragDrop(): void {
  document.querySelectorAll<HTMLElement>('.card').forEach((card) => {
    attachDragListeners(card);
  });

  document.querySelectorAll<HTMLElement>('.column').forEach((col) => {
    col.addEventListener('dragover', (e: DragEvent) => {
      e.preventDefault();
      col.classList.add('drag-over');
    });
    col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
    col.addEventListener('drop', (e: DragEvent) => handleDrop(e, col.dataset.status!, col));
  });
}
