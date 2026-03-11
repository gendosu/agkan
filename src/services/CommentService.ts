import { TaskComment, CreateTaskCommentInput } from '../models';
import { getDatabase } from '../db/connection';
import { StorageProvider } from '../db/types/storage';
import { validateCommentInput } from '../utils/input-validators';

/**
 * Comment Service
 * Manages creation, retrieval, and deletion of task comments
 */
export class CommentService {
  private db: StorageProvider;

  constructor(db?: StorageProvider) {
    this.db = db || getDatabase();
  }

  /**
   * Add a comment to a task
   * @param input - Comment creation input
   * @returns Created comment object
   */
  addComment(input: CreateTaskCommentInput): TaskComment {
    const db = this.db;

    const errors = validateCommentInput(input);
    if (errors.length > 0) {
      throw new Error(errors[0].message);
    }

    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO task_comments (task_id, author, content, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(input.task_id, input.author ?? null, input.content, now, now);

    return this.getComment(result.lastInsertRowid as number)!;
  }

  /**
   * Get a comment by ID
   * @param id - Comment ID
   * @returns Comment object or null if not found
   */
  getComment(id: number): TaskComment | null {
    const db = this.db;

    const stmt = db.prepare(`
      SELECT * FROM task_comments
      WHERE id = ?
    `);

    const result = stmt.get(id);

    return result ? (result as unknown as TaskComment) : null;
  }

  /**
   * List comments for a task
   * @param taskId - Task ID
   * @returns Array of comment objects ordered by created_at ASC
   */
  listComments(taskId: number): TaskComment[] {
    const db = this.db;

    const stmt = db.prepare(`
      SELECT * FROM task_comments
      WHERE task_id = ?
      ORDER BY created_at ASC
    `);

    const results = stmt.all(taskId);

    return results as unknown as TaskComment[];
  }

  /**
   * Delete a comment by ID
   * @param id - Comment ID
   * @returns True if deletion succeeded, false if comment not found
   */
  deleteComment(id: number): boolean {
    const db = this.db;

    const stmt = db.prepare(`
      DELETE FROM task_comments
      WHERE id = ?
    `);

    const result = stmt.run(id);

    return result.changes > 0;
  }

  /**
   * Delete all comments for a task
   * @param taskId - Task ID
   * @returns Number of deleted comments
   */
  deleteAllComments(taskId: number): number {
    const db = this.db;

    const stmt = db.prepare(`
      DELETE FROM task_comments
      WHERE task_id = ?
    `);

    const result = stmt.run(taskId);

    return result.changes;
  }

  /**
   * Get all comments for multiple tasks at once
   * Avoids the N+1 problem by fetching all comments in a single query
   * @param taskIds - Array of task IDs
   * @returns Map<task_id, TaskComment[]>
   */
  getCommentsForTasks(taskIds: number[]): Map<number, TaskComment[]> {
    const db = this.db;

    if (taskIds.length === 0) {
      return new Map();
    }

    const placeholders = taskIds.map(() => '?').join(', ');
    const stmt = db.prepare(`
      SELECT * FROM task_comments
      WHERE task_id IN (${placeholders})
      ORDER BY task_id, created_at ASC
    `);

    const results = stmt.all(...taskIds) as unknown as TaskComment[];
    const commentsMap = new Map<number, TaskComment[]>();

    for (const row of results) {
      const taskId = row.task_id;
      if (!commentsMap.has(taskId)) {
        commentsMap.set(taskId, []);
      }
      commentsMap.get(taskId)!.push(row);
    }

    return commentsMap;
  }
}
