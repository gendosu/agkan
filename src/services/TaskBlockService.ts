import { TaskBlock, CreateTaskBlockInput } from '../models';
import { getStorageBackend } from '../db/connection';
import { TaskService } from './TaskService';
import { StorageBackend } from '../db/types/repository';

/**
 * Task Block Service
 * Manages blocking relationships between tasks
 */
export class TaskBlockService {
  private backend: StorageBackend;
  private taskService: TaskService;

  constructor(backend?: StorageBackend, taskService?: TaskService) {
    this.backend = backend ?? getStorageBackend();
    this.taskService = taskService ?? new TaskService(this.backend);
  }

  /**
   * Add a blocking relationship between tasks
   * @param input - Creation input for the blocking relationship
   * @returns Created blocking relationship
   * @throws Error if tasks do not exist, self-reference is detected, or circular reference would be created
   */
  addBlock(input: CreateTaskBlockInput): TaskBlock {
    // Check for self-reference: prevent a task from blocking itself
    if (input.blocker_task_id === input.blocked_task_id) {
      throw new Error('Task cannot block itself');
    }

    // Verify both tasks exist in the database
    const blockerTask = this.taskService.getTask(input.blocker_task_id);
    if (!blockerTask) {
      throw new Error(`Blocker task with id ${input.blocker_task_id} does not exist`);
    }

    const blockedTask = this.taskService.getTask(input.blocked_task_id);
    if (!blockedTask) {
      throw new Error(`Blocked task with id ${input.blocked_task_id} does not exist`);
    }

    // Check for circular reference: ensure new blocking relationship doesn't create a cycle
    if (this.wouldCreateBlockCycle(input.blocker_task_id, input.blocked_task_id)) {
      throw new Error(
        `Cannot create block relationship: would create circular dependency between tasks ${input.blocker_task_id} and ${input.blocked_task_id}`
      );
    }

    const now = new Date().toISOString();
    return this.backend.blocks.create({ ...input, created_at: now });
  }

  /**
   * Remove a blocking relationship between tasks
   * @param blockerId - ID of the blocking task
   * @param blockedId - ID of the blocked task
   * @returns True if removal was successful, false if relationship was not found
   */
  removeBlock(blockerId: number, blockedId: number): boolean {
    return this.backend.blocks.delete(blockerId, blockedId);
  }

  /**
   * Get IDs of tasks blocked by the specified task
   * Returns a list of IDs for tasks that are blocked by the given blocker task
   * @param blockerId - ID of the blocking task
   * @returns Array of IDs for tasks blocked by this task
   */
  getBlockedTaskIds(blockerId: number): number[] {
    return this.backend.blocks.findBlockedTaskIds(blockerId);
  }

  /**
   * Get IDs of tasks blocking the specified task
   * Returns a list of IDs for tasks that block the given task
   * @param blockedId - ID of the blocked task
   * @returns Array of IDs for blocking tasks
   */
  getBlockerTaskIds(blockedId: number): number[] {
    return this.backend.blocks.findBlockerTaskIds(blockedId);
  }

  /**
   * Get all blocking relationships
   * Returns all block records for efficient bulk operations
   * @returns Array of all blocking relationships
   */
  getAllBlocks(): Array<{ blocker_task_id: number; blocked_task_id: number }> {
    return this.backend.blocks.findAll();
  }

  /**
   * Check for circular references in blocking relationships (private method)
   * Detects whether adding a new blocking relationship would create a cycle using BFS algorithm
   * @param blockerId - ID of the blocking task
   * @param blockedId - ID of the blocked task
   * @returns True if a circular reference would be created, false otherwise
   */
  private wouldCreateBlockCycle(blockerId: number, blockedId: number): boolean {
    const visited = new Set<number>();
    const queue: number[] = [blockedId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      if (current === blockerId) return true;

      const blockedByCurrentIds = this.getBlockedTaskIds(current);
      queue.push(...blockedByCurrentIds);
    }

    return false;
  }
}
