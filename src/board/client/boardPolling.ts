// Board synchronization: SSE updates with periodic reconciliation

import { draggedCard, isPendingStatusUpdate, attachDragListeners, addDragDropIdleListener } from './dragDrop';
import { attachAutoScrollToBody } from './autoScroll';
import { attachClaudeButtonListeners, getRunningTaskIds, updateButtonStates } from './claudeButton';
import type { ActiveFilters, TaskDetail } from './types';
import { addBoardStreamListener } from './boardStream';

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
let _isDetailDirty: (() => boolean) | null = null;
let _redrawDependencies: (() => void) | null = null;
const detailRefreshSuppressedUntil = new Map<number, number>();
let pendingDetailRefreshTaskId: number | null = null;

// A PATCH initiated by the open detail panel also emits a board update. Keep
// that update from re-rendering the form and discarding unsaved title/body text.
export function suppressDetailRefreshForTask(taskId: number): void {
  const until = Date.now() + 1500;
  detailRefreshSuppressedUntil.set(taskId, until);
  setTimeout(() => {
    if (detailRefreshSuppressedUntil.get(taskId) === until) {
      detailRefreshSuppressedUntil.delete(taskId);
    }
  }, 1500);
}

function isDetailRefreshSuppressed(): boolean {
  const now = Date.now();
  let suppressed = false;
  detailRefreshSuppressedUntil.forEach((until, taskId) => {
    if (until < now) {
      detailRefreshSuppressedUntil.delete(taskId);
    } else {
      suppressed = true;
    }
  });
  return suppressed;
}

interface RefreshBoardCardsOptions {
  suppressDetailRefresh?: boolean;
  suppressDetailRefreshForTaskId?: number;
}

export function registerDetailPanelCallbacks(callbacks: {
  openTaskDetail: (taskId: string) => Promise<void>;
  renderDetailPanel: (data: TaskDetail) => void;
  showUpdateWarning: () => void;
  getDetailTaskId: () => number | null;
  getDetailActiveTab: () => string;
  setActiveCard: (taskId: number | null) => void;
  isDetailDirty?: () => boolean;
}): void {
  detailRefreshSuppressedUntil.clear();
  pendingDetailRefreshTaskId = null;
  _openTaskDetail = callbacks.openTaskDetail;
  _renderDetailPanel = callbacks.renderDetailPanel;
  _showUpdateWarning = callbacks.showUpdateWarning;
  _getDetailTaskId = callbacks.getDetailTaskId;
  _getDetailActiveTab = callbacks.getDetailActiveTab;
  _setActiveCard = callbacks.setActiveCard;
  _isDetailDirty = callbacks.isDetailDirty || null;
}

export function registerDependencyRedrawCallback(callback: () => void): void {
  _redrawDependencies = callback;
}

function attachCardListeners(body: HTMLElement): void {
  body.querySelectorAll<HTMLElement>('.card').forEach((card) => {
    if (card.dataset.listenersAttached) return;
    card.dataset.listenersAttached = '1';
    attachDragListeners(card);
    card.addEventListener('click', async (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      if (_openTaskDetail) await _openTaskDetail(card.dataset.id!);
    });
  });
}

interface CardWatchAttrs {
  updatedAt: string;
  tagIds: string;
  blockedBy: string;
  blocking: string;
}

function readCardWatchAttrs(card: HTMLElement): CardWatchAttrs {
  return {
    updatedAt: card.dataset.updatedAt ?? '',
    tagIds: card.dataset.tagIds ?? '',
    blockedBy: card.dataset.blockedBy ?? '',
    blocking: card.dataset.blocking ?? '',
  };
}

