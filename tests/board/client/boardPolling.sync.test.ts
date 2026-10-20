/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  activeFilters,
  initBoardPolling,
  refreshBoardCards,
  registerDetailPanelCallbacks,
} from '../../../src/board/client/boardPolling';
import { initDragDrop } from '../../../src/board/client/dragDrop';

const stream = vi.hoisted(() => ({ listener: null as (() => void) | null, unsubscribe: vi.fn() }));
vi.mock('../../../src/board/client/boardStream', () => ({
  addBoardStreamListener: vi.fn((_type: string, listener: () => void) => {
    stream.listener = listener;
    return stream.unsubscribe;
  }),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function cards(title: string, status = 'backlog', tagIds = ''): Response {
  return {
    ok: true,
    json: async () => ({
      columns: ['backlog', 'ready'].map((column) => ({
        status: column,
        html:
          column === status
            ? `<div class="card" data-id="1" data-status="${status}" data-tag-ids="${tagIds}" data-updated-at="${title}">${title}</div>`
            : '',
        count: column === status ? 1 : 0,
      })),
    }),
  } as Response;
}

let stop: (() => void) | void;
let hidden = false;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  hidden = false;
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => (hidden ? 'hidden' : 'visible'));
  activeFilters.tagIds = [];
  activeFilters.priorities = [];
  activeFilters.assignee = '';
  activeFilters.searchText = '';
  registerDetailPanelCallbacks({
    openTaskDetail: vi.fn(),
    renderDetailPanel: vi.fn(),
    showUpdateWarning: vi.fn(),
    getDetailTaskId: () => null,
    getDetailActiveTab: () => 'details',
    setActiveCard: vi.fn(),
  });
  document.body.innerHTML = ['backlog', 'ready']
    .map(
      (status) =>
        `<div class="column" data-status="${status}"><span class="column-count">0</span><div class="column-body" id="col-${status}"></div></div>`
    )
    .join('');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(cards('latest')));
  stop = initBoardPolling();
});

