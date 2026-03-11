export interface TaskComment {
  id: number;
  task_id: number;
  author: string | null;
  content: string;
  created_at: string;
  updated_at: string;
}

/**
 * TaskComment creation input type
 *
 * Security constraints:
 * - content: max 5000 characters (required)
 * - author: max 100 characters (optional)
 */
export interface CreateTaskCommentInput {
  task_id: number;
  content: string; // max 5000 chars
  author?: string; // max 100 chars
}
