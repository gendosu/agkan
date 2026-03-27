import * as fs from 'fs';
import * as path from 'path';
import { Task, TaskStatus, PRIORITIES, PRIORITY_ORDER } from '../models';
import { Tag } from '../models/Tag';
import { StorageBackend } from '../db/types/repository';
import { BOARD_STYLES } from './boardStyles';

export const STATUSES: TaskStatus[] = ['icebox', 'backlog', 'ready', 'in_progress', 'review', 'done', 'closed'];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  icebox: 'Icebox',
  backlog: 'Backlog',
  ready: 'Ready',
  in_progress: 'In Progress',
  review: 'Review',
  done: 'Done',
  closed: 'Closed',
};

export const STATUS_COLORS: Record<TaskStatus, string> = {
  icebox: '#6b7280',
  backlog: '#3b82f6',
  ready: '#8b5cf6',
  in_progress: '#f97316',
  review: '#eab308',
  done: '#22c55e',
  closed: '#374151',
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function renderCard(task: Task, tags: Tag[], blockedByIds: number[] = [], blockingIds: number[] = []): string {
  const priority = task.priority;
  const priorityBadge = priority
    ? `<span class="priority priority-${escapeHtml(priority)}">${escapeHtml(priority)}</span>`
    : '';
  const tagBadges = tags.map((t) => `<span class="tag">${escapeHtml(t.name)}</span>`).join('');
  const dataBlockedBy = blockedByIds.length > 0 ? ` data-blocked-by="${blockedByIds.join(',')}"` : '';
  const dataBlocking = blockingIds.length > 0 ? ` data-blocking="${blockingIds.join(',')}"` : '';

  return `
    <div class="card" draggable="true" data-id="${task.id}" data-status="${task.status}" data-updated-at="${escapeHtml(task.updated_at)}"${dataBlockedBy}${dataBlocking}>
      <div class="card-header">
        <span class="card-id">#${task.id}</span>
        ${priorityBadge}
      </div>
      <div class="card-title">${escapeHtml(task.title)}</div>
      ${tagBadges ? `<div class="card-tags">${tagBadges}</div>` : ''}
    </div>`;
}

export function renderColumn(
  status: TaskStatus,
  tasks: Task[],
  tagMap: Map<number, Tag[]>,
  blockMap: Map<number, { blockedBy: number[]; blocking: number[] }> = new Map()
): string {
  const color = STATUS_COLORS[status];
  const label = STATUS_LABELS[status];
  const cards = tasks
    .map((t) => {
      const blockRels = blockMap.get(t.id) || { blockedBy: [], blocking: [] };
      return renderCard(t, tagMap.get(t.id) || [], blockRels.blockedBy, blockRels.blocking);
    })
    .join('');

  return `
      <div class="column" data-status="${status}">
        <div class="column-header" style="border-top-color:${color}">
          <span class="column-title" style="color:${color}">${label}</span>
          <span class="column-header-right">
            <span class="column-count">${tasks.length}</span>
            <button class="add-btn" data-status="${status}" title="Add task">+</button>
          </span>
        </div>
        <div class="column-body" id="col-${status}">
          ${cards}
        </div>
      </div>`;
}

const BOARD_PRIORITY_OPTIONS = PRIORITIES.map(
  (p) => `<option value="${p}">${p.charAt(0).toUpperCase() + p.slice(1)}</option>`
).join('\n        ');

function getAddTaskModal(): string {
  return `
  <div class="modal-overlay" id="add-modal">
    <div class="modal">
      <h2>Add Task</h2>
      <label for="add-title">Title</label>
      <input type="text" id="add-title" placeholder="Task title">
      <label for="add-body">Description</label>
      <textarea id="add-body" placeholder="Optional"></textarea>
      <label for="add-priority">Priority</label>
      <select id="add-priority">
        <option value="">None</option>
        ${BOARD_PRIORITY_OPTIONS}
      </select>
      <label>Tags</label>
      <div class="tag-select-wrapper" id="add-tags-wrapper">
        <div class="tag-select-control" id="add-tag-select-control"></div>
        <div class="tag-select-dropdown" id="add-tag-select-dropdown"></div>
      </div>
      <label>Metadata</label>
      <div id="add-metadata-rows"></div>
      <button type="button" id="add-metadata-add-row" class="add-metadata-row-btn">+ Add metadata</button>
      <input type="hidden" id="add-status">
      <div class="modal-actions">
        <button id="add-cancel">Cancel</button>
        <button id="add-submit" class="primary">Add</button>
      </div>
    </div>
  </div>`;
}

function getContextMenuAndToast(): string {
  return `
  <div class="context-menu" id="context-menu">
    <div class="context-menu-item danger" id="ctx-delete">Delete task</div>
  </div>
  <div class="toast" id="toast">Failed to update task</div>`;
}

function getPurgeAndVersionModals(): string {
  return `
  <div class="modal-overlay" id="purge-confirm-modal">
    <div class="modal">
      <h2>Purge Tasks</h2>
      <p style="font-size:13px;color:#64748b;margin-bottom:16px;">Delete all done/closed tasks older than 3 days. This action cannot be undone.</p>
      <p id="purge-result" style="font-size:13px;color:#16a34a;min-height:18px;margin-bottom:8px;"></p>
      <div class="modal-actions">
        <button id="purge-cancel-btn">Cancel</button>
        <button id="purge-confirm-btn" class="primary" style="background:#dc2626;border-color:#dc2626;">Purge</button>
      </div>
    </div>
  </div>
  <div class="modal-overlay" id="import-modal">
    <div class="modal" style="width:420px;">
      <h2>Import Tasks</h2>
      <p style="font-size:13px;color:#64748b;margin-bottom:16px;">Import tasks from a JSON export file. Tasks will be added without duplicate checking.</p>
      <div id="import-drop-zone" style="border:2px dashed #94a3b8;border-radius:8px;padding:24px;text-align:center;margin-bottom:16px;cursor:pointer;transition:border-color 0.2s;">
        <p style="font-size:13px;color:#64748b;margin:0 0 8px 0;">Drag &amp; drop a JSON file here, or</p>
        <label for="import-file-input" style="cursor:pointer;color:#3b82f6;font-size:13px;text-decoration:underline;">click to select a file</label>
        <input type="file" id="import-file-input" accept=".json" style="display:none;">
      </div>
      <p id="import-result" style="font-size:13px;min-height:18px;margin-bottom:8px;"></p>
      <div class="modal-actions">
        <button id="import-cancel-btn">Cancel</button>
        <button id="import-confirm-btn" class="primary" disabled>Import</button>
      </div>
    </div>
  </div>
  <div class="modal-overlay" id="version-info-modal">
    <div class="modal" style="width:320px;">
      <h2>Version Info</h2>
      <p id="version-info-text" style="font-size:14px;color:var(--text-primary);margin-bottom:16px;"></p>
      <div class="modal-actions">
        <button id="version-info-close">Close</button>
      </div>
    </div>
  </div>`;
}

function loadClientBundle(): string {
  // Try resolved path (works in compiled dist/ and in development)
  const candidates = [
    path.join(__dirname, 'client', 'board.js'),
    path.join(__dirname, '..', '..', 'dist', 'board', 'client', 'board.js'),
  ];
  for (const bundlePath of candidates) {
    try {
      return fs.readFileSync(bundlePath, 'utf8');
    } catch {
      // Try next candidate
    }
  }
  throw new Error(`Client bundle not found. Tried: ${candidates.join(', ')}. Run 'npm run build' to generate it.`);
}

function getBoardBodyStatic(): string {
  const clientBundle = loadClientBundle();
  const script = `
    var statusColors = ${JSON.stringify(STATUS_COLORS)};
    var allStatuses = ${JSON.stringify(STATUSES)};
    var statusLabels = ${JSON.stringify(STATUS_LABELS)};
    var allPriorities = ${JSON.stringify(PRIORITIES)};
    ${clientBundle}`;

  return `${getAddTaskModal()}${getContextMenuAndToast()}${getPurgeAndVersionModals()}
  <script>${script}
  </script>`;
}

export function renderBoard(
  tasksByStatus: Map<TaskStatus, Task[]>,
  tagMap: Map<number, Tag[]>,
  boardTitle?: string,
  theme?: string,
  blockMap: Map<number, { blockedBy: number[]; blocking: number[] }> = new Map()
): string {
  const columns = STATUSES.map((status) =>
    renderColumn(status, tasksByStatus.get(status) || [], tagMap, blockMap)
  ).join('');
  const titleHtml = boardTitle ? `<span class="board-title">${escapeHtml(boardTitle)}</span>` : '';
  const boardBodyStatic = getBoardBodyStatic();
  const dataThemeAttr = theme === 'dark' || theme === 'light' ? ` data-theme="${theme}"` : '';

  return `<!DOCTYPE html>
<html lang="en"${dataThemeAttr}>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>agkan board</title>
  <style>${BOARD_STYLES}
  </style>
</head>
<body>
  <header><h1>agkan board</h1>${titleHtml}<div class="burger-menu-wrapper"><button class="burger-menu-btn" id="burger-menu-btn" title="Menu" aria-label="Menu"><span></span><span></span><span></span></button><div class="burger-menu-dropdown" id="burger-menu-dropdown"><div class="burger-menu-item danger" id="burger-purge-tasks">&#128465; Purge Tasks</div><div class="burger-menu-item" id="burger-export-tasks">&#8595; Export Tasks</div><div class="burger-menu-item" id="burger-import-tasks">&#8593; Import Tasks</div><div class="burger-menu-item" id="burger-version-info">&#8505; Version Info</div><div class="burger-menu-separator"></div><div class="burger-menu-item" id="burger-theme-dark">Dark Mode</div><div class="burger-menu-item" id="burger-theme-light">Light Mode</div><div class="burger-menu-item" id="burger-theme-system">System Setting</div></div></div></header>
  <div class="filter-bar" id="filter-bar">
    <div class="filter-group">
      <input type="search" id="filter-search" class="filter-search-input" placeholder="Search tasks...">
    </div>
    <div class="filter-group">
      <span class="filter-label">Priority</span>
      <button class="filter-priority-btn" data-priority="critical">critical</button>
      <button class="filter-priority-btn" data-priority="high">high</button>
      <button class="filter-priority-btn" data-priority="medium">medium</button>
      <button class="filter-priority-btn" data-priority="low">low</button>
    </div>
    <div class="filter-group">
      <span class="filter-label">Tags</span>
      <div id="filter-tags-control" style="display:flex;align-items:center;gap:4px;flex-wrap:nowrap;"></div>
    </div>
    <div class="filter-group">
      <span class="filter-label">Assignee</span>
      <input type="text" id="filter-assignee" class="filter-assignee-input" placeholder="Filter by assignee">
    </div>
    <button class="dependency-toggle-btn" id="dependency-toggle" title="Show/hide task dependencies">Show dependencies</button>
    <button class="filter-clear-btn" id="filter-clear">Clear filters</button>
  </div>
  <div class="board-container">
    <div class="board">${columns}</div>${boardBodyStatic}
  </div>
</body>
</html>`;
}

export function sortByPriority(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const oa = a.priority ? PRIORITY_ORDER[a.priority] : 4;
    const ob = b.priority ? PRIORITY_ORDER[b.priority] : 4;
    return oa - ob;
  });
}

