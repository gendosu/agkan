import { TaskMetadata, CreateTaskMetadataInput } from '../models';
import { getStorageBackend } from '../db/connection';
import { StorageBackend } from '../db/types/repository';

/**
 * Metadata Service
 * Manages creation, retrieval, update, and deletion of task metadata
 */
export class MetadataService {
  private backend: StorageBackend;

  constructor(backend?: StorageBackend) {
    this.backend = backend ?? getStorageBackend();
  }

  /**
   * Set metadata for a task (create or update)
   * @param input - Metadata creation input
   * @returns Metadata object
   */
  setMetadata(input: CreateTaskMetadataInput): TaskMetadata {
    const now = new Date().toISOString();
    return this.backend.metadata.set({ ...input, created_at: now, updated_at: now });
  }

  /**
   * Get metadata by task ID and key
   * @param taskId - Task ID
   * @param key - Metadata key
   * @returns Metadata object or null if not found
   */
  getMetadataByKey(taskId: number, key: string): TaskMetadata | null {
    return this.backend.metadata.findByKey(taskId, key);
  }

  /**
   * List metadata for a task
   * @param taskId - Task ID
   * @returns Array of metadata objects
   */
  listMetadata(taskId: number): TaskMetadata[] {
    return this.backend.metadata.findByTaskId(taskId);
  }

  /**
   * Delete metadata by task ID and key
   * @param taskId - Task ID
   * @param key - Metadata key
   * @returns True if deletion succeeded, false if metadata not found
   */
  deleteMetadata(taskId: number, key: string): boolean {
    return this.backend.metadata.delete(taskId, key);
  }

  /**
   * Get all metadata for multiple tasks at once
   * Avoids the N+1 problem by fetching all metadata in a single query
   * @returns Map<task_id, TaskMetadata[]>
   */
  getAllTasksMetadata(): Map<number, TaskMetadata[]> {
    return this.backend.metadata.findAllGroupedByTaskId();
  }

  /**
   * Delete all metadata for a task
   * @param taskId - Task ID
   * @returns Number of deleted metadata entries
   */
  deleteAllMetadata(taskId: number): number {
    return this.backend.metadata.deleteAllForTask(taskId);
  }
}
