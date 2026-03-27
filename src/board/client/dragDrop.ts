// Drag and drop functionality

import { showToast } from './utils';

let _redrawDependencies: (() => void) | null = null;

export function registerDependencyRedrawCallback(callback: () => void): void {
  _redrawDependencies = callback;
}

export let draggedCard: HTMLElement | null = null;
export let sourceBody: HTMLElement | null = null;

// Track mouse position and drag offset for virtual rect calculation
let _dragMouseX = 0;
let _dragMouseY = 0;
let _dragOffsetX = 0;
let _dragOffsetY = 0;

/** Returns a simulated DOMRect for the dragged card based on current mouse position. */
export function getDraggedCardVirtualRect(): DOMRect | null {
  if (!draggedCard) return null;
  const rect = draggedCard.getBoundingClientRect();
  const left = _dragMouseX - _dragOffsetX;
  const top = _dragMouseY - _dragOffsetY;
  return new DOMRect(left, top, rect.width, rect.height);
}

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

let _documentDragOverListener: ((e: DragEvent) => void) | null = null;

export function attachDragListeners(card: HTMLElement): void {
  card.addEventListener('dragstart', (e: DragEvent) => {
    draggedCard = card;
    sourceBody = card.parentElement;
    card.classList.add('dragging');
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';

    // Record offset of mouse within the card for virtual rect calculation
    const rect = card.getBoundingClientRect();
    _dragOffsetX = e.clientX - rect.left;
    _dragOffsetY = e.clientY - rect.top;
    _dragMouseX = e.clientX;
    _dragMouseY = e.clientY;

    // Track mouse position during drag and redraw dependency lines
    _documentDragOverListener = (ev: DragEvent) => {
      _dragMouseX = ev.clientX;
      _dragMouseY = ev.clientY;
      if (_redrawDependencies) _redrawDependencies();
    };
    document.addEventListener('dragover', _documentDragOverListener);
  });
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    draggedCard = null;
    sourceBody = null;
    if (_documentDragOverListener) {
      document.removeEventListener('dragover', _documentDragOverListener);
      _documentDragOverListener = null;
    }
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
