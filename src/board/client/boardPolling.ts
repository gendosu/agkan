// Board streaming: receive board updates via SSE

import { draggedCard, isPendingStatusUpdate, attachDragListeners } from './dragDrop';
import { attachAutoScrollToBody } from './autoScroll';
import { attachClaudeButtonListeners, getRunningTaskIds, updateButtonStates } from './claudeButton';
import type { ActiveFilters, TaskDetail } from './types';

export const activeFilters: ActiveFilters = { tagIds: [], priorities: [], assignee: '', searchText: '' };

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
  if (activeFilters.searchText) {
    params.set('search', activeFilters.searchText);
  }
  return params;
}

// Callbacks to be set by detailPanel module after initialization
// This breaks the circular dependency
let _openTaskDetail: ((taskId: string) => Promise<void>) | null = null;
let _renderDetailPanel: ((data: TaskDetail) => void) | null = null;
let _showUpdateWarning: (() => void) | null = null;
let _getDetailTaskId: (() => number | null) | null = null;
let _getDetailActiveTab: (() => string) | null = null;
let _setActiveCard: ((taskId: number | null) => void) | null = null;
let _redrawDependencies: (() => void) | null = null;

export function registerDetailPanelCallbacks(callbacks: {
  openTaskDetail: (taskId: string) => Promise<void>;
  renderDetailPanel: (data: TaskDetail) => void;
  showUpdateWarning: () => void;
  getDetailTaskId: () => number | null;
  getDetailActiveTab: () => string;
  setActiveCard: (taskId: number | null) => void;
}): void {
  _openTaskDetail = callbacks.openTaskDetail;
  _renderDetailPanel = callbacks.renderDetailPanel;
  _showUpdateWarning = callbacks.showUpdateWarning;
  _getDetailTaskId = callbacks.getDetailTaskId;
  _getDetailActiveTab = callbacks.getDetailActiveTab;
  _setActiveCard = callbacks.setActiveCard;
}

export function registerDependencyRedrawCallback(callback: () => void): void {
  _redrawDependencies = callback;
}

function attachCardListeners(body: HTMLElement): void {
  body.querySelectorAll<HTMLElement>('.card').forEach((card) => {
    attachDragListeners(card);
    if (card.dataset.listenersAttached) return;
    card.dataset.listenersAttached = '1';
    card.addEventListener('click', async (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      if (_openTaskDetail) await _openTaskDetail(card.dataset.id!);
    });
  });
}

export function applyIncrementalCardUpdate(body: HTMLElement, newHtml: string): void {
  const template = document.createElement('div');
  template.innerHTML = newHtml;
  const newCards = Array.from(template.querySelectorAll<HTMLElement>('.card'));

  // Build a map of existing cards by id
  const existingCards = new Map<string, HTMLElement>();
  body.querySelectorAll<HTMLElement>('.card').forEach((card) => {
    const id = card.dataset.id;
    if (id) existingCards.set(id, card);
  });

  // Build a set of new card ids to detect removals
  const newCardIds = new Set<string>();
  newCards.forEach((card) => {
    const id = card.dataset.id;
    if (id) newCardIds.add(id);
  });

  // Remove cards no longer present
  existingCards.forEach((card, id) => {
    if (!newCardIds.has(id)) {
      card.remove();
    }
  });

  // Insert or update cards in order
  newCards.forEach((newCard, index) => {
    const id = newCard.dataset.id;
    const newUpdatedAt = newCard.dataset.updatedAt;
    const newTagIds = newCard.dataset.tagIds ?? '';
    const newBlockedBy = newCard.dataset.blockedBy ?? '';
    const newBlocking = newCard.dataset.blocking ?? '';
    const existing = id ? existingCards.get(id) : undefined;

    if (existing) {
      // Update if content changed: compare updated-at, tag, and dependency attributes
      const existingUpdatedAt = existing.dataset.updatedAt;
      const existingTagIds = existing.dataset.tagIds ?? '';
      const existingBlockedBy = existing.dataset.blockedBy ?? '';
      const existingBlocking = existing.dataset.blocking ?? '';
      const tagsChanged = newTagIds !== existingTagIds;
      const depsChanged = newBlockedBy !== existingBlockedBy || newBlocking !== existingBlocking;
      let activeCard: HTMLElement;
      if (newUpdatedAt !== existingUpdatedAt || tagsChanged || depsChanged) {
        existing.replaceWith(newCard);
        activeCard = newCard;
      } else {
        activeCard = existing;
      }
      // Reorder if not in correct position
      const currentChild = body.children[index];
      if (currentChild !== activeCard) {
        body.insertBefore(activeCard, currentChild || null);
      }
    } else {
      // New card: insert at correct position
      const currentChild = body.children[index];
      body.insertBefore(newCard, currentChild || null);
    }
  });
}

function updateColumnHtml(col: { status: string; html: string; count: number }): void {
  const body = document.getElementById('col-' + col.status);
  if (!body) return;
  applyIncrementalCardUpdate(body, col.html);
  const colEl = body.closest('.column');
  if (colEl) {
    const countEl = colEl.querySelector('.column-count');
    if (countEl) countEl.textContent = String(col.count);
  }
  attachCardListeners(body);
  attachAutoScrollToBody(body);
  attachClaudeButtonListeners(body);
  updateButtonStates(getRunningTaskIds());
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
  if (_getDetailActiveTab && _getDetailActiveTab() === 'run-logs') {
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

    // Re-apply active card indicator after DOM update
    const detailTaskId = _getDetailTaskId ? _getDetailTaskId() : null;
    if (detailTaskId !== null && _setActiveCard) {
      _setActiveCard(detailTaskId);
    }

    // Redraw dependency visualization if enabled
    if (_redrawDependencies) {
      _redrawDependencies();
    }

    // If detail panel is open, refresh its content if the task was updated
    if (detailTaskId !== null) {
      await refreshOpenDetailPanel(detailTaskId);
    }
  } catch {
    // Ignore network errors during card refresh
  }
}

export function initBoardPolling(): void {
  const es = new EventSource('/api/board/stream');

  es.addEventListener('update', () => {
    if (draggedCard !== null || isPendingStatusUpdate) return;
    refreshBoardCards();
  });
}
