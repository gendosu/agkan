import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { TaskService } from '../services/TaskService';
import { TaskTagService } from '../services/TaskTagService';
import { MetadataService } from '../services/MetadataService';
import { Task, TaskStatus, PRIORITIES, PRIORITY_ORDER, isPriority, Priority } from '../models';
import { Tag } from '../models/Tag';
import { getDatabase } from '../db/connection';
import { StorageProvider } from '../db/types/storage';

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

function renderBoard(tasksByStatus: Map<TaskStatus, Task[]>, tagMap: Map<number, Tag[]>): string {
  const columns = STATUSES.map((status) => {
    const tasks = tasksByStatus.get(status) || [];
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
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>agkan board</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f1f5f9; color: #1e293b; }
    header { background: #1e293b; color: white; padding: 12px 20px; }
    header h1 { font-size: 18px; font-weight: 700; }
    .board { display: flex; gap: 12px; padding: 16px; overflow-x: auto; min-height: calc(100vh - 48px); align-items: flex-start; }
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
    .modal { background: white; border-radius: 8px; padding: 20px; width: 360px; box-shadow: 0 8px 24px rgba(0,0,0,0.2); }
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
    .detail-panel { position: fixed; top: 0; right: 0; width: 400px; height: 100vh; background: white; box-shadow: -4px 0 16px rgba(0,0,0,0.1); z-index: 1500; transform: translateX(100%); transition: transform 0.25s ease; display: flex; flex-direction: column; min-width: 280px; max-width: 800px; }
    .detail-panel-resize-handle { position: absolute; top: 0; left: 0; width: 6px; height: 100%; cursor: col-resize; z-index: 10; background: transparent; }
    .detail-panel-resize-handle:hover, .detail-panel-resize-handle.dragging { background: rgba(59,130,246,0.3); }
    .detail-panel.open { transform: translateX(0); }
    .detail-panel-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid #e2e8f0; }
    .detail-panel-header h2 { font-size: 16px; font-weight: 700; color: #1e293b; margin: 0; }
    .detail-panel-close { background: none; border: none; font-size: 20px; color: #64748b; cursor: pointer; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 4px; }
    .detail-panel-close:hover { background: #f1f5f9; color: #1e293b; }
    .detail-panel-body { flex: 1; overflow-y: auto; padding: 20px; }
    .detail-field { margin-bottom: 16px; }
    .detail-field-label { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #94a3b8; margin-bottom: 4px; letter-spacing: 0.05em; }
    .detail-field-value { font-size: 13px; color: #1e293b; line-height: 1.5; }
    .detail-field-value.empty { color: #94a3b8; font-style: italic; }
    .detail-status-badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; color: white; }
    .detail-tags { display: flex; flex-wrap: wrap; gap: 4px; }
    .detail-meta-table { width: 100%; border-collapse: collapse; }
    .detail-meta-table td { padding: 4px 0; font-size: 12px; }
    .detail-meta-table td:first-child { color: #64748b; width: 100px; }
    .detail-meta-table td:last-child { color: #1e293b; }
    .detail-panel-footer { padding: 12px 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; }
    .detail-panel-footer button { padding: 7px 18px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid #3b82f6; background: #3b82f6; color: white; }
    .detail-panel-footer button:hover { background: #2563eb; border-color: #2563eb; }
    .detail-edit-input { width: 100%; border: 1px solid #e2e8f0; border-radius: 6px; padding: 7px 10px; font-size: 13px; font-family: inherit; background: white; color: #1e293b; }
    .detail-edit-input:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.2); }
    .detail-edit-textarea { width: 100%; border: 1px solid #e2e8f0; border-radius: 6px; padding: 7px 10px; font-size: 13px; font-family: inherit; resize: vertical; min-height: 80px; background: white; color: #1e293b; }
    .detail-edit-textarea:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.2); }
    .detail-edit-select { width: 100%; border: 1px solid #e2e8f0; border-radius: 6px; padding: 7px 10px; font-size: 13px; font-family: inherit; background: white; color: #1e293b; }
    .detail-edit-select:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.2); }
  </style>
</head>
<body>
  <header><h1>agkan board</h1></header>
  <div class="board">${columns}</div>
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
        ${PRIORITIES.map((p) => `<option value="${p}">${p.charAt(0).toUpperCase() + p.slice(1)}</option>`).join('\n        ')}
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
  <div class="detail-panel" id="detail-panel">
    <div class="detail-panel-resize-handle" id="detail-panel-resize-handle"></div>
    <div class="detail-panel-header">
      <h2 id="detail-panel-title">Task Detail</h2>
      <button class="detail-panel-close" id="detail-panel-close" title="Close">&times;</button>
    </div>
    <div class="detail-panel-body" id="detail-panel-body"></div>
    <div class="detail-panel-footer">
      <button id="detail-save-btn">Save</button>
    </div>
  </div>
  <div class="toast" id="toast">Failed to update task</div>
  <script>
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

    // Detail panel
    const detailPanel = document.getElementById('detail-panel');
    const detailPanelTitle = document.getElementById('detail-panel-title');
    const detailPanelBody = document.getElementById('detail-panel-body');
    let detailTaskId = null;

    function closeDetailPanel() {
      detailPanel.classList.remove('open');
      detailTaskId = null;
    }

    document.getElementById('detail-panel-close').addEventListener('click', closeDetailPanel);

    // Detail panel resize
    const resizeHandle = document.getElementById('detail-panel-resize-handle');
    const PANEL_MIN_WIDTH = 280;
    const PANEL_MAX_WIDTH = 800;
    const PANEL_WIDTH_KEY = 'detailPanelWidth';

    (function initPanelWidth() {
      const saved = localStorage.getItem(PANEL_WIDTH_KEY);
      if (saved) {
        const w = parseInt(saved, 10);
        if (w >= PANEL_MIN_WIDTH && w <= PANEL_MAX_WIDTH) {
          detailPanel.style.width = w + 'px';
        }
      }
    })();

    resizeHandle.addEventListener('mousedown', function(e) {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = detailPanel.offsetWidth;
      resizeHandle.classList.add('dragging');
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';

      function onMouseMove(e) {
        const delta = startX - e.clientX;
        const newWidth = Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, startWidth + delta));
        detailPanel.style.width = newWidth + 'px';
      }

      function onMouseUp() {
        resizeHandle.classList.remove('dragging');
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        localStorage.setItem(PANEL_WIDTH_KEY, detailPanel.offsetWidth);
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

    function renderDetailPanel(data) {
      const task = data.task;
      const tags = data.tags || [];
      const metadata = data.metadata || [];

      detailTaskId = task.id;
      detailPanelTitle.textContent = '#' + task.id + ' ' + task.title;

      let html = '';

      // Title (editable)
      html += '<div class="detail-field">';
      html += '<div class="detail-field-label">Title</div>';
      html += '<input id="detail-edit-title" class="detail-edit-input" type="text" value="' + escapeHtmlClient(task.title) + '">';
      html += '</div>';

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

      // Body (editable)
      html += '<div class="detail-field">';
      html += '<div class="detail-field-label">Description</div>';
      html += '<textarea id="detail-edit-body" class="detail-edit-textarea">' + escapeHtmlClient(task.body || '') + '</textarea>';
      html += '</div>';

      // Tags (read-only)
      if (tags.length > 0) {
        html += '<div class="detail-field">';
        html += '<div class="detail-field-label">Tags</div>';
        html += '<div class="detail-field-value detail-tags">';
        tags.forEach(t => { html += '<span class="tag">' + escapeHtmlClient(t.name) + '</span>'; });
        html += '</div></div>';
      }

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

      // Timestamps (read-only)
      html += '<div class="detail-field">';
      html += '<div class="detail-field-label">Created</div>';
      html += '<div class="detail-field-value">' + escapeHtmlClient(task.created_at) + '</div>';
      html += '</div>';
      html += '<div class="detail-field">';
      html += '<div class="detail-field-label">Updated</div>';
      html += '<div class="detail-field-value">' + escapeHtmlClient(task.updated_at) + '</div>';
      html += '</div>';

      detailPanelBody.innerHTML = html;
    }

    function escapeHtmlClient(str) {
      if (!str) return '';
      const div = document.createElement('div');
      div.textContent = String(str);
      return div.innerHTML;
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
        location.reload();
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
          detailPanel.classList.add('open');
        } catch {
          showToast('Failed to load task details');
        }
      });
    });

    // Board polling: reload when updated_at changes (skip during drag or detail panel open)
    let lastUpdatedAt = null;
    async function pollBoardUpdates() {
      if (draggedCard !== null) return;
      if (detailPanel.classList.contains('open')) return;
      try {
        const res = await fetch('/api/board/updated-at');
        if (!res.ok) return;
        const data = await res.json();
        const ts = data.updatedAt;
        if (lastUpdatedAt === null) {
          lastUpdatedAt = ts;
        } else if (ts !== lastUpdatedAt) {
          location.reload();
        }
      } catch {
        // Ignore network errors during polling
      }
    }
    setInterval(pollBoardUpdates, 10000);
    pollBoardUpdates();
  </script>
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

export function createBoardApp(
  taskService?: TaskService,
  taskTagService?: TaskTagService,
  metadataService?: MetadataService,
  db?: StorageProvider
): Hono {
  const app = new Hono();
  const ts = taskService ?? new TaskService();
  const tts = taskTagService ?? new TaskTagService();
  const ms = metadataService ?? new MetadataService();
  const database = db ?? getDatabase();

  app.get('/', (c) => {
    const tasks = ts.listTasks({}, 'id', 'asc');
    const tagMap = tts.getAllTaskTags();

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

    return c.html(renderBoard(tasksByStatus, tagMap));
  });

  app.get('/api/board/updated-at', (c) => {
    const stmtBase = database.prepare(`
      SELECT MAX(updated_at) as max_updated_at FROM (
        SELECT updated_at FROM tasks
        UNION ALL
        SELECT updated_at FROM task_metadata
      )
    `);
    const baseRow = stmtBase.get() as { max_updated_at: string | null };

    const stmtTags = database.prepare(`
      SELECT MAX(created_at) as max_created_at, COUNT(*) as count FROM task_tags
    `);
    const tagsRow = stmtTags.get() as { max_created_at: string | null; count: number };

    const fingerprint = `${baseRow.max_updated_at}|${tagsRow.max_created_at}|${tagsRow.count}`;
    const updatedAt = baseRow.max_updated_at === null && tagsRow.max_created_at === null ? null : fingerprint;

    return c.json({ updatedAt });
  });

  app.get('/api/tasks', (c) => {
    const tasks = ts.listTasks({}, 'id', 'asc');
    return c.json({ tasks });
  });

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
    const task = ts.createTask({ title: body.title.trim(), body: body.body || undefined, status, priority });
    return c.json(task, 201);
  });

  app.get('/api/tasks/:id', (c) => {
    const id = Number(c.req.param('id'));
    if (isNaN(id)) {
      return c.json({ error: 'Invalid task id' }, 400);
    }
    const task = ts.getTask(id);
    if (!task) {
      return c.json({ error: 'Task not found' }, 404);
    }
    const tags = tts.getTagsForTask(id);
    const metadata = ms.listMetadata(id);
    return c.json({ task, tags, metadata });
  });

  app.patch('/api/tasks/:id', async (c) => {
    const id = Number(c.req.param('id'));
    if (isNaN(id)) {
      return c.json({ error: 'Invalid task id' }, 400);
    }
    const body = await c.req.json<TaskPatchBody>();
    const { input, error } = buildTaskUpdateInput(body);
    if (error) {
      return c.json({ error }, 400);
    }
    const task = ts.updateTask(id, input);
    if (!task) {
      return c.json({ error: 'Task not found' }, 404);
    }
    return c.json(task);
  });

  app.delete('/api/tasks/:id', (c) => {
    const id = Number(c.req.param('id'));
    if (isNaN(id)) {
      return c.json({ error: 'Invalid task id' }, 400);
    }
    const task = ts.getTask(id);
    if (!task) {
      return c.json({ error: 'Task not found' }, 404);
    }
    ts.deleteTask(id);
    return c.json({ success: true });
  });

  return app;
}

export function startBoardServer(port: number): void {
  const app = createBoardApp();

  serve({ fetch: app.fetch, port }, () => {
    console.log(`Board running at http://localhost:${port}`);
  });
}
