/**
 * Service container for CLI commands
 *
 * Centralizes service instantiation to eliminate duplication across CLI commands.
 * Each call to getServiceContainer() returns a new set of service instances
 * appropriate for the lifetime of a single CLI command invocation.
 */

import {
  TaskService,
  TaskBlockService,
  TaskTagService,
  CommentService,
  TagService,
  MetadataService,
} from '../../services';
import { BoardEventService } from '../../services/BoardEventService';
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
}

/**
 * Factory function that creates and returns a ServiceContainer with all service instances.
 * Returns a new container per invocation, suitable for per-command use.
 */
export function getServiceContainer(): ServiceContainer {
  return {
    taskService: new TaskService(undefined, new HttpBoardEventService()),
    taskBlockService: new TaskBlockService(),
    taskTagService: new TaskTagService(),
    commentService: new CommentService(),
    tagService: new TagService(),
    metadataService: new MetadataService(),
  };
}
