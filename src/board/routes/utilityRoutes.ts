import { Hono } from 'hono';
import { TaskService } from '../../services/TaskService';
import { GitService } from '../GitService';
import { resolveBeforeDate } from '../../utils/date';

export function registerUtilityRoutes(app: Hono, ts: TaskService, gitService: GitService): void {
  app.post('/api/tasks/purge', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { beforeDate?: string };
    const resolved = resolveBeforeDate(body.beforeDate);
    if ('error' in resolved) {
      return c.json({ error: resolved.error }, 400);
    }
    const tasks = ts.purgeTasksBefore(resolved.date, ['done', 'closed'], false);
    return c.json({
      count: tasks.length,
      tasks: tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, updated_at: t.updated_at })),
    });
  });
  app.post('/api/tasks/archive', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { beforeDate?: string };
    const resolved = resolveBeforeDate(body.beforeDate);
    if ('error' in resolved) {
      return c.json({ error: resolved.error }, 400);
    }
    const tasks = ts.archiveTasksBefore(resolved.date, ['done', 'closed'], false);
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
    const { version } = require('../../../package.json') as { version: string };
    return c.json({ version });
  });
  app.get('/api/git/branches', (c) => {
    return c.json({ branches: gitService.listBranches() });
  });
}
