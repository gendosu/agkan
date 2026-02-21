import { TaskTag, CreateTaskTagInput, Tag, Task } from '../models';
import { getDatabase } from '../db/connection';
import { TaskService } from './TaskService';
import { TagService } from './TagService';
import { StorageProvider } from '../db/types/storage';

/**
 * Task Tag Service
 * Manages associations between tasks and tags
 */
export class TaskTagService {
  private db: StorageProvider;
  private taskService: TaskService;
  private tagService: TagService;

  constructor(db?: StorageProvider, taskService?: TaskService, tagService?: TagService) {
    this.db = db || getDatabase();
    this.taskService = taskService || new TaskService(this.db);
    this.tagService = tagService || new TagService(this.db);
  }

  /**
   * Add tag to task
   * @param input - Task tag creation input
   * @returns Created task tag association
   * @throws Error if task or tag does not exist, or if the association already exists
   */
  addTagToTask(input: CreateTaskTagInput): TaskTag {
    const db = this.db;

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

    const stmt = db.prepare(`
      INSERT INTO task_tags (task_id, tag_id, created_at)
      VALUES (?, ?, ?)
    `);

    const result = stmt.run(input.task_id, input.tag_id, now);

    const getStmt = db.prepare('SELECT * FROM task_tags WHERE id = ?');
    return getStmt.get(result.lastInsertRowid as number) as unknown as TaskTag;
  }

  /**
   * Remove tag from task
   * @param taskId - Task ID
   * @param tagId - Tag ID
   * @returns True if removal was successful, false if association not found
   */
  removeTagFromTask(taskId: number, tagId: number): boolean {
    const db = this.db;

    const stmt = db.prepare(`
      DELETE FROM task_tags
      WHERE task_id = ? AND tag_id = ?
    `);

    const result = stmt.run(taskId, tagId);

    return result.changes > 0;
  }

  /**
   * Check if task has a tag
   * @param taskId - Task ID
   * @param tagId - Tag ID
   * @returns True if task has the tag, false otherwise
   */
  hasTag(taskId: number, tagId: number): boolean {
    const db = this.db;

    const stmt = db.prepare(`
      SELECT COUNT(*) as count FROM task_tags
      WHERE task_id = ? AND tag_id = ?
    `);

    const result = stmt.get(taskId, tagId) as { count: number };
    return result.count > 0;
  }

  /**
   * Get tag IDs for a task
   * @param taskId - Task ID
   * @returns Array of tag IDs in order of assignment
   */
  getTagIdsForTask(taskId: number): number[] {
    const db = this.db;

    const stmt = db.prepare(`
      SELECT tag_id FROM task_tags
      WHERE task_id = ?
      ORDER BY created_at ASC
    `);

    const results = stmt.all(taskId) as Array<{ tag_id: number }>;
    return results.map((row) => row.tag_id);
  }

  /**
   * Get tag objects for a task
   * @param taskId - Task ID
   * @returns Array of tag objects in order of assignment
   */
  getTagsForTask(taskId: number): Tag[] {
    const db = this.db;

    const stmt = db.prepare(`
      SELECT t.*
      FROM tags t
      INNER JOIN task_tags tt ON t.id = tt.tag_id
      WHERE tt.task_id = ?
      ORDER BY tt.created_at ASC
    `);

    return stmt.all(taskId) as unknown as Tag[];
  }

  /**
   * Get task IDs for a tag
   * @param tagId - Tag ID
   * @returns Array of task IDs
   */
  getTaskIdsForTag(tagId: number): number[] {
    const db = this.db;

    const stmt = db.prepare(`
      SELECT task_id FROM task_tags
      WHERE tag_id = ?
      ORDER BY created_at ASC
    `);

    const results = stmt.all(tagId) as Array<{ task_id: number }>;
    return results.map((row) => row.task_id);
  }

  /**
   * Get task objects for a tag
   * @param tagId - Tag ID
   * @returns Array of task objects
   */
  getTasksForTag(tagId: number): Task[] {
    const db = this.db;

    const stmt = db.prepare(`
      SELECT t.*
      FROM tasks t
      INNER JOIN task_tags tt ON t.id = tt.task_id
      WHERE tt.tag_id = ?
      ORDER BY tt.created_at ASC
    `);

    return stmt.all(tagId) as unknown as Task[];
  }

  /**
   * Get all task tags at once
   * Avoids the N+1 problem by fetching all task tags in a single query
   * @returns Map<task_id, Tag[]>
   */
  getAllTaskTags(): Map<number, Tag[]> {
    const db = this.db;

    const stmt = db.prepare(`
      SELECT tt.task_id, t.*
      FROM tags t
      INNER JOIN task_tags tt ON t.id = tt.tag_id
      ORDER BY tt.task_id, tt.created_at ASC
    `);

    const results = stmt.all() as unknown as Array<{ task_id: number } & Tag>;

    const taskTagsMap = new Map<number, Tag[]>();

    for (const row of results) {
      const taskId = row.task_id;
      const tag: Tag = {
        id: row.id,
        name: row.name,
        created_at: row.created_at,
      };

      if (!taskTagsMap.has(taskId)) {
        taskTagsMap.set(taskId, []);
      }
      taskTagsMap.get(taskId)!.push(tag);
    }

    return taskTagsMap;
  }
}