function cardWatchAttrsEqual(a: CardWatchAttrs, b: CardWatchAttrs): boolean {
  return (
    a.updatedAt === b.updatedAt && a.tagIds === b.tagIds && a.blockedBy === b.blockedBy && a.blocking === b.blocking
  );
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
    const existing = id ? existingCards.get(id) : undefined;

    if (existing) {
      // Update if content changed: compare updated-at, tag, and dependency attributes
      let activeCard: HTMLElement;
      if (!cardWatchAttrsEqual(readCardWatchAttrs(existing), readCardWatchAttrs(newCard))) {
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

function findCardElementById(taskId: number): HTMLElement | null {
  return document.querySelector<HTMLElement>('.card[data-id="' + taskId + '"]');
}

interface DetailCardSnapshot extends CardWatchAttrs {
  status: string;
}

// Captures the detail task's card attributes by value (not an element reference) so the
// comparison in didDetailCardChange doesn't depend on whether the DOM node gets replaced
// or updated in place.
function snapshotDetailCard(taskId: number): DetailCardSnapshot | null {
  const card = findCardElementById(taskId);
  if (!card) return null;
  return { ...readCardWatchAttrs(card), status: card.dataset.status ?? '' };
}

// Detects whether the detail task's own card changed (attributes, status/column move, or
// appeared/disappeared), as opposed to some other task's card changing elsewhere on the
// board. When the card can't be found on either side (e.g. filtered out of view), we cannot
// rule out a change, so we conservatively report a change and let the panel refresh.
function didDetailCardChange(before: DetailCardSnapshot | null, after: DetailCardSnapshot | null): boolean {
  if (before === null || after === null) return true;
  return !cardWatchAttrsEqual(before, after) || before.status !== after.status;
}

// Refreshes the open detail panel only if the detail task's own card changed —
// unrelated task updates elsewhere on the board must not reload/warn the open panel.
async function refreshDetailPanelIfCardChanged(
  detailTaskId: number,
  beforeDetailSnapshot: DetailCardSnapshot | null,
  signal: AbortSignal
): Promise<void> {
  const afterDetailSnapshot = snapshotDetailCard(detailTaskId);
  if (didDetailCardChange(beforeDetailSnapshot, afterDetailSnapshot)) {
    pendingDetailRefreshTaskId = detailTaskId;
  }
  if (pendingDetailRefreshTaskId === detailTaskId) {
    const handled = await refreshOpenDetailPanel(detailTaskId, signal);
    if (handled && !signal.aborted) pendingDetailRefreshTaskId = null;
  }
}

function isEditingDetailPanel(): boolean {
  const editableFields = [
    'detail-edit-title',
    'detail-edit-body',
    'detail-edit-status',
    'detail-edit-priority',
    'detail-edit-branch',
    'detail-edit-model-planning',
    'detail-edit-effort-planning',
    'detail-edit-model-run',
    'detail-edit-effort-run',
  ];
  if (editableFields.some((id) => document.activeElement && document.activeElement.id === id)) {
    return true;
  }
  if (
    document.activeElement &&
    (document.activeElement.closest('.markdown-editor') || document.activeElement.closest('.description-field-wrapper'))
  ) {
    return true;
  }
  if (_isDetailDirty && _isDetailDirty()) {
    return true;
  }
  return false;
}

async function refreshOpenDetailPanel(detailTaskId: number, signal: AbortSignal): Promise<boolean> {
  if (isEditingDetailPanel()) {
    if (_showUpdateWarning) _showUpdateWarning();
    return true;
  }
  if (_getDetailActiveTab && _getDetailActiveTab() === 'run-logs') {
    return true;
  }
  try {
    const taskRes = await fetch('/api/tasks/' + detailTaskId, { signal, cache: 'no-store' });
    if (!taskRes.ok) return false;
    const taskData = (await taskRes.json()) as TaskDetail;
    if (signal.aborted || isBoardInteractionPending() || _getDetailTaskId?.() !== detailTaskId) return false;
    if (_getDetailActiveTab?.() === 'run-logs') return true;
    if (isEditingDetailPanel()) {
      _showUpdateWarning?.();
    } else {
      _renderDetailPanel?.(taskData);
    }
    return true;
  } catch {
    // Ignore network errors during detail panel refresh
    return false;
  }
}

interface RefreshRequest {
  suppressDetailRefresh: boolean;
  suppressedTaskIds: Set<number>;
  resolve: Array<() => void>;
}

let pendingRefresh: RefreshRequest | null = null;
let refreshing = false;
let refreshController: AbortController | null = null;
let stopPolling: (() => void) | null = null;

function isBoardInteractionPending(): boolean {
  return draggedCard !== null || isPendingStatusUpdate;
}

function queueRefresh(request: RefreshRequest): void {
  if (pendingRefresh === null) {
    pendingRefresh = request;
    return;
  }
  pendingRefresh.suppressDetailRefresh ||= request.suppressDetailRefresh;
  request.suppressedTaskIds.forEach((id) => pendingRefresh!.suppressedTaskIds.add(id));
  pendingRefresh.resolve.push(...request.resolve);
}

async function performRefresh(request: RefreshRequest, signal: AbortSignal): Promise<boolean> {
  const filterParams = buildFilterParams();
  const filterKey = filterParams.toString();
  const url = '/api/board/cards' + (filterKey ? '?' + filterKey : '');
  const res = await fetch(url, { signal, cache: 'no-store' });
  if (!res.ok || signal.aborted) return false;
  const data = (await res.json()) as { columns: Array<{ status: string; html: string; count: number }> };

  if (signal.aborted) return false;
  // The response may have become obsolete while the fetch/body was pending.
  if (isBoardInteractionPending() || filterKey !== buildFilterParams().toString()) return true;

  const detailTaskId = _getDetailTaskId ? _getDetailTaskId() : null;
  if (pendingDetailRefreshTaskId !== detailTaskId) pendingDetailRefreshTaskId = null;
  const beforeDetailSnapshot = detailTaskId !== null ? snapshotDetailCard(detailTaskId) : null;

  data.columns.forEach(updateColumnHtml);

  // Re-apply active card indicator after DOM update
  if (detailTaskId !== null && _setActiveCard) {
    _setActiveCard(detailTaskId);
  }

  // Redraw dependency visualization if enabled
  if (_redrawDependencies) {
    _redrawDependencies();
  }

  const suppressDetailRefresh =
    detailTaskId !== null &&
    (request.suppressDetailRefresh || request.suppressedTaskIds.has(detailTaskId) || isDetailRefreshSuppressed());
  if (detailTaskId !== null && !suppressDetailRefresh) {
    await refreshDetailPanelIfCardChanged(detailTaskId, beforeDetailSnapshot, signal);
  }
  return !signal.aborted && isBoardInteractionPending();
}

async function flushPendingRefresh(): Promise<void> {
  if (refreshing || isBoardInteractionPending()) return;
  refreshing = true;
  try {
    while (pendingRefresh !== null && !isBoardInteractionPending()) {
      const request = pendingRefresh;
      pendingRefresh = null;
      const controller = new AbortController();
      refreshController = controller;
      // Race the entire refresh (including JSON/detail) so even an unresponsive
      // transport cannot hold the queue indefinitely after aborting.
      const aborted = new Promise<false>((resolve) => {
        controller.signal.addEventListener('abort', () => resolve(false), { once: true });
      });
      const timeout = setTimeout(() => controller.abort(), 5000);
      let deferred = false;
      try {
        deferred = await Promise.race([performRefresh(request, controller.signal), aborted]);
      } catch {
        // Leave retries to a later notification/interval rather than spinning.
      } finally {
        clearTimeout(timeout);
        refreshController = null;
      }
      if (deferred && !controller.signal.aborted) {
        queueRefresh(request);
      } else {
        request.resolve.forEach((resolve) => resolve());
      }
    }
  } finally {
    refreshing = false;
  }
}

export function refreshBoardCards(options?: RefreshBoardCardsOptions): Promise<void> {
  return new Promise((resolve) => {
    queueRefresh({
      suppressDetailRefresh: options?.suppressDetailRefresh === true,
      suppressedTaskIds: new Set(
        options?.suppressDetailRefreshForTaskId === undefined ? [] : [options.suppressDetailRefreshForTaskId]
      ),
      resolve: [resolve],
    });
    void flushPendingRefresh();
  });
}

export function initBoardPolling(): () => void {
  stopPolling?.();
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  const refresh = () => {
    void refreshBoardCards();
  };
  const unsubscribe = addBoardStreamListener('board-update', refresh);
  const unsubscribeIdle = addDragDropIdleListener(() => {
    void flushPendingRefresh();
  });

  const updateVisibility = () => {
    if (timer !== null) clearInterval(timer);
    timer = null;
    if (document.visibilityState === 'visible') {
      refresh();
      timer = setInterval(refresh, 2000);
    }
  };
  if (document.visibilityState === 'visible') timer = setInterval(refresh, 2000);
  document.addEventListener('visibilitychange', updateVisibility);

  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    if (timer !== null) clearInterval(timer);
    unsubscribe();
    unsubscribeIdle();
    document.removeEventListener('visibilitychange', updateVisibility);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', resume);
    refreshController?.abort();
    pendingRefresh?.resolve.forEach((resolve) => resolve());
    pendingRefresh = null;
    if (stopPolling === cleanup) stopPolling = null;
  };
  const resume = (event: PageTransitionEvent) => {
    if (event.persisted) {
      initBoardPolling();
      refresh();
    }
  };
  const onPageHide = (event: PageTransitionEvent) => {
    cleanup();
    if (event.persisted) window.addEventListener('pageshow', resume, { once: true });
  };
  window.addEventListener('pagehide', onPageHide);
  stopPolling = cleanup;
  return cleanup;
}
