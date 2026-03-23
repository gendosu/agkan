import { getDatabase } from '../db/connection';
import { StorageProvider } from '../db/types/storage';
import { TaskService } from './TaskService';
import { TagService } from './TagService';
import { TaskTagService } from './TaskTagService';
import { MetadataService } from './MetadataService';
import { CommentService } from './CommentService';
import { TaskBlockService } from './TaskBlockService';

export interface ExportedComment {
  author: string | null;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface ExportedTask {
  id: number;
  title: string;
  body: string | null;
  author: string | null;
  assignees: string | null;
  status: string;
  parent_id: number | null;
  created_at: string;
  updated_at: string;
  tags: string[];
  metadata: Record<string, string>;
  comments: ExportedComment[];
  blocked_by: number[];
}

export interface ExportData {
  version: string;
  exported_at: string;
  tasks: ExportedTask[];
}

export interface ImportResult {
  importedCount: number;
  idMapping: Map<number, number>;
}

/**
 * Export/Import Service
 * Handles JSON bulk export and import of tasks with all related data
 */
export class ExportImportService {
  private db: StorageProvider;
  private taskService: TaskService;
  private tagService: TagService;
  private taskTagService: TaskTagService;
  private metadataService: MetadataService;
  private commentService: CommentService;
  private taskBlockService: TaskBlockService;

  constructor(db?: StorageProvider) {
    this.db = db || getDatabase();
    this.taskService = new TaskService(this.db);
    this.tagService = new TagService(this.db);
    this.taskTagService = new TaskTagService(this.db);
    this.metadataService = new MetadataService(this.db);
    this.commentService = new CommentService(this.db);
    this.taskBlockService = new TaskBlockService(this.db);
  }

  /**
   * Build a map from task_id to list of blocker task IDs
   */
  private buildBlockedByMap(): Map<number, number[]> {
    const blockedByMap = new Map<number, number[]>();
    for (const block of this.taskBlockService.getAllBlocks()) {
      const blockedId = block.blocked_task_id;
      if (!blockedByMap.has(blockedId)) {
        blockedByMap.set(blockedId, []);
      }
      blockedByMap.get(blockedId)!.push(block.blocker_task_id);
    }
    return blockedByMap;
  }

  /**
   * Export all tasks with related data as JSON
   * @returns Export data object with version, timestamp, and tasks
   */
  exportData(): ExportData {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { version } = require('../../package.json') as { version: string };
    const tasks = this.taskService.listTasks({}, 'id', 'asc');
    const allTaskTags = this.taskTagService.getAllTaskTags();
    const allMetadata = this.metadataService.getAllTasksMetadata();
    const allComments = this.commentService.getCommentsForTasks(tasks.map((t) => t.id));
    const blockedByMap = this.buildBlockedByMap();

    const exportedTasks: ExportedTask[] = tasks.map((task) => {
      const tags = (allTaskTags.get(task.id) || []).map((tag) => tag.name);
      const metadataList = allMetadata.get(task.id) || [];
      const metadata: Record<string, string> = {};
      for (const m of metadataList) {
        metadata[m.key] = m.value;
      }
      const comments: ExportedComment[] = (allComments.get(task.id) || []).map((c) => ({
        author: c.author,
        content: c.content,
        created_at: c.created_at,
        updated_at: c.updated_at,
      }));
      return {
        id: task.id,
        title: task.title,
        body: task.body,
        author: task.author,
        assignees: task.assignees,
        status: task.status,
        parent_id: task.parent_id,
        created_at: task.created_at,
        updated_at: task.updated_at,
        tags,
        metadata,
        comments,
        blocked_by: blockedByMap.get(task.id) || [],
      };
    });

    return {
      version,
      exported_at: new Date().toISOString(),
      tasks: exportedTasks,
    };
  }

