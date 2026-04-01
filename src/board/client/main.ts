// Main entry point for board client-side code

import { initDragDrop } from './dragDrop';
import { initAutoScroll } from './autoScroll';
import { initAddTaskModal } from './addTaskModal';
import { initContextMenu } from './contextMenu';
import { initDetailPanel } from './detailPanel';
import { initBoardPolling } from './boardPolling';
import { initFilters } from './filters';
import { initBurgerMenu } from './burgerMenu';
import { initDependencyVisualization } from './dependencyVisualization';
import { initClaudeButton, registerClaudeModalCallback } from './claudeButton';
import { initClaudeStreamModal, openClaudeStreamModal, registerClaudeButtonUpdateCallback } from './claudeStreamModal';
import { updateButtonStates } from './claudeButton';

initDragDrop();
initAutoScroll();
initAddTaskModal();
initContextMenu();
initDetailPanel();
initBoardPolling();
initFilters();
initBurgerMenu();
initDependencyVisualization();
initClaudeButton();
initClaudeStreamModal();
registerClaudeModalCallback(openClaudeStreamModal);
registerClaudeButtonUpdateCallback(() => {
  updateButtonStates(new Set());
});
