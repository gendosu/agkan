import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import path from 'path';
import { TaskService } from '../services/TaskService';
import { TaskTagService } from '../services/TaskTagService';
import { TagService } from '../services/TagService';
import { MetadataService } from '../services/MetadataService';
import { CommentService } from '../services/CommentService';
import { TaskBlockService } from '../services/TaskBlockService';
import { Task, TaskStatus, PRIORITIES, PRIORITY_ORDER, isPriority, Priority } from '../models';
import { Tag } from '../models/Tag';
import { getDatabase } from '../db/connection';
import { StorageProvider } from '../db/types/storage';
import { getDefaultDirName } from '../db/config';
import { readBoardConfig, writeBoardConfig, DETAIL_PANE_MAX_WIDTH } from './boardConfig';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { version: APP_VERSION } = require('../../package.json') as { version: string };

const STATUSES: TaskStatus[] = ['icebox', 'backlog', 'ready', 'in_progress', 'review', 'done', 'closed'];

const STATUS_LABELS: Record<TaskStatus, string> = {
  icebox: 'Icebox',
  backlog: 'Backlog',
  ready: 'Ready',
  in_progress: 'In Progress',
  review: 'Review',
  done: 'Done',
  closed: 'Closed',
};

const STATUS_COLORS: Record<TaskStatus, string> = {
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

function renderCard(task: Task, tags: Tag[]): string {
  const priority = task.priority;
  const priorityBadge = priority
    ? `<span class="priority priority-${escapeHtml(priority)}">${escapeHtml(priority)}</span>`
    : '';
  const tagBadges = tags.map((t) => `<span class="tag">${escapeHtml(t.name)}</span>`).join('');

  return `
    <div class="card" draggable="true" data-id="${task.id}" data-status="${task.status}">
      <div class="card-header">
        <span class="card-id">#${task.id}</span>
        ${priorityBadge}
      </div>
      <div class="card-title">${escapeHtml(task.title)}</div>
      ${tagBadges ? `<div class="card-tags">${tagBadges}</div>` : ''}
    </div>`;
}

const BOARD_STYLES = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f1f5f9; color: #1e293b; }
    header { background: #1e293b; color: white; padding: 12px 20px; display: flex; align-items: center; justify-content: space-between; }
    header h1 { font-size: 18px; font-weight: 700; }
    .board-title { font-size: 14px; font-weight: 400; opacity: 0.75; }
    .board-container { display: flex; width: 100%; height: calc(100vh - 92px); gap: 0; }
    .board { display: flex; gap: 12px; padding: 16px; overflow-x: auto; flex: 1; align-items: flex-start; min-width: 0; }
    .board.with-panel { padding-right: 0; }
    .column { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; width: 240px; flex-shrink: 0; display: flex; flex-direction: column; border-top: 3px solid transparent; }
    .column-header { padding: 10px 12px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e2e8f0; }
    .column-title { font-size: 13px; font-weight: 700; }
    .column-header-right { display: flex; align-items: center; gap: 6px; }
    .column-count { background: #e2e8f0; color: #64748b; border-radius: 10px; font-size: 11px; font-weight: 600; padding: 2px 7px; }
    .add-btn { background: none; border: 1px solid #cbd5e1; color: #64748b; border-radius: 4px; width: 22px; height: 22px; font-size: 14px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; }
    .add-btn:hover { background: #e2e8f0; color: #1e293b; }
    .column-body { padding: 8px; min-height: 60px; }
    .column.drag-over .column-body { background: #eff6ff; border-radius: 6px; }
    .card { background: white; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; margin-bottom: 6px; cursor: grab; transition: box-shadow 0.15s; }
    .card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .card.dragging { opacity: 0.5; }
    .card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px; }
    .card-id { font-size: 11px; color: #94a3b8; font-weight: 600; }
    .card-title { font-size: 13px; font-weight: 500; line-height: 1.4; }
    .card-tags { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px; }
    .tag { background: #e0f2fe; color: #0369a1; font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 10px; }
    .priority { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 10px; text-transform: uppercase; }
    .priority-critical { background: #fee2e2; color: #dc2626; }
    .priority-high { background: #fee2e2; color: #dc2626; }
    .priority-medium { background: #fef9c3; color: #ca8a04; }
    .priority-low { background: #dcfce7; color: #16a34a; }
    .context-menu { position: fixed; background: white; border: 1px solid #e2e8f0; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); padding: 4px 0; z-index: 1000; display: none; min-width: 140px; }
    .context-menu-item { padding: 8px 14px; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 8px; }
    .context-menu-item:hover { background: #f1f5f9; }
    .context-menu-item.danger { color: #dc2626; }
    .context-menu-item.danger:hover { background: #fef2f2; }
    .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 2000; display: none; align-items: center; justify-content: center; }
    .modal-overlay.show { display: flex; }
    .modal { background: white; border-radius: 8px; padding: 24px; width: 520px; box-shadow: 0 8px 24px rgba(0,0,0,0.2); }
    .modal h2 { font-size: 16px; margin-bottom: 14px; }
    .modal label { display: block; font-size: 12px; font-weight: 600; color: #64748b; margin-bottom: 4px; }
    .modal input, .modal textarea, .modal select { width: 100%; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; font-size: 13px; font-family: inherit; margin-bottom: 12px; background: white; }
    .modal textarea { resize: vertical; min-height: 60px; }
    .modal input:focus, .modal textarea:focus, .modal select:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.2); }
    .modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
    .modal-actions button { padding: 6px 14px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid #e2e8f0; background: white; color: #64748b; }
    .modal-actions button:hover { background: #f1f5f9; }
    .modal-actions button.primary { background: #3b82f6; color: white; border-color: #3b82f6; }
    .modal-actions button.primary:hover { background: #2563eb; }
    .toast { position: fixed; bottom: 20px; right: 20px; background: #ef4444; color: white; padding: 10px 16px; border-radius: 6px; font-size: 13px; opacity: 0; transition: opacity 0.3s; pointer-events: none; }
    .toast.show { opacity: 1; }
    .detail-panel { position: relative; width: 0; height: calc(100vh - 92px); background: white; box-shadow: none; border-left: 0 solid #e2e8f0; display: flex; flex-direction: column; max-width: 800px; overflow: hidden; transition: width 0.25s ease; }
    .detail-panel-resize-handle { position: absolute; top: 0; left: 0; width: 6px; height: 100%; cursor: col-resize; z-index: 10; background: transparent; }
    .detail-panel-resize-handle:hover, .detail-panel-resize-handle.dragging { background: rgba(59,130,246,0.3); }
    .detail-panel.open { width: 400px; min-width: 280px; border-left-width: 1px; }
    .detail-panel-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid #e2e8f0; flex-shrink: 0; }
    .detail-panel-header h2 { font-size: 16px; font-weight: 700; color: #1e293b; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .detail-panel-close { background: none; border: none; font-size: 20px; color: #64748b; cursor: pointer; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 4px; flex-shrink: 0; }
    .detail-panel-close:hover { background: #f1f5f9; color: #1e293b; }
    .detail-panel-body { flex: 1; overflow: hidden; min-width: 0; display: flex; flex-direction: column; }
    .detail-field { margin-bottom: 16px; word-wrap: break-word; }
    .description-field-wrapper { flex: 1; display: flex; flex-direction: column; min-height: 0; margin-bottom: 0; }
    .detail-field-label { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #94a3b8; margin-bottom: 4px; letter-spacing: 0.05em; }
    .detail-field-value { font-size: 13px; color: #1e293b; line-height: 1.5; }
    .detail-field-value.empty { color: #94a3b8; font-style: italic; }
    .detail-status-badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; color: white; }
    .detail-tags { display: flex; flex-wrap: wrap; gap: 4px; }
    .detail-meta-table { width: 100%; border-collapse: collapse; }
    .detail-meta-table td { padding: 4px 0; font-size: 12px; }
    .detail-meta-table td:first-child { color: #64748b; width: 100px; }
    .detail-meta-table td:last-child { color: #1e293b; }
    .detail-panel-footer { padding: 12px 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; flex-shrink: 0; }
    .detail-panel-footer button { padding: 7px 18px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid #3b82f6; background: #3b82f6; color: white; }
    .detail-panel-footer button:hover { background: #2563eb; border-color: #2563eb; }
    .detail-edit-input { width: 100%; border: 1px solid #e2e8f0; border-radius: 6px; padding: 7px 10px; font-size: 13px; font-family: inherit; background: white; color: #1e293b; }
    .detail-edit-input:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.2); }
    .detail-edit-textarea { width: 100%; border: 1px solid #e2e8f0; border-radius: 6px; padding: 7px 10px; font-size: 13px; font-family: inherit; resize: vertical; min-height: 240px; background: white; color: #1e293b; }
    .detail-edit-textarea:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.2); }
    .description-field-wrapper .detail-edit-textarea { flex: 1; resize: none; min-height: 0; }
    .detail-edit-select { width: 100%; border: 1px solid #e2e8f0; border-radius: 6px; padding: 7px 10px; font-size: 13px; font-family: inherit; background: white; color: #1e293b; }
    .detail-edit-select:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.2); }
    .tag-select-wrapper { position: relative; }
    .tag-select-control { border: 1px solid #e2e8f0; border-radius: 6px; padding: 4px 8px; min-height: 36px; cursor: text; display: flex; flex-wrap: wrap; gap: 4px; align-items: center; background: white; }
    .tag-select-control:focus-within { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.2); }
    .tag-pill { background: #e0f2fe; color: #0369a1; font-size: 11px; font-weight: 600; padding: 2px 4px 2px 8px; border-radius: 10px; display: inline-flex; align-items: center; gap: 3px; }
    .tag-pill-remove { background: none; border: none; color: #0369a1; cursor: pointer; font-size: 13px; line-height: 1; padding: 0 2px; display: inline-flex; align-items: center; border-radius: 50%; }
    .tag-pill-remove:hover { color: #dc2626; background: rgba(220,38,38,0.1); }
    .tag-select-input { border: none; outline: none; font-size: 12px; font-family: inherit; min-width: 80px; flex: 1; background: transparent; padding: 2px 0; color: #1e293b; }
    .tag-select-input::placeholder { color: #94a3b8; }
    .tag-select-dropdown { position: absolute; top: calc(100% + 2px); left: 0; right: 0; background: white; border: 1px solid #e2e8f0; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); z-index: 100; max-height: 180px; overflow-y: auto; display: none; }
    .tag-select-dropdown.open { display: block; }
    .tag-select-option { padding: 6px 10px; font-size: 12px; cursor: pointer; color: #1e293b; }
    .tag-select-option:hover, .tag-select-option.focused { background: #eff6ff; color: #0369a1; }
    .tag-select-no-options { padding: 6px 10px; font-size: 12px; color: #94a3b8; font-style: italic; }
    .filter-bar { display: flex; align-items: center; gap: 16px; height: 44px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 0 16px; flex-shrink: 0; overflow-x: auto; }
    .filter-group { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
    .filter-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.05em; white-space: nowrap; }
    .filter-priority-btn { border: 1px solid #e2e8f0; background: white; border-radius: 4px; padding: 2px 8px; font-size: 11px; font-weight: 600; cursor: pointer; text-transform: uppercase; color: #64748b; }
    .filter-priority-btn:hover { background: #f1f5f9; }
    .filter-priority-btn.active[data-priority="critical"] { background: #fee2e2; color: #dc2626; border-color: #fca5a5; }
    .filter-priority-btn.active[data-priority="high"] { background: #fee2e2; color: #dc2626; border-color: #fca5a5; }
    .filter-priority-btn.active[data-priority="medium"] { background: #fef9c3; color: #ca8a04; border-color: #fde047; }
    .filter-priority-btn.active[data-priority="low"] { background: #dcfce7; color: #16a34a; border-color: #86efac; }
    .filter-assignee-input { border: 1px solid #e2e8f0; border-radius: 4px; padding: 3px 8px; font-size: 12px; font-family: inherit; background: white; color: #1e293b; width: 120px; }
    .filter-assignee-input:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.2); }
    .filter-tag-pill { background: #e0f2fe; color: #0369a1; font-size: 11px; font-weight: 600; padding: 2px 4px 2px 8px; border-radius: 10px; display: inline-flex; align-items: center; gap: 3px; flex-shrink: 0; }
    .filter-tag-pill-remove { background: none; border: none; color: #0369a1; cursor: pointer; font-size: 13px; line-height: 1; padding: 0 2px; display: inline-flex; align-items: center; border-radius: 50%; }
    .filter-tag-pill-remove:hover { color: #dc2626; background: rgba(220,38,38,0.1); }
    .filter-tag-dropdown-wrapper { flex-shrink: 0; }
    .filter-tag-add-btn { border: 1px dashed #cbd5e1; background: white; border-radius: 4px; padding: 2px 8px; font-size: 11px; color: #64748b; cursor: pointer; white-space: nowrap; }
    .filter-tag-add-btn:hover { background: #f1f5f9; border-color: #94a3b8; }
    .filter-tag-dropdown { position: fixed; background: white; border: 1px solid #e2e8f0; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); z-index: 200; max-height: 180px; overflow-y: auto; display: none; min-width: 140px; }
    .filter-tag-dropdown.open { display: block; }
    .filter-tag-dropdown-option { padding: 6px 10px; font-size: 12px; cursor: pointer; color: #1e293b; white-space: nowrap; }
    .filter-tag-dropdown-option:hover { background: #eff6ff; color: #0369a1; }
    .filter-tag-dropdown-empty { padding: 6px 10px; font-size: 12px; color: #94a3b8; font-style: italic; }
    .filter-clear-btn { border: 1px solid #e2e8f0; background: white; border-radius: 4px; padding: 2px 10px; font-size: 11px; font-weight: 600; cursor: pointer; color: #64748b; display: none; flex-shrink: 0; margin-left: auto; }
    .filter-clear-btn:hover { background: #fee2e2; border-color: #fca5a5; color: #dc2626; }
    .filter-clear-btn.visible { display: block; }
    .detail-tabs { display: flex; gap: 0; border-bottom: 1px solid #e2e8f0; flex-shrink: 0; padding: 0 20px; background: white; }
    .detail-tab { padding: 8px 14px; font-size: 12px; font-weight: 600; color: #94a3b8; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; background: none; border-top: none; border-left: none; border-right: none; }
    .detail-tab:hover { color: #64748b; }
    .detail-tab.active { color: #3b82f6; border-bottom-color: #3b82f6; }
    .detail-tab-content { display: none; flex: 1; overflow-y: auto; min-height: 0; }
    .detail-tab-content.active { display: flex; flex-direction: column; }
    .detail-relations { font-size: 12px; color: #64748b; padding: 6px 0; border-bottom: 1px solid #f1f5f9; margin-bottom: 12px; }
    .detail-relation-row { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
    .detail-relation-label { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #94a3b8; width: 80px; flex-shrink: 0; letter-spacing: 0.05em; }
    .detail-relation-ids { display: flex; flex-wrap: wrap; gap: 4px; }
    .detail-relation-id { font-size: 11px; color: #3b82f6; background: #eff6ff; border-radius: 10px; padding: 1px 7px; font-weight: 600; }
    .detail-timestamp { font-size: 11px; color: #94a3b8; margin-top: 8px; padding-top: 8px; border-top: 1px solid #f1f5f9; }
    .comment-item { position: relative; padding: 6px 0 6px 10px; border-left: 2px solid #e2e8f0; margin-bottom: 10px; }
    .comment-item:hover { border-left-color: #3b82f6; }
    .comment-meta { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; }
    .comment-author { font-size: 11px; font-weight: 600; color: #64748b; }
    .comment-date { font-size: 11px; color: #94a3b8; }
    .comment-actions { display: none; margin-left: auto; gap: 4px; }
    .comment-item:hover .comment-actions { display: flex; }
    .comment-action-btn { background: none; border: none; padding: 1px 4px; cursor: pointer; color: #94a3b8; font-size: 12px; border-radius: 3px; }
    .comment-action-btn:hover { color: #1e293b; background: #f1f5f9; }
    .comment-action-btn.danger:hover { color: #dc2626; background: #fef2f2; }
    .comment-content { font-size: 13px; color: #1e293b; line-height: 1.5; white-space: pre-wrap; }
    .comment-edit-area { width: 100%; border: 1px solid #e2e8f0; border-radius: 6px; padding: 7px 10px; font-size: 13px; font-family: inherit; resize: vertical; min-height: 60px; background: white; color: #1e293b; margin-top: 4px; }
    .comment-edit-area:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.2); }
    .comment-edit-actions { display: flex; gap: 6px; margin-top: 4px; }
    .comment-btn { background: none; border: 1px solid #e2e8f0; border-radius: 4px; font-size: 11px; font-weight: 600; padding: 2px 8px; cursor: pointer; color: #64748b; }
    .comment-btn:hover { background: #f1f5f9; }
    .add-comment-trigger { background: none; border: 1px dashed #cbd5e1; border-radius: 6px; padding: 8px 12px; font-size: 12px; color: #94a3b8; cursor: pointer; width: 100%; text-align: left; margin-top: 4px; }
    .add-comment-trigger:hover { border-color: #94a3b8; color: #64748b; background: #f8fafc; }
    .add-comment-form { margin-top: 4px; display: none; }
    .add-comment-form.open { display: block; }
    .add-comment-textarea { width: 100%; border: 1px solid #e2e8f0; border-radius: 6px; padding: 7px 10px; font-size: 13px; font-family: inherit; resize: vertical; min-height: 72px; background: white; color: #1e293b; }
    .add-comment-textarea:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.2); }
    .add-comment-submit { margin-top: 6px; padding: 5px 14px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid #3b82f6; background: #3b82f6; color: white; }
    .add-comment-submit:hover { background: #2563eb; border-color: #2563eb; }
    .add-comment-cancel { margin-top: 6px; margin-left: 6px; padding: 5px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid #e2e8f0; background: white; color: #64748b; }
    .add-comment-cancel:hover { background: #f1f5f9; }
    .burger-menu-wrapper { position: relative; }
    .burger-menu-btn { background: none; border: none; color: white; cursor: pointer; padding: 4px 6px; border-radius: 4px; display: flex; flex-direction: column; gap: 4px; align-items: center; justify-content: center; opacity: 0.8; }
    .burger-menu-btn:hover { opacity: 1; background: rgba(255,255,255,0.1); }
    .burger-menu-btn span { display: block; width: 18px; height: 2px; background: white; border-radius: 1px; }
    .burger-menu-dropdown { position: absolute; right: 0; top: calc(100% + 6px); background: white; border: 1px solid #e2e8f0; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); padding: 4px 0; z-index: 1000; display: none; min-width: 180px; }
    .burger-menu-dropdown.open { display: block; }
    .burger-menu-item { padding: 8px 14px; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 8px; color: #1e293b; white-space: nowrap; }
    .burger-menu-item:hover { background: #f1f5f9; }
    .burger-menu-item.danger { color: #dc2626; }
    .burger-menu-item.danger:hover { background: #fef2f2; }`;

const BOARD_SCRIPT = `
    let draggedCard = null;
    let sourceBody = null;

    document.querySelectorAll('.card').forEach(card => {
      card.addEventListener('dragstart', e => {
        draggedCard = card;
        sourceBody = card.parentElement;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        draggedCard = null;
        sourceBody = null;
      });
    });

    document.querySelectorAll('.column').forEach(col => {
      col.addEventListener('dragover', e => {
        e.preventDefault();
        col.classList.add('drag-over');
      });
      col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
      col.addEventListener('drop', e => handleDrop(e, col.dataset.status, col));
    });

    async function handleDrop(e, newStatus, colEl) {
      e.preventDefault();
      colEl.classList.remove('drag-over');
      if (!draggedCard) return;
      const taskId = draggedCard.dataset.id;
      const oldStatus = draggedCard.dataset.status;
      if (oldStatus === newStatus) return;

      const targetBody = document.getElementById('col-' + newStatus);
      const prevBody = sourceBody;
      targetBody.appendChild(draggedCard);
      draggedCard.dataset.status = newStatus;
      updateCount(oldStatus);
      updateCount(newStatus);

      try {
        const res = await fetch('/api/tasks/' + taskId, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus })
        });
        if (!res.ok) throw new Error('Server error');
      } catch {
        prevBody.appendChild(draggedCard);
        draggedCard.dataset.status = oldStatus;
        updateCount(oldStatus);
        updateCount(newStatus);
        showToast();
      }
    }

    function updateCount(status) {
      const col = document.querySelector('.column[data-status="' + status + '"]');
      if (!col) return;
      col.querySelector('.column-count').textContent = col.querySelector('.column-body').children.length;
    }

    function showToast(msg) {
      const toast = document.getElementById('toast');
      if (msg) toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 3000);
    }

    // Add task modal
    const addModal = document.getElementById('add-modal');
    const addTitle = document.getElementById('add-title');
    const addBody = document.getElementById('add-body');
    const addPriority = document.getElementById('add-priority');
    const addStatus = document.getElementById('add-status');

    document.querySelectorAll('.add-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        addStatus.value = btn.dataset.status;
        addTitle.value = '';
        addBody.value = '';
        addPriority.value = '';
        addModal.classList.add('show');
        addTitle.focus();
      });
    });

    document.getElementById('add-cancel').addEventListener('click', () => {
      addModal.classList.remove('show');
    });

    addModal.addEventListener('click', e => {
      if (e.target === addModal) addModal.classList.remove('show');
    });

    addTitle.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); document.getElementById('add-submit').click(); }
    });

    document.getElementById('add-submit').addEventListener('click', async () => {
      const title = addTitle.value.trim();
      if (!title) { addTitle.focus(); return; }
      const status = addStatus.value;
      addModal.classList.remove('show');

      try {
        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, body: addBody.value.trim() || null, status, priority: addPriority.value || null })
        });
        if (!res.ok) throw new Error('Server error');
        location.reload();
      } catch {
        showToast('Failed to add task');
      }
    });

    // Context menu
    const ctxMenu = document.getElementById('context-menu');
    let ctxTargetCard = null;

    document.addEventListener('contextmenu', e => {
      const card = e.target.closest('.card');
      if (!card) { ctxMenu.style.display = 'none'; return; }
      e.preventDefault();
      ctxTargetCard = card;
      ctxMenu.style.left = e.clientX + 'px';
      ctxMenu.style.top = e.clientY + 'px';
      ctxMenu.style.display = 'block';
    });

    document.addEventListener('click', e => {
      if (!e.target.closest('#context-menu')) {
        ctxMenu.style.display = 'none';
        ctxTargetCard = null;
      }
    });

    document.getElementById('ctx-delete').addEventListener('click', async e => {
      e.stopPropagation();
      ctxMenu.style.display = 'none';
      if (!ctxTargetCard) return;
      const card = ctxTargetCard;
      ctxTargetCard = null;
      const taskId = card.dataset.id;
      const status = card.dataset.status;
      if (!confirm('Delete task #' + taskId + '?')) return;

      card.remove();
      updateCount(status);

      try {
        const res = await fetch('/api/tasks/' + taskId, { method: 'DELETE' });
        if (!res.ok) throw new Error('Server error');
      } catch {
        location.reload();
        showToast('Failed to delete task');
      }
    });

    // Detail panel - create and insert into board-container
    const boardContainer = document.querySelector('.board-container');
    const detailPanelHtml = '<div class="detail-panel" id="detail-panel"><div class="detail-panel-resize-handle" id="detail-panel-resize-handle"></div><div class="detail-panel-header"><h2 id="detail-panel-title">Task Detail</h2><button class="detail-panel-close" id="detail-panel-close" title="Close">&times;</button></div><div class="detail-tabs" id="detail-tabs"><button class="detail-tab active" data-tab="details">Details</button><button class="detail-tab" data-tab="comments" id="detail-tab-comments">Comments</button></div><div class="detail-panel-body" id="detail-panel-body"><div class="detail-tab-content active" id="detail-tab-content-details"></div><div class="detail-tab-content" id="detail-tab-content-comments"></div></div><div class="detail-panel-footer" id="detail-panel-footer"><button id="detail-save-btn">Save</button></div></div>';
    boardContainer.insertAdjacentHTML('beforeend', detailPanelHtml);

    const detailPanel = document.getElementById('detail-panel');
    const detailPanelTitle = document.getElementById('detail-panel-title');
    const detailPanelBody = document.getElementById('detail-panel-body');
    let detailTaskId = null;
    let lastTab = 'details';

    function closeDetailPanel() {
      detailPanel.classList.remove('open');
      detailPanel.style.width = '';
      detailTaskId = null;
    }

    document.getElementById('detail-panel-close').addEventListener('click', closeDetailPanel);

    // Tab switching
    function switchTab(tabName) {
      lastTab = tabName;
      document.querySelectorAll('.detail-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
      });
      document.querySelectorAll('.detail-tab-content').forEach(el => {
        el.classList.toggle('active', el.id === 'detail-tab-content-' + tabName);
      });
      const footer = document.getElementById('detail-panel-footer');
      if (footer) footer.style.display = tabName === 'details' ? '' : 'none';
    }

    document.getElementById('detail-tabs').addEventListener('click', e => {
      const btn = e.target.closest('.detail-tab');
      if (!btn) return;
      switchTab(btn.dataset.tab);
    });

    // Detail panel resize
    const resizeHandle = document.getElementById('detail-panel-resize-handle');
    const PANEL_MIN_WIDTH = 280;
    const PANEL_MAX_WIDTH = 800;
    const PANEL_DEFAULT_WIDTH = 400;

    // Initialize panel width from server config (async)
    (async function initPanelWidth() {
      let targetWidth = PANEL_DEFAULT_WIDTH;
      try {
        const res = await fetch('/api/config');
        if (res.ok) {
          const data = await res.json();
          const savedWidth = data && data.board && data.board.detailPaneWidth;
          if (typeof savedWidth === 'number' && savedWidth >= PANEL_MIN_WIDTH && savedWidth <= PANEL_MAX_WIDTH) {
            targetWidth = savedWidth;
          }
        }
      } catch {
        // Ignore errors, use default width
      }
      // Store the width for when panel opens (width is 0 when closed)
      detailPanel.dataset.preferredWidth = String(targetWidth);
    })();

    resizeHandle.addEventListener('mousedown', function(e) {
      e.preventDefault();
      if (!detailPanel.classList.contains('open')) return;
      const startX = e.clientX;
      const startWidth = detailPanel.offsetWidth;
      resizeHandle.classList.add('dragging');
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
      detailPanel.style.transition = 'none';

      function onMouseMove(e) {
        const delta = startX - e.clientX;
        const newWidth = Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, startWidth + delta));
        detailPanel.style.width = newWidth + 'px';
      }

      function onMouseUp() {
        resizeHandle.classList.remove('dragging');
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        detailPanel.style.transition = '';
        const currentWidth = detailPanel.offsetWidth;
        detailPanel.dataset.preferredWidth = String(currentWidth);
        fetch('/api/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ board: { detailPaneWidth: currentWidth } })
        }).catch(function() {
          // Ignore errors when saving panel width
        });
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      }

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    const statusColors = ${JSON.stringify(STATUS_COLORS)};
    const allStatuses = ${JSON.stringify(STATUSES)};
    const statusLabels = ${JSON.stringify(STATUS_LABELS)};
    const allPriorities = ${JSON.stringify(PRIORITIES)};

    let allAvailableTags = [];

    async function loadAllTags() {
      try {
        const res = await fetch('/api/tags');
        if (!res.ok) return;
        const data = await res.json();
        allAvailableTags = data.tags || [];
      } catch {
        // Ignore errors loading tags
      }
    }

    function renderTagsSection(currentTags) {
      const container = document.getElementById('detail-tags-container');
      if (!container) return;

      container.innerHTML = '<div class="tag-select-wrapper"><div class="tag-select-control" id="tag-select-control"></div><div class="tag-select-dropdown" id="tag-select-dropdown"></div></div>';

      const control = document.getElementById('tag-select-control');
      const dropdown = document.getElementById('tag-select-dropdown');
      let focusedOptionIndex = -1;
      let inputValue = '';

      function getFilteredTags() {
        const currentTagIds = new Set(currentTags.map(t => t.id));
        const available = allAvailableTags.filter(t => !currentTagIds.has(t.id));
        if (!inputValue.trim()) return available;
        const q = inputValue.toLowerCase();
        return available.filter(t => t.name.toLowerCase().includes(q));
      }

      const input = document.createElement('input');
      input.className = 'tag-select-input';
      input.type = 'text';
      input.autocomplete = 'off';
      control.appendChild(input);

      function renderPills() {
        control.querySelectorAll('.tag-pill').forEach(p => p.remove());
        currentTags.forEach(t => {
          const pill = document.createElement('span');
          pill.className = 'tag-pill';
          pill.dataset.tagId = t.id;
          const label = document.createTextNode(t.name);
          const removeBtn = document.createElement('button');
          removeBtn.className = 'tag-pill-remove';
          removeBtn.title = 'Remove tag';
          removeBtn.setAttribute('data-tag-id', t.id);
          removeBtn.innerHTML = '&times;';
          removeBtn.addEventListener('click', async e => {
            e.stopPropagation();
            try {
              const res = await fetch('/api/tasks/' + detailTaskId + '/tags/' + t.id, { method: 'DELETE' });
              if (!res.ok) throw new Error('Server error');
              const idx = currentTags.findIndex(x => String(x.id) === String(t.id));
              if (idx !== -1) currentTags.splice(idx, 1);
              renderPills();
              renderDropdown();
            } catch {
              showToast('Failed to remove tag');
            }
          });
          pill.appendChild(label);
          pill.appendChild(removeBtn);
          control.insertBefore(pill, input);
        });
        input.placeholder = currentTags.length === 0 ? 'Add tags...' : '';
      }

      function renderDropdown() {
        const filtered = getFilteredTags();
        dropdown.innerHTML = '';
        focusedOptionIndex = -1;
        if (filtered.length === 0) {
          const noOpt = document.createElement('div');
          noOpt.className = 'tag-select-no-options';
          noOpt.textContent = inputValue ? 'No matching tags' : 'No tags available';
          dropdown.appendChild(noOpt);
        } else {
          filtered.forEach((t, i) => {
            const opt = document.createElement('div');
            opt.className = 'tag-select-option';
            opt.dataset.tagId = t.id;
            opt.textContent = t.name;
            opt.addEventListener('mouseover', () => setFocusedOption(i));
            opt.addEventListener('mousedown', async e => {
              e.preventDefault();
              await addTag(t.id);
            });
            dropdown.appendChild(opt);
          });
        }
      }

      function setFocusedOption(index) {
        const opts = dropdown.querySelectorAll('.tag-select-option');
        opts.forEach((o, i) => o.classList.toggle('focused', i === index));
        focusedOptionIndex = index;
      }

      function openDropdown() {
        renderDropdown();
        dropdown.classList.add('open');
      }

      function closeDropdown() {
        dropdown.classList.remove('open');
        focusedOptionIndex = -1;
      }

      async function addTag(tagId) {
        try {
          const res = await fetch('/api/tasks/' + detailTaskId + '/tags', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tagId: Number(tagId) })
          });
          if (!res.ok) throw new Error('Server error');
          const tag = allAvailableTags.find(t => String(t.id) === String(tagId));
          if (tag) currentTags.push(tag);
          input.value = '';
          inputValue = '';
          renderPills();
          renderDropdown();
        } catch {
          showToast('Failed to add tag');
        }
      }

      control.addEventListener('click', () => input.focus());

      input.addEventListener('focus', () => openDropdown());

      input.addEventListener('blur', () => setTimeout(() => closeDropdown(), 150));

      input.addEventListener('input', () => {
        inputValue = input.value;
        renderDropdown();
        if (!dropdown.classList.contains('open')) openDropdown();
      });

      input.addEventListener('keydown', async e => {
        const filtered = getFilteredTags();
        const opts = dropdown.querySelectorAll('.tag-select-option');
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setFocusedOption(Math.min(focusedOptionIndex + 1, opts.length - 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setFocusedOption(Math.max(focusedOptionIndex - 1, 0));
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (focusedOptionIndex >= 0 && filtered[focusedOptionIndex]) {
            await addTag(filtered[focusedOptionIndex].id);
          }
        } else if (e.key === 'Escape') {
          closeDropdown();
          input.blur();
        } else if (e.key === 'Backspace' && input.value === '' && currentTags.length > 0) {
          e.preventDefault();
          const last = currentTags[currentTags.length - 1];
          try {
            const res = await fetch('/api/tasks/' + detailTaskId + '/tags/' + last.id, { method: 'DELETE' });
            if (!res.ok) throw new Error('Server error');
            currentTags.splice(currentTags.length - 1, 1);
            renderPills();
            renderDropdown();
          } catch {
            showToast('Failed to remove tag');
          }
        }
      });

      renderPills();
    }

    function relativeTime(isoStr) {
      if (!isoStr) return '';
      const diff = Date.now() - new Date(isoStr).getTime();
      const sec = Math.floor(diff / 1000);
      if (sec < 60) return 'just now';
      const min = Math.floor(sec / 60);
      if (min < 60) return min + 'm ago';
      const hr = Math.floor(min / 60);
      if (hr < 24) return hr + 'h ago';
      const day = Math.floor(hr / 24);
      if (day < 30) return day + 'd ago';
      const mo = Math.floor(day / 30);
      if (mo < 12) return mo + 'mo ago';
      return Math.floor(mo / 12) + 'y ago';
    }

    function renderDetailPanel(data) {
      const task = data.task;
      const tags = data.tags || [];
      const metadata = data.metadata || [];
      const blockedBy = data.blockedBy || [];
      const blocking = data.blocking || [];
      const parent = data.parent || null;

      detailTaskId = task.id;
      detailPanelTitle.textContent = '#' + task.id;

      let html = '';

      // Status (editable)
      html += '<div class="detail-field">';
      html += '<div class="detail-field-label">Status</div>';
      html += '<select id="detail-edit-status" class="detail-edit-select">';
      allStatuses.forEach(s => {
        const selected = s === task.status ? ' selected' : '';
        html += '<option value="' + s + '"' + selected + '>' + statusLabels[s] + '</option>';
      });
      html += '</select>';
      html += '</div>';

      // Priority (editable)
      html += '<div class="detail-field">';
      html += '<div class="detail-field-label">Priority</div>';
      html += '<select id="detail-edit-priority" class="detail-edit-select">';
      html += '<option value="">None</option>';
      allPriorities.forEach(p => {
        const selected = task.priority === p ? ' selected' : '';
        html += '<option value="' + p + '"' + selected + '>' + p.charAt(0).toUpperCase() + p.slice(1) + '</option>';
      });
      html += '</select>';
      html += '</div>';

      // Tags (editable)
      html += '<div class="detail-field">';
      html += '<div class="detail-field-label">Tags</div>';
      html += '<div id="detail-tags-container"></div>';
      html += '</div>';

      // Relations: parent, blockedBy, blocking
      const hasRelations = parent || blockedBy.length > 0 || blocking.length > 0;
      if (hasRelations) {
        html += '<div class="detail-relations">';
        if (parent) {
          html += '<div class="detail-relation-row">';
          html += '<span class="detail-relation-label">Parent</span>';
          html += '<div class="detail-relation-ids"><span class="detail-relation-id">#' + parent.id + ' ' + escapeHtmlClient(parent.title) + '</span></div>';
          html += '</div>';
        }
        if (blockedBy.length > 0) {
          html += '<div class="detail-relation-row">';
          html += '<span class="detail-relation-label">Blocked by</span>';
          html += '<div class="detail-relation-ids">';
          blockedBy.forEach(t => { html += '<span class="detail-relation-id">#' + t.id + '</span>'; });
          html += '</div></div>';
        }
        if (blocking.length > 0) {
          html += '<div class="detail-relation-row">';
          html += '<span class="detail-relation-label">Blocking</span>';
          html += '<div class="detail-relation-ids">';
          blocking.forEach(t => { html += '<span class="detail-relation-id">#' + t.id + '</span>'; });
          html += '</div></div>';
        }
        html += '</div>';
      }

      // Title (editable)
      html += '<div class="detail-field">';
      html += '<div class="detail-field-label">Title</div>';
      html += '<input id="detail-edit-title" class="detail-edit-input" type="text" value="' + escapeHtmlClient(task.title) + '">';
      html += '</div>';

      // Body (editable)
      html += '<div class="detail-field description-field-wrapper">';
      html += '<div class="detail-field-label">Description</div>';
      html += '<textarea id="detail-edit-body" class="detail-edit-textarea">' + escapeHtmlClient(task.body || '') + '</textarea>';
      html += '</div>';

      // Metadata table (read-only, non-priority)
      const otherMeta = metadata.filter(m => m.key !== 'priority');
      if (otherMeta.length > 0) {
        html += '<div class="detail-field">';
        html += '<div class="detail-field-label">Metadata</div>';
        html += '<table class="detail-meta-table">';
        otherMeta.forEach(m => {
          html += '<tr><td>' + escapeHtmlClient(m.key) + '</td><td>' + escapeHtmlClient(m.value) + '</td></tr>';
        });
        html += '</table></div>';
      }

      // Timestamps compressed to one line
      html += '<div class="detail-timestamp">created ' + relativeTime(task.created_at) + ' &middot; updated ' + relativeTime(task.updated_at) + '</div>';

      const detailsPane = document.getElementById('detail-tab-content-details');
      if (detailsPane) {
        detailsPane.innerHTML = html;
        detailsPane.style.padding = '20px';
      }

      // Render tags section after DOM update
      loadAllTags().then(() => renderTagsSection([...tags]));

      // Load comments into the comments tab
      loadComments(task.id);

      // Restore last tab
      switchTab(lastTab);
    }

    function escapeHtmlClient(str) {
      if (!str) return '';
      const div = document.createElement('div');
      div.textContent = String(str);
      return div.innerHTML;
    }

    async function loadComments(taskId) {
      const tabBtn = document.getElementById('detail-tab-comments');
      const pane = document.getElementById('detail-tab-content-comments');
      if (!pane) return;
      try {
        const res = await fetch('/api/tasks/' + taskId + '/comments');
        if (!res.ok) throw new Error('Server error');
        const data = await res.json();
        const comments = data.comments || [];
        if (tabBtn) tabBtn.textContent = 'Comments (' + comments.length + ')';
        renderComments(taskId, comments);
      } catch {
        if (pane) pane.innerHTML = '<div style="padding:20px;font-size:12px;color:#94a3b8;">Failed to load comments</div>';
      }
    }

    function renderComments(taskId, comments) {
      const pane = document.getElementById('detail-tab-content-comments');
      if (!pane) return;
      pane.style.padding = '16px 20px';

      let html = '';

      comments.forEach(function(comment) {
        const authorText = comment.author ? escapeHtmlClient(comment.author) : 'Anonymous';
        const dateRel = relativeTime(comment.created_at);
        const dateAbs = escapeHtmlClient(comment.created_at);
        const contentText = escapeHtmlClient(comment.content);
        html += '<div class="comment-item" data-comment-id="' + comment.id + '">';
        html += '<div class="comment-meta">';
        html += '<span class="comment-author">' + authorText + '</span>';
        html += '<span class="comment-date" title="' + dateAbs + '">' + dateRel + '</span>';
        html += '<span class="comment-actions">';
        html += '<button class="comment-action-btn" title="Edit" onclick="startCommentEdit(' + comment.id + ')">&#9998;</button>';
        html += '<button class="comment-action-btn danger" title="Delete" onclick="deleteComment(' + comment.id + ',' + taskId + ')">&#128465;</button>';
        html += '</span>';
        html += '</div>';
        html += '<div class="comment-content" id="comment-content-' + comment.id + '">' + contentText + '</div>';
        html += '<div id="comment-edit-' + comment.id + '" style="display:none;">';
        html += '<textarea class="comment-edit-area" id="comment-edit-area-' + comment.id + '">' + contentText + '</textarea>';
        html += '<div class="comment-edit-actions">';
        html += '<button class="comment-btn" onclick="saveCommentEdit(' + comment.id + ',' + taskId + ')">Save</button>';
        html += '<button class="comment-btn" onclick="cancelCommentEdit(' + comment.id + ')">Cancel</button>';
        html += '</div></div>';
        html += '</div>';
      });

      html += '<button class="add-comment-trigger" id="add-comment-trigger" onclick="openAddCommentForm()">+ Add comment...</button>';
      html += '<div class="add-comment-form" id="add-comment-form">';
      html += '<textarea class="add-comment-textarea" id="add-comment-text" placeholder="Write a comment..."></textarea>';
      html += '<div>';
      html += '<button class="add-comment-submit" onclick="submitComment(' + taskId + ')">Add Comment</button>';
      html += '<button class="add-comment-cancel" onclick="closeAddCommentForm()">Cancel</button>';
      html += '</div></div>';

      pane.innerHTML = html;
    }

    function openAddCommentForm() {
      const trigger = document.getElementById('add-comment-trigger');
      const form = document.getElementById('add-comment-form');
      if (trigger) trigger.style.display = 'none';
      if (form) { form.classList.add('open'); form.querySelector('textarea').focus(); }
    }

    function closeAddCommentForm() {
      const trigger = document.getElementById('add-comment-trigger');
      const form = document.getElementById('add-comment-form');
      if (trigger) trigger.style.display = '';
      if (form) { form.classList.remove('open'); form.querySelector('textarea').value = ''; }
    }

    function startCommentEdit(commentId) {
      const contentEl = document.getElementById('comment-content-' + commentId);
      const editWrapper = document.getElementById('comment-edit-' + commentId);
      if (contentEl) contentEl.style.display = 'none';
      if (editWrapper) editWrapper.style.display = 'block';
      const area = document.getElementById('comment-edit-area-' + commentId);
      if (area) area.focus();
    }

    function cancelCommentEdit(commentId) {
      const contentEl = document.getElementById('comment-content-' + commentId);
      const editWrapper = document.getElementById('comment-edit-' + commentId);
      if (contentEl) contentEl.style.display = '';
      if (editWrapper) editWrapper.style.display = 'none';
    }

    async function saveCommentEdit(commentId, taskId) {
      const area = document.getElementById('comment-edit-area-' + commentId);
      if (!area) return;
      const content = area.value.trim();
      if (!content) { area.focus(); return; }
      try {
        const res = await fetch('/api/comments/' + commentId, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content })
        });
        if (!res.ok) throw new Error('Server error');
        await loadComments(taskId);
      } catch {
        showToast('Failed to update comment');
      }
    }

    async function deleteComment(commentId, taskId) {
      if (!confirm('Delete this comment?')) return;
      try {
        const res = await fetch('/api/comments/' + commentId, { method: 'DELETE' });
        if (!res.ok) throw new Error('Server error');
        await loadComments(taskId);
      } catch {
        showToast('Failed to delete comment');
      }
    }

    async function submitComment(taskId) {
      const textarea = document.getElementById('add-comment-text');
      if (!textarea) return;
      const content = textarea.value.trim();
      if (!content) { textarea.focus(); return; }
      try {
        const res = await fetch('/api/tasks/' + taskId + '/comments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content })
        });
        if (!res.ok) throw new Error('Server error');
        await loadComments(taskId);
      } catch {
        showToast('Failed to add comment');
      }
    }

    document.getElementById('detail-save-btn').addEventListener('click', async () => {
      if (detailTaskId === null) return;
      const titleInput = document.getElementById('detail-edit-title');
      const title = titleInput ? titleInput.value.trim() : '';
      if (!title) { if (titleInput) titleInput.focus(); return; }
      const bodyEl = document.getElementById('detail-edit-body');
      const statusEl = document.getElementById('detail-edit-status');
      const priorityEl = document.getElementById('detail-edit-priority');

      try {
        const res = await fetch('/api/tasks/' + detailTaskId, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            body: bodyEl ? (bodyEl.value.trim() || null) : null,
            status: statusEl ? statusEl.value : undefined,
            priority: priorityEl ? (priorityEl.value || null) : null
          })
        });
        if (!res.ok) throw new Error('Server error');
        // Fetch updated task data and refresh detail panel instead of reloading
        const getRes = await fetch('/api/tasks/' + detailTaskId);
        if (!getRes.ok) throw new Error('Failed to fetch updated task');
        const data = await getRes.json();
        renderDetailPanel(data);
        showToast('Task saved successfully');
        // Update lastUpdatedAt so polling doesn't treat our own save as an external update
        try {
          const tsRes = await fetch('/api/board/updated-at');
          if (tsRes.ok) {
            const tsData = await tsRes.json();
            lastUpdatedAt = tsData.updatedAt;
          }
        } catch {
          // Ignore errors when syncing timestamp
        }
        // Refresh board cards in the background
        refreshBoardCards();
      } catch {
        showToast('Failed to update task');
      }
    });

    document.querySelectorAll('.card').forEach(card => {
      card.addEventListener('click', async e => {
        if (e.defaultPrevented) return;
        const taskId = card.dataset.id;
        try {
          const res = await fetch('/api/tasks/' + taskId);
          if (!res.ok) throw new Error('Server error');
          const data = await res.json();
          renderDetailPanel(data);
          if (!detailPanel.classList.contains('open')) {
            const preferredWidth = detailPanel.dataset.preferredWidth || PANEL_DEFAULT_WIDTH;
            detailPanel.style.width = preferredWidth + 'px';
            detailPanel.classList.add('open');
          }
        } catch {
          showToast('Failed to load task details');
        }
      });
    });

    // Filter state (defined before refreshBoardCards so it can use them)
    let activeFilters = { tagIds: [], priorities: [], assignee: '' };

    function buildFilterParams() {
      const params = new URLSearchParams();
      if (activeFilters.priorities.length > 0) {
        params.set('priority', activeFilters.priorities.join(','));
      }
      if (activeFilters.tagIds.length > 0) {
        params.set('tags', activeFilters.tagIds.join(','));
      }
      if (activeFilters.assignee) {
        params.set('assignee', activeFilters.assignee);
      }
      return params;
    }

    // Board polling: reload when updated_at changes (skip during drag)
    let lastUpdatedAt = null;
    async function refreshBoardCards() {
      const filterParams = buildFilterParams();
      const url = '/api/board/cards' + (filterParams.toString() ? '?' + filterParams.toString() : '');
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        const columns = data.columns;
        columns.forEach(col => {
          const body = document.getElementById('col-' + col.status);
          if (!body) return;
          body.innerHTML = col.html;
          const colEl = body.closest('.column');
          if (colEl) colEl.querySelector('.column-count').textContent = col.count;
          // Re-attach drag event listeners to new cards
          body.querySelectorAll('.card').forEach(card => {
            card.addEventListener('dragstart', e => {
              draggedCard = card;
              sourceBody = card.parentElement;
              card.classList.add('dragging');
              e.dataTransfer.effectAllowed = 'move';
            });
            card.addEventListener('dragend', () => {
              card.classList.remove('dragging');
              draggedCard = null;
              sourceBody = null;
            });
            card.addEventListener('click', async e => {
              if (e.defaultPrevented) return;
              const taskId = card.dataset.id;
              try {
                const res = await fetch('/api/tasks/' + taskId);
                if (!res.ok) throw new Error('Server error');
                const data = await res.json();
                renderDetailPanel(data);
                if (!detailPanel.classList.contains('open')) {
                  const preferredWidth = detailPanel.dataset.preferredWidth || PANEL_DEFAULT_WIDTH;
                  detailPanel.style.width = preferredWidth + 'px';
                  detailPanel.classList.add('open');
                }
              } catch {
                showToast('Failed to load task details');
              }
            });
          });
        });
        // If detail panel is open, refresh its content if the task was updated
        if (detailTaskId !== null) {
          const editableFields = ['detail-edit-title', 'detail-edit-body', 'detail-edit-status', 'detail-edit-priority'];
          const isEditing = editableFields.some(id => document.activeElement && document.activeElement.id === id);
          if (isEditing) {
            const warning = document.getElementById('detail-panel-update-warning');
            if (!warning) {
              const warningEl = document.createElement('div');
              warningEl.id = 'detail-panel-update-warning';
              warningEl.style.cssText = 'color: red; font-size: 0.85em; padding: 4px 8px; background: #fff0f0; border: 1px solid #ffcccc; border-radius: 4px; margin-bottom: 8px;';
              warningEl.textContent = 'This task has been updated in the database. Save or discard your changes to see the latest version.';
              detailPanelBody.insertBefore(warningEl, detailPanelBody.firstChild);
            }
          } else {
            try {
              const taskRes = await fetch('/api/tasks/' + detailTaskId);
              if (taskRes.ok) {
                const taskData = await taskRes.json();
                renderDetailPanel(taskData);
              }
            } catch {
              // Ignore network errors during detail panel refresh
            }
          }
        }
      } catch {
        // Ignore network errors during card refresh
      }
    }
    async function pollBoardUpdates() {
      if (draggedCard !== null) return;
      try {
        const res = await fetch('/api/board/updated-at');
        if (!res.ok) return;
        const data = await res.json();
        const ts = data.updatedAt;
        if (lastUpdatedAt === null) {
          lastUpdatedAt = ts;
        } else if (ts !== lastUpdatedAt) {
          lastUpdatedAt = ts;
          if (detailPanel.classList.contains('open')) {
            await refreshBoardCards();
          } else {
            location.reload();
          }
        }
      } catch {
        // Ignore network errors during polling
      }
    }
    setInterval(pollBoardUpdates, 5000);
    pollBoardUpdates();

    async function loadComments(taskId) {
      const section = document.getElementById('comments-section');
      if (!section) return;
      try {
        const res = await fetch('/api/tasks/' + taskId + '/comments');
        if (!res.ok) throw new Error('Server error');
        const data = await res.json();
        renderComments(taskId, data.comments || []);
      } catch {
        section.innerHTML = '<div class="comments-section-title">Comments</div><div style="font-size:12px;color:#94a3b8;">Failed to load comments</div>';
      }
    }

    function renderComments(taskId, comments) {
      const section = document.getElementById('comments-section');
      if (!section) return;

      let html = '<div class="comments-section-title">Comments (' + comments.length + ')</div>';

      comments.forEach(function(comment) {
        const authorText = comment.author ? escapeHtmlClient(comment.author) : 'Anonymous';
        const dateText = escapeHtmlClient(comment.created_at);
        const contentText = escapeHtmlClient(comment.content);
        html += '<div class="comment-item" data-comment-id="' + comment.id + '">';
        html += '<div class="comment-meta">';
        html += '<span class="comment-author">' + authorText + '</span>';
        html += '<span class="comment-date">' + dateText + '</span>';
        html += '</div>';
        html += '<div class="comment-content" id="comment-content-' + comment.id + '">' + contentText + '</div>';
        html += '<div class="comment-edit-wrapper" id="comment-edit-' + comment.id + '" style="display:none;">';
        html += '<textarea class="comment-edit-area" id="comment-edit-area-' + comment.id + '">' + contentText + '</textarea>';
        html += '<div class="comment-edit-actions">';
        html += '<button class="comment-btn" onclick="saveCommentEdit(' + comment.id + ',' + taskId + ')">Save</button>';
        html += '<button class="comment-btn" onclick="cancelCommentEdit(' + comment.id + ')">Cancel</button>';
        html += '</div></div>';
        html += '<div class="comment-actions">';
        html += '<button class="comment-btn" onclick="startCommentEdit(' + comment.id + ')">Edit</button>';
        html += '<button class="comment-btn danger" onclick="deleteComment(' + comment.id + ',' + taskId + ')">Delete</button>';
        html += '</div>';
        html += '</div>';
      });

      html += '<div class="add-comment-form">';
      html += '<textarea class="add-comment-textarea" id="add-comment-text" placeholder="Add a comment..."></textarea>';
      html += '<button class="add-comment-submit" onclick="submitComment(' + taskId + ')">Add Comment</button>';
      html += '</div>';

      section.innerHTML = html;
    }

    function startCommentEdit(commentId) {
      const contentEl = document.getElementById('comment-content-' + commentId);
      const editWrapper = document.getElementById('comment-edit-' + commentId);
      if (contentEl) contentEl.style.display = 'none';
      if (editWrapper) editWrapper.style.display = 'block';
      const area = document.getElementById('comment-edit-area-' + commentId);
      if (area) area.focus();
    }

    function cancelCommentEdit(commentId) {
      const contentEl = document.getElementById('comment-content-' + commentId);
      const editWrapper = document.getElementById('comment-edit-' + commentId);
      if (contentEl) contentEl.style.display = '';
      if (editWrapper) editWrapper.style.display = 'none';
    }

    async function saveCommentEdit(commentId, taskId) {
      const area = document.getElementById('comment-edit-area-' + commentId);
      if (!area) return;
      const content = area.value.trim();
      if (!content) { area.focus(); return; }
      try {
        const res = await fetch('/api/comments/' + commentId, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content })
        });
        if (!res.ok) throw new Error('Server error');
        await loadComments(taskId);
      } catch {
        showToast('Failed to update comment');
      }
    }

    async function deleteComment(commentId, taskId) {
      if (!confirm('Delete this comment?')) return;
      try {
        const res = await fetch('/api/comments/' + commentId, { method: 'DELETE' });
        if (!res.ok) throw new Error('Server error');
        await loadComments(taskId);
      } catch {
        showToast('Failed to delete comment');
      }
    }

    async function submitComment(taskId) {
      const textarea = document.getElementById('add-comment-text');
      if (!textarea) return;
      const content = textarea.value.trim();
      if (!content) { textarea.focus(); return; }
      try {
        const res = await fetch('/api/tasks/' + taskId + '/comments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content })
        });
        if (!res.ok) throw new Error('Server error');
        await loadComments(taskId);
      } catch {
        showToast('Failed to add comment');
      }
    }

    function isFiltersActive() {
      return activeFilters.priorities.length > 0 || activeFilters.tagIds.length > 0 || activeFilters.assignee !== '';
    }

    function applyFilters() {
      const clearBtn = document.getElementById('filter-clear');
      if (clearBtn) {
        if (isFiltersActive()) {
          clearBtn.classList.add('visible');
        } else {
          clearBtn.classList.remove('visible');
        }
      }
      refreshBoardCards();
    }

    function renderFilterTagPills() {
      const container = document.getElementById('filter-tags-control');
      if (!container) return;
      // Remove existing pills
      container.querySelectorAll('.filter-tag-pill').forEach(p => p.remove());
      // Add pills for active tag filters
      activeFilters.tagIds.forEach(tagId => {
        const tag = allAvailableTags.find(t => t.id === tagId);
        if (!tag) return;
        const pill = document.createElement('span');
        pill.className = 'filter-tag-pill';
        const label = document.createTextNode(tag.name);
        const removeBtn = document.createElement('button');
        removeBtn.className = 'filter-tag-pill-remove';
        removeBtn.title = 'Remove tag filter';
        removeBtn.innerHTML = '&times;';
        removeBtn.addEventListener('click', () => {
          const idx = activeFilters.tagIds.indexOf(tagId);
          if (idx !== -1) activeFilters.tagIds.splice(idx, 1);
          renderFilterTagPills();
          applyFilters();
        });
        pill.appendChild(label);
        pill.appendChild(removeBtn);
        container.insertBefore(pill, container.querySelector('.filter-tag-dropdown-wrapper'));
      });
    }

    function initFilterBar() {
      // Priority toggle buttons
      document.querySelectorAll('.filter-priority-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const priority = btn.dataset.priority;
          const idx = activeFilters.priorities.indexOf(priority);
          if (idx === -1) {
            activeFilters.priorities.push(priority);
            btn.classList.add('active');
          } else {
            activeFilters.priorities.splice(idx, 1);
            btn.classList.remove('active');
          }
          applyFilters();
        });
      });

      // Assignee input with debounce
      const assigneeInput = document.getElementById('filter-assignee');
      let assigneeTimer = null;
      if (assigneeInput) {
        assigneeInput.addEventListener('input', () => {
          clearTimeout(assigneeTimer);
          assigneeTimer = setTimeout(() => {
            activeFilters.assignee = assigneeInput.value.trim();
            applyFilters();
          }, 300);
        });
      }

      // Clear button
      const clearBtn = document.getElementById('filter-clear');
      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          activeFilters.tagIds = [];
          activeFilters.priorities = [];
          activeFilters.assignee = '';
          document.querySelectorAll('.filter-priority-btn').forEach(btn => btn.classList.remove('active'));
          if (assigneeInput) assigneeInput.value = '';
          renderFilterTagPills();
          applyFilters();
        });
      }

      // Tag filter dropdown
      const tagsControl = document.getElementById('filter-tags-control');
      if (tagsControl) {
        const dropdownWrapper = document.createElement('div');
        dropdownWrapper.className = 'filter-tag-dropdown-wrapper';

        const addBtn = document.createElement('button');
        addBtn.className = 'filter-tag-add-btn';
        addBtn.textContent = '+ Tag';

        const dropdown = document.createElement('div');
        dropdown.className = 'filter-tag-dropdown';

        dropdownWrapper.appendChild(addBtn);
        dropdownWrapper.appendChild(dropdown);
        tagsControl.appendChild(dropdownWrapper);

        function renderTagDropdown() {
          dropdown.innerHTML = '';
          const available = allAvailableTags.filter(t => !activeFilters.tagIds.includes(t.id));
          if (available.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'filter-tag-dropdown-empty';
            empty.textContent = 'No tags available';
            dropdown.appendChild(empty);
          } else {
            available.forEach(tag => {
              const opt = document.createElement('div');
              opt.className = 'filter-tag-dropdown-option';
              opt.textContent = tag.name;
              opt.addEventListener('mousedown', (e) => {
                e.preventDefault();
                activeFilters.tagIds.push(tag.id);
                dropdown.classList.remove('open');
                renderFilterTagPills();
                applyFilters();
              });
              dropdown.appendChild(opt);
            });
          }
        }

        addBtn.addEventListener('click', () => {
          if (dropdown.classList.contains('open')) {
            dropdown.classList.remove('open');
          } else {
            renderTagDropdown();
            const rect = addBtn.getBoundingClientRect();
            dropdown.style.top = (rect.bottom + 2) + 'px';
            dropdown.style.left = rect.left + 'px';
            dropdown.classList.add('open');
          }
        });

        document.addEventListener('click', (e) => {
          if (!dropdownWrapper.contains(e.target)) {
            dropdown.classList.remove('open');
          }
        });
      }
    }

    // Initialize filter bar after tags are loaded
    loadAllTags().then(() => {
      initFilterBar();
    });

    // Burger menu
    const burgerBtn = document.getElementById('burger-menu-btn');
    const burgerDropdown = document.getElementById('burger-menu-dropdown');

    burgerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      burgerDropdown.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
      if (!burgerDropdown.contains(e.target) && e.target !== burgerBtn) {
        burgerDropdown.classList.remove('open');
      }
    });

    // Purge tasks
    const purgeModal = document.getElementById('purge-confirm-modal');
    const purgeConfirmBtn = document.getElementById('purge-confirm-btn');
    const purgeCancelBtn = document.getElementById('purge-cancel-btn');
    const purgeResultEl = document.getElementById('purge-result');

    document.getElementById('burger-purge-tasks').addEventListener('click', () => {
      burgerDropdown.classList.remove('open');
      purgeResultEl.textContent = '';
      purgeModal.classList.add('show');
    });

    purgeCancelBtn.addEventListener('click', () => {
      purgeModal.classList.remove('show');
    });

    purgeConfirmBtn.addEventListener('click', async () => {
      purgeConfirmBtn.disabled = true;
      purgeConfirmBtn.textContent = 'Purging...';
      try {
        const res = await fetch('/api/tasks/purge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        const data = await res.json();
        if (res.ok) {
          purgeResultEl.textContent = 'Purged ' + data.count + ' task(s).';
          setTimeout(() => { purgeModal.classList.remove('show'); }, 1500);
          refreshBoard();
        } else {
          purgeResultEl.textContent = 'Error: ' + (data.error || 'Unknown error');
        }
      } catch {
        purgeResultEl.textContent = 'Failed to purge tasks.';
      } finally {
        purgeConfirmBtn.disabled = false;
        purgeConfirmBtn.textContent = 'Purge';
      }
    });

    // Version info
    const versionModal = document.getElementById('version-info-modal');
    const versionCloseBtn = document.getElementById('version-info-close');
    const versionTextEl = document.getElementById('version-info-text');

    document.getElementById('burger-version-info').addEventListener('click', async () => {
      burgerDropdown.classList.remove('open');
      versionTextEl.textContent = 'Loading...';
      versionModal.classList.add('show');
      try {
        const res = await fetch('/api/version');
        const data = await res.json();
        versionTextEl.textContent = 'agkan v' + data.version;
      } catch {
        versionTextEl.textContent = 'Failed to load version.';
      }
    });

    versionCloseBtn.addEventListener('click', () => {
      versionModal.classList.remove('show');
    });`;

function renderColumn(status: TaskStatus, tasks: Task[], tagMap: Map<number, Tag[]>): string {
  const color = STATUS_COLORS[status];
  const label = STATUS_LABELS[status];
  const cards = tasks.map((t) => renderCard(t, tagMap.get(t.id) || [])).join('');

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

const BOARD_BODY_STATIC = `
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
      <input type="hidden" id="add-status">
      <div class="modal-actions">
        <button id="add-cancel">Cancel</button>
        <button id="add-submit" class="primary">Add</button>
      </div>
    </div>
  </div>
  <div class="context-menu" id="context-menu">
    <div class="context-menu-item danger" id="ctx-delete">Delete task</div>
  </div>
  <div class="toast" id="toast">Failed to update task</div>
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
  <div class="modal-overlay" id="version-info-modal">
    <div class="modal" style="width:320px;">
      <h2>Version Info</h2>
      <p id="version-info-text" style="font-size:14px;color:#1e293b;margin-bottom:16px;"></p>
      <div class="modal-actions">
        <button id="version-info-close">Close</button>
      </div>
    </div>
  </div>
  <script>${BOARD_SCRIPT}
  </script>`;

function renderBoard(tasksByStatus: Map<TaskStatus, Task[]>, tagMap: Map<number, Tag[]>, boardTitle?: string): string {
  const columns = STATUSES.map((status) => renderColumn(status, tasksByStatus.get(status) || [], tagMap)).join('');
  const titleHtml = boardTitle ? `<span class="board-title">${escapeHtml(boardTitle)}</span>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>agkan board</title>
  <style>${BOARD_STYLES}
  </style>
</head>
<body>
  <header><h1>agkan board</h1>${titleHtml}<div class="burger-menu-wrapper"><button class="burger-menu-btn" id="burger-menu-btn" title="Menu" aria-label="Menu"><span></span><span></span><span></span></button><div class="burger-menu-dropdown" id="burger-menu-dropdown"><div class="burger-menu-item danger" id="burger-purge-tasks">&#128465; Purge Tasks</div><div class="burger-menu-item" id="burger-version-info">&#8505; Version Info</div></div></div></header>
  <div class="filter-bar" id="filter-bar">
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
    <button class="filter-clear-btn" id="filter-clear">Clear filters</button>
  </div>
  <div class="board-container">
    <div class="board">${columns}</div>${BOARD_BODY_STATIC}
  </div>
</body>
</html>`;
}

function sortByPriority(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const oa = a.priority ? PRIORITY_ORDER[a.priority] : 4;
    const ob = b.priority ? PRIORITY_ORDER[b.priority] : 4;
    return oa - ob;
  });
}

type TaskPatchBody = {
  title?: string;
  body?: string | null;
  status?: TaskStatus;
  priority?: string | null;
};

type TaskUpdateInput = { title?: string; body?: string; status?: TaskStatus; priority?: Priority | null };

function buildTaskUpdateInput(body: TaskPatchBody): { input: TaskUpdateInput; error?: string } {
  const input: TaskUpdateInput = {};

  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) {
      return { input, error: 'Invalid status' };
    }
    input.status = body.status;
  }

  if (body.title !== undefined) {
    if (!body.title.trim()) {
      return { input, error: 'Title cannot be empty' };
    }
    input.title = body.title.trim();
  }

  if (body.body !== undefined) {
    input.body = body.body ?? '';
  }

  if (body.priority !== undefined) {
    input.priority = body.priority && isPriority(body.priority) ? body.priority : null;
  }

  return { input };
}

type BoardServices = {
  ts: TaskService;
  tts: TaskTagService;
  tags: TagService;
  ms: MetadataService;
  cs: CommentService;
  tbs: TaskBlockService;
  database: StorageProvider;
  boardTitle?: string;
  configDir: string;
};

function buildTasksByStatus(tasks: Task[]): Map<TaskStatus, Task[]> {
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

function getBoardUpdatedAt(database: StorageProvider): string | null {
  const baseRow = database
    .prepare(
      `
    SELECT MAX(updated_at) as max_updated_at FROM (
      SELECT updated_at FROM tasks UNION ALL SELECT updated_at FROM task_metadata
    )
  `
    )
    .get() as { max_updated_at: string | null };
  const tagsRow = database
    .prepare(
      `
    SELECT MAX(created_at) as max_created_at, COUNT(*) as count FROM task_tags
  `
    )
    .get() as { max_created_at: string | null; count: number };
  if (baseRow.max_updated_at === null && tagsRow.max_created_at === null) return null;
  return `${baseRow.max_updated_at}|${tagsRow.max_created_at}|${tagsRow.count}`;
}

function registerTaskApiRoutes(app: Hono, { ts, tts, tags, ms, cs, tbs }: BoardServices): void {
  app.get('/api/tasks', (c) => c.json({ tasks: ts.listTasks({}, 'id', 'asc') }));
  app.post('/api/tasks', async (c) => {
    const body = await c.req.json<{
      title: string;
      body?: string | null;
      status?: TaskStatus;
      priority?: string | null;
    }>();
    if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
      return c.json({ error: 'Title is required' }, 400);
    }
    const status = body.status && STATUSES.includes(body.status) ? body.status : 'backlog';
    const priority = body.priority && isPriority(body.priority) ? body.priority : undefined;
    return c.json(ts.createTask({ title: body.title.trim(), body: body.body || undefined, status, priority }), 201);
  });
  app.get('/api/tasks/:id', (c) => {
    const id = Number(c.req.param('id'));
    if (isNaN(id)) return c.json({ error: 'Invalid task id' }, 400);
    const task = ts.getTask(id);
    if (!task) return c.json({ error: 'Task not found' }, 404);
    const parent = task.parent_id ? ts.getTask(task.parent_id) : null;
    const blockedByIds = tbs.getBlockerTaskIds(id);
    const blockingIds = tbs.getBlockedTaskIds(id);
    const blockedBy = blockedByIds.map((bid) => ts.getTask(bid)).filter(Boolean);
    const blocking = blockingIds.map((bid) => ts.getTask(bid)).filter(Boolean);
    return c.json({ task, tags: tts.getTagsForTask(id), metadata: ms.listMetadata(id), parent, blockedBy, blocking });
  });
  app.patch('/api/tasks/:id', async (c) => {
    const id = Number(c.req.param('id'));
    if (isNaN(id)) return c.json({ error: 'Invalid task id' }, 400);
    const { input, error } = buildTaskUpdateInput(await c.req.json<TaskPatchBody>());
    if (error) return c.json({ error }, 400);
    const task = ts.updateTask(id, input);
    if (!task) return c.json({ error: 'Task not found' }, 404);
    return c.json(task);
  });
  app.delete('/api/tasks/:id', (c) => {
    const id = Number(c.req.param('id'));
    if (isNaN(id)) return c.json({ error: 'Invalid task id' }, 400);
    if (!ts.getTask(id)) return c.json({ error: 'Task not found' }, 404);
    ts.deleteTask(id);
    return c.json({ success: true });
  });
  app.get('/api/tags', (c) => c.json({ tags: tags.listTags() }));
  app.post('/api/tasks/:id/tags', async (c) => {
    const id = Number(c.req.param('id'));
    if (isNaN(id)) return c.json({ error: 'Invalid task id' }, 400);
    const body = await c.req.json<{ tagId?: unknown }>();
    if (body.tagId === undefined || body.tagId === null) return c.json({ error: 'tagId is required' }, 400);
    const tagId = Number(body.tagId);
    if (!ts.getTask(id)) return c.json({ error: 'Task not found' }, 404);
    if (!tags.getTag(tagId)) return c.json({ error: 'Tag not found' }, 404);
    tts.addTagToTask({ task_id: id, tag_id: tagId });
    return c.json({ success: true }, 201);
  });
  app.delete('/api/tasks/:id/tags/:tagId', (c) => {
    const id = Number(c.req.param('id'));
    if (isNaN(id)) return c.json({ error: 'Invalid task id' }, 400);
    const tagId = Number(c.req.param('tagId'));
    if (isNaN(tagId)) return c.json({ error: 'Invalid tag id' }, 400);
    const removed = tts.removeTagFromTask(id, tagId);
    if (!removed) return c.json({ error: 'Tag not attached to task' }, 404);
    return c.json({ success: true });
  });
  app.get('/api/tasks/:id/comments', (c) => {
    const id = Number(c.req.param('id'));
    if (isNaN(id)) return c.json({ error: 'Invalid task id' }, 400);
    if (!ts.getTask(id)) return c.json({ error: 'Task not found' }, 404);
    return c.json({ comments: cs.listComments(id) });
  });
  app.post('/api/tasks/:id/comments', async (c) => {
    const id = Number(c.req.param('id'));
    if (isNaN(id)) return c.json({ error: 'Invalid task id' }, 400);
    if (!ts.getTask(id)) return c.json({ error: 'Task not found' }, 404);
    const body = await c.req.json<{ content?: string; author?: string }>();
    if (!body.content || typeof body.content !== 'string') {
      return c.json({ error: 'Content is required' }, 400);
    }
    try {
      const comment = cs.addComment({ task_id: id, content: body.content, author: body.author });
      return c.json(comment, 201);
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : 'Invalid input' }, 400);
    }
  });
  app.delete('/api/comments/:id', (c) => {
    const id = Number(c.req.param('id'));
    if (isNaN(id)) return c.json({ error: 'Invalid comment id' }, 400);
    const deleted = cs.deleteComment(id);
    if (!deleted) return c.json({ error: 'Comment not found' }, 404);
    return c.json({ success: true });
  });
  app.patch('/api/comments/:id', async (c) => {
    const id = Number(c.req.param('id'));
    if (isNaN(id)) return c.json({ error: 'Invalid comment id' }, 400);
    const body = await c.req.json<{ content?: string }>();
    if (!body.content || typeof body.content !== 'string') {
      return c.json({ error: 'Content is required' }, 400);
    }
    try {
      const comment = cs.updateComment(id, body.content);
      if (!comment) return c.json({ error: 'Comment not found' }, 404);
      return c.json(comment);
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : 'Invalid input' }, 400);
    }
  });

  app.post('/api/tasks/purge', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { beforeDate?: string };
    let beforeDate: string;
    if (body.beforeDate !== undefined) {
      const parsed = new Date(body.beforeDate);
      if (isNaN(parsed.getTime())) {
        return c.json({ error: 'Invalid beforeDate. Use ISO 8601 format.' }, 400);
      }
      beforeDate = parsed.toISOString();
    } else {
      const d = new Date();
      d.setDate(d.getDate() - 3);
      beforeDate = d.toISOString();
    }
    const tasks = ts.purgeTasksBefore(beforeDate, ['done', 'closed'], false);
    return c.json({
      count: tasks.length,
      tasks: tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, updated_at: t.updated_at })),
    });
  });

  app.get('/api/version', (c) => c.json({ version: APP_VERSION }));
}

function buildBoardCardsPayload(
  tasksByStatus: Map<TaskStatus, Task[]>,
  tagMap: Map<number, Tag[]>
): { status: TaskStatus; html: string; count: number }[] {
  return STATUSES.map((status) => {
    const tasks = tasksByStatus.get(status) || [];
    const html = tasks.map((t) => renderCard(t, tagMap.get(t.id) || [])).join('');
    return { status, html, count: tasks.length };
  });
}

type BoardCardFilters = { tagIds?: number[]; priority?: string[]; assignees?: string };

function parseBoardCardFilters(query: { tags?: string; priority?: string; assignee?: string }): BoardCardFilters {
  const filters: BoardCardFilters = {};
  if (query.tags) {
    const tagIds = query.tags
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => !isNaN(n) && n > 0);
    if (tagIds.length > 0) filters.tagIds = tagIds;
  }
  if (query.priority) {
    const priorities = query.priority
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (priorities.length > 0) filters.priority = priorities;
  }
  if (query.assignee && query.assignee.trim()) {
    filters.assignees = query.assignee.trim();
  }
  return filters;
}

function registerConfigApiRoutes(app: Hono, configDir: string): void {
  app.get('/api/config', (c) => {
    const boardConfig = readBoardConfig(configDir);
    return c.json({ board: boardConfig });
  });

  app.put('/api/config', async (c) => {
    const body = await c.req.json<{ board?: { detailPaneWidth?: unknown } }>();
    const boardBody = body?.board ?? {};

    if (boardBody.detailPaneWidth !== undefined) {
      const width = boardBody.detailPaneWidth;
      if (typeof width !== 'number' || !Number.isFinite(width)) {
        return c.json({ error: 'detailPaneWidth must be a number' }, 400);
      }
      if (width > DETAIL_PANE_MAX_WIDTH) {
        return c.json({ error: `detailPaneWidth must not exceed ${DETAIL_PANE_MAX_WIDTH}` }, 400);
      }
      writeBoardConfig(configDir, { detailPaneWidth: width });
    }

    return c.json({ success: true });
  });
}

function registerBoardRoutes(app: Hono, services: BoardServices): void {
  const { ts, tts, database, boardTitle, configDir } = services;
  app.get('/', (c) => {
    const tasksByStatus = buildTasksByStatus(ts.listTasks({}, 'id', 'asc'));
    return c.html(renderBoard(tasksByStatus, tts.getAllTaskTags(), boardTitle));
  });
  app.get('/api/board/updated-at', (c) => c.json({ updatedAt: getBoardUpdatedAt(database) }));
  app.get('/api/board/cards', (c) => {
    const filters = parseBoardCardFilters({
      tags: c.req.query('tags'),
      priority: c.req.query('priority'),
      assignee: c.req.query('assignee'),
    });
    const tasksByStatus = buildTasksByStatus(ts.listTasks(filters, 'id', 'asc'));
    const columns = buildBoardCardsPayload(tasksByStatus, tts.getAllTaskTags());
    return c.json({ columns });
  });
  registerTaskApiRoutes(app, services);
  registerConfigApiRoutes(app, configDir);
}

export function createBoardApp(
  taskService?: TaskService,
  taskTagService?: TaskTagService,
  metadataService?: MetadataService,
  db?: StorageProvider,
  boardTitle?: string,
  tagService?: TagService,
  configDir?: string,
  commentService?: CommentService,
  taskBlockService?: TaskBlockService
): Hono {
  const app = new Hono();
  const resolvedConfigDir = configDir ?? path.join(process.cwd(), getDefaultDirName());
  const resolvedDb = db ?? getDatabase();
  const services: BoardServices = {
    ts: taskService ?? new TaskService(),
    tts: taskTagService ?? new TaskTagService(),
    tags: tagService ?? new TagService(),
    ms: metadataService ?? new MetadataService(),
    cs: commentService ?? new CommentService(resolvedDb),
    tbs: taskBlockService ?? new TaskBlockService(resolvedDb),
    database: resolvedDb,
    boardTitle,
    configDir: resolvedConfigDir,
  };
  registerBoardRoutes(app, services);
  return app;
}

export function startBoardServer(port: number, boardTitle?: string): void {
  const app = createBoardApp(undefined, undefined, undefined, undefined, boardTitle);

  serve({ fetch: app.fetch, port }, () => {
    console.log(`Board running at http://localhost:${port}`);
  });
}
