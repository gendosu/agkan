import { Task, CreateTaskInput, UpdateTaskInput, TaskStatus } from '../models';
import { getStorageBackend } from '../db/connection';
import { validateTaskInput, validateTaskUpdateInput } from '../utils/input-validators';
import { wouldCreateCycle } from '../utils/cycle-detector';
import { StorageBackend } from '../db/types/repository';
import { ValidationError, NotFoundError, ConflictError } from '../errors';

/** Allowed sort fields for task listing */
export const ALLOWED_SORT_FIELDS = ['id', 'title', 'status', 'created_at', 'updated_at', 'priority'] as const;
export type SortField = (typeof ALLOWED_SORT_FIELDS)[number];

export type SortOrder = 'asc' | 'desc';

/**
 * Task Service
 * Provides CRUD operations for tasks
 */
export class TaskService {
  private backend: StorageBackend;

  constructor(backend?: StorageBackend) {
    this.backend = backend ?? getStorageBackend();
  }

  /**
   * Create a new task
   * If `tagIds` is provided, the task creation and tag attachments are wrapped
   * in a single transaction to prevent orphaned tasks when tag attachment fails.
   * @param input - Task creation input
   * @returns Created task
   */
  createTask(input: CreateTaskInput): Task {
    const now = new Date().toISOString();
    const status = input.status || 'backlog';

    // Validate input fields
    const validationErrors = validateTaskInput(input);
    if (validationErrors.length > 0) {
      throw new ValidationError(validationErrors[0].message);
    }

    // Validate parent_id: check if parent task exists
    if (input.parent_id !== undefined && input.parent_id !== null) {
      const parentTask = this.getTask(input.parent_id);
      if (!parentTask) {
        throw new NotFoundError(`Parent task with id ${input.parent_id} does not exist`);
      }
    }

    const { tagIds, ...taskInput } = input;

    if (!tagIds || tagIds.length === 0) {
      return this.backend.tasks.create({
        ...taskInput,
        status,
        created_at: now,
        updated_at: now,
      });
    }

    return this.backend.transaction(() => {
      const task = this.backend.tasks.create({
        ...taskInput,
        status,
        created_at: now,
        updated_at: now,
      });
      for (const tagId of tagIds) {
        this.backend.taskTags.create({ task_id: task.id, tag_id: tagId, created_at: now });
      }
      return task;
    });
  }

  /**
   * Get task by ID
   * @param id - Task ID
   * @returns Task, or null if not found
   */
  getTask(id: number): Task | null {
    return this.backend.tasks.findById(id);
  }

  /**
   * Get task list
   * @param filters - Filter criteria (status, author, tagIds)
   * @param sort - Sort field (default: created_at)
   * @param order - Sort order (default: desc)
   * @returns Array of tasks
   */
  listTasks(
    filters?: {
      status?: TaskStatus | TaskStatus[];
      author?: string;
      assignees?: string;
      tagIds?: number[];
      priority?: string | string[];
      search?: string;
    },
    sort?: SortField,
    order?: SortOrder
  ): Task[] {
    const sortField = sort && ALLOWED_SORT_FIELDS.includes(sort) ? sort : 'created_at';
    const sortOrder: SortOrder = order === 'asc' ? 'asc' : 'desc';

    return this.backend.tasks.findAll(
      {
        status: filters?.status,
        author: filters?.author,
        assignees: filters?.assignees,
        tagIds: filters?.tagIds,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        priority: filters?.priority as any,
        search: filters?.search,
      },
      { field: sortField, order: sortOrder }
    );
  }

  /**
   * Update task
   * @param id - Task ID
   * @param input - Update content
   * @returns Updated task, or null if not found
   */
  updateTask(id: number, input: UpdateTaskInput): Task | null {
    const task = this.getTask(id);
    if (!task) {
      return null;
    }

    const validationErrors = validateTaskUpdateInput(input);
    if (validationErrors.length > 0) {
      throw new ValidationError(validationErrors[0].message);
    }

    if (input.parent_id !== undefined) {
      if (wouldCreateCycle(id, input.parent_id, (parentId) => this.getTask(parentId)?.parent_id ?? null)) {
        throw new ConflictError(`Cannot set parent_id to ${input.parent_id}: would create circular reference`);
      }

      if (input.parent_id !== null) {
        const parentTask = this.getTask(input.parent_id);
        if (!parentTask) {
          throw new NotFoundError(`Parent task with id ${input.parent_id} does not exist`);
        }
      }
    }

    const now = new Date().toISOString();
    return this.backend.tasks.update(id, { ...input, updated_at: now });
  }

  /**
   * Delete task
   * @param id - Task ID
   * @returns true if deletion succeeded, false if task not found
   */
  deleteTask(id: number): boolean {
    const task = this.getTask(id);
    if (!task) {
      return false;
    }
    return this.backend.tasks.delete(id);
  }

