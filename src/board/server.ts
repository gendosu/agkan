import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import path from 'path';
import { TaskService } from '../services/TaskService';
import { TaskTagService } from '../services/TaskTagService';
import { TagService } from '../services/TagService';
import { MetadataService } from '../services/MetadataService';
import { CommentService } from '../services/CommentService';
import { TaskBlockService } from '../services/TaskBlockService';
import { ClaudeProcessService } from '../services/ClaudeProcessService';
import { getStorageBackend } from '../db/connection';
import { StorageBackend } from '../db/types/repository';
import { getDefaultDirName } from '../db/config';
import { registerBoardRoutes, BoardServices } from './boardRoutes';

export function createBoardApp(
  taskService?: TaskService,
  taskTagService?: TaskTagService,
  metadataService?: MetadataService,
  db?: StorageBackend,
  boardTitle?: string,
  tagService?: TagService,
  configDir?: string,
  commentService?: CommentService,
  taskBlockService?: TaskBlockService,
  claudeProcessService?: ClaudeProcessService
): Hono {
  const app = new Hono();
  const resolvedConfigDir = configDir ?? path.join(process.cwd(), getDefaultDirName());
  const resolvedDb = db ?? getStorageBackend();
  const services: BoardServices = {
    ts: taskService ?? new TaskService(resolvedDb),
    tts: taskTagService ?? new TaskTagService(resolvedDb),
    tags: tagService ?? new TagService(resolvedDb),
    ms: metadataService ?? new MetadataService(resolvedDb),
    cs: commentService ?? new CommentService(resolvedDb),
    tbs: taskBlockService ?? new TaskBlockService(resolvedDb),
    database: resolvedDb,
    boardTitle,
    configDir: resolvedConfigDir,
    claudeProcessService,
  };
  registerBoardRoutes(app, services);
  return app;
}

export function startBoardServer(port: number, boardTitle?: string): void {
  const app = createBoardApp(
    undefined,
    undefined,
    undefined,
    undefined,
    boardTitle,
    undefined,
    undefined,
    undefined,
    undefined,
    new ClaudeProcessService()
  );
  serve(
    {
      fetch: app.fetch,
      port,
    },
    (info) => {
      console.log(`Server is running on http://localhost:${info.port}`);
    }
  );
}
