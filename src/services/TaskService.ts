import { Task, CreateTaskInput, UpdateTaskInput, TaskStatus } from '../models';
import { getDatabase } from '../db/connection';
import { validateTaskInput, validateTaskUpdateInput } from '../utils/input-validators';
import { wouldCreateCycle } from '../utils/cycle-detector';
import Database from 'better-sqlite3';

/**
 * Task Service
 * Provides CRUD operations for tasks
 */
export class TaskService {
  private db: Database.Database;

  constructor(db?: Database.Database) {
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
      INSERT INTO tasks (title, body, author, status, parent_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      input.title,
      input.body || null,
      input.author || null,
      status,
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
   * Get task list
   * @param filters - Filter criteria (status, author, tagIds)
   * @returns Array of tasks
   */
  listTasks(filters?: { status?: TaskStatus; author?: string; tagIds?: number[] }): Task[] {
    const db = this.db;

    let query: string;
    const params: (string | number)[] = [];

    // Use JOIN when tag filter is specified
    if (filters?.tagIds && filters.tagIds.length > 0) {
      query = 'SELECT DISTINCT tasks.* FROM tasks INNER JOIN task_tags ON tasks.id = task_tags.task_id WHERE 1=1';

      // Add IN clause for tag IDs
      const placeholders = filters.tagIds.map(() => '?').join(', ');
      query += ` AND task_tags.tag_id IN (${placeholders})`;
      params.push(...filters.tagIds);
    } else {
      query = 'SELECT * FROM tasks WHERE 1=1';
    }

    if (filters?.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }

    if (filters?.author) {
      query += ' AND author = ?';
      params.push(filters.author);
    }

    query += ' ORDER BY created_at DESC';

    const stmt = db.prepare(query);
    return stmt.all(...params) as Task[];
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

    if (input.status !== undefined) {
      updates.push('status = ?');
      params.push(input.status);
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
   * Search tasks
   * @param keyword - Search keyword (LIKE search on title and body)
   * @param includeAll - If true, include done/closed tasks in search (default: false)
   * @returns Array of matched tasks
   */
  searchTasks(keyword: string, includeAll: boolean = false): Task[] {
    const db = this.db;

    let query = 'SELECT * FROM tasks WHERE (title LIKE ? OR body LIKE ?)';
    const params: string[] = [`%${keyword}%`, `%${keyword}%`];

    if (!includeAll) {
      query += ' AND status NOT IN (?, ?)';
      params.push('done', 'closed');
    }

    query += ' ORDER BY created_at DESC';

    const stmt = db.prepare(query);
    return stmt.all(...params) as Task[];
  }

  /**
   * Get child tasks (direct children only)
   * @param parentId - Parent task ID
   * @returns Array of child tasks
   */
  getChildTasks(parentId: number): Task[] {
    const db = this.db;
    const stmt = db.prepare('SELECT * FROM tasks WHERE parent_id = ? ORDER BY created_at ASC');
    return stmt.all(parentId) as Task[];
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
