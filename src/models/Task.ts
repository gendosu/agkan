/**
 * Task model
 * Type definitions and status management for tasks
 */

/**
 * Task status type
 */
export type TaskStatus = 'backlog' | 'ready' | 'in_progress' | 'review' | 'done' | 'closed';

/**
 * Complete task type definition
 * Represents a task retrieved from the database
 */
export interface Task {
  id: number;
  title: string;
  body: string | null;
  author: string | null;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
  parent_id: number | null;
}

/**
 * Task creation input type
 * Excludes id, created_at, and updated_at as they are auto-generated
 *
 * Security constraints:
 * - title: max 200 characters (required)
 * - body: max 10000 characters (optional)
 * - author: max 100 characters (optional)
 */
export interface CreateTaskInput {
  title: string; // max 200 chars
  body?: string; // max 10000 chars
  author?: string; // max 100 chars
  status?: TaskStatus;
  parent_id?: number | null;
}

/**
 * Task update input type
 * All fields are optional to support partial updates
 *
 * Security constraints:
 * - title: max 200 characters
 * - body: max 10000 characters
 * - author: max 100 characters
 */
export interface UpdateTaskInput {
  title?: string; // max 200 chars
  body?: string; // max 10000 chars
  author?: string; // max 100 chars
  status?: TaskStatus;
  parent_id?: number | null;
}
