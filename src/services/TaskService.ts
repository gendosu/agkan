import { Task, CreateTaskInput, UpdateTaskInput, TaskStatus } from '../models';
import { getDatabase } from '../db/connection';
import { validateTaskInput, validateTaskUpdateInput } from '../utils/input-validators';
import { wouldCreateCycle } from '../utils/cycle-detector';
import { StorageProvider } from '../db/types/storage';

/** Allowed sort fields for task listing */
export const ALLOWED_SORT_FIELDS = ['id', 'title', 'status', 'created_at', 'updated_at', 'priority'] as const;
export type SortField = (typeof ALLOWED_SORT_FIELDS)[number];

/**
 * SQL CASE expression for priority ordering.
 * Numeric weight: critical=4, high=3, medium=2, low=1, NULL=0
 * ORDER BY ... DESC puts critical first; ASC puts unset first.
 */
const PRIORITY_ORDER_EXPR = `CASE priority WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END`;
export type SortOrder = 'asc' | 'desc';

/**
 * Task Service
 * Provides CRUD operations for tasks
 */
export class TaskService {
  private db: StorageProvider;

  constructor(db?: StorageProvider) {
    this.db = db || getDatabase();
  }

  /**
   * Create a new task
   * @param input - Task creation input
   * @returns Created task
   */
  createTask(input: CreateTaskInput): Task {
    const db = this.db;
    const now = new Date().toISOString();
    const status = input.status || 'backlog';

    // Validate input fields
    const validationErrors = validateTaskInput(input);
    if (validationErrors.length > 0) {
      throw new Error(validationErrors[0].message);
    }

    // Validate parent_id: check if parent task exists
    if (input.parent_id !== undefined && input.parent_id !== null) {
      const parentTask = this.getTask(input.parent_id);
      if (!parentTask) {
        throw new Error(`Parent task with id ${input.parent_id} does not exist`);
      }
    }

    const stmt = db.prepare(`
      INSERT INTO tasks (title, body, author, assignees, status, priority, parent_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      input.title,
      input.body || null,
      input.author || null,
      input.assignees || null,
      status,
      input.priority !== undefined ? input.priority : null,
      input.parent_id !== undefined ? input.parent_id : null,
      now,
      now
    );

    return this.getTask(result.lastInsertRowid as number)!;
  }

  /**
   * Get task by ID
   * @param id - Task ID
   * @returns Task, or null if not found
   */
  getTask(id: number): Task | null {
    const db = this.db;

    const stmt = db.prepare('SELECT * FROM tasks WHERE id = ?');
    const task = stmt.get(id) as Task | undefined;

    return task || null;
  }

  /**
   * Build the base SELECT query and initial params for listTasks.
   * Uses a JOIN when tag IDs are specified.
   */
  private buildListBaseQuery(tagIds?: number[]): { query: string; params: (string | number)[] } {
    const params: (string | number)[] = [];
    let query: string;

    if (tagIds && tagIds.length > 0) {
      query = 'SELECT DISTINCT tasks.* FROM tasks INNER JOIN task_tags ON tasks.id = task_tags.task_id WHERE 1=1';
      const placeholders = tagIds.map(() => '?').join(', ');
      query += ` AND task_tags.tag_id IN (${placeholders})`;
      params.push(...tagIds);
    } else {
      query = 'SELECT * FROM tasks WHERE 1=1';
    }

    return { query, params };
  }

  /**
   * Append filter conditions (status, author, assignees, priority) to query and params.
   */
  private applyListFilters(
    query: string,
    params: (string | number)[],
    filters: { status?: TaskStatus | TaskStatus[]; author?: string; assignees?: string; priority?: string | string[] }
  ): { query: string; params: (string | number)[] } {
    if (filters.status) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
      if (statuses.length > 0) {
        query += ` AND status IN (${statuses.map(() => '?').join(', ')})`;
        params.push(...statuses);
      }
    }

    if (filters.author) {
      query += ' AND author = ?';
      params.push(filters.author);
    }

    if (filters.assignees) {
      query += ' AND assignees LIKE ?';
      params.push(`%${filters.assignees}%`);
    }

    if (filters.priority) {
      const priorities = Array.isArray(filters.priority) ? filters.priority : [filters.priority];
      if (priorities.length > 0) {
        query += ` AND priority IN (${priorities.map(() => '?').join(', ')})`;
        params.push(...priorities);
      }
    }

    return { query, params };
  }

  /**
   * Append ORDER BY clause to query for listTasks.
   */
  private applyListOrder(query: string, sort?: SortField, order?: SortOrder, hasTagFilter?: boolean): string {
    const sortField: SortField = sort && ALLOWED_SORT_FIELDS.includes(sort) ? sort : 'created_at';
    const sortOrder: SortOrder = order === 'asc' ? 'asc' : 'desc';
    const tablePrefix = hasTagFilter ? 'tasks.' : '';
    const dir = sortOrder.toUpperCase();

    if (sortField === 'priority') {
      return query + ` ORDER BY ${PRIORITY_ORDER_EXPR} ${dir}, ${tablePrefix}id ${dir}`;
    }
    return query + ` ORDER BY ${tablePrefix}${sortField} ${dir}, ${tablePrefix}id ${dir}`;
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
    },
    sort?: SortField,
    order?: SortOrder
  ): Task[] {
    const hasTagFilter = !!(filters?.tagIds && filters.tagIds.length > 0);
    const { query: baseQuery, params: baseParams } = this.buildListBaseQuery(filters?.tagIds);
    const { query: filteredQuery, params } = this.applyListFilters(baseQuery, baseParams, filters ?? {});
    const query = this.applyListOrder(filteredQuery, sort, order, hasTagFilter);

    return this.db.prepare(query).all(...params) as unknown as Task[];
  }

  /**
   * Build dynamic UPDATE query for task fields
   * @param input - Update content
   * @param id - Task ID (appended as last param for WHERE clause)
   * @returns Object with sql string and params array
   */
  private buildUpdateQuery(input: UpdateTaskInput, id: number): { sql: string; params: (string | number | null)[] } {
    const updates: string[] = [];
    const params: (string | number | null)[] = [];

    if (input.title !== undefined) {
      updates.push('title = ?');
      params.push(input.title);
    }

    if (input.body !== undefined) {
      updates.push('body = ?');
      params.push(input.body);
    }

    if (input.author !== undefined) {
      updates.push('author = ?');
      params.push(input.author);
    }

    if (input.assignees !== undefined) {
      updates.push('assignees = ?');
      params.push(input.assignees || null);
    }

    if (input.status !== undefined) {
      updates.push('status = ?');
      params.push(input.status);
    }

    if (input.priority !== undefined) {
      updates.push('priority = ?');
      params.push(input.priority);
    }

    if (input.parent_id !== undefined) {
      updates.push('parent_id = ?');
      params.push(input.parent_id);
    }

    updates.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);

    const sql = `UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`;
    return { sql, params };
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
      throw new Error(validationErrors[0].message);
    }

    if (input.parent_id !== undefined) {
      if (wouldCreateCycle(id, input.parent_id, (parentId) => this.getTask(parentId)?.parent_id ?? null)) {
        throw new Error(`Cannot set parent_id to ${input.parent_id}: would create circular reference`);
      }

      if (input.parent_id !== null) {
        const parentTask = this.getTask(input.parent_id);
        if (!parentTask) {
          throw new Error(`Parent task with id ${input.parent_id} does not exist`);
        }
      }
    }

    const { sql, params } = this.buildUpdateQuery(input, id);
    this.db.prepare(sql).run(...params);

    return this.getTask(id);
  }

  /**
   * Delete task
   * @param id - Task ID
   * @returns true if deletion succeeded, false if task not found
   */
  deleteTask(id: number): boolean {
    const db = this.db;

    const task = this.getTask(id);
    if (!task) {
      return false;
    }

    const stmt = db.prepare('DELETE FROM tasks WHERE id = ?');
    stmt.run(id);

    return true;
  }

  /**
   * Get task count by status
   * @returns Map of task count for each status
   */
  getTaskCountByStatus(): Record<TaskStatus, number> {
    const db = this.db;

    const stmt = db.prepare(`
      SELECT status, COUNT(*) as count
      FROM tasks
      GROUP BY status
    `);

    const results = stmt.all() as Array<{ status: TaskStatus; count: number }>;

    // Initialize all statuses with 0
    const countMap: Record<TaskStatus, number> = {
      icebox: 0,
      backlog: 0,
      ready: 0,
      in_progress: 0,
      review: 0,
      done: 0,
      closed: 0,
    };

    // Update map with query results
    results.forEach((row) => {
      countMap[row.status] = row.count;
    });

    return countMap;
  }

  /**
   * Purge (delete) tasks that match given statuses and were last updated before the given date
   * @param beforeDate - ISO date string; tasks updated before this date are eligible
   * @param statuses - Array of statuses to target (default: ['done', 'closed'])
   * @param dryRun - If true, return matching tasks without deleting them
   * @returns Array of purged (or would-be-purged) tasks
   */
  purgeTasksBefore(beforeDate: string, statuses: TaskStatus[] = ['done', 'closed'], dryRun: boolean = false): Task[] {
    const db = this.db;

    if (statuses.length === 0) {
      return [];
    }

    const placeholders = statuses.map(() => '?').join(', ');
    const query = `SELECT * FROM tasks WHERE status IN (${placeholders}) AND updated_at < ? ORDER BY updated_at ASC`;
    const params: (string | number)[] = [...statuses, beforeDate];

    const stmt = db.prepare(query);
    const tasks = stmt.all(...params) as unknown as Task[];

    if (!dryRun && tasks.length > 0) {
      const idPlaceholders = tasks.map(() => '?').join(', ');
      const ids = tasks.map((t) => t.id);
      db.prepare(`DELETE FROM tasks WHERE id IN (${idPlaceholders})`).run(...ids);
    }

    return tasks;
  }

  /**
   * Search tasks
   * @param keyword - Search keyword (LIKE search on title and body)
   * @param includeAll - If true, include done/closed tasks in search (default: false)
   * @param statuses - Optional array of statuses to filter by (overrides includeAll)
   * @returns Array of matched tasks
   */
  searchTasks(keyword: string, includeAll: boolean = false, statuses?: TaskStatus[]): Task[] {
    const db = this.db;

    let query = 'SELECT * FROM tasks WHERE (title LIKE ? OR body LIKE ?)';
    const params: (string | number)[] = [`%${keyword}%`, `%${keyword}%`];

    if (statuses && statuses.length > 0) {
      // If specific statuses are provided, filter by those statuses
      const placeholders = statuses.map(() => '?').join(', ');
      query += ` AND status IN (${placeholders})`;
      params.push(...statuses);
    } else if (!includeAll) {
      // Otherwise, exclude done/closed/icebox if includeAll is false
      query += ' AND status NOT IN (?, ?, ?)';
      params.push('icebox', 'done', 'closed');
    }

    query += ' ORDER BY created_at DESC';

    const stmt = db.prepare(query);
    return stmt.all(...params) as unknown as Task[];
  }

  /**
   * Get child tasks (direct children only)
   * @param parentId - Parent task ID
   * @returns Array of child tasks
   */
  getChildTasks(parentId: number): Task[] {
    const db = this.db;
    const stmt = db.prepare('SELECT * FROM tasks WHERE parent_id = ? ORDER BY created_at ASC');
    return stmt.all(parentId) as unknown as Task[];
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
