/**
 * Tests for ExportImportService
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ExportImportService, ExportData } from '../../src/services/ExportImportService';
import { TaskService } from '../../src/services/TaskService';
import { TagService } from '../../src/services/TagService';
import { TaskTagService } from '../../src/services/TaskTagService';
import { MetadataService } from '../../src/services/MetadataService';
import { CommentService } from '../../src/services/CommentService';
import { TaskBlockService } from '../../src/services/TaskBlockService';
import { resetDatabase } from '../../src/db/reset';
import { getDatabase } from '../../src/db/connection';

describe('ExportImportService', () => {
  let service: ExportImportService;
  let taskService: TaskService;
  let tagService: TagService;
  let taskTagService: TaskTagService;
  let metadataService: MetadataService;
  let commentService: CommentService;
  let taskBlockService: TaskBlockService;

  beforeEach(() => {
    resetDatabase();
    const db = getDatabase();
    service = new ExportImportService(db);
    taskService = new TaskService(db);
    tagService = new TagService(db);
    taskTagService = new TaskTagService(db);
    metadataService = new MetadataService(db);
    commentService = new CommentService(db);
    taskBlockService = new TaskBlockService(db);
  });

  describe('exportData', () => {
    it('should export empty tasks list', () => {
      const data = service.exportData();

      expect(data.version).toBeDefined();
      expect(typeof data.version).toBe('string');
      expect(data.exported_at).toBeDefined();
      expect(Array.isArray(data.tasks)).toBe(true);
      expect(data.tasks).toHaveLength(0);
    });

    it('should export a task with all fields', () => {
      const task = taskService.createTask({
        title: 'Test Task',
        body: 'Test body',
        author: 'alice',
        assignees: 'bob,carol',
        status: 'ready',
      });

      const data = service.exportData();
      expect(data.tasks).toHaveLength(1);

      const exported = data.tasks[0];
      expect(exported.id).toBe(task.id);
      expect(exported.title).toBe('Test Task');
      expect(exported.body).toBe('Test body');
      expect(exported.author).toBe('alice');
      expect(exported.assignees).toBe('bob,carol');
      expect(exported.status).toBe('ready');
      expect(exported.parent_id).toBeNull();
      expect(exported.created_at).toBeDefined();
      expect(exported.updated_at).toBeDefined();
      expect(Array.isArray(exported.tags)).toBe(true);
      expect(exported.tags).toHaveLength(0);
      expect(exported.metadata).toEqual({});
      expect(Array.isArray(exported.comments)).toBe(true);
      expect(exported.comments).toHaveLength(0);
      expect(Array.isArray(exported.blocked_by)).toBe(true);
      expect(exported.blocked_by).toHaveLength(0);
    });

    it('should export task tags as names', () => {
      const task = taskService.createTask({ title: 'Tagged Task' });
      const tag1 = tagService.createTag({ name: 'bug' });
      const tag2 = tagService.createTag({ name: 'feature' });
      taskTagService.addTagToTask({ task_id: task.id, tag_id: tag1.id });
      taskTagService.addTagToTask({ task_id: task.id, tag_id: tag2.id });

      const data = service.exportData();
      expect(data.tasks[0].tags).toContain('bug');
      expect(data.tasks[0].tags).toContain('feature');
    });

    it('should export task metadata', () => {
      const task = taskService.createTask({ title: 'Meta Task' });
      metadataService.setMetadata({ task_id: task.id, key: 'priority', value: 'high' });
      metadataService.setMetadata({ task_id: task.id, key: 'sprint', value: '3' });

      const data = service.exportData();
      expect(data.tasks[0].metadata).toEqual({ priority: 'high', sprint: '3' });
    });

    it('should export task comments', () => {
      const task = taskService.createTask({ title: 'Comment Task' });
      commentService.addComment({ task_id: task.id, content: 'First comment', author: 'alice' });
      commentService.addComment({ task_id: task.id, content: 'Second comment' });

      const data = service.exportData();
      expect(data.tasks[0].comments).toHaveLength(2);
      expect(data.tasks[0].comments[0].content).toBe('First comment');
      expect(data.tasks[0].comments[0].author).toBe('alice');
      expect(data.tasks[0].comments[1].content).toBe('Second comment');
      expect(data.tasks[0].comments[1].author).toBeNull();
    });

    it('should export blocked_by relationships', () => {
      const task1 = taskService.createTask({ title: 'Task 1' });
      const task2 = taskService.createTask({ title: 'Task 2' });
      const task3 = taskService.createTask({ title: 'Task 3' });
      // task3 is blocked by task1 and task2
      taskBlockService.addBlock({ blocker_task_id: task1.id, blocked_task_id: task3.id });
      taskBlockService.addBlock({ blocker_task_id: task2.id, blocked_task_id: task3.id });

      const data = service.exportData();
      const exportedTask3 = data.tasks.find((t) => t.id === task3.id);
      expect(exportedTask3?.blocked_by).toContain(task1.id);
      expect(exportedTask3?.blocked_by).toContain(task2.id);
    });

    it('should export parent_id', () => {
      const parent = taskService.createTask({ title: 'Parent' });
      const child = taskService.createTask({ title: 'Child', parent_id: parent.id });

      const data = service.exportData();
      const exportedChild = data.tasks.find((t) => t.id === child.id);
      expect(exportedChild?.parent_id).toBe(parent.id);
    });

    it('should include version from package.json', () => {
      const data = service.exportData();
      // Version should follow semver pattern
      expect(data.version).toMatch(/^\d+\.\d+\.\d+/);
    });

    it('should include exported_at timestamp', () => {
      const before = new Date().toISOString();
      const data = service.exportData();
      const after = new Date().toISOString();

      expect(data.exported_at >= before).toBe(true);
      expect(data.exported_at <= after).toBe(true);
    });
  });

  describe('importData', () => {
    it('should import tasks from export data', () => {
      const exportData: ExportData = {
        version: '1.0.0',
        exported_at: '2026-01-01T00:00:00.000Z',
        tasks: [
          {
            id: 100,
            title: 'Imported Task',
            body: 'Task body',
            author: 'alice',
            assignees: 'bob',
            status: 'ready',
            parent_id: null,
            created_at: '2026-01-01T10:00:00.000Z',
            updated_at: '2026-01-02T10:00:00.000Z',
            tags: [],
            metadata: {},
            comments: [],
            blocked_by: [],
          },
        ],
      };

      const result = service.importData(exportData);
      expect(result.importedCount).toBe(1);

      const tasks = taskService.listTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('Imported Task');
      expect(tasks[0].body).toBe('Task body');
      expect(tasks[0].author).toBe('alice');
      expect(tasks[0].assignees).toBe('bob');
      expect(tasks[0].status).toBe('ready');
    });

    it('should preserve original timestamps on import', () => {
      const exportData: ExportData = {
        version: '1.0.0',
        exported_at: '2026-01-01T00:00:00.000Z',
        tasks: [
          {
            id: 100,
            title: 'Timestamped Task',
            body: null,
            author: null,
            assignees: null,
            status: 'backlog',
            parent_id: null,
            created_at: '2025-06-01T10:00:00.000Z',
            updated_at: '2025-06-15T12:00:00.000Z',
            tags: [],
            metadata: {},
            comments: [],
            blocked_by: [],
          },
        ],
      };

      service.importData(exportData);

      const tasks = taskService.listTasks();
      expect(tasks[0].created_at).toBe('2025-06-01T10:00:00.000Z');
      expect(tasks[0].updated_at).toBe('2025-06-15T12:00:00.000Z');
    });

    it('should remap old IDs to new IDs', () => {
      const exportData: ExportData = {
        version: '1.0.0',
        exported_at: '2026-01-01T00:00:00.000Z',
        tasks: [
          {
            id: 999,
            title: 'Task 999',
            body: null,
            author: null,
            assignees: null,
            status: 'backlog',
            parent_id: null,
            created_at: '2026-01-01T10:00:00.000Z',
            updated_at: '2026-01-01T10:00:00.000Z',
            tags: [],
            metadata: {},
            comments: [],
            blocked_by: [],
          },
        ],
      };

      const result = service.importData(exportData);
      expect(result.idMapping.has(999)).toBe(true);
      const newId = result.idMapping.get(999)!;
      expect(newId).toBeGreaterThan(0);
      expect(newId).not.toBe(999);
    });

    it('should import tags, creating new ones if not found', () => {
      const existingTag = tagService.createTag({ name: 'existing-tag' });

      const exportData: ExportData = {
        version: '1.0.0',
        exported_at: '2026-01-01T00:00:00.000Z',
        tasks: [
          {
            id: 1,
            title: 'Tagged Task',
            body: null,
            author: null,
            assignees: null,
            status: 'backlog',
            parent_id: null,
            created_at: '2026-01-01T10:00:00.000Z',
            updated_at: '2026-01-01T10:00:00.000Z',
            tags: ['existing-tag', 'new-tag'],
            metadata: {},
            comments: [],
            blocked_by: [],
          },
        ],
      };

      service.importData(exportData);

      const tasks = taskService.listTasks();
      const importedTask = tasks[0];
      const tags = taskTagService.getTagsForTask(importedTask.id);

      expect(tags.map((t) => t.name)).toContain('existing-tag');
      expect(tags.map((t) => t.name)).toContain('new-tag');

      // Existing tag should be reused (same id)
      const existingTagAfter = tagService.getTagByName('existing-tag');
      expect(existingTagAfter?.id).toBe(existingTag.id);
    });

    it('should import metadata', () => {
      const exportData: ExportData = {
        version: '1.0.0',
        exported_at: '2026-01-01T00:00:00.000Z',
        tasks: [
          {
            id: 1,
            title: 'Meta Task',
            body: null,
            author: null,
            assignees: null,
            status: 'backlog',
            parent_id: null,
            created_at: '2026-01-01T10:00:00.000Z',
            updated_at: '2026-01-01T10:00:00.000Z',
            tags: [],
            metadata: { priority: 'high', sprint: '5' },
            comments: [],
            blocked_by: [],
          },
        ],
      };

      service.importData(exportData);

      const tasks = taskService.listTasks();
      const metadata = metadataService.listMetadata(tasks[0].id);

      const metaMap: Record<string, string> = {};
      for (const m of metadata) {
        metaMap[m.key] = m.value;
      }
      expect(metaMap['priority']).toBe('high');
      expect(metaMap['sprint']).toBe('5');
    });

    it('should import comments with preserved timestamps', () => {
      const exportData: ExportData = {
        version: '1.0.0',
        exported_at: '2026-01-01T00:00:00.000Z',
        tasks: [
          {
            id: 1,
            title: 'Comment Task',
            body: null,
            author: null,
            assignees: null,
            status: 'backlog',
            parent_id: null,
            created_at: '2026-01-01T10:00:00.000Z',
            updated_at: '2026-01-01T10:00:00.000Z',
            tags: [],
            metadata: {},
            comments: [
              {
                author: 'alice',
                content: 'Original comment',
                created_at: '2025-06-01T09:00:00.000Z',
                updated_at: '2025-06-01T09:00:00.000Z',
              },
            ],
            blocked_by: [],
          },
        ],
      };

      service.importData(exportData);

      const tasks = taskService.listTasks();
      const comments = commentService.listComments(tasks[0].id);

      expect(comments).toHaveLength(1);
      expect(comments[0].author).toBe('alice');
      expect(comments[0].content).toBe('Original comment');
      expect(comments[0].created_at).toBe('2025-06-01T09:00:00.000Z');
      expect(comments[0].updated_at).toBe('2025-06-01T09:00:00.000Z');
    });

    it('should resolve parent_id using ID mapping', () => {
      const exportData: ExportData = {
        version: '1.0.0',
        exported_at: '2026-01-01T00:00:00.000Z',
        tasks: [
          {
            id: 10,
            title: 'Parent Task',
            body: null,
            author: null,
            assignees: null,
            status: 'backlog',
            parent_id: null,
            created_at: '2026-01-01T10:00:00.000Z',
            updated_at: '2026-01-01T10:00:00.000Z',
            tags: [],
            metadata: {},
            comments: [],
            blocked_by: [],
          },
          {
            id: 20,
            title: 'Child Task',
            body: null,
            author: null,
            assignees: null,
            status: 'backlog',
            parent_id: 10,
            created_at: '2026-01-01T11:00:00.000Z',
            updated_at: '2026-01-01T11:00:00.000Z',
            tags: [],
            metadata: {},
            comments: [],
            blocked_by: [],
          },
        ],
      };

      const result = service.importData(exportData);

      const tasks = taskService.listTasks({}, 'id', 'asc');
      const parentTask = tasks.find((t) => t.title === 'Parent Task')!;
      const childTask = tasks.find((t) => t.title === 'Child Task')!;

      expect(childTask.parent_id).toBe(parentTask.id);

      // Verify ID mapping
      expect(result.idMapping.get(10)).toBe(parentTask.id);
      expect(result.idMapping.get(20)).toBe(childTask.id);
    });

    it('should resolve blocked_by using ID mapping', () => {
      const exportData: ExportData = {
        version: '1.0.0',
        exported_at: '2026-01-01T00:00:00.000Z',
        tasks: [
          {
            id: 1,
            title: 'Blocker Task',
            body: null,
            author: null,
            assignees: null,
            status: 'backlog',
            parent_id: null,
            created_at: '2026-01-01T10:00:00.000Z',
            updated_at: '2026-01-01T10:00:00.000Z',
            tags: [],
            metadata: {},
            comments: [],
            blocked_by: [],
          },
          {
            id: 2,
            title: 'Blocked Task',
            body: null,
            author: null,
            assignees: null,
            status: 'backlog',
            parent_id: null,
            created_at: '2026-01-01T11:00:00.000Z',
            updated_at: '2026-01-01T11:00:00.000Z',
            tags: [],
            metadata: {},
            comments: [],
            blocked_by: [1],
          },
        ],
      };

      const result = service.importData(exportData);

      const blockerNewId = result.idMapping.get(1)!;
      const blockedNewId = result.idMapping.get(2)!;

      const blockers = taskBlockService.getBlockerTaskIds(blockedNewId);
      expect(blockers).toContain(blockerNewId);
    });

    it('should handle child task listed before parent (topological sort)', () => {
      const exportData: ExportData = {
        version: '1.0.0',
        exported_at: '2026-01-01T00:00:00.000Z',
        tasks: [
          {
            id: 20,
            title: 'Child Task',
            body: null,
            author: null,
            assignees: null,
            status: 'backlog',
            parent_id: 10,
            created_at: '2026-01-01T11:00:00.000Z',
            updated_at: '2026-01-01T11:00:00.000Z',
            tags: [],
            metadata: {},
            comments: [],
            blocked_by: [],
          },
          {
            id: 10,
            title: 'Parent Task',
            body: null,
            author: null,
            assignees: null,
            status: 'backlog',
            parent_id: null,
            created_at: '2026-01-01T10:00:00.000Z',
            updated_at: '2026-01-01T10:00:00.000Z',
            tags: [],
            metadata: {},
            comments: [],
            blocked_by: [],
          },
        ],
      };

      // Should not throw even though child is listed before parent
      expect(() => service.importData(exportData)).not.toThrow();

      const tasks = taskService.listTasks({}, 'id', 'asc');
      const parentTask = tasks.find((t) => t.title === 'Parent Task')!;
      const childTask = tasks.find((t) => t.title === 'Child Task')!;

      expect(childTask.parent_id).toBe(parentTask.id);
    });

    it('should ignore version during import', () => {
      const exportData: ExportData = {
        version: '99.99.99',
        exported_at: '2026-01-01T00:00:00.000Z',
        tasks: [
          {
            id: 1,
            title: 'Task',
            body: null,
            author: null,
            assignees: null,
            status: 'backlog',
            parent_id: null,
            created_at: '2026-01-01T10:00:00.000Z',
            updated_at: '2026-01-01T10:00:00.000Z',
            tags: [],
            metadata: {},
            comments: [],
            blocked_by: [],
          },
        ],
      };

      // Should succeed regardless of version
      expect(() => service.importData(exportData)).not.toThrow();
      expect(taskService.listTasks()).toHaveLength(1);
    });

    it('should return correct importedCount', () => {
      const exportData: ExportData = {
        version: '1.0.0',
        exported_at: '2026-01-01T00:00:00.000Z',
        tasks: [
          {
            id: 1,
            title: 'Task 1',
            body: null,
            author: null,
            assignees: null,
            status: 'backlog',
            parent_id: null,
            created_at: '2026-01-01T10:00:00.000Z',
            updated_at: '2026-01-01T10:00:00.000Z',
            tags: [],
            metadata: {},
            comments: [],
            blocked_by: [],
          },
          {
            id: 2,
            title: 'Task 2',
            body: null,
            author: null,
            assignees: null,
            status: 'ready',
            parent_id: null,
            created_at: '2026-01-01T11:00:00.000Z',
            updated_at: '2026-01-01T11:00:00.000Z',
            tags: [],
            metadata: {},
            comments: [],
            blocked_by: [],
          },
        ],
      };

      const result = service.importData(exportData);
      expect(result.importedCount).toBe(2);
    });
  });

  describe('export then import roundtrip', () => {
    it('should preserve data through export and import cycle', () => {
      // Create original data
      const originalTask = taskService.createTask({
        title: 'Original Task',
        body: 'Original body',
        author: 'alice',
        status: 'in_progress',
      });
      const tag = tagService.createTag({ name: 'roundtrip-tag' });
      taskTagService.addTagToTask({ task_id: originalTask.id, tag_id: tag.id });
      metadataService.setMetadata({ task_id: originalTask.id, key: 'key1', value: 'val1' });
      commentService.addComment({ task_id: originalTask.id, content: 'A comment', author: 'bob' });

      // Export
      const exportedData = service.exportData();

      // Reset and import
      resetDatabase();

      const newService = new ExportImportService(getDatabase());
      const result = newService.importData(exportedData);

      expect(result.importedCount).toBe(1);

      const newTaskService = new TaskService(getDatabase());
      const importedTasks = newTaskService.listTasks();
      expect(importedTasks).toHaveLength(1);
      expect(importedTasks[0].title).toBe('Original Task');
      expect(importedTasks[0].body).toBe('Original body');
      expect(importedTasks[0].author).toBe('alice');
      expect(importedTasks[0].status).toBe('in_progress');

      const newTaskTagService = new TaskTagService(getDatabase());
      const importedTags = newTaskTagService.getTagsForTask(importedTasks[0].id);
      expect(importedTags.map((t) => t.name)).toContain('roundtrip-tag');

      const newCommentService = new CommentService(getDatabase());
      const importedComments = newCommentService.listComments(importedTasks[0].id);
      expect(importedComments).toHaveLength(1);
      expect(importedComments[0].content).toBe('A comment');
    });
  });
});
