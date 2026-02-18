import { TaskMetadata, CreateTaskMetadataInput } from '../models';
import { getDatabase } from '../db/connection';
import Database from 'better-sqlite3';

/**
 * Metadata Service
 * Manages creation, retrieval, update, and deletion of task metadata
 */
export class MetadataService {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db || getDatabase();
  }

  /**
   * Set metadata for a task (create or update)
   * @param input - Metadata creation input
   * @returns Metadata object
   */
  setMetadata(input: CreateTaskMetadataInput): TaskMetadata {
    const db = this.db;

    // Check if metadata already exists
    const existing = this.getMetadataByKey(input.task_id, input.key);

    const now = new Date().toISOString();

    if (existing) {
      // Update existing metadata
      const stmt = db.prepare(`
        UPDATE task_metadata
        SET value = ?, updated_at = ?
        WHERE task_id = ? AND key = ?
      `);

      stmt.run(input.value, now, input.task_id, input.key);

      return this.getMetadataByKey(input.task_id, input.key)!;
    } else {
      // Create new metadata
      const stmt = db.prepare(`
        INSERT INTO task_metadata (task_id, key, value, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `);

      stmt.run(input.task_id, input.key, input.value, now, now);

      return this.getMetadataByKey(input.task_id, input.key)!;
    }
  }

  /**
   * Get metadata by task ID and key
   * @param taskId - Task ID
   * @param key - Metadata key
   * @returns Metadata object or null if not found
   */
  getMetadataByKey(taskId: number, key: string): TaskMetadata | null {
    const db = this.db;

    const stmt = db.prepare(`
      SELECT * FROM task_metadata
      WHERE task_id = ? AND key = ?
    `);

    const result = stmt.get(taskId, key);

    return result ? (result as TaskMetadata) : null;
  }

  /**
   * List metadata for a task
   * @param taskId - Task ID
   * @returns Array of metadata objects
   */
  listMetadata(taskId: number): TaskMetadata[] {
    const db = this.db;

    const stmt = db.prepare(`
      SELECT * FROM task_metadata
      WHERE task_id = ?
      ORDER BY created_at DESC
    `);

    const results = stmt.all(taskId);

    return results as TaskMetadata[];
  }

  /**
   * Delete metadata by task ID and key
   * @param taskId - Task ID
   * @param key - Metadata key
   * @returns True if deletion succeeded, false if metadata not found
   */
  deleteMetadata(taskId: number, key: string): boolean {
    const db = this.db;

    const stmt = db.prepare(`
      DELETE FROM task_metadata
      WHERE task_id = ? AND key = ?
    `);

    const result = stmt.run(taskId, key);

    return result.changes > 0;
  }

  /**
   * Get all metadata for multiple tasks at once
   * Avoids the N+1 problem by fetching all metadata in a single query
   * @returns Map<task_id, TaskMetadata[]>
   */
  getAllTasksMetadata(): Map<number, TaskMetadata[]> {
    const db = this.db;

    const stmt = db.prepare(`
      SELECT * FROM task_metadata
      ORDER BY task_id, created_at DESC
    `);

    const results = stmt.all() as TaskMetadata[];
    const metadataMap = new Map<number, TaskMetadata[]>();

    for (const row of results) {
      const taskId = row.task_id;
      if (!metadataMap.has(taskId)) {
        metadataMap.set(taskId, []);
      }
      metadataMap.get(taskId)!.push(row);
    }

    return metadataMap;
  }

  /**
   * Delete all metadata for a task
   * @param taskId - Task ID
   * @returns Number of deleted metadata entries
   */
  deleteAllMetadata(taskId: number): number {
    const db = this.db;

    const stmt = db.prepare(`
      DELETE FROM task_metadata
      WHERE task_id = ?
    `);

    const result = stmt.run(taskId);

    return result.changes;
  }
}
