export interface TaskMetadata {
  id: number;
  task_id: number;
  key: string;
  value: string;
  created_at: string;
  updated_at: string;
}

/**
 * TaskMetadata creation input type
 *
 * Security constraints:
 * - key: max 50 characters (required)
 * - value: max 500 characters (required)
 */
export interface CreateTaskMetadataInput {
  task_id: number;
  key: string; // max 50 chars
  value: string; // max 500 chars
}

/**
 * TaskMetadata update input type
 *
 * Security constraints:
 * - value: max 500 characters
 */
export interface UpdateTaskMetadataInput {
  value?: string; // max 500 chars
}