afterEach(async () => {
  document.querySelector('.dragging')?.dispatchEvent(new Event('dragend'));
  if (typeof stop === 'function') stop();
  await vi.advanceTimersByTimeAsync(0);
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Board resynchronization', () => {
  it.each(['drag', 'timeout', 'network'] as const)(
    'retries a detail update interrupted by %s even after its card was updated',
    async (interruption) => {
      const detail = deferred<Response>();
      const renderDetailPanel = vi.fn();
      registerDetailPanelCallbacks({
        openTaskDetail: vi.fn(),
        renderDetailPanel,
        showUpdateWarning: vi.fn(),
        getDetailTaskId: () => 1,
        getDetailActiveTab: () => 'details',
        setActiveCard: vi.fn(),
      });
      const detailResponse = { ok: true, json: async () => ({ task: { id: 1, title: 'latest' } }) } as Response;
      vi.mocked(fetch).mockImplementation(async (url) => {
        if (url === '/api/tasks/1') return detailResponse;
        return cards('latest');
      });
      vi.mocked(fetch)
        .mockResolvedValueOnce(cards('latest'))
        .mockReturnValueOnce(interruption === 'network' ? Promise.reject(new Error('offline')) : detail.promise);
      const request = refreshBoardCards();
      await vi.advanceTimersByTimeAsync(0);
      const card = document.querySelector<HTMLElement>('.card')!;
      expect(card.textContent).toBe('latest');
      if (interruption === 'drag') {
        card.dispatchEvent(new Event('dragstart'));
        detail.resolve(detailResponse);
        await vi.advanceTimersByTimeAsync(0);
        expect(renderDetailPanel).not.toHaveBeenCalled();
        card.dispatchEvent(new Event('dragend'));
      } else if (interruption === 'timeout') {
        await vi.advanceTimersByTimeAsync(5000);
      }
      await request;
      await vi.advanceTimersByTimeAsync(2000);
      expect(renderDetailPanel).toHaveBeenCalledOnce();
      expect(document.querySelector('.card')).toBe(card);
    }
  );

  it('protects edits started while a detail fetch is in flight', async () => {
    const detail = deferred<Response>();
    const renderDetailPanel = vi.fn();
    const showUpdateWarning = vi.fn();
    let dirty = false;
    registerDetailPanelCallbacks({
      openTaskDetail: vi.fn(),
      renderDetailPanel,
      showUpdateWarning,
      getDetailTaskId: () => 1,
      getDetailActiveTab: () => 'details',
      setActiveCard: vi.fn(),
      isDetailDirty: () => dirty,
    });
    vi.mocked(fetch).mockResolvedValueOnce(cards('latest')).mockReturnValueOnce(detail.promise);
    const request = refreshBoardCards();
    await vi.advanceTimersByTimeAsync(0);
    dirty = true;
    detail.resolve({ ok: true, json: async () => ({ task: { id: 1 } }) } as Response);
    await request;
    expect(renderDetailPanel).not.toHaveBeenCalled();
    expect(showUpdateWarning).toHaveBeenCalledOnce();
  });

  it('refreshes every two seconds without any SSE notification', async () => {
    await vi.advanceTimersByTimeAsync(2000);
    expect(document.querySelector('.card')?.textContent).toBe('latest');
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('recovers on the next interval after a network failure', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
    await vi.advanceTimersByTimeAsync(2000);
    expect(document.querySelector('.card')).toBeNull();
    await vi.advanceTimersByTimeAsync(2000);
    expect(document.querySelector('.card')?.textContent).toBe('latest');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('stops periodic requests in a hidden tab and synchronizes immediately on return', async () => {
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(6000);
    expect(fetch).not.toHaveBeenCalled();
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(document.querySelector('.card')?.textContent).toBe('latest');
  });

  it('cleans up subscriptions, timers and visibility listeners on reinitialization and shutdown', async () => {
    const oldStop = stop;
    stop = initBoardPolling();
    expect(stream.unsubscribe).toHaveBeenCalledOnce();
    if (typeof oldStop === 'function') oldStop();
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetch).toHaveBeenCalledOnce();
    if (typeof stop === 'function') stop();
    vi.mocked(fetch).mockClear();
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(6000);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('coalesces a burst during a request and waits for the final response', async () => {
    const first = deferred<Response>();
    const last = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(first.promise).mockReturnValueOnce(last.promise);
    const firstRefresh = refreshBoardCards();
    const settled = vi.fn();
    const finalRefresh = refreshBoardCards().then(settled);
    for (let i = 0; i < 20; i++) stream.listener?.();
    expect(fetch).toHaveBeenCalledOnce();
    first.resolve(cards('old'));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(settled).not.toHaveBeenCalled();
    last.resolve(cards('latest'));
    await Promise.all([firstRefresh, finalRefresh]);
    expect(document.querySelector('.card')?.textContent).toBe('latest');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('cleans up on pagehide and immediately resynchronizes after a back-forward cache restore', async () => {
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    await vi.advanceTimersByTimeAsync(4000);
    expect(fetch).not.toHaveBeenCalled();
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    await vi.advanceTimersByTimeAsync(0);
    expect(document.querySelector('.card')?.textContent).toBe('latest');
    stop = initBoardPolling();
  });

  it('discards an obsolete filter response and uses the final filter for the queued request', async () => {
    const first = deferred<Response>();
    const last = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(first.promise).mockReturnValueOnce(last.promise);
    const initial = refreshBoardCards();
    activeFilters.tagIds = [3];
    const intermediate = refreshBoardCards();
    activeFilters.tagIds = [7];
    const final = refreshBoardCards();
    first.resolve(cards('obsolete'));
    await vi.advanceTimersByTimeAsync(0);
    expect(document.querySelector('.card')).toBeNull();
    expect(vi.mocked(fetch).mock.calls[1][0]).toBe('/api/board/cards?tags=7');
    last.resolve(cards('filtered', 'ready', '7'));
    await Promise.all([initial, intermediate, final]);
    expect(document.querySelector('#col-ready .card')?.textContent).toBe('filtered');
    expect(document.querySelector('.column[data-status="ready"] .column-count')?.textContent).toBe('1');
  });

  it('times out an unresponsive body, releases awaiters and ignores its late response', async () => {
    const body = deferred<unknown>();
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: () => body.promise } as Response);
    const request = refreshBoardCards();
    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
    await vi.advanceTimersByTimeAsync(5000);
    await request;
    expect(signal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(document.querySelector('.card')?.textContent).toBe('latest');
    body.resolve(await cards('stale').json());
    await vi.advanceTimersByTimeAsync(0);
    expect(document.querySelector('.card')?.textContent).toBe('latest');
  });

  it('does not let an old response render after shutdown or block a new initialization', async () => {
    const first = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(first.promise);
    const request = refreshBoardCards();
    if (typeof stop === 'function') stop();
    stop = initBoardPolling();
    await refreshBoardCards();
    await request;
    first.resolve(cards('stale'));
    await vi.advanceTimersByTimeAsync(0);
    expect(document.querySelector('.card')?.textContent).toBe('latest');
  });

  it('preserves an unchanged card and its scroll position across periodic updates', async () => {
    await refreshBoardCards();
    const card = document.querySelector('.card');
    document.getElementById('col-backlog')!.scrollTop = 80;
    await vi.advanceTimersByTimeAsync(6000);
    expect(document.querySelector('.card')).toBe(card);
    expect(document.getElementById('col-backlog')!.scrollTop).toBe(80);
  });

  it('retains detail-refresh suppression when a direct refresh is coalesced with notifications', async () => {
    const first = deferred<Response>();
    const renderDetailPanel = vi.fn();
    registerDetailPanelCallbacks({
      openTaskDetail: vi.fn(),
      renderDetailPanel,
      showUpdateWarning: vi.fn(),
      getDetailTaskId: () => 1,
      getDetailActiveTab: () => 'details',
      setActiveCard: vi.fn(),
    });
    vi.mocked(fetch).mockReturnValueOnce(first.promise);
    const initial = refreshBoardCards({ suppressDetailRefresh: true });
    const final = refreshBoardCards({ suppressDetailRefreshForTaskId: 1 });
    stream.listener?.();
    first.resolve(cards('old'));
    await Promise.all([initial, final]);
    expect(renderDetailPanel).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe('synchronization during drag and status saving', () => {
  function startDrag(): HTMLElement {
    document.getElementById('col-backlog')!.innerHTML =
      '<div class="card" data-id="1" data-status="backlog">original</div>';
    initDragDrop();
    const card = document.querySelector<HTMLElement>('.card')!;
    card.dispatchEvent(new Event('dragstart'));
    return card;
  }

  it('replays a notification after dragend with no further notification', async () => {
    const card = startDrag();
    stream.listener?.();
    expect(fetch).not.toHaveBeenCalled();
    card.dispatchEvent(new Event('dragend'));
    await vi.advanceTimersByTimeAsync(0);
    expect(document.querySelector('.card')?.textContent).toBe('latest');
  });

  it('keeps updates deferred until all overlapping status saves have finished', async () => {
    const card = startDrag();
    const firstPatch = deferred<Response>();
    const secondPatch = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(firstPatch.promise).mockReturnValueOnce(secondPatch.promise);
    document.querySelector('.column[data-status="ready"]')!.dispatchEvent(new Event('drop', { cancelable: true }));
    card.dispatchEvent(new Event('dragend'));
    card.dispatchEvent(new Event('dragstart'));
    document.querySelector('.column[data-status="backlog"]')!.dispatchEvent(new Event('drop', { cancelable: true }));
    card.dispatchEvent(new Event('dragend'));
    stream.listener?.();
    firstPatch.resolve({ ok: true } as Response);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(document.querySelector('.card')).toBe(card);
    secondPatch.resolve({ ok: true } as Response);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(document.querySelector('.card')?.textContent).toBe('latest');
  });

  it('does not replace a card when a drag begins while a request is in flight', async () => {
    const response = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(response.promise);
    const request = refreshBoardCards();
    const card = startDrag();
    response.resolve(cards('obsolete'));
    await vi.advanceTimersByTimeAsync(0);
    expect(document.querySelector('.card')).toBe(card);
    card.dispatchEvent(new Event('dragend'));
    await request;
    expect(document.querySelector('.card')?.textContent).toBe('latest');
  });

  it.each(['drag-first', 'save-first', 'save-error'] as const)(
    'waits for both dragend and status save (%s)',
    async (order) => {
      const card = startDrag();
      const patch = deferred<Response>();
      vi.mocked(fetch).mockReturnValueOnce(patch.promise).mockResolvedValue(cards('latest', 'ready'));
      document.querySelector('.column[data-status="ready"]')!.dispatchEvent(new Event('drop', { cancelable: true }));
      stream.listener?.();
      if (order !== 'save-first') card.dispatchEvent(new Event('dragend'));
      await vi.advanceTimersByTimeAsync(0);
      expect(fetch).toHaveBeenCalledOnce();
      patch.resolve({ ok: order !== 'save-error' } as Response);
      await vi.advanceTimersByTimeAsync(0);
      if (order === 'save-first') {
        expect(fetch).toHaveBeenCalledOnce();
        card.dispatchEvent(new Event('dragend'));
        await vi.advanceTimersByTimeAsync(0);
      }
      expect(document.querySelector('#col-ready .card')?.textContent).toBe('latest');
      expect(fetch).toHaveBeenCalledTimes(2);
    }
  );
});
