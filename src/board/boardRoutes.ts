import { Hono } from 'hono';
import { verboseLog } from '../utils/logger';
import { AgkanError } from '../errors';
import { BulkRunService } from './BulkRunService';
import { GitService } from './GitService';
import { registerStaticRoutes } from './staticRoutes';
import { BoardServices, mapAgkanErrorToStatus } from './routes/shared';
import { registerBoardPageRoutes } from './routes/boardPageRoutes';
import { registerTaskCrudRoutes } from './routes/taskRoutes';
import { registerCommentRoutes } from './routes/commentRoutes';
import { registerTagRoutes } from './routes/tagRoutes';
import { registerUtilityRoutes } from './routes/utilityRoutes';
import { registerExportImportRoutes } from './routes/exportImportRoutes';
import { registerConfigApiRoutes } from './routes/configRoutes';
import { registerClaudeRoutes } from './routes/claudeRoutes';
import { registerBulkRunRoutes } from './routes/bulkRunRoutes';
import { registerHookRoutes, registerTestHookTokenRoute, HookRouteDeps } from './routes/hookRoutes';

export type { BoardServices };
export type { HookRouteDeps };
export { registerHookRoutes, registerTestHookTokenRoute };

export function registerTaskApiRoutes(app: Hono, services: BoardServices, gitService: GitService): void {
  const { ts, tts, tags, ms, cs, tbs, boardEventService } = services;
  registerTaskCrudRoutes(app, ts, tts, tbs, ms, tags);
  registerCommentRoutes(app, cs, ts);
  registerTagRoutes(app, tts, tags, ts, boardEventService);
  registerUtilityRoutes(app, ts, gitService);
  registerExportImportRoutes(app, services);
}

export function registerBoardRoutes(app: Hono, services: BoardServices): void {
  const { ts, tbs, configDir } = services;
  const gitService = new GitService();

  app.onError((err, c) => {
    if (err instanceof AgkanError) {
      return c.json({ error: err.message }, mapAgkanErrorToStatus(err));
    }
    console.error('[boardRoutes] Unhandled error:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  });

  app.use('*', async (c, next) => {
    verboseLog(`[boardRoutes] ${c.req.method} ${c.req.path}`);
    await next();
    verboseLog(`[boardRoutes] ${c.req.method} ${c.req.path} -> ${c.res.status}`);
  });

  registerStaticRoutes(app);
  registerBoardPageRoutes(app, services);
  registerTaskApiRoutes(app, services, gitService);
  registerConfigApiRoutes(app, configDir);
  if (services.ptySessionService) {
    registerClaudeRoutes(app, services.ptySessionService, ts, services.ms, gitService);
    const bulkRunService = new BulkRunService(ts, tbs, services.ptySessionService, services.ms);
    registerBulkRunRoutes(app, bulkRunService);
  }
}
