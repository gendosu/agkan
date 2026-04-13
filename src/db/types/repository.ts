/**
 * Repository Interface Definitions
 *
 * Defines entity-specific repository interfaces as part of the Repository pattern.
 * Each repository encapsulates data access logic for a specific entity.
 * StorageBackend is the collection of all repositories.
 *
 * ## Design Pattern: Repository Pattern
 * - Thin repositories: data access / SQL only
 * - Business logic remains in the service layer
 * - Sync implementation (async can be reconsidered when non-SQL backends are added)
 */

import type {
  Task,
  CreateTaskInput,
  UpdateTaskInput,
  TaskStatus,
  Tag,
  CreateTagInput,
  UpdateTagInput,
  TaskBlock,
  CreateTaskBlockInput,
  TaskTag,
  CreateTaskTagInput,
  TaskMetadata,
  CreateTaskMetadataInput,
  TaskComment,
  CreateTaskCommentInput,
} from '../../models';
import type { Priority } from '../../models/Priority';

/** Filter options for task listing */
export interface TaskFilter {
  status?: TaskStatus | TaskStatus[];
  author?: string;
  assignees?: string;
  tagIds?: number[];
  priority?: Priority | Priority[];
  search?: string;
  /** If true, include archived tasks (is_archived=1). Default: false (exclude archived) */
  includeArchived?: boolean;
}

/** Sort options for task listing */
export interface TaskSortOptions {
  field: 'id' | 'title' | 'status' | 'created_at' | 'updated_at' | 'priority';
  order: 'asc' | 'desc';
}

/**
 * Repository for Task entity data access
 */
export interface TaskRepository {
  /** Find a task by its ID */
  findById(id: number): Task | null;
  /** Find all tasks matching the filter, with optional sort */
  findAll(filter?: TaskFilter, sort?: TaskSortOptions): Task[];
  /** Create a new task */
  create(input: CreateTaskInput & { status: TaskStatus; created_at: string; updated_at: string }): Task;
  /** Update fields of an existing task */
  update(id: number, input: Partial<UpdateTaskInput & { updated_at: string }>): Task | null;
  /** Delete a task by ID */
  delete(id: number): boolean;
  /** Find direct child tasks */
  findChildren(parentId: number): Task[];
  /** Count tasks grouped by status */
  countByStatus(): Record<TaskStatus, number>;
  /** Find tasks updated before a given date with specific statuses */
  findForPurge(beforeDate: string, statuses: TaskStatus[]): Task[];
  /** Delete multiple tasks by IDs */
  deleteMany(ids: number[]): number;
  /** Set is_archived=1 on multiple tasks by IDs */
  archiveMany(ids: number[]): number;
  /** Set is_archived=0 on multiple tasks by IDs */
  unarchiveMany(ids: number[]): number;
}

/**
 * Repository for Tag entity data access
 */
export interface TagRepository {
  /** Find a tag by its ID */
  findById(id: number): Tag | null;
  /** Find a tag by its name */
  findByName(name: string): Tag | null;
  /** Find all tags */
  findAll(): Tag[];
  /** Create a new tag */
  create(input: CreateTagInput & { created_at: string }): Tag;
  /** Update a tag */
  update(id: number, input: UpdateTagInput): Tag | null;
  /** Delete a tag by ID */
  delete(id: number): boolean;
}

/**
 * Repository for TaskBlock (blocking relationships) data access
 */
export interface TaskBlockRepository {
  /** Create a new block relationship */
  create(input: CreateTaskBlockInput & { created_at: string }): TaskBlock;
  /** Remove a block relationship */
  delete(blockerId: number, blockedId: number): boolean;
  /** Get all task IDs blocked by a given task */
  findBlockedTaskIds(blockerId: number): number[];
  /** Get all task IDs that block a given task */
  findBlockerTaskIds(blockedId: number): number[];
  /** Get all block relationships */
  findAll(): Array<{ blocker_task_id: number; blocked_task_id: number }>;
}

/**
 * Repository for TaskTag (task-tag associations) data access
 */