  /**
   * Get task count by status
   * @returns Map of task count for each status
   */
  getTaskCountByStatus(): Record<TaskStatus, number> {
    return this.backend.tasks.countByStatus();
  }

  /**
   * Purge (delete) tasks that match given statuses and were last updated before the given date
   * @param beforeDate - ISO date string; tasks updated before this date are eligible
   * @param statuses - Array of statuses to target (default: ['done', 'closed'])
   * @param dryRun - If true, return matching tasks without deleting them
   * @returns Array of purged (or would-be-purged) tasks
   */
  purgeTasksBefore(beforeDate: string, statuses: TaskStatus[] = ['done', 'closed'], dryRun: boolean = false): Task[] {
    const tasks = this.findTasksBeforeByStatuses(beforeDate, statuses);

    if (!dryRun && tasks.length > 0) {
      this.backend.tasks.deleteMany(tasks.map((t) => t.id));
    }

    return tasks;
  }

  /**
   * Archive tasks that match given statuses and were last updated before the given date
   * @param beforeDate - ISO date string; tasks updated before this date are eligible
   * @param statuses - Array of statuses to target (default: ['done', 'closed'])
   * @param dryRun - If true, return matching tasks without updating them
   * @returns Array of archived (or would-be-archived) tasks
   */
  archiveTasksBefore(beforeDate: string, statuses: TaskStatus[] = ['done', 'closed'], dryRun: boolean = false): Task[] {
    const tasks = this.findTasksBeforeByStatuses(beforeDate, statuses);

    if (!dryRun && tasks.length > 0) {
      const now = new Date().toISOString();
      for (const task of tasks) {
        this.backend.tasks.update(task.id, { status: 'archive', updated_at: now });
      }
    }

    return tasks;
  }

  private findTasksBeforeByStatuses(beforeDate: string, statuses: TaskStatus[]): Task[] {
    if (statuses.length === 0) {
      return [];
    }

    return this.backend.tasks.findForPurge(beforeDate, statuses);
  }

  /**
   * Search tasks
   * @param keyword - Search keyword (LIKE search on title and body)
   * @param includeAll - If true, include done/closed tasks in search (default: false)
   * @param statuses - Optional array of statuses to filter by (overrides includeAll)
   * @returns Array of matched tasks
   */
  searchTasks(keyword: string, includeAll: boolean = false, statuses?: TaskStatus[]): Task[] {
    let statusFilter: TaskStatus[] | undefined;

    if (statuses && statuses.length > 0) {
      statusFilter = statuses;
    } else if (!includeAll) {
      // Exclude done/closed/icebox/archive by filtering to all other statuses
      const allStatuses: TaskStatus[] = ['backlog', 'ready', 'in_progress', 'review'];
      statusFilter = allStatuses;
    }

    return this.backend.tasks.findAll(
      { search: keyword, status: statusFilter },
      { field: 'created_at', order: 'desc' }
    );
  }

  /**
   * Get child tasks (direct children only)
   * @param parentId - Parent task ID
   * @returns Array of child tasks
   */
  getChildTasks(parentId: number): Task[] {
    return this.backend.tasks.findChildren(parentId);
  }

  /**
   * Get parent task
   * @param taskId - Task ID
   * @returns Parent task, or null if no parent exists
   */
  getParentTask(taskId: number): Task | null {
    const task = this.getTask(taskId);
    if (!task || !task.parent_id) {
      return null;
    }
    return this.getTask(task.parent_id);
  }

  /**
   * Get descendant tasks iteratively (all descendants)
   * @param parentId - Parent task ID
   * @returns Array of all descendant tasks
   */
  getDescendantTasks(parentId: number): Task[] {
    const descendants: Task[] = [];
    const visited = new Set<number>();
    const queue = [parentId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) {
        continue;
      }
      visited.add(currentId);

      const children = this.getChildTasks(currentId);
      for (const child of children) {
        if (!visited.has(child.id)) {
          descendants.push(child);
          queue.push(child.id);
        }
      }
    }

    return descendants;
  }

  /**
   * Get root task (top-level parent)
   * @param taskId - Task ID
   * @returns Root task, or null if task not found
   */
  getRootTask(taskId: number): Task | null {
    let currentTask = this.getTask(taskId);
    if (!currentTask) {
      return null;
    }

    const visited = new Set<number>();
    visited.add(currentTask.id);

    while (currentTask.parent_id) {
      if (visited.has(currentTask.parent_id)) {
        break;
      }
      const parentTask = this.getTask(currentTask.parent_id);
      if (!parentTask) {
        break;
      }
      visited.add(parentTask.id);
      currentTask = parentTask;
    }

    return currentTask;
  }
}
