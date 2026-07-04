/**
 * @vitest-environment jsdom
 *
 * Tests for board client dragDrop module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  updateCount,
  attachDragListeners,
  getDraggedCardVirtualRect,
  registerDependencyRedrawCallback,
  initDragDrop,
} from '../../../src/board/client/dragDrop';

beforeEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('updateCount', () => {
  function setupColumn(status: string, cardCount: number): void {
    const col = document.createElement('div');
    col.className = 'column';
    col.dataset.status = status;

    const countEl = document.createElement('span');
    countEl.className = 'column-count';
    countEl.textContent = '0';
    col.appendChild(countEl);

    const body = document.createElement('div');
    body.className = 'column-body';
    for (let i = 0; i < cardCount; i++) {
      const card = document.createElement('div');
      card.className = 'card';
      body.appendChild(card);
    }
    col.appendChild(body);
    document.body.appendChild(col);
  }

  it('updates count to reflect number of children in column-body', () => {
    setupColumn('backlog', 3);
    updateCount('backlog');
    const countEl = document.querySelector('.column-count')!;
    expect(countEl.textContent).toBe('3');
  });

  it('sets count to 0 when column-body is empty', () => {
    setupColumn('done', 0);
    updateCount('done');
    const countEl = document.querySelector('.column-count')!;
    expect(countEl.textContent).toBe('0');
  });

  it('does not throw when column does not exist in DOM', () => {
    expect(() => updateCount('nonexistent')).not.toThrow();
  });
});

describe('attachDragListeners', () => {
  function makeCard(status = 'backlog'): HTMLElement {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.status = status;
    card.dataset.id = '1';
    document.body.appendChild(card);
    return card;
  }

  it('attaches without throwing', () => {
    const card = makeCard();
    expect(() => attachDragListeners(card)).not.toThrow();
  });

  it('adds "dragging" class on dragstart', () => {
    const card = makeCard();
    attachDragListeners(card);
    // jsdom does not support DragEvent constructor; use a plain Event
    card.dispatchEvent(new Event('dragstart', { bubbles: true }));
    expect(card.classList.contains('dragging')).toBe(true);
    card.dispatchEvent(new Event('dragend', { bubbles: true }));
  });

  it('removes "dragging" class on dragend', () => {
    const card = makeCard();
    attachDragListeners(card);
    card.classList.add('dragging');
    card.dispatchEvent(new Event('dragend', { bubbles: true }));
    expect(card.classList.contains('dragging')).toBe(false);
  });

  it('sets draggedCard to card on dragstart', async () => {
    // Import draggedCard after attaching listeners
    const { draggedCard: before } = await import('../../../src/board/client/dragDrop');
    expect(before).toBeNull();

    const card = makeCard();
    attachDragListeners(card);
    card.dispatchEvent(new Event('dragstart', { bubbles: true }));

    const { draggedCard: after } = await import('../../../src/board/client/dragDrop');
    expect(after).toBe(card);
    card.dispatchEvent(new Event('dragend', { bubbles: true }));
  });

  it('clears draggedCard to null on dragend', async () => {
    const card = makeCard();
    attachDragListeners(card);
    card.dispatchEvent(new Event('dragstart', { bubbles: true }));
    card.dispatchEvent(new Event('dragend', { bubbles: true }));

    const { draggedCard } = await import('../../../src/board/client/dragDrop');
    expect(draggedCard).toBeNull();
  });

  it('sets effectAllowed to "move" when dataTransfer is present on dragstart', () => {
    const card = makeCard();
    attachDragListeners(card);

    const dataTransfer = { effectAllowed: '' };
    const event = new Event('dragstart', { bubbles: true });
    Object.defineProperty(event, 'dataTransfer', { value: dataTransfer, configurable: true });
    Object.defineProperty(event, 'clientX', { value: 0, configurable: true });
    Object.defineProperty(event, 'clientY', { value: 0, configurable: true });
    card.dispatchEvent(event);

    expect(dataTransfer.effectAllowed).toBe('move');

    card.dispatchEvent(new Event('dragend', { bubbles: true }));
  });
});

describe('getDraggedCardVirtualRect', () => {
  function makeCard(): HTMLElement {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.status = 'backlog';
    card.dataset.id = '1';
    document.body.appendChild(card);
    return card;
  }

  function dispatchDragStart(card: HTMLElement, clientX: number, clientY: number): void {
    const event = new Event('dragstart', { bubbles: true });
    Object.defineProperty(event, 'clientX', { value: clientX, configurable: true });
    Object.defineProperty(event, 'clientY', { value: clientY, configurable: true });
    card.dispatchEvent(event);
  }

  it('returns null when no card is being dragged', () => {
    expect(getDraggedCardVirtualRect()).toBeNull();
  });

  it('returns a DOMRect based on mouse position after dragstart', () => {
    const card = makeCard();
    card.getBoundingClientRect = vi.fn(() => new DOMRect(50, 60, 100, 40));
    attachDragListeners(card);
    dispatchDragStart(card, 70, 90);

    const rect = getDraggedCardVirtualRect();

    expect(rect).not.toBeNull();
    expect(rect!.left).toBe(50);
    expect(rect!.top).toBe(60);
    expect(rect!.width).toBe(100);
    expect(rect!.height).toBe(40);

    card.dispatchEvent(new Event('dragend', { bubbles: true }));
  });
});

describe('document dragover tracking during drag', () => {
  function makeCard(): HTMLElement {
    const card = document.createElement('div');
    card.className = 'card';
    document.body.appendChild(card);
    return card;
  }

  function dispatchDragStart(card: HTMLElement, clientX: number, clientY: number): void {
    const event = new Event('dragstart', { bubbles: true });
    Object.defineProperty(event, 'clientX', { value: clientX, configurable: true });
    Object.defineProperty(event, 'clientY', { value: clientY, configurable: true });
    card.dispatchEvent(event);
  }

  function dispatchDocumentDragover(clientX: number, clientY: number): void {
    const event = new Event('dragover', { bubbles: true });
    Object.defineProperty(event, 'clientX', { value: clientX, configurable: true });
    Object.defineProperty(event, 'clientY', { value: clientY, configurable: true });
    document.dispatchEvent(event);
  }

  it('tracks mouse position and triggers the redraw callback while dragging', () => {
    const redrawSpy = vi.fn();
    registerDependencyRedrawCallback(redrawSpy);

    const card = makeCard();
    card.getBoundingClientRect = vi.fn(() => new DOMRect(0, 0, 10, 10));
    attachDragListeners(card);
    dispatchDragStart(card, 5, 5);

    dispatchDocumentDragover(105, 205);

    expect(redrawSpy).toHaveBeenCalled();
    const rect = getDraggedCardVirtualRect();
    expect(rect!.left).toBe(100);
    expect(rect!.top).toBe(200);

    card.dispatchEvent(new Event('dragend', { bubbles: true }));
  });

  it('stops tracking mouse position after dragend', () => {
    const redrawSpy = vi.fn();
    registerDependencyRedrawCallback(redrawSpy);

    const card = makeCard();
    attachDragListeners(card);
    dispatchDragStart(card, 5, 5);
    card.dispatchEvent(new Event('dragend', { bubbles: true }));

    redrawSpy.mockClear();
    dispatchDocumentDragover(999, 999);

    expect(redrawSpy).not.toHaveBeenCalled();
  });
});

describe('initDragDrop', () => {
  function setupBoard(): { card: HTMLElement; backlogCol: HTMLElement; inProgressCol: HTMLElement } {
    document.body.innerHTML = `
      <div class="column" data-status="backlog">
        <span class="column-count">1</span>
        <div class="column-body" id="col-backlog">
          <div class="card" data-id="1" data-status="backlog"></div>
        </div>
      </div>
      <div class="column" data-status="in_progress">
        <span class="column-count">0</span>
        <div class="column-body" id="col-in_progress"></div>
      </div>
    `;
    return {
      card: document.querySelector('.card')!,
      backlogCol: document.querySelector('.column[data-status="backlog"]')!,
      inProgressCol: document.querySelector('.column[data-status="in_progress"]')!,
    };
  }

  it('attaches drag listeners to existing cards', () => {
    const { card } = setupBoard();
    initDragDrop();

    card.dispatchEvent(new Event('dragstart', { bubbles: true }));
    expect(card.classList.contains('dragging')).toBe(true);

    card.dispatchEvent(new Event('dragend', { bubbles: true }));
  });

  it('adds "drag-over" class on column dragover and removes it on dragleave', () => {
    const { inProgressCol } = setupBoard();
    initDragDrop();

    inProgressCol.dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true }));
    expect(inProgressCol.classList.contains('drag-over')).toBe(true);

    inProgressCol.dispatchEvent(new Event('dragleave', { bubbles: true }));
    expect(inProgressCol.classList.contains('drag-over')).toBe(false);
  });

  it('moves the card, updates counts, and redraws dependencies on a successful drop', async () => {
    const { card, backlogCol, inProgressCol } = setupBoard();
    const redrawSpy = vi.fn();
    registerDependencyRedrawCallback(redrawSpy);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true } as Response));
    initDragDrop();

    card.dispatchEvent(new Event('dragstart', { bubbles: true }));
    inProgressCol.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => expect(redrawSpy).toHaveBeenCalled());

    expect(card.dataset.status).toBe('in_progress');
    expect(document.getElementById('col-in_progress')!.contains(card)).toBe(true);
    expect(backlogCol.querySelector('.column-count')!.textContent).toBe('0');
    expect(inProgressCol.querySelector('.column-count')!.textContent).toBe('1');
    expect(fetch).toHaveBeenCalledWith('/api/tasks/1', expect.objectContaining({ method: 'PATCH' }));

    card.dispatchEvent(new Event('dragend', { bubbles: true }));
  });

  it('rolls back the card and shows a toast on a failed drop', async () => {
    const { card, backlogCol, inProgressCol } = setupBoard();
    const toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false } as Response));
    initDragDrop();

    card.dispatchEvent(new Event('dragstart', { bubbles: true }));
    inProgressCol.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => expect(card.dataset.status).toBe('backlog'));

    expect(document.getElementById('col-backlog')!.contains(card)).toBe(true);
    expect(backlogCol.querySelector('.column-count')!.textContent).toBe('1');
    expect(inProgressCol.querySelector('.column-count')!.textContent).toBe('0');
    expect(toast.classList.contains('show')).toBe(true);

    card.dispatchEvent(new Event('dragend', { bubbles: true }));
  });

  it("ignores a drop onto the card's own column", async () => {
    const { card, backlogCol } = setupBoard();
    vi.stubGlobal('fetch', vi.fn());
    initDragDrop();

    card.dispatchEvent(new Event('dragstart', { bubbles: true }));
    backlogCol.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
    await Promise.resolve();

    expect(fetch).not.toHaveBeenCalled();
    expect(card.dataset.status).toBe('backlog');

    card.dispatchEvent(new Event('dragend', { bubbles: true }));
  });
});
