import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { TaskService } from '../services/TaskService';
import { TaskTagService } from '../services/TaskTagService';
import { MetadataService } from '../services/MetadataService';
import { Task, TaskStatus, PRIORITIES, PRIORITY_ORDER, isPriority } from '../models';
import { TaskMetadata } from '../models/TaskMetadata';
import { Tag } from '../models/Tag';

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

function renderCard(task: Task, tags: Tag[], metadata: TaskMetadata[]): string {
  const priority = metadata.find((m) => m.key === 'priority')?.value;
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

function renderBoard(
  tasksByStatus: Map<TaskStatus, Task[]>,
  tagMap: Map<number, Tag[]>,
  metaMap: Map<number, TaskMetadata[]>
): string {
  const columns = STATUSES.map((status) => {
    const tasks = tasksByStatus.get(status) || [];
    const color = STATUS_COLORS[status];
    const label = STATUS_LABELS[status];
    const cards = tasks.map((t) => renderCard(t, tagMap.get(t.id) || [], metaMap.get(t.id) || [])).join('');

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
      if (e.key === 'Enter') { e.preventDefault(); document.getElementById('add-submit').click(); }
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
  </script>
</body>
</html>`;
}

function sortByPriority(tasks: Task[], metaMap: Map<number, TaskMetadata[]>): Task[] {
  return [...tasks].sort((a, b) => {
    const pa = metaMap.get(a.id)?.find((m) => m.key === 'priority')?.value;
    const pb = metaMap.get(b.id)?.find((m) => m.key === 'priority')?.value;
    const oa = pa && isPriority(pa) ? PRIORITY_ORDER[pa] : 4;
    const ob = pb && isPriority(pb) ? PRIORITY_ORDER[pb] : 4;
    return oa - ob;
  });
}

export function createBoardApp(
  taskService?: TaskService,
  taskTagService?: TaskTagService,
  metadataService?: MetadataService
): Hono {
  const app = new Hono();
  const ts = taskService ?? new TaskService();
  const tts = taskTagService ?? new TaskTagService();
  const ms = metadataService ?? new MetadataService();

  app.get('/', (c) => {
    const tasks = ts.listTasks({}, 'id', 'asc');
    const tagMap = tts.getAllTaskTags();
    const metaMap = ms.getAllTasksMetadata();

    const tasksByStatus = new Map<TaskStatus, Task[]>();
    for (const status of STATUSES) {
      tasksByStatus.set(status, []);
    }
    for (const task of tasks) {
      tasksByStatus.get(task.status)?.push(task);
    }

    for (const [status, statusTasks] of tasksByStatus) {
      tasksByStatus.set(status, sortByPriority(statusTasks, metaMap));
    }

    return c.html(renderBoard(tasksByStatus, tagMap, metaMap));
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
    const task = ts.createTask({ title: body.title.trim(), body: body.body || undefined, status });
    if (body.priority && isPriority(body.priority)) {
      ms.setMetadata({ task_id: task.id, key: 'priority', value: body.priority });
    }
    return c.json(task, 201);
  });

  app.patch('/api/tasks/:id', async (c) => {
    const id = Number(c.req.param('id'));
    if (isNaN(id)) {
      return c.json({ error: 'Invalid task id' }, 400);
    }
    const body = await c.req.json<{ status: TaskStatus }>();
    if (!STATUSES.includes(body.status)) {
      return c.json({ error: 'Invalid status' }, 400);
    }
    const task = ts.updateTask(id, { status: body.status });
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
