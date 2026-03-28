// Dependency visualization for task blocking relationships

import { registerDependencyRedrawCallback } from './boardPolling';
import {
  registerDependencyRedrawCallback as registerDragDropRedrawCallback,
  draggedCard,
  getDraggedCardVirtualRect,
} from './dragDrop';

interface SVGArrowMarker {
  svg: SVGSVGElement;
}

let isDependencyVisible = false;
let arrowMarkers: Map<string, SVGArrowMarker> = new Map();
let scrollListener: ((event: Event) => void) | null = null;
let columnScrollListener: ((event: Event) => void) | null = null;
let resizeListener: (() => void) | null = null;

function getOrCreateArrowMarker(svg: SVGSVGElement, color: string): string {
  const markerId = `arrow-${color.substring(1)}`;
  if (!arrowMarkers.has(markerId)) {
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', markerId);
    marker.setAttribute('markerWidth', '10');
    marker.setAttribute('markerHeight', '10');
    marker.setAttribute('refX', '8');
    marker.setAttribute('refY', '3');
    marker.setAttribute('orient', 'auto');
    marker.setAttribute('markerUnits', 'strokeWidth');

    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('points', '0 0, 10 3, 0 6');
    polygon.setAttribute('fill', color);

    marker.appendChild(polygon);
    defs.appendChild(marker);
    svg.appendChild(defs);
    arrowMarkers.set(markerId, { svg });
  }
  return markerId;
}

function drawBezierLine(
  svg: SVGSVGElement,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  isHovered: boolean
): SVGPathElement {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

  // Horizontal bezier: control points extend horizontally from each endpoint
  const dx = Math.abs(x2 - x1);
  const cpOffset = Math.max(dx * 0.5, 60);
  // Adjust control point direction based on line direction
  const cp1x = x1 < x2 ? x1 + cpOffset : x1 - cpOffset;
  const cp2x = x1 < x2 ? x2 - cpOffset : x2 + cpOffset;

  const pathData = `M ${x1} ${y1} C ${cp1x} ${y1}, ${cp2x} ${y2}, ${x2} ${y2}`;
  path.setAttribute('d', pathData);
  path.setAttribute('stroke', color);
  path.setAttribute('stroke-width', isHovered ? '2.5' : '1.5');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('marker-end', `url(#${getOrCreateArrowMarker(svg, color)})`);
  path.setAttribute('class', 'dependency-line');

  return path;
}

function getCardRect(card: HTMLElement): DOMRect {
  if (card === draggedCard) {
    return getDraggedCardVirtualRect() ?? card.getBoundingClientRect();
  }
  return card.getBoundingClientRect();
}

function getCardEdgePoints(
  fromCard: HTMLElement,
  toCard: HTMLElement,
  boardRect: DOMRect
): { x1: number; y1: number; x2: number; y2: number } {
  const fromRect = getCardRect(fromCard);
  const toRect = getCardRect(toCard);

  const fromCenterX = fromRect.left + fromRect.width / 2;
  const toCenterX = toRect.left + toRect.width / 2;

  // Connect right edge → left edge when target is to the right, otherwise left → right
  const fromX = fromCenterX <= toCenterX ? fromRect.right - boardRect.left : fromRect.left - boardRect.left;
  const toX = fromCenterX <= toCenterX ? toRect.left - boardRect.left : toRect.right - boardRect.left;

  return {
    x1: fromX,
    y1: fromRect.top - boardRect.top + fromRect.height / 2,
    x2: toX,
    y2: toRect.top - boardRect.top + toRect.height / 2,
  };
}

