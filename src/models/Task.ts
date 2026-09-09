/**
 * Task model
 * Type definitions and status management for tasks
 */

import type { Priority } from './Priority';

/**
 * Marker value indicating that a git branch name should be auto-generated at runtime
 */
export const BRANCH_AUTO_GENERATE = '<auto-generate>';

/**
 * Task status type
 */
export type TaskStatus = 'icebox' | 'backlog' | 'ready' | 'in_progress' | 'review' | 'done' | 'closed';

/**
 * Complete task type definition
 * Represents a task retrieved from the database
 */
export interface Task {
  id: number;
  title: string;
  body: string | null;
  author: string | null;
  assignees: string | null;
  status: TaskStatus;
  priority: Priority | null;
  created_at: string;
  updated_at: string;
  parent_id: number | null;
  is_archived: 0 | 1;
  branch: string | null;
  /** Claude model alias used for planning runs of this task (null = fall back to config) */
  model_planning: string | null;
  /** Claude model alias used for pr/run runs of this task (null = fall back to config) */
  model_run: string | null;
  /** Reasoning effort used for planning runs of this task (null = fall back to config) */
  effort_planning: string | null;
  /** Reasoning effort used for pr/run runs of this task (null = fall back to config) */
  effort_run: string | null;
}

/**
 * Task creation input type
 * Excludes id, created_at, and updated_at as they are auto-generated
 *
 * Security constraints:
 * - title: max MAX_TITLE_LENGTH characters (required)
 * - body: max MAX_BODY_LENGTH characters (optional)
 * - author: max MAX_AUTHOR_LENGTH characters (optional)
 * - assignees: max MAX_ASSIGNEES_LENGTH characters (optional, CSV format)
 */
export interface CreateTaskInput {
  title: string; // max MAX_TITLE_LENGTH chars
  body?: string; // max MAX_BODY_LENGTH chars
  author?: string; // max MAX_AUTHOR_LENGTH chars
  assignees?: string; // max MAX_ASSIGNEES_LENGTH chars, CSV format
  status?: TaskStatus;
  priority?: Priority | null;
  parent_id?: number | null;
  branch?: string | null;
  model_planning?: string | null;
  model_run?: string | null;
  effort_planning?: string | null;
  effort_run?: string | null;
  /** Optional tag IDs to attach atomically with task creation */
  tagIds?: number[];
}

/**
 * Task update input type
 * All fields are optional to support partial updates
 *
 * Security constraints:
 * - title: max MAX_TITLE_LENGTH characters
 * - body: max MAX_BODY_LENGTH characters
 * - author: max MAX_AUTHOR_LENGTH characters
 * - assignees: max MAX_ASSIGNEES_LENGTH characters (CSV format)
 */
export interface UpdateTaskInput {
  title?: string; // max MAX_TITLE_LENGTH chars
  body?: string; // max MAX_BODY_LENGTH chars
  author?: string; // max MAX_AUTHOR_LENGTH chars
  assignees?: string; // max MAX_ASSIGNEES_LENGTH chars, CSV format
  status?: TaskStatus;
  priority?: Priority | null;
  parent_id?: number | null;
  branch?: string | null;
  model_planning?: string | null;
  model_run?: string | null;
  effort_planning?: string | null;
  effort_run?: string | null;
}
