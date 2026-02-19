/**
 * Validators utility
 * Provides validation functions for CLI input
 */

import { existsSync } from 'fs';
import { TaskStatus } from '../../models';
import { isPathSafe } from '../../utils/security';

/**
 * Validate task status value
 * @param status - The status string to validate
 * @returns true if valid, false otherwise
 */
export function validateTaskStatus(status: string): boolean {
  const validStatuses: TaskStatus[] = ['icebox', 'backlog', 'ready', 'in_progress', 'review', 'done', 'closed'];
  return validStatuses.includes(status as TaskStatus);
}

/**
 * Validate and convert task ID
 * @param id - The ID value to validate (can be string or number)
 * @returns The validated number ID, or null if invalid
 */
export function validateTaskId(id: unknown): number | null {
  if (typeof id === 'number') {
    return isNaN(id) ? null : id;
  }

  if (typeof id === 'string') {
    const parsed = parseInt(id, 10);
    return isNaN(parsed) ? null : parsed;
  }

  return null;
}

/**
 * Validate file existence and path safety
 * @param path - The file path to check
 * @returns true if file exists and path is safe, false otherwise
 */
export function validateFileExists(path: string): boolean {
  if (!isPathSafe(path)) {
    return false;
  }

  return existsSync(path);
}
