import { Hono } from 'hono';
import { TaskService } from '../../services/TaskService';
import { AttentionStateService } from '../../services/AttentionStateService';
import { verifyHookToken, getHookToken } from '../../utils/hookToken';
import { isTestMode } from '../../db/config';

export interface HookRouteDeps {
  attentionStateService: AttentionStateService;
  ptySessionService: { stopProcess: (taskId: number) => boolean; stopProcessFromHook: (taskId: number) => boolean };
  taskService: Pick<TaskService, 'getTask'>;
}

export function registerHookRoutes(app: Hono, deps: HookRouteDeps): void {
  app.post('/api/internal/hooks/attention', async (c) => {
    const token = c.req.header('x-hook-token');
    if (!verifyHookToken(token)) {
      return c.body('', 401);
    }
    const body = (await c.req.json().catch(() => ({}))) as { taskId?: unknown; state?: unknown };
    const id = Number(body.taskId);
    if (!Number.isFinite(id)) {
      return c.json({ error: 'invalid taskId' }, 400);
    }
    deps.attentionStateService.setAttention(id, body.state === 'needs');
    return c.json({ ok: true });
  });

  app.post('/api/internal/hooks/stop', async (c) => {
    const token = c.req.header('x-hook-token');
    if (!verifyHookToken(token)) {
      return c.body('', 401);
    }
    const body = (await c.req.json().catch(() => ({}))) as { taskId?: unknown; reason?: unknown };
    const id = Number(body.taskId);
    if (!Number.isFinite(id)) {
      return c.json({ error: 'invalid taskId' }, 400);
    }
    if (body.reason === 'complete') {
      const stopped = deps.ptySessionService.stopProcessFromHook(id);
      if (!stopped) {
        // The screen-status guard skipped termination (or no session was running). Report
        // this observably instead of silently claiming success: the caller (hook-stop.mjs)
        // fires only once per turn and does not retry, so a swallowed skip here would be
        // invisible. PtySessionService itself schedules a deferred re-evaluation to
        // guarantee the session is eventually stopped even though this response is ok:false.
        return c.json({ ok: false, reason: 'guard-skipped' });
      }
    }
    return c.json({ ok: true });
  });

  app.get('/api/internal/tasks/:id/status', (c) => {
    const token = c.req.header('x-hook-token');
    if (!verifyHookToken(token)) {
      return c.body('', 401);
    }
    const id = Number(c.req.param('id'));
    if (!Number.isFinite(id)) {
      return c.json({ error: 'invalid taskId' }, 400);
    }
    const task = deps.taskService.getTask(id);
    if (!task) {
      return c.json({ error: 'task not found' }, 404);
    }
    return c.json({ status: task.status });
  });
}

export function registerTestHookTokenRoute(app: Hono): void {
  if (!isTestMode()) return;
  app.get('/api/internal/test/hook-token', (c) => {
    return c.json({ token: getHookToken() });
  });
}
