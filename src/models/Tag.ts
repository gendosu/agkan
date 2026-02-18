export interface Tag {
  id: number;
  name: string;
  created_at: string;
}

/**
 * Tag creation input type
 *
 * Security constraints:
 * - name: max 50 characters (required)
 */
export interface CreateTagInput {
  name: string; // max 50 chars
}

/**
 * Tag update input type
 *
 * Security constraints:
 * - name: max 50 characters
 */
export interface UpdateTagInput {
  name?: string; // max 50 chars
}