function createSVGOverlay(): SVGSVGElement {
  const boardContainer = document.querySelector('.board-container') as HTMLElement;
  const existing = boardContainer.querySelector('#dependency-svg');
  if (existing) {
    existing.remove();
  }

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('id', 'dependency-svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('viewBox', `0 0 ${boardContainer.offsetWidth} ${boardContainer.offsetHeight}`);
  svg.style.position = 'absolute';
  svg.style.top = '0';
  svg.style.left = '0';
  svg.style.pointerEvents = 'none';
  svg.style.zIndex = '5';

  boardContainer.style.position = 'relative';
  boardContainer.appendChild(svg);

  return svg;
}

function redrawDependencies(): void {
  if (!isDependencyVisible) return;

  const svg = createSVGOverlay();
  const boardContainer = document.querySelector('.board-container') as HTMLElement;

  // Clear existing lines (keep defs)
  svg.querySelectorAll('.dependency-line').forEach((line) => line.remove());

  // Get all cards and build a map for quick lookup
  const cards = Array.from(document.querySelectorAll<HTMLElement>('.card'));
  const cardMap = new Map<number, HTMLElement>();

  cards.forEach((card) => {
    const id = Number(card.getAttribute('data-id'));
    cardMap.set(id, card);
  });

  // Get hovered card IDs (including indirect relationships)
  const hoveredCard = document.querySelector('.card:hover') as HTMLElement | null;
  const hoveredCardId = hoveredCard ? Number(hoveredCard.getAttribute('data-id')) : null;
  const hoveredBlockedBySet = new Set<number>();
  const hoveredBlockingSet = new Set<number>();

  if (hoveredCardId) {
    const hoveredElement = cardMap.get(hoveredCardId);
    if (hoveredElement) {
      const blockedBy = hoveredElement.getAttribute('data-blocked-by');
      const blocking = hoveredElement.getAttribute('data-blocking');

      if (blockedBy) {
        blockedBy.split(',').forEach((id) => {
          const numId = Number(id.trim());
          if (!isNaN(numId)) hoveredBlockedBySet.add(numId);
        });
      }

      if (blocking) {
        blocking.split(',').forEach((id) => {
          const numId = Number(id.trim());
          if (!isNaN(numId)) hoveredBlockingSet.add(numId);
        });
      }
    }
  }

  const boardRect = boardContainer.getBoundingClientRect();

  // Draw all dependency lines
  cards.forEach((card) => {
    const cardId = Number(card.getAttribute('data-id'));
    const blockedByStr = card.getAttribute('data-blocked-by');
    const blockingStr = card.getAttribute('data-blocking');

    if (!blockedByStr && !blockingStr) return;

    const isHovered = cardId === hoveredCardId || hoveredBlockedBySet.has(cardId) || hoveredBlockingSet.has(cardId);

    // Draw lines to blocking tasks (this task blocks these)
    if (blockingStr) {
      const blockingIds = blockingStr.split(',').map((s) => Number(s.trim()));
      blockingIds.forEach((blockedId) => {
        const blockedCard = cardMap.get(blockedId);
        if (blockedCard) {
          const { x1, y1, x2, y2 } = getCardEdgePoints(card, blockedCard, boardRect);
          const color = isHovered || hoveredBlockedBySet.has(blockedId) ? '#ef4444' : '#cbd5e1';
          const line = drawBezierLine(svg, x1, y1, x2, y2, color, isHovered);
          svg.appendChild(line);
        }
      });
    }
  });

  // Update SVG viewBox
  svg.setAttribute('viewBox', `0 0 ${boardContainer.offsetWidth} ${boardContainer.offsetHeight}`);
}

function handleCardHoverEvents(): void {
  const cards = document.querySelectorAll<HTMLElement>('.card');

  cards.forEach((card) => {
    card.addEventListener('mouseenter', () => {
      redrawDependencies();
    });
    card.addEventListener('mouseleave', () => {
      redrawDependencies();
    });
  });
}

export function initDependencyVisualization(): void {
  const toggleBtn = document.getElementById('dependency-toggle') as HTMLButtonElement | null;
  if (!toggleBtn) return;

  const redrawIfVisible = () => {
    if (isDependencyVisible) {
      handleCardHoverEvents();
      redrawDependencies();
    }
  };

  // Register the redraw callback with boardPolling
  registerDependencyRedrawCallback(redrawIfVisible);

  // Register the redraw callback with dragDrop
  registerDragDropRedrawCallback(redrawIfVisible);

  toggleBtn.addEventListener('click', () => {
    isDependencyVisible = !isDependencyVisible;

    if (isDependencyVisible) {
      toggleBtn.classList.add('active');
      redrawDependencies();
      handleCardHoverEvents();

      // Redraw on scroll
      const board = document.querySelector('.board') as HTMLElement;
      const boardContainer = document.querySelector('.board-container') as HTMLElement;

      if (board) {
        scrollListener = () => redrawDependencies();
        board.addEventListener('scroll', scrollListener, { passive: true });
      }

      // Redraw on column-body vertical scroll
      columnScrollListener = () => redrawDependencies();
      document.querySelectorAll<HTMLElement>('.column-body').forEach((col) => {
        col.addEventListener('scroll', columnScrollListener!, { passive: true });
      });

      // Redraw on window resize
      if (boardContainer) {
        resizeListener = () => redrawDependencies();
        window.addEventListener('resize', resizeListener, { passive: true });
      }
    } else {
      toggleBtn.classList.remove('active');
      const svg = document.querySelector('#dependency-svg');
      if (svg) svg.remove();

      // Remove scroll listener
      const board = document.querySelector('.board') as HTMLElement;
      if (board && scrollListener) {
        board.removeEventListener('scroll', scrollListener);
        scrollListener = null;
      }

      // Remove column-body scroll listeners
      if (columnScrollListener) {
        document.querySelectorAll<HTMLElement>('.column-body').forEach((col) => {
          col.removeEventListener('scroll', columnScrollListener!);
        });
        columnScrollListener = null;
      }

      // Remove resize listener
      if (resizeListener) {
        window.removeEventListener('resize', resizeListener);
        resizeListener = null;
      }
    }
  });
}

export function redrawDependenciesAfterUpdate(): void {
  if (isDependencyVisible) {
    // Update card references and redraw
    handleCardHoverEvents();
    redrawDependencies();
  }
}