export function buildBoardCardsPayload(
  tasksByStatus: Map<TaskStatus, Task[]>,
  tagMap: Map<number, Tag[]>,
  blockMap: Map<number, { blockedBy: number[]; blocking: number[] }> = new Map()
): { status: TaskStatus; html: string; count: number }[] {
  return STATUSES.map((status) => {
    const tasks = tasksByStatus.get(status) || [];
    const html = tasks
      .map((t) => {
        const blockRels = blockMap.get(t.id) || { blockedBy: [], blocking: [] };
        return renderCard(t, tagMap.get(t.id) || [], blockRels.blockedBy, blockRels.blocking);
      })
      .join('');
    return { status, html, count: tasks.length };
  });
}

export function buildTasksByStatus(tasks: Task[]): Map<TaskStatus, Task[]> {
  const tasksByStatus = new Map<TaskStatus, Task[]>();
  for (const status of STATUSES) {
    tasksByStatus.set(status, []);
  }
  for (const task of tasks) {
    tasksByStatus.get(task.status)?.push(task);
  }
  for (const [status, statusTasks] of tasksByStatus) {
    tasksByStatus.set(status, sortByPriority(statusTasks));
  }
  return tasksByStatus;
}

export function buildBlockMap(
  blocks: Array<{ blocker_task_id: number; blocked_task_id: number }>
): Map<number, { blockedBy: number[]; blocking: number[] }> {
  const blockMap = new Map<number, { blockedBy: number[]; blocking: number[] }>();
  for (const block of blocks) {
    if (!blockMap.has(block.blocker_task_id)) {
      blockMap.set(block.blocker_task_id, { blockedBy: [], blocking: [] });
    }
    blockMap.get(block.blocker_task_id)!.blocking.push(block.blocked_task_id);

    if (!blockMap.has(block.blocked_task_id)) {
      blockMap.set(block.blocked_task_id, { blockedBy: [], blocking: [] });
    }
    blockMap.get(block.blocked_task_id)!.blockedBy.push(block.blocker_task_id);
  }
  return blockMap;
}

export function getBoardUpdatedAt(database: StorageBackend): string | null {
  return database.getBoardUpdatedAtSignature();
}
