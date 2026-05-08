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
});
