import { Hono } from 'hono';
import { TaskStatus } from '../../models';
import {
  buildTasksByStatus,
  getBoardUpdatedAt,
  buildBoardCardsPayload,
  renderBoard,
  buildBlockMap,
} from '../boardRenderer';
import { readBoardConfig } from '../boardConfig';
import { BoardServices, NON_ARCHIVE_STATUSES } from './shared';

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

export function registerBoardPageRoutes(app: Hono, services: BoardServices): void {
  const { ts, tts, tbs, database, boardTitle, configDir, boardEventService, attentionStateService } = services;

  app.get('/', (c) => {
    const tasksByStatus = buildTasksByStatus(ts.listTasks({ status: NON_ARCHIVE_STATUSES }, 'id', 'asc'));
    const boardConfig = readBoardConfig(configDir);
    const blockMap = buildBlockMap(tbs.getAllBlocks());
    return c.html(renderBoard(tasksByStatus, tts.getAllTaskTags(), boardTitle, boardConfig.theme, blockMap));
  });

  app.get('/api/board/stream', (c) => {
    const ptyService = services.ptySessionService;
    const stream = new ReadableStream({
      start(controller) {
        let finalized = false;
        const unsubscribers: (() => void)[] = [];

        const encode = (event: string, data: unknown): Uint8Array => {
          const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          return new TextEncoder().encode(payload);
        };

        const safeClose = () => {
          if (finalized) return;
          finalized = true;
          unsubscribers.forEach((fn) => fn());
          controller.close();
        };

        const send = (event: string, data: unknown) => {
          if (finalized) return;
          try {
            controller.enqueue(encode(event, data));
          } catch {
            safeClose();
          }
        };

        // board-update: triggered by BoardEventService or fallback polling
        if (boardEventService) {
          // Send initial snapshot so client can sync on connect
          send('board-update', { updatedAt: getBoardUpdatedAt(database) });
          const unsub = boardEventService.subscribe(() => {
            send('board-update', { updatedAt: getBoardUpdatedAt(database) });
          });
          unsubscribers.push(unsub);
        } else {
          let lastKnownTs: string | null | undefined = undefined;
          const intervalId = setInterval(() => {
            if (finalized) return;
            const ts = getBoardUpdatedAt(database);
            if (ts !== lastKnownTs) {
              lastKnownTs = ts;
              send('board-update', { updatedAt: ts });
            }
          }, 2000);
          unsubscribers.push(() => clearInterval(intervalId));
          // initial send
          const ts = getBoardUpdatedAt(database);
          lastKnownTs = ts;
          send('board-update', { updatedAt: ts });
        }

        // attention: snapshot + updates
        if (attentionStateService) {
          const initial = attentionStateService.listAttentionTasks();
          send('attention', { type: 'snapshot', taskIds: initial });
          const unsub = attentionStateService.subscribe((update) => {
            send('attention', { type: 'update', ...update });
          });
          unsubscribers.push(unsub);
        }

        // running-tasks + confirm-complete
        if (ptyService) {
          send('running-tasks', { tasks: ptyService.listRunningTasks() });
          const unsubRunning = ptyService.subscribeRunningTasksChange(() => {
            send('running-tasks', { tasks: ptyService.listRunningTasks() });
          });
          unsubscribers.push(unsubRunning);
          const unsubConfirm = ptyService.subscribeCompletionConfirm((taskId, targetStatus) => {
            send('confirm-complete', { taskId, targetStatus });
          });
          unsubscribers.push(unsubConfirm);
        }

        c.req.raw.signal?.addEventListener('abort', () => {
          safeClose();
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

  app.post('/api/board/notify', (c) => {
    boardEventService?.notify();
    return c.json({ ok: true });
  });
}
