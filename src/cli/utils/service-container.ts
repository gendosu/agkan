/**
 * Service container for CLI commands
 *
 * Centralizes service instantiation to eliminate duplication across CLI commands.
 * Each call to getServiceContainer() returns a new set of service instances
 * appropriate for the lifetime of a single CLI command invocation.
 */

import { homedir } from 'os';
import { join } from 'path';
import {
  TaskService,
  TaskBlockService,
  TaskTagService,
  CommentService,
  TagService,
  MetadataService,
} from '../../services';
import { BoardEventService } from '../../services/BoardEventService';
import { PtySessionService } from '../../terminal/PtySessionService';
import { AttentionStateService } from '../../services/AttentionStateService';
import { notifyBoard } from './boardNotify';

class HttpBoardEventService extends BoardEventService {
  notify(): void {
    void notifyBoard();
  }
}

/**
 * Container holding all service instances needed by CLI commands
 */
export interface ServiceContainer {
  taskService: TaskService;
  taskBlockService: TaskBlockService;
  taskTagService: TaskTagService;
  commentService: CommentService;
  tagService: TagService;
  metadataService: MetadataService;
  ptySessionService: PtySessionService;
}

/**
 * Factory function that creates and returns a ServiceContainer with all service instances.
 * Returns a new container per invocation, suitable for per-command use.
 */
export function getServiceContainer(): ServiceContainer {
  // Mirrors src/board/server.ts's PtySessionService wiring, except boardApiUrl is always
  // null: there is no board server here, so Board-only hook callbacks (buildHookEnv) must
  // stay disabled — the CLI observes completion via PtySessionService's subscribeOutput
  // instead of a webhook.
  const hookSettingsDataDir = process.env.AGKAN_DATA_DIR
    ? join(process.env.AGKAN_DATA_DIR, 'board-hooks')
    : join(homedir(), '.agkan', 'board-hooks');
  const agyHooksConfigDir = join(homedir(), '.gemini', 'config');
  const grokHooksConfigDir = join(homedir(), '.grok', 'hooks');

  return {
    taskService: new TaskService(undefined, new HttpBoardEventService()),
    taskBlockService: new TaskBlockService(),
    taskTagService: new TaskTagService(),
    commentService: new CommentService(),
    tagService: new TagService(),
    metadataService: new MetadataService(),
    ptySessionService: new PtySessionService(undefined, {
      boardApiUrl: null,
      attentionStateService: new AttentionStateService(),
      hookSettingsDataDir,
      agyHooksConfigDir,
      grokHooksConfigDir,
    }),
  };
}
