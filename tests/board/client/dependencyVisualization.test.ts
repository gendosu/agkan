/**
 * @vitest-environment jsdom
 *
 * Tests for dependencyVisualization module
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('dependencyVisualization', () => {
  function setupDOM() {
    document.body.innerHTML = `
      <div class="board-container">
        <div class="board"></div>
        <div class="card" data-id="1" data-blocking="2"></div>
        <div class="card" data-id="2" data-blocked-by="1"></div>
      </div>
      <div class="column-body"></div>
      <button id="dependency-toggle"></button>
    `;
    return {
      boardContainer: document.querySelector('.board-container') as HTMLElement,
      toggleBtn: document.getElementById('dependency-toggle') as HTMLButtonElement,
    };
  }

  async function loadModule() {
    vi.resetModules();
    vi.doMock('../../../src/board/client/boardPolling', () => ({
      registerDependencyRedrawCallback: vi.fn(),
    }));
    vi.doMock('../../../src/board/client/dragDrop', () => ({
      registerDependencyRedrawCallback: vi.fn(),
      draggedCard: null,
      getDraggedCardVirtualRect: vi.fn().mockReturnValue(null),
    }));
    return import('../../../src/board/client/dependencyVisualization');
  }

  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('attaches exactly two hover listeners to board-container when toggle is enabled', async () => {
    const { boardContainer, toggleBtn } = setupDOM();
    const { initDependencyVisualization } = await loadModule();

    const spy = vi.spyOn(boardContainer, 'addEventListener');

    initDependencyVisualization();
    toggleBtn.click();

    const hoverCalls = spy.mock.calls.filter(([type]) => type === 'mouseover' || type === 'mouseout');
    expect(hoverCalls).toHaveLength(2);
  });

  it('does not add hover listeners on repeated redrawDependenciesAfterUpdate calls', async () => {
    const { boardContainer, toggleBtn } = setupDOM();
    const { initDependencyVisualization, redrawDependenciesAfterUpdate } = await loadModule();

    const spy = vi.spyOn(boardContainer, 'addEventListener');

    initDependencyVisualization();
    toggleBtn.click();

    const countAfterEnable = spy.mock.calls.filter(([type]) => type === 'mouseover' || type === 'mouseout').length;

    for (let i = 0; i < 50; i++) {
      redrawDependenciesAfterUpdate();
    }

    const countAfterUpdates = spy.mock.calls.filter(([type]) => type === 'mouseover' || type === 'mouseout').length;

    expect(countAfterEnable).toBe(2);
    expect(countAfterUpdates).toBe(2);
  });

  it('removes hover listeners from board-container when toggle is disabled', async () => {
    const { boardContainer, toggleBtn } = setupDOM();
    const { initDependencyVisualization } = await loadModule();

    initDependencyVisualization();
    toggleBtn.click(); // enable

    const removeSpy = vi.spyOn(boardContainer, 'removeEventListener');
    toggleBtn.click(); // disable

    const hoverRemovals = removeSpy.mock.calls.filter(([type]) => type === 'mouseover' || type === 'mouseout');
    expect(hoverRemovals).toHaveLength(2);
  });

  it('does not re-attach hover listener when already attached', async () => {
    const { boardContainer, toggleBtn } = setupDOM();
    const { initDependencyVisualization } = await loadModule();

    initDependencyVisualization();
    toggleBtn.click(); // enable
    toggleBtn.click(); // disable

    const spy = vi.spyOn(boardContainer, 'addEventListener');
    toggleBtn.click(); // re-enable

    const hoverCalls = spy.mock.calls.filter(([type]) => type === 'mouseover' || type === 'mouseout');
    expect(hoverCalls).toHaveLength(2);
  });

  describe('hover direction coloring', () => {
    function setupChainDOM() {
      // 1 blocks 2, 2 blocks 3: 1 -> 2 -> 3
      document.body.innerHTML = `
        <div class="board-container">
          <div class="board"></div>
          <div class="card" data-id="1" data-blocking="2"></div>
          <div class="card" data-id="2" data-blocked-by="1" data-blocking="3"></div>
          <div class="card" data-id="3" data-blocked-by="2"></div>
        </div>
        <div class="column-body"></div>
        <button id="dependency-toggle"></button>
      `;
      return {
        boardContainer: document.querySelector('.board-container') as HTMLElement,
        toggleBtn: document.getElementById('dependency-toggle') as HTMLButtonElement,
        card1: document.querySelector('[data-id="1"]') as HTMLElement,
        card2: document.querySelector('[data-id="2"]') as HTMLElement,
        card3: document.querySelector('[data-id="3"]') as HTMLElement,
      };
    }

    function hoverCard(card: HTMLElement, fromCard: HTMLElement | null) {
      card.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: fromCard ?? undefined }));
    }

    function getLineColors(): string[] {
      return Array.from(document.querySelectorAll('.dependency-line')).map((line) => line.getAttribute('stroke'));
    }

    it('colors the line to a card the hovered card blocks as outgoing (red)', async () => {
      const { toggleBtn, card1, card2 } = setupChainDOM();
      const { initDependencyVisualization } = await loadModule();

      initDependencyVisualization();
      toggleBtn.click(); // enable

      hoverCard(card1, null);

      expect(card2.classList.contains('dep-blocks')).toBe(true);
      expect(card2.classList.contains('dep-blocked-by')).toBe(false);
      expect(getLineColors()).toContain('#ef4444');
    });

    it('colors the line from a card that blocks the hovered card as incoming (blue)', async () => {
      const { toggleBtn, card1, card2 } = setupChainDOM();
      const { initDependencyVisualization } = await loadModule();

      initDependencyVisualization();
      toggleBtn.click(); // enable

      hoverCard(card2, null);

      expect(card1.classList.contains('dep-blocked-by')).toBe(true);
      expect(card1.classList.contains('dep-blocks')).toBe(false);
      expect(getLineColors()).toContain('#3b82f6');
    });

    it('clears direction classes from previously related cards when the hover target changes', async () => {
      const { toggleBtn, card1, card2, card3 } = setupChainDOM();
      const { initDependencyVisualization } = await loadModule();

      initDependencyVisualization();
      toggleBtn.click(); // enable

      hoverCard(card1, null);
      expect(card2.classList.contains('dep-blocks')).toBe(true);

      hoverCard(card3, card1);
      expect(card2.classList.contains('dep-blocks')).toBe(false);
      expect(card2.classList.contains('dep-blocked-by')).toBe(true);
    });

    it('removes direction classes from all cards when the toggle is disabled', async () => {
      const { toggleBtn, card1, card2 } = setupChainDOM();
      const { initDependencyVisualization } = await loadModule();

      initDependencyVisualization();
      toggleBtn.click(); // enable
      hoverCard(card1, null);
      expect(card2.classList.contains('dep-blocks')).toBe(true);

      toggleBtn.click(); // disable

      expect(card2.classList.contains('dep-blocks')).toBe(false);
      expect(card1.classList.contains('dep-blocked-by')).toBe(false);
    });
  });
});
