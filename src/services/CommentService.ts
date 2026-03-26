import { TaskComment, CreateTaskCommentInput } from '../models';
import { getStorageBackend } from '../db/connection';
import { StorageBackend } from '../db/types/repository';
import { validateCommentInput } from '../utils/input-validators';

/**
 * Comment Service
 * Manages creation, retrieval, and deletion of task comments
 */
export class CommentService {
  private backend: StorageBackend;

  constructor(backend?: StorageBackend) {
    this.backend = backend ?? getStorageBackend();
  }

  /**
   * Add a comment to a task
   * @param input - Comment creation input
   * @returns Created comment object
   */
  addComment(input: CreateTaskCommentInput): TaskComment {
    const errors = validateCommentInput(input);
    if (errors.length > 0) {
      throw new Error(errors[0].message);
    }

    const now = new Date().toISOString();
    return this.backend.comments.create({ ...input, created_at: now, updated_at: now });
  }

  /**
   * Get a comment by ID
   * @param id - Comment ID
   * @returns Comment object or null if not found
   */
  getComment(id: number): TaskComment | null {
    return this.backend.comments.findById(id);
  }

  /**
   * List comments for a task
   * @param taskId - Task ID
   * @returns Array of comment objects ordered by created_at ASC
   */
  listComments(taskId: number): TaskComment[] {
    return this.backend.comments.findByTaskId(taskId);
  }

  /**
   * Delete a comment by ID
   * @param id - Comment ID
   * @returns True if deletion succeeded, false if comment not found
   */
  deleteComment(id: number): boolean {
    return this.backend.comments.delete(id);
  }

  /**
   * Update a comment's content
   * @param id - Comment ID
   * @param content - New content
   * @returns Updated comment object or null if not found
   */
  updateComment(id: number, content: string): TaskComment | null {
    const errors = validateCommentInput({ task_id: 0, content });
    if (errors.length > 0) {
      throw new Error(errors[0].message);
    }

    const now = new Date().toISOString();
    return this.backend.comments.update(id, content, now);
  }

  /**
   * Delete all comments for a task
   * @param taskId - Task ID
   * @returns Number of deleted comments
   */
  deleteAllComments(taskId: number): number {
    return this.backend.comments.deleteAllForTask(taskId);
  }

  /**
   * Get all comments for multiple tasks at once
   * Avoids the N+1 problem by fetching all comments in a single query
   * @param taskIds - Array of task IDs
   * @returns Map<task_id, TaskComment[]>
   */
  getCommentsForTasks(taskIds: number[]): Map<number, TaskComment[]> {
    return this.backend.comments.findByTaskIds(taskIds);
  }
}
