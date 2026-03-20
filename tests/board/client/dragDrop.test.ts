/**
 * @vitest-environment jsdom
 *
 * Tests for board client dragDrop module
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateCount, attachDragListeners } from '../../../src/board/client/dragDrop';

beforeEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
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
  });

  it('clears draggedCard to null on dragend', async () => {
    const card = makeCard();
    attachDragListeners(card);
    card.dispatchEvent(new Event('dragstart', { bubbles: true }));
    card.dispatchEvent(new Event('dragend', { bubbles: true }));

    const { draggedCard } = await import('../../../src/board/client/dragDrop');
    expect(draggedCard).toBeNull();
  });
});
