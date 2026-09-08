import { Hono } from 'hono';
import { PtySessionService } from '../../terminal/PtySessionService';
import { TaskService } from '../../services/TaskService';
import { BRANCH_AUTO_GENERATE } from '../../models/Task';
import { ConflictError } from '../../errors';
import { GitService } from '../GitService';
import { runTargetStatus } from '../../utils/runTargetStatus';
import {
  parseClaudeCommand,
  buildClaudePrompt,
  resolveLaunchSettings,
  LaunchSettingsError,
  type LaunchSettings,
} from '../claudePromptBuilder';

export function registerClaudeRoutes(
  app: Hono,
  claudeProcess: PtySessionService,
  ts: TaskService,
  gitService: GitService
): void {
  app.post('/api/claude/tasks/:taskId/run', async (c) => {
    const taskId = Number(c.req.param('taskId'));
    if (isNaN(taskId)) return c.json({ error: 'Invalid taskId' }, 400);
    const task = ts.getTask(taskId);
    if (!task) return c.json({ error: 'Task not found' }, 404);

    if (task.branch && task.branch !== BRANCH_AUTO_GENERATE) {
      try {
        gitService.checkoutBranch(task.branch);
      } catch (e) {
        console.error(`[boardRoutes] git checkout failed:`, e);
        return c.json({ error: `Failed to checkout branch: ${task.branch}` }, 500);
      }
    }

    const body = (await c.req.json().catch(() => ({}))) as { command?: string };
    const command = parseClaudeCommand(body.command);

    const prompt = buildClaudePrompt(taskId, command, task.branch);

    let agent: LaunchSettings['agent'];
    let model: string | undefined;
    let effort: string | undefined;
    try {
      ({ agent, model, effort } = resolveLaunchSettings(ts, taskId, command));
    } catch (e) {
      if (e instanceof LaunchSettingsError) {
        return c.json({ error: e.message }, 400);
      }
      console.error(`[boardRoutes] failed to resolve launch settings for taskId=${taskId}:`, e);
      return c.json({ error: e instanceof Error ? e.message : 'Failed to resolve launch settings' }, 500);
    }

    try {
      await claudeProcess.startProcess(taskId, prompt, command, model, effort, agent);
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
      const targetStatus = runTargetStatus(command) ?? 'done';
      const unsubscribe = claudeProcess.subscribeOutput(taskId, (evt) => {
        if (evt.kind === 'done' || evt.kind === 'error') {
          console.error(
            `[diag][boardRoutes.subscribe] taskId=${taskId} command=${command} evt=${JSON.stringify(evt)} userStopped=${claudeProcess.isUserStopped(taskId)} at=${new Date().toISOString()}`
          );
        }
        if (evt.kind === 'done' && evt.exitCode === 0) {
          if (claudeProcess.isUserStopped(taskId)) {
            // User explicitly stopped the process — do not auto-advance status
          } else {
            claudeProcess.notifyCompletionConfirm(taskId, targetStatus);
          }
        }
        if (evt.kind === 'done' || evt.kind === 'error') {
          unsubscribe();
        }
      });
    } else if (command === 'planning') {
      const unsubscribe = claudeProcess.subscribeOutput(taskId, (evt) => {
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

  app.get('/api/running-tasks', (c) => {
    const tasks = claudeProcess.listRunningTasks();
    return c.json({ tasks });
  });

  app.get('/api/claude/tasks/:taskId/run-logs/stream', (c) => {
    const taskId = Number(c.req.param('taskId'));
    if (isNaN(taskId)) return c.json({ error: 'Invalid taskId' }, 400);
    if (!ts.getTask(taskId)) return c.json({ error: 'Task not found' }, 404);

    const stream = new ReadableStream({
      start(controller) {
        let finalized = false;
        let stopUpdate: (() => void) | undefined;
        let stopRunning: (() => void) | undefined;

        const encode = (event: string, data: unknown): Uint8Array => {
          const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          return new TextEncoder().encode(payload);
        };

        const safeClose = () => {
          if (finalized) return;
          finalized = true;
          stopUpdate?.();
          stopRunning?.();
          controller.close();
        };

        const sendUpdate = () => {
          if (finalized) return;
          queueMicrotask(() => {
            if (finalized) return;
            try {
              controller.enqueue(encode('update', { logs: claudeProcess.getRunLogs(taskId) }));
            } catch {
              safeClose();
            }
          });
        };

        const resubscribe = () => {
          stopUpdate?.();
          stopUpdate = claudeProcess.subscribeOutputUpdate(taskId, sendUpdate);
        };

        try {
          controller.enqueue(encode('update', { logs: claudeProcess.getRunLogs(taskId) }));
        } catch {
          safeClose();
          return;
        }

        resubscribe();

        // Re-subscribe when a new process starts for this task (e.g. user clicks Run while SSE is open)
        stopRunning = claudeProcess.subscribeRunningTasksChange(() => {
          resubscribe();
          sendUpdate();
        });

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

  app.get('/api/claude/tasks/:taskId/run-logs', (c) => {
    const taskId = Number(c.req.param('taskId'));
    if (isNaN(taskId)) return c.json({ error: 'Invalid taskId' }, 400);
    if (!ts.getTask(taskId)) return c.json({ error: 'Task not found' }, 404);
    const logs = claudeProcess.getRunLogs(taskId);
    return c.json({ logs });
  });
}
