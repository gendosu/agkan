// Main entry point for board client-side code

import { initDragDrop } from './dragDrop';
import { initAutoScroll } from './autoScroll';
import { initAddTaskModal } from './addTaskModal';
import { initContextMenu } from './contextMenu';
import { initDetailPanel, openTaskDetail, switchTab, updateTerminalTabUi } from './detailPanel';
import { initBoardPolling } from './boardPolling';
import { initFilters } from './filters';
import { initBurgerMenu } from './burgerMenu';
import { initDependencyVisualization } from './dependencyVisualization';
import { initClaudeButton, registerClaudeButtonDetailHooks, updateButtonStates } from './claudeButton';
import { registerClaudeButtonUpdateCallback } from './claudeTerminalModal';

initDragDrop();
initAutoScroll();
initAddTaskModal();
initContextMenu();
initDetailPanel();
initBoardPolling();
initFilters();
initBurgerMenu();
initDependencyVisualization();
registerClaudeButtonDetailHooks({
  openTaskDetail,
  switchTab,
  updateTerminalTabUi,
});
initClaudeButton();
registerClaudeButtonUpdateCallback(() => {
  updateButtonStates(new Set());
});
