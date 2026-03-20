// Board polling: reload when updated_at changes

import { draggedCard, attachDragListeners } from './dragDrop';
import { attachAutoScrollToBody } from './autoScroll';
import type { ActiveFilters, TaskDetail } from './types';

let lastUpdatedAt: string | null = null;

export function getLastUpdatedAt(): string | null {
  return lastUpdatedAt;
}

export function setLastUpdatedAt(val: string | null): void {
  lastUpdatedAt = val;
}

export const activeFilters: ActiveFilters = { tagIds: [], priorities: [], assignee: '' };

export function buildFilterParams(): URLSearchParams {
  const params = new URLSearchParams();
  if (activeFilters.priorities.length > 0) {
    params.set('priority', activeFilters.priorities.join(','));
  }
  if (activeFilters.tagIds.length > 0) {
    params.set('tags', activeFilters.tagIds.join(','));
  }
  if (activeFilters.assignee) {
    params.set('assignee', activeFilters.assignee);
  }
  return params;
}

// Callbacks to be set by detailPanel module after initialization
// This breaks the circular dependency
let _openTaskDetail: ((taskId: string) => Promise<void>) | null = null;
let _renderDetailPanel: ((data: TaskDetail) => void) | null = null;
let _showUpdateWarning: (() => void) | null = null;
let _getDetailTaskId: (() => number | null) | null = null;

export function registerDetailPanelCallbacks(callbacks: {
  openTaskDetail: (taskId: string) => Promise<void>;
  renderDetailPanel: (data: TaskDetail) => void;
  showUpdateWarning: () => void;
  getDetailTaskId: () => number | null;
}): void {
  _openTaskDetail = callbacks.openTaskDetail;
  _renderDetailPanel = callbacks.renderDetailPanel;
  _showUpdateWarning = callbacks.showUpdateWarning;
  _getDetailTaskId = callbacks.getDetailTaskId;
}

function attachCardListeners(body: HTMLElement): void {
  body.querySelectorAll<HTMLElement>('.card').forEach((card) => {
    attachDragListeners(card);
    card.addEventListener('click', async (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      if (_openTaskDetail) await _openTaskDetail(card.dataset.id!);
    });
  });
}

function updateColumnHtml(col: { status: string; html: string; count: number }): void {
  const body = document.getElementById('col-' + col.status);
  if (!body) return;
  body.innerHTML = col.html;
  const colEl = body.closest('.column');
  if (colEl) {
    const countEl = colEl.querySelector('.column-count');
    if (countEl) countEl.textContent = String(col.count);
  }
  attachCardListeners(body);
  attachAutoScrollToBody(body);
}

function isEditingDetailPanel(): boolean {
  const editableFields = ['detail-edit-title', 'detail-edit-body', 'detail-edit-status', 'detail-edit-priority'];
  return editableFields.some((id) => document.activeElement && document.activeElement.id === id);
}

async function refreshOpenDetailPanel(detailTaskId: number): Promise<void> {
  if (isEditingDetailPanel()) {
    if (_showUpdateWarning) _showUpdateWarning();
    return;
  }
  try {
    const taskRes = await fetch('/api/tasks/' + detailTaskId);
    if (taskRes.ok) {
      const taskData = (await taskRes.json()) as TaskDetail;
      if (_renderDetailPanel) _renderDetailPanel(taskData);
    }
  } catch {
    // Ignore network errors during detail panel refresh
  }
}

export async function refreshBoardCards(): Promise<void> {
  const filterParams = buildFilterParams();
  const url = '/api/board/cards' + (filterParams.toString() ? '?' + filterParams.toString() : '');
  try {
    const res = await fetch(url);
    if (!res.ok) return;
    const data = (await res.json()) as { columns: Array<{ status: string; html: string; count: number }> };
    data.columns.forEach(updateColumnHtml);

    // If detail panel is open, refresh its content if the task was updated
    const detailTaskId = _getDetailTaskId ? _getDetailTaskId() : null;
    if (detailTaskId !== null) {
      await refreshOpenDetailPanel(detailTaskId);
    }
  } catch {
    // Ignore network errors during card refresh
  }
}

export async function pollBoardUpdates(): Promise<void> {
  if (draggedCard !== null) return;
  try {
    const res = await fetch('/api/board/updated-at');
    if (!res.ok) return;
    const data = (await res.json()) as { updatedAt: string };
    const ts: string = data.updatedAt;
    const detailPanel = document.getElementById('detail-panel') as HTMLElement;
    if (lastUpdatedAt === null) {
      lastUpdatedAt = ts;
    } else if (ts !== lastUpdatedAt) {
      lastUpdatedAt = ts;
      if (detailPanel.classList.contains('open')) {
        await refreshBoardCards();
      } else {
        location.reload();
      }
    }
  } catch {
    // Ignore network errors during polling
  }
}

export function initBoardPolling(): void {
  setInterval(pollBoardUpdates, 5000);
  pollBoardUpdates();
}