export interface TaskTagRepository {
  /** Create a task-tag association */
  create(input: CreateTaskTagInput & { created_at: string }): TaskTag;
  /** Remove a task-tag association */
  delete(taskId: number, tagId: number): boolean;
  /** Check if a task has a specific tag */
  exists(taskId: number, tagId: number): boolean;
  /** Get tag IDs for a task */
  findTagIdsByTaskId(taskId: number): number[];
  /** Get tags for a task */
  findTagsByTaskId(taskId: number): Tag[];
  /** Get task IDs for a tag */
  findTaskIdsByTagId(tagId: number): number[];
  /** Get tasks for a tag */
  findTasksByTagId(tagId: number): Task[];
  /** Get all task tags as a map (task_id -> Tag[]) */
  findAllGroupedByTaskId(): Map<number, Tag[]>;
}

/**
 * Repository for TaskMetadata data access
 */
export interface MetadataRepository {
  /** Set metadata for a task (create or update) */
  set(input: CreateTaskMetadataInput & { created_at: string; updated_at: string }): TaskMetadata;
  /** Get metadata by task ID and key */
  findByKey(taskId: number, key: string): TaskMetadata | null;
  /** List all metadata for a task */
  findByTaskId(taskId: number): TaskMetadata[];
  /** Delete metadata by task ID and key */
  delete(taskId: number, key: string): boolean;
  /** Delete all metadata for a task */
  deleteAllForTask(taskId: number): number;
  /** Get all metadata grouped by task ID */
  findAllGroupedByTaskId(): Map<number, TaskMetadata[]>;
  /** Update an existing metadata entry */
  update(taskId: number, key: string, value: string, updatedAt: string): TaskMetadata | null;
}

/**
 * Repository for TaskComment data access
 */
export interface CommentRepository {
  /** Create a new comment */
  create(input: CreateTaskCommentInput & { created_at: string; updated_at: string }): TaskComment;
  /** Find a comment by ID */
  findById(id: number): TaskComment | null;
  /** List comments for a task */
  findByTaskId(taskId: number): TaskComment[];
  /** Delete a comment by ID */
  delete(id: number): boolean;
  /** Delete all comments for a task */
  deleteAllForTask(taskId: number): number;
  /** Update comment content */
  update(id: number, content: string, updatedAt: string): TaskComment | null;
  /** Get all comments for multiple tasks */
  findByTaskIds(taskIds: number[]): Map<number, TaskComment[]>;
  /** Update comment timestamps (used during import) */
  updateTimestamps(id: number, createdAt: string, updatedAt: string): void;
}

/**
 * Raw DB row shape for task_run_logs table
 */
export interface RunLogRow {
  id: number;
  task_id: number;
  started_at: string;
  finished_at: string | null;
  exit_code: number | null;
  session_id: string | null;
  events: string;
}

/**
 * Repository for task run log data access
 */
export interface RunLogRepository {
  /** Create a new run log entry and return its ID */
  create(taskId: number, startedAt: string): number;
  /** Update a run log with final status (on process close or error) */
  updateFinished(id: number, finishedAt: string, exitCode: number, events: string): void;
  /** Update the session_id of a run log */
  updateSessionId(id: number, sessionId: string): void;
  /** Update the events of a run log (incremental update) */
  updateEvents(id: number, events: string): void;
  /** Find the most recent run log for a task */
  findLatestByTaskId(taskId: number): RunLogRow | null;
  /** Find run logs for a task, ordered by started_at DESC, up to limit */
  findByTaskId(taskId: number, limit: number): RunLogRow[];
  /** Find all run log IDs for a task, ordered by started_at DESC */
  findIdsByTaskId(taskId: number): number[];
  /** Delete run logs by IDs */
  deleteMany(ids: number[]): void;
}

/**
 * StorageBackend - collection of all entity repositories
 *
 * This is the main interface that replaces StorageProvider for use in services.
 * Each service receives the specific repository it needs via constructor injection.
 */
export interface StorageBackend {
  tasks: TaskRepository;
  tags: TagRepository;
  blocks: TaskBlockRepository;
  taskTags: TaskTagRepository;
  metadata: MetadataRepository;
  comments: CommentRepository;
  runLogs: RunLogRepository;
  /** Execute a function within a database transaction */
  transaction<T>(fn: () => T): T;
  /** Update task timestamps directly (used during import) */
  updateTaskTimestamps(id: number, createdAt: string, updatedAt: string): void;
  /**
   * Get a signature representing the latest update across tasks, metadata, and task_tags.
   * Used by the board to detect data changes for polling.
   * Returns null if there is no data yet.
   */
  getBoardUpdatedAtSignature(): string | null;
  /** Close the storage connection */
  close(): void;
}
