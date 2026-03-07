import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { TaskService } from '../services/TaskService';
import { TaskTagService } from '../services/TaskTagService';
import { MetadataService } from '../services/MetadataService';
import { Task, TaskStatus } from '../models';
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
          <span class="column-count">${tasks.length}</span>
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
    .column-count { background: #e2e8f0; color: #64748b; border-radius: 10px; font-size: 11px; font-weight: 600; padding: 2px 7px; }
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
    .priority-high { background: #fee2e2; color: #dc2626; }
    .priority-medium { background: #fef9c3; color: #ca8a04; }
    .priority-low { background: #dcfce7; color: #16a34a; }
    .toast { position: fixed; bottom: 20px; right: 20px; background: #ef4444; color: white; padding: 10px 16px; border-radius: 6px; font-size: 13px; opacity: 0; transition: opacity 0.3s; pointer-events: none; }
    .toast.show { opacity: 1; }
  </style>
</head>
<body>
  <header><h1>agkan board</h1></header>
  <div class="board">${columns}</div>
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

    function showToast() {
      const toast = document.getElementById('toast');
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 3000);
    }
  </script>
</body>
</html>`;
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

    return c.html(renderBoard(tasksByStatus, tagMap, metaMap));
  });

  app.get('/api/tasks', (c) => {
    const tasks = ts.listTasks({}, 'id', 'asc');
    return c.json({ tasks });
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

  return app;
}

export function startBoardServer(port: number): void {
  const app = createBoardApp();

  serve({ fetch: app.fetch, port }, () => {
    console.log(`Board running at http://localhost:${port}`);
  });
}
