import { Hono } from 'hono';
import { TaskService } from '../services/TaskService';
import { TaskTagService } from '../services/TaskTagService';
import { TagService } from '../services/TagService';
import { MetadataService } from '../services/MetadataService';
import { CommentService } from '../services/CommentService';
import { TaskBlockService } from '../services/TaskBlockService';
import { TaskStatus, isPriority, Priority } from '../models';
import { StorageProvider } from '../db/types/storage';
import { readBoardConfig, writeBoardConfig, DETAIL_PANE_MAX_WIDTH } from './boardConfig';
import { buildTasksByStatus, getBoardUpdatedAt, buildBoardCardsPayload, STATUSES, renderBoard } from './boardRenderer';

export type BoardServices = {
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

function registerTaskCrudRoutes(
  app: Hono,
  ts: TaskService,
  tts: TaskTagService,
  tbs: TaskBlockService,
  ms: MetadataService
): void {
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
}

function registerCommentRoutes(app: Hono, cs: CommentService, ts: TaskService): void {
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
  app.get('/api/comments/:id', (c) => {
    const id = Number(c.req.param('id'));
    if (isNaN(id)) return c.json({ error: 'Invalid comment id' }, 400);
    const comment = cs.getComment(id);
    if (!comment) return c.json({ error: 'Comment not found' }, 404);
    return c.json(comment);
  });
  app.patch('/api/comments/:id', async (c) => {
    const id = Number(c.req.param('id'));
    if (isNaN(id)) return c.json({ error: 'Invalid comment id' }, 400);
    const body = await c.req.json<{ content: string }>();
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
  app.delete('/api/comments/:id', (c) => {
    const id = Number(c.req.param('id'));
    if (isNaN(id)) return c.json({ error: 'Invalid comment id' }, 400);
    const deleted = cs.deleteComment(id);
    if (!deleted) return c.json({ error: 'Comment not found' }, 404);
    return c.json({ success: true });
  });
}

function registerTagRoutes(app: Hono, tts: TaskTagService, tags: TagService, ts: TaskService): void {
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
  app.get('/api/tags', (c) => {
    const allTags = tags.listTags();
    return c.json({ tags: allTags });
  });
}

function registerUtilityRoutes(app: Hono, ts: TaskService): void {
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
  app.get('/api/version', (c) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { version } = require('../../package.json') as { version: string };
    return c.json({ version });
  });
}

export function registerTaskApiRoutes(app: Hono, { ts, tts, tags, ms, cs, tbs }: BoardServices): void {
  registerTaskCrudRoutes(app, ts, tts, tbs, ms);
  registerCommentRoutes(app, cs, ts);
  registerTagRoutes(app, tts, tags, ts);
  registerUtilityRoutes(app, ts);
}

export function registerConfigApiRoutes(app: Hono, configDir: string): void {
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

export function registerBoardRoutes(app: Hono, services: BoardServices): void {
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
