import * as fs from 'fs';
import * as path from 'path';
import { Hono } from 'hono';
import { verboseLog } from '../utils/logger';
import { TaskService } from '../services/TaskService';
import { TaskTagService } from '../services/TaskTagService';
import { TagService } from '../services/TagService';
import { MetadataService } from '../services/MetadataService';
import { CommentService } from '../services/CommentService';
import { TaskBlockService } from '../services/TaskBlockService';
import { ExportImportService, ExportData } from '../services/ExportImportService';
import { ClaudeProcessService } from '../services/ClaudeProcessService';
import { TaskStatus, isPriority, Priority } from '../models';
import { ConflictError } from '../errors';
import { StorageBackend } from '../db/types/repository';
import { readBoardConfig, writeBoardConfig, DETAIL_PANE_MAX_WIDTH, VALID_THEMES, ThemePreference } from './boardConfig';
import { daysAgoIso } from '../utils/date';
import {
  buildTasksByStatus,
  getBoardUpdatedAt,
  buildBoardCardsPayload,
  STATUSES,
  renderBoard,
  buildBlockMap,
} from './boardRenderer';

export type BoardServices = {
  ts: TaskService;
  tts: TaskTagService;
  tags: TagService;
  ms: MetadataService;
  cs: CommentService;
  tbs: TaskBlockService;
  database: StorageBackend;
  boardTitle?: string;
  configDir: string;
  claudeProcessService?: ClaudeProcessService;
};

type TaskPatchBody = {
  title?: string;
  body?: string | null;
  status?: BoardTaskStatus;
  priority?: string | null;
};

type BoardTaskStatus = TaskStatus;
type TaskUpdateInput = { title?: string; body?: string; status?: BoardTaskStatus; priority?: Priority | null };
const NON_ARCHIVE_STATUSES: TaskStatus[] = ['icebox', 'backlog', 'ready', 'in_progress', 'review', 'done', 'closed'];

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
  ms: MetadataService,
  tags: TagService
): void {
  app.get('/api/tasks', (c) => {
    const includeAll = c.req.query('all') === 'true' || c.req.query('all') === '1';
    if (includeAll) {
      return c.json({ tasks: ts.listTasks({ includeArchived: true }, 'id', 'asc') });
    }
    return c.json({ tasks: ts.listTasks({}, 'id', 'asc') });
  });
  app.post('/api/tasks', async (c) => {
    const body = await c.req.json<{
      title: string;
      body?: string | null;
      status?: BoardTaskStatus;
      priority?: string | null;
      tags?: unknown;
      metadata?: unknown;
    }>();
    if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
      return c.json({ error: 'Title is required' }, 400);
    }
    const status = body.status && STATUSES.includes(body.status) ? body.status : 'backlog';
    const priority = body.priority && isPriority(body.priority) ? body.priority : undefined;

    // Resolve valid tag IDs before task creation
    const tagIds = Array.isArray(body.tags)
      ? body.tags.map(Number).filter((n) => !isNaN(n) && tags.getTag(n))
      : undefined;

    const task = ts.createTask({
      title: body.title.trim(),
      body: body.body || undefined,
      status,
      priority,
      tagIds: tagIds && tagIds.length > 0 ? tagIds : undefined,
    });

    // Store metadata if provided
    if (Array.isArray(body.metadata)) {
      for (const entry of body.metadata) {
        if (
          entry &&
          typeof entry === 'object' &&
          typeof (entry as { key: unknown }).key === 'string' &&
          (entry as { key: string }).key.trim() !== ''
        ) {
          const metaEntry = entry as { key: string; value: unknown };
          ms.setMetadata({
            task_id: task.id,
            key: metaEntry.key.trim(),
            value: String(metaEntry.value ?? ''),
          });
        }
      }
    }

    return c.json(task, 201);
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
  app.post('/api/tags', async (c) => {
    const body = await c.req.json<{ name?: unknown }>();
    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      return c.json({ error: 'Name is required' }, 400);
    }
    try {
      const tag = tags.createTag({ name: body.name.trim() });
      return c.json(tag, 201);
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : 'Failed to create tag' }, 400);
    }
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
      beforeDate = daysAgoIso(3);
    }
    const tasks = ts.purgeTasksBefore(beforeDate, ['done', 'closed'], false);
    return c.json({
      count: tasks.length,
      tasks: tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, updated_at: t.updated_at })),
    });
  });
  app.post('/api/tasks/archive', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { beforeDate?: string };
    let beforeDate: string;
    if (body.beforeDate !== undefined) {
      const parsed = new Date(body.beforeDate);
      if (isNaN(parsed.getTime())) {
        return c.json({ error: 'Invalid beforeDate. Use ISO 8601 format.' }, 400);
      }
      beforeDate = parsed.toISOString();
    } else {
      beforeDate = daysAgoIso(3);
    }
    const tasks = ts.archiveTasksBefore(beforeDate, ['done', 'closed'], false);
    return c.json({
      count: tasks.length,
      tasks: tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, updated_at: t.updated_at })),
    });
  });
  app.post('/api/tasks/:id/unarchive', async (c) => {
    const idStr = c.req.param('id');
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      return c.json({ error: 'Invalid task ID' }, 400);
    }

    const task = ts.unarchiveTask(id);
    if (!task) {
      return c.json({ error: 'Task not found' }, 404);
    }

    return c.json({
      id: task.id,
      title: task.title,
      status: task.status,
      is_archived: task.is_archived,
      updated_at: task.updated_at,
    });
  });
  app.get('/api/version', (c) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { version } = require('../../package.json') as { version: string };
    return c.json({ version });
  });
}

