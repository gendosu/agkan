import { Hono } from 'hono';
import { TaskService } from '../../services/TaskService';
import { TaskTagService } from '../../services/TaskTagService';
import { TagService } from '../../services/TagService';
import { MetadataService } from '../../services/MetadataService';
import { TaskBlockService } from '../../services/TaskBlockService';
import { TaskStatus, isPriority, Priority } from '../../models';
import { STATUSES } from '../boardRenderer';
import { persistTaskModelOverrides, persistTaskEffortOverrides } from '../taskModelOverride';

type BoardTaskStatus = TaskStatus;

type TaskPatchBody = {
  title?: string;
  body?: string | null;
  status?: BoardTaskStatus;
  priority?: string | null;
  branch?: string | null;
  models?: unknown;
  efforts?: unknown;
};

type TaskUpdateInput = {
  title?: string;
  body?: string;
  status?: BoardTaskStatus;
  priority?: Priority | null;
  branch?: string | null;
};

type CreateTaskBody = {
  title: string;
  body?: string | null;
  status?: BoardTaskStatus;
  priority?: string | null;
  branch?: string | null;
  tags?: unknown;
  metadata?: unknown;
  models?: unknown;
  efforts?: unknown;
};

function applyStatusUpdate(input: TaskUpdateInput, status: BoardTaskStatus): string | undefined {
  if (!STATUSES.includes(status)) return 'Invalid status';
  input.status = status;
  return undefined;
}

function applyTitleUpdate(input: TaskUpdateInput, title: string): string | undefined {
  const trimmed = title.trim();
  if (!trimmed) return 'Title cannot be empty';
  input.title = trimmed;
  return undefined;
}

function applyOptionalUpdates(input: TaskUpdateInput, body: TaskPatchBody): void {
  if (body.body !== undefined) input.body = body.body ?? '';
  if (body.priority !== undefined) {
    input.priority = body.priority && isPriority(body.priority) ? body.priority : null;
  }
  if (body.branch !== undefined) input.branch = body.branch ?? null;
}

function buildTaskUpdateInput(body: TaskPatchBody): { input: TaskUpdateInput; error?: string } {
  const input: TaskUpdateInput = {};
  if (body.status !== undefined) {
    const error = applyStatusUpdate(input, body.status);
    if (error) return { input, error };
  }
  if (body.title !== undefined) {
    const error = applyTitleUpdate(input, body.title);
    if (error) return { input, error };
  }
  applyOptionalUpdates(input, body);
  return { input };
}

function resolveTagIds(rawTags: unknown, tags: TagService): number[] | undefined {
  if (!Array.isArray(rawTags)) return undefined;
  const ids = rawTags.map(Number).filter((n) => !isNaN(n) && tags.getTag(n));
  return ids.length > 0 ? ids : undefined;
}

function persistTaskMetadata(taskId: number, rawMetadata: unknown, ms: MetadataService): void {
  if (!Array.isArray(rawMetadata)) return;
  for (const entry of rawMetadata) {
    if (!entry || typeof entry !== 'object') continue;
    const key = (entry as { key: unknown }).key;
    if (typeof key !== 'string' || !key.trim()) continue;
    const value = (entry as { value: unknown }).value;
    ms.setMetadata({ task_id: taskId, key: key.trim(), value: String(value ?? '') });
  }
}

function registerCreateTaskRoute(app: Hono, ts: TaskService, ms: MetadataService, tags: TagService): void {
  app.post('/api/tasks', async (c) => {
    const body = await c.req.json<CreateTaskBody>();
    if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
      return c.json({ error: 'Title is required' }, 400);
    }
    const status = body.status && STATUSES.includes(body.status) ? body.status : 'backlog';
    const priority = body.priority && isPriority(body.priority) ? body.priority : undefined;
    const tagIds = resolveTagIds(body.tags, tags);

    const task = ts.createTask({
      title: body.title.trim(),
      body: body.body || undefined,
      status,
      priority,
      branch: body.branch ?? undefined,
      tagIds,
    });
    persistTaskMetadata(task.id, body.metadata, ms);
    persistTaskModelOverrides(task.id, body.models, ms);
    persistTaskEffortOverrides(task.id, body.efforts, ms);
    return c.json(task, 201);
  });
}

function registerListTaskRoute(app: Hono, ts: TaskService): void {
  app.get('/api/tasks', (c) => {
    const includeAll = c.req.query('all') === 'true' || c.req.query('all') === '1';
    const opts = includeAll ? { includeArchived: true } : {};
    return c.json({ tasks: ts.listTasks(opts, 'id', 'asc') });
  });
}

function registerGetTaskRoute(
  app: Hono,
  ts: TaskService,
  tts: TaskTagService,
  tbs: TaskBlockService,
  ms: MetadataService
): void {
  app.get('/api/tasks/:id', (c) => {
    const id = Number(c.req.param('id'));
    if (isNaN(id)) return c.json({ error: 'Invalid task id' }, 400);
    const task = ts.getTask(id);
    if (!task) return c.json({ error: 'Task not found' }, 404);
    const parent = task.parent_id ? ts.getTask(task.parent_id) : null;
    const blockedBy = tbs
      .getBlockerTaskIds(id)
      .map((bid) => ts.getTask(bid))
      .filter(Boolean);
    const blocking = tbs
      .getBlockedTaskIds(id)
      .map((bid) => ts.getTask(bid))
      .filter(Boolean);
    return c.json({ task, tags: tts.getTagsForTask(id), metadata: ms.listMetadata(id), parent, blockedBy, blocking });
  });
}

function registerPatchAndDeleteTaskRoutes(app: Hono, ts: TaskService, ms: MetadataService): void {
  app.patch('/api/tasks/:id', async (c) => {
    const id = Number(c.req.param('id'));
    if (isNaN(id)) return c.json({ error: 'Invalid task id' }, 400);
    const body = await c.req.json<TaskPatchBody>();
    const { input, error } = buildTaskUpdateInput(body);
    if (error) return c.json({ error }, 400);
    const task = ts.updateTask(id, input);
    if (!task) return c.json({ error: 'Task not found' }, 404);
    if (body.models !== undefined) persistTaskModelOverrides(id, body.models, ms);
    if (body.efforts !== undefined) persistTaskEffortOverrides(id, body.efforts, ms);
    return c.json(task);
  });
  app.delete('/api/tasks/:id', (c) => {
    const id = Number(c.req.param('id'));
    if (isNaN(id)) return c.json({ error: 'Invalid task id' }, 400);
    if (!ts.getTask(id)) return c.json({ error: 'Task not found' }, 404);
    ts.deleteTask(id);
    return c.json({ success: true });
  });
}

export function registerTaskCrudRoutes(
  app: Hono,
  ts: TaskService,
  tts: TaskTagService,
  tbs: TaskBlockService,
  ms: MetadataService,
  tags: TagService
): void {
  registerListTaskRoute(app, ts);
  registerCreateTaskRoute(app, ts, ms, tags);
  registerGetTaskRoute(app, ts, tts, tbs, ms);
  registerPatchAndDeleteTaskRoutes(app, ts, ms);
}
