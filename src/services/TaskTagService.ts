import { TaskTag, CreateTaskTagInput, Tag, Task } from '../models';
import { getStorageBackend } from '../db/connection';
import { TaskService } from './TaskService';
import { TagService } from './TagService';
import { StorageBackend } from '../db/types/repository';

/**
 * Task Tag Service
 * Manages associations between tasks and tags
 */
export class TaskTagService {
  private backend: StorageBackend;
  private taskService: TaskService;
  private tagService: TagService;

  constructor(backend?: StorageBackend, taskService?: TaskService, tagService?: TagService) {
    this.backend = backend ?? getStorageBackend();
    this.taskService = taskService ?? new TaskService(this.backend);
    this.tagService = tagService ?? new TagService(this.backend);
  }

  /**
   * Add tag to task
   * @param input - Task tag creation input
   * @returns Created task tag association
   * @throws Error if task or tag does not exist, or if the association already exists
   */
  addTagToTask(input: CreateTaskTagInput): TaskTag {
    // Check if task exists
    const task = this.taskService.getTask(input.task_id);
    if (!task) {
      throw new Error(`Task with id ${input.task_id} does not exist`);
    }

    // Check if tag exists
    const tag = this.tagService.getTag(input.tag_id);
    if (!tag) {
      throw new Error(`Tag with id ${input.tag_id} does not exist`);
    }

    // Check if the association already exists
    if (this.hasTag(input.task_id, input.tag_id)) {
      throw new Error(`Task ${input.task_id} already has tag ${input.tag_id}`);
    }

    const now = new Date().toISOString();
    return this.backend.taskTags.create({ ...input, created_at: now });
  }

  /**
   * Remove tag from task
   * @param taskId - Task ID
   * @param tagId - Tag ID
   * @returns True if removal was successful, false if association not found
   */
  removeTagFromTask(taskId: number, tagId: number): boolean {
    return this.backend.taskTags.delete(taskId, tagId);
  }

  /**
   * Check if task has a tag
   * @param taskId - Task ID
   * @param tagId - Tag ID
   * @returns True if task has the tag, false otherwise
   */
  hasTag(taskId: number, tagId: number): boolean {
    return this.backend.taskTags.exists(taskId, tagId);
  }

  /**
   * Get tag IDs for a task
   * @param taskId - Task ID
   * @returns Array of tag IDs in order of assignment
   */
  getTagIdsForTask(taskId: number): number[] {
    return this.backend.taskTags.findTagIdsByTaskId(taskId);
  }

  /**
   * Get tag objects for a task
   * @param taskId - Task ID
   * @returns Array of tag objects in order of assignment
   */
  getTagsForTask(taskId: number): Tag[] {
    return this.backend.taskTags.findTagsByTaskId(taskId);
  }

  /**
   * Get task IDs for a tag
   * @param tagId - Tag ID
   * @returns Array of task IDs
   */
  getTaskIdsForTag(tagId: number): number[] {
    return this.backend.taskTags.findTaskIdsByTagId(tagId);
  }

  /**
   * Get task objects for a tag
   * @param tagId - Tag ID
   * @returns Array of task objects
   */
  getTasksForTag(tagId: number): Task[] {
    return this.backend.taskTags.findTasksByTagId(tagId);
  }

  /**
   * Get all task tags at once
   * Avoids the N+1 problem by fetching all task tags in a single query
   * @returns Map<task_id, Tag[]>
   */
  getAllTaskTags(): Map<number, Tag[]> {
    return this.backend.taskTags.findAllGroupedByTaskId();
  }
}