function registerExportImportRoutes(app: Hono, services: BoardServices): void {
  const { database } = services;

  app.get('/api/export', (c) => {
    try {
      const service = new ExportImportService(database);
      const data = service.exportData();
      const filename = `agkan-export-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      c.header('Content-Disposition', `attachment; filename="${filename}"`);
      c.header('Content-Type', 'application/json');
      return c.body(JSON.stringify(data, null, 2));
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : 'Export failed' }, 500);
    }
  });

  app.post('/api/import', async (c) => {
    try {
      const data = await c.req.json<ExportData>();
      if (!data.tasks || !Array.isArray(data.tasks)) {
        return c.json({ error: 'Invalid export file format (missing tasks array)' }, 400);
      }
      const service = new ExportImportService(database);
      const result = service.importData(data);
      return c.json({ success: true, importedCount: result.importedCount });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : 'Import failed' }, 500);
    }
  });
}

export function registerTaskApiRoutes(app: Hono, services: BoardServices): void {
  const { ts, tts, tags, ms, cs, tbs } = services;
  registerTaskCrudRoutes(app, ts, tts, tbs, ms, tags);
  registerCommentRoutes(app, cs, ts);
  registerTagRoutes(app, tts, tags, ts);
  registerUtilityRoutes(app, ts);
  registerExportImportRoutes(app, services);
}

export function registerConfigApiRoutes(app: Hono, configDir: string): void {
  app.get('/api/config', (c) => {
    const boardConfig = readBoardConfig(configDir);
    return c.json({ board: boardConfig });
  });

  app.put('/api/config', async (c) => {
    const body = await c.req.json<{ board?: { detailPaneWidth?: unknown; theme?: unknown } }>();
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

    if (boardBody.theme !== undefined) {
      const theme = boardBody.theme;
      if (typeof theme !== 'string' || !(VALID_THEMES as string[]).includes(theme)) {
        return c.json({ error: `theme must be one of: ${VALID_THEMES.join(', ')}` }, 400);
      }
      writeBoardConfig(configDir, { theme: theme as ThemePreference });
    }

    return c.json({ success: true });
  });
}

type BoardCardFilters = {
  status?: TaskStatus[];
  tagIds?: number[];
  priority?: string[];
  assignees?: string;
  search?: string;
};

function parseBoardCardFilters(query: {
  tags?: string;
  priority?: string;
  assignee?: string;
  search?: string;
}): BoardCardFilters {
  const filters: BoardCardFilters = { status: NON_ARCHIVE_STATUSES };
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
  if (query.search && query.search.trim()) {
    filters.search = query.search.trim();
  }
  return filters;
}

function registerClaudeRoutes(app: Hono, claudeProcess: ClaudeProcessService, ts: TaskService): void {
  app.post('/api/claude/tasks/:taskId/run', async (c) => {
    const taskId = Number(c.req.param('taskId'));
    if (isNaN(taskId)) return c.json({ error: 'Invalid taskId' }, 400);
    if (!ts.getTask(taskId)) return c.json({ error: 'Task not found' }, 404);

    const body = (await c.req.json().catch(() => ({}))) as { command?: string };
    const command = body.command === 'planning' ? 'planning' : body.command === 'pr' ? 'pr' : 'run';
    const prompt =
      command === 'planning'
        ? `Task ID: ${taskId}\n/agkan-planning-subtask`
        : command === 'pr'
          ? `Task ID: ${taskId}\n/agkan-subtask`
          : `Task ID: ${taskId}\n/agkan-subtask-direct`;

    try {
      claudeProcess.startProcess(taskId, prompt, command);
    } catch (e) {
      if (e instanceof ConflictError) {
        console.error(
          `[boardRoutes] 409 already running taskId=${taskId} command=${command} running=${JSON.stringify(claudeProcess.listRunningTasks())}`
        );
        return c.json({ error: e.message }, 409);
      }
      return c.json({ error: e instanceof Error ? e.message : 'Failed to start process' }, 500);
    }

    if (command === 'pr' || command === 'run') {
      const targetStatus = command === 'pr' ? 'review' : 'done';
      const unsubscribe = claudeProcess.subscribeOutput(taskId, (evt) => {
        if (evt.kind === 'done' && evt.exitCode === 0) {
          ts.updateTask(taskId, { status: targetStatus });
        }
        if (evt.kind === 'done' || evt.kind === 'error') {
          unsubscribe();
        }
      });
    }

    return c.json({ taskId, started: true }, 201);
  });

  app.delete('/api/claude/tasks/:taskId/run', (c) => {
    const taskId = Number(c.req.param('taskId'));
    if (isNaN(taskId)) return c.json({ error: 'Invalid taskId' }, 400);
    const stopped = claudeProcess.stopProcess(taskId);
    if (!stopped) return c.json({ error: 'No running process for this taskId' }, 404);
    return c.json({ success: true });
  });

  app.get('/api/claude/tasks/:taskId/stream', (c) => {
    const taskId = Number(c.req.param('taskId'));
    if (isNaN(taskId)) {
      return c.json({ error: 'Invalid taskId' }, 400);
    }

    const stream = new ReadableStream({
      start(controller) {
        const encode = (event: string, data: unknown): Uint8Array => {
          const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          return new TextEncoder().encode(payload);
        };

        const stop = claudeProcess.subscribeOutput(taskId, (evt) => {
          if (evt.kind === 'text') {
            controller.enqueue(encode('text', { text: evt.text }));
          } else if (evt.kind === 'tool_use') {
            controller.enqueue(encode('tool_use', { name: evt.name, input: evt.input }));
          } else if (evt.kind === 'done') {
            controller.enqueue(encode('end', { exitCode: evt.exitCode }));
            controller.close();
          } else if (evt.kind === 'error') {
            controller.enqueue(encode('error', { message: evt.message }));
            controller.close();
          }
        });

        c.req.raw.signal?.addEventListener('abort', () => {
          stop();
          controller.close();
        });
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  });

  app.get('/api/running-tasks', (c) => {
    const tasks = claudeProcess.listRunningTasks();
    return c.json({ tasks });
  });

  app.get('/api/claude/tasks/:taskId/run-logs', (c) => {
    const taskId = Number(c.req.param('taskId'));
    if (isNaN(taskId)) return c.json({ error: 'Invalid taskId' }, 400);
    if (!ts.getTask(taskId)) return c.json({ error: 'Task not found' }, 404);
    const logs = claudeProcess.getRunLogs(taskId);
    return c.json({ logs });
  });
}

export function registerBoardRoutes(app: Hono, services: BoardServices): void {
  const { ts, tts, tbs, database, boardTitle, configDir } = services;

  app.use('*', async (c, next) => {
    verboseLog(`[boardRoutes] ${c.req.method} ${c.req.path}`);
    await next();
    verboseLog(`[boardRoutes] ${c.req.method} ${c.req.path} -> ${c.res.status}`);
  });

  app.get('/static/board.js', (c) => {
    const candidates = [
      path.join(__dirname, 'client', 'board.js'),
      path.join(__dirname, '..', '..', 'dist', 'board', 'client', 'board.js'),
    ];
    for (const bundlePath of candidates) {
      try {
        const content = fs.readFileSync(bundlePath, 'utf8');
        return new Response(content, {
          headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
        });
      } catch {
        // Try next candidate
      }
    }
    return c.notFound();
  });

  app.get('/', (c) => {
    const tasksByStatus = buildTasksByStatus(ts.listTasks({ status: NON_ARCHIVE_STATUSES }, 'id', 'asc'));
    const boardConfig = readBoardConfig(configDir);
    const blockMap = buildBlockMap(tbs.getAllBlocks());
    return c.html(renderBoard(tasksByStatus, tts.getAllTaskTags(), boardTitle, boardConfig.theme, blockMap));
  });
  app.get('/api/board/updated-at', (c) => c.json({ updatedAt: getBoardUpdatedAt(database) }));
  app.get('/api/board/cards', (c) => {
    const filters = parseBoardCardFilters({
      tags: c.req.query('tags'),
      priority: c.req.query('priority'),
      assignee: c.req.query('assignee'),
      search: c.req.query('search'),
    });
    const tasksByStatus = buildTasksByStatus(ts.listTasks(filters, 'id', 'asc'));
    const blockMap = buildBlockMap(tbs.getAllBlocks());
    const columns = buildBoardCardsPayload(tasksByStatus, tts.getAllTaskTags(), blockMap);
    return c.json({ columns });
  });
  registerTaskApiRoutes(app, services);
  registerConfigApiRoutes(app, configDir);
  if (services.claudeProcessService) {
    registerClaudeRoutes(app, services.claudeProcessService, ts);
  }
}
