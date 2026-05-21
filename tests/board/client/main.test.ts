/**
 * @vitest-environment jsdom
 *
 * Smoke tests for board client main.ts entry point.
 * Verifies that all initializers are called when the module is loaded.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/board/client/dragDrop', () => ({
  initDragDrop: vi.fn(),
}));

vi.mock('../../../src/board/client/autoScroll', () => ({
  initAutoScroll: vi.fn(),
}));

vi.mock('../../../src/board/client/addTaskModal', () => ({
  initAddTaskModal: vi.fn(),
}));

vi.mock('../../../src/board/client/contextMenu', () => ({
  initContextMenu: vi.fn(),
}));

vi.mock('../../../src/board/client/detailPanel', () => ({
  initDetailPanel: vi.fn(),
  openTaskDetail: vi.fn(),
  switchTab: vi.fn(),
  updateTerminalTabUi: vi.fn(),
}));

vi.mock('../../../src/board/client/boardPolling', () => ({
  initBoardPolling: vi.fn(),
}));

vi.mock('../../../src/board/client/filters', () => ({
  initFilters: vi.fn(),
}));

vi.mock('../../../src/board/client/burgerMenu', () => ({
  initBurgerMenu: vi.fn(),
}));

vi.mock('../../../src/board/client/dependencyVisualization', () => ({
  initDependencyVisualization: vi.fn(),
}));

vi.mock('../../../src/board/client/claudeButton', () => ({
  initClaudeButton: vi.fn(),
  registerClaudeButtonDetailHooks: vi.fn(),
}));

vi.mock('../../../src/board/client/attentionIndicator', () => ({
  initAttentionStream: vi.fn(),
}));

vi.mock('../../../src/board/client/bulkRunButton', () => ({
  initBulkRunButton: vi.fn(),
}));

vi.mock('../../../src/board/client/boardStream', () => ({
  initBoardStream: vi.fn(),
  addBoardStreamListener: vi.fn(),
}));

// Import main.ts — this executes the module-level init calls
import '../../../src/board/client/main';

import { initDragDrop } from '../../../src/board/client/dragDrop';
import { initAutoScroll } from '../../../src/board/client/autoScroll';
import { initAddTaskModal } from '../../../src/board/client/addTaskModal';
import { initContextMenu } from '../../../src/board/client/contextMenu';
import { initDetailPanel, openTaskDetail, switchTab, updateTerminalTabUi } from '../../../src/board/client/detailPanel';
import { initBoardPolling } from '../../../src/board/client/boardPolling';
import { initFilters } from '../../../src/board/client/filters';
import { initBurgerMenu } from '../../../src/board/client/burgerMenu';
import { initDependencyVisualization } from '../../../src/board/client/dependencyVisualization';
import { initClaudeButton, registerClaudeButtonDetailHooks } from '../../../src/board/client/claudeButton';
import { initAttentionStream } from '../../../src/board/client/attentionIndicator';
import { initBulkRunButton } from '../../../src/board/client/bulkRunButton';

describe('main.ts entry point smoke test', () => {
  it('calls initDragDrop on load', () => {
    expect(initDragDrop).toHaveBeenCalledOnce();
  });

  it('calls initAutoScroll on load', () => {
    expect(initAutoScroll).toHaveBeenCalledOnce();
  });

  it('calls initAddTaskModal on load', () => {
    expect(initAddTaskModal).toHaveBeenCalledOnce();
  });

  it('calls initContextMenu on load', () => {
    expect(initContextMenu).toHaveBeenCalledOnce();
  });

  it('calls initDetailPanel on load', () => {
    expect(initDetailPanel).toHaveBeenCalledOnce();
  });

  it('calls initBoardPolling on load', () => {
    expect(initBoardPolling).toHaveBeenCalledOnce();
  });

  it('calls initFilters on load', () => {
    expect(initFilters).toHaveBeenCalledOnce();
  });

  it('calls initBurgerMenu on load', () => {
    expect(initBurgerMenu).toHaveBeenCalledOnce();
  });

  it('calls initDependencyVisualization on load', () => {
    expect(initDependencyVisualization).toHaveBeenCalledOnce();
  });

  it('calls initClaudeButton on load', () => {
    expect(initClaudeButton).toHaveBeenCalledOnce();
  });

  it('calls initBulkRunButton on load', () => {
    expect(initBulkRunButton).toHaveBeenCalledOnce();
  });

  it('calls initAttentionStream on load', () => {
    expect(initAttentionStream).toHaveBeenCalledOnce();
  });

  it('calls registerClaudeButtonDetailHooks with detail panel hooks', () => {
    expect(registerClaudeButtonDetailHooks).toHaveBeenCalledOnce();
    expect(registerClaudeButtonDetailHooks).toHaveBeenCalledWith({
      openTaskDetail,
      switchTab,
      updateTerminalTabUi,
    });
  });
});
