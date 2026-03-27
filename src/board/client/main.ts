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

initDragDrop();
initAutoScroll();
initAddTaskModal();
initContextMenu();
initDetailPanel();
initBoardPolling();
initFilters();
initBurgerMenu();
initDependencyVisualization();