  /**
   * Import a single task and restore its timestamps
   */
  private importTask(exportedTask: ExportedTask, idMapping: Map<number, number>): number {
    const newParentId = exportedTask.parent_id !== null ? (idMapping.get(exportedTask.parent_id) ?? null) : null;

    const newTask = this.taskService.createTask({
      title: exportedTask.title,
      body: exportedTask.body || undefined,
      author: exportedTask.author || undefined,
      assignees: exportedTask.assignees || undefined,
      status: exportedTask.status as Parameters<TaskService['createTask']>[0]['status'],
      parent_id: newParentId,
    });

    // Restore original timestamps via direct UPDATE
    this.db
      .prepare('UPDATE tasks SET created_at = ?, updated_at = ? WHERE id = ?')
      .run(exportedTask.created_at, exportedTask.updated_at, newTask.id);

    return newTask.id;
  }

  /**
   * Add tags to a task, creating tags that don't yet exist
   */
  private importTaskTags(taskId: number, tagNames: string[]): void {
    for (const tagName of tagNames) {
      let tag = this.tagService.getTagByName(tagName);
      if (!tag) {
        tag = this.tagService.createTag({ name: tagName });
      }
      try {
        this.taskTagService.addTagToTask({ task_id: taskId, tag_id: tag.id });
      } catch {
        // Tag already attached, skip
      }
    }
  }

  /**
   * Add comments to a task, restoring original timestamps
   */
  private importTaskComments(taskId: number, comments: ExportedComment[]): void {
    for (const comment of comments) {
      const newComment = this.commentService.addComment({
        task_id: taskId,
        author: comment.author || undefined,
        content: comment.content,
      });
      this.db
        .prepare('UPDATE task_comments SET created_at = ?, updated_at = ? WHERE id = ?')
        .run(comment.created_at, comment.updated_at, newComment.id);
    }
  }

  /**
   * Create block relationships for all tasks using remapped IDs
   */
  private importBlockRelationships(tasks: ExportedTask[], idMapping: Map<number, number>): void {
    for (const exportedTask of tasks) {
      const newTaskId = idMapping.get(exportedTask.id);
      if (newTaskId === undefined) continue;

      for (const oldBlockerId of exportedTask.blocked_by) {
        const newBlockerId = idMapping.get(oldBlockerId);
        if (newBlockerId === undefined) continue;
        try {
          this.taskBlockService.addBlock({
            blocker_task_id: newBlockerId,
            blocked_task_id: newTaskId,
          });
        } catch {
          // Skip if circular or already exists
        }
      }
    }
  }

  /**
   * Import tasks from exported JSON data
   * Resolves parent_id and blocked_by using old->new ID mapping
   * Preserves original created_at/updated_at timestamps
   * Auto-creates tags if not found by name
   * @param data - Export data to import
   * @returns Import result with count and ID mapping
   */
  importData(data: ExportData): ImportResult {
    const idMapping = new Map<number, number>();
    const sortedTasks = this.sortTasksByParent(data.tasks);

    for (const exportedTask of sortedTasks) {
      const newTaskId = this.importTask(exportedTask, idMapping);
      idMapping.set(exportedTask.id, newTaskId);

      this.importTaskTags(newTaskId, exportedTask.tags);

      for (const [key, value] of Object.entries(exportedTask.metadata)) {
        this.metadataService.setMetadata({ task_id: newTaskId, key, value });
      }

      this.importTaskComments(newTaskId, exportedTask.comments);
    }

    this.importBlockRelationships(data.tasks, idMapping);

    return {
      importedCount: sortedTasks.length,
      idMapping,
    };
  }

  /**
   * Sort tasks so parents come before children (topological sort)
   */
  private sortTasksByParent(tasks: ExportedTask[]): ExportedTask[] {
    const taskMap = new Map<number, ExportedTask>();
    for (const task of tasks) {
      taskMap.set(task.id, task);
    }

    const sorted: ExportedTask[] = [];
    const visited = new Set<number>();

    const visit = (task: ExportedTask): void => {
      if (visited.has(task.id)) return;
      visited.add(task.id);

      if (task.parent_id !== null) {
        const parent = taskMap.get(task.parent_id);
        if (parent) visit(parent);
      }

      sorted.push(task);
    };

    for (const task of tasks) {
      visit(task);
    }

    return sorted;
  }
}
