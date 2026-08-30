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
import { getStorageBackend } from '../../src/db/connection';

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
    const backend = getStorageBackend();
    service = new ExportImportService(backend);
    taskService = new TaskService(backend);
    tagService = new TagService(backend);
    taskTagService = new TaskTagService(backend);
    metadataService = new MetadataService(backend);
    commentService = new CommentService(backend);
    taskBlockService = new TaskBlockService(backend);
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

    it('should export priority and branch', () => {
      taskService.createTask({ title: 'Priority Task', priority: 'high', branch: 'feat/123-test' });

      const data = service.exportData();
      expect(data.tasks[0].priority).toBe('high');
      expect(data.tasks[0].branch).toBe('feat/123-test');
    });

    it('should export model and effort overrides', () => {
      taskService.createTask({
        title: 'Override Task',
        model_planning: 'opus',
        model_run: 'sonnet',
        effort_planning: 'low',
        effort_run: 'xhigh',
      });

      const data = service.exportData();
      expect(data.tasks[0].model_planning).toBe('opus');
      expect(data.tasks[0].model_run).toBe('sonnet');
      expect(data.tasks[0].effort_planning).toBe('low');
      expect(data.tasks[0].effort_run).toBe('xhigh');
    });

    it('should include archived tasks in export', () => {
      const backend = getStorageBackend();
      const task = taskService.createTask({ title: 'Archived Task' });
      backend.tasks.archiveMany([task.id]);

      const data = service.exportData();
      const exported = data.tasks.find((t) => t.id === task.id);
      expect(exported).toBeDefined();
      expect(exported?.is_archived).toBe(1);
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

    it('should roll back all changes when import fails midway', () => {
      const backend = getStorageBackend();

      // Spy on importTaskTags by making the second task's tag creation throw
      let taskCreationCount = 0;
      const originalCreate = backend.tasks.create.bind(backend.tasks);
      backend.tasks.create = (...args) => {
        taskCreationCount++;
        if (taskCreationCount === 2) {
          throw new Error('Simulated failure during second task creation');
        }
        return originalCreate(...args);
      };

      const failingService = new ExportImportService(backend);

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

      expect(() => failingService.importData(exportData)).toThrow('Simulated failure during second task creation');

      // Verify no partial data was committed (full rollback)
      const tasks = taskService.listTasks();
      expect(tasks).toHaveLength(0);
    });

    it('should restore priority, branch, and archived status', () => {
      const exportData: ExportData = {
        version: '1.0.0',
        exported_at: '2026-01-01T00:00:00.000Z',
        tasks: [
          {
            id: 1,
            title: 'Restored Task',
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
            priority: 'critical',
            branch: 'feat/1-restored-task',
            is_archived: 1,
          },
        ],
      };

      service.importData(exportData);

      const tasks = taskService.listTasks({ includeArchived: true });
      expect(tasks).toHaveLength(1);
      expect(tasks[0].priority).toBe('critical');
      expect(tasks[0].branch).toBe('feat/1-restored-task');
      expect(tasks[0].is_archived).toBe(1);
      // Archiving must not clobber the restored timestamp
      expect(tasks[0].updated_at).toBe('2026-01-01T10:00:00.000Z');
    });

    it('should restore model and effort overrides', () => {
      const exportData: ExportData = {
        version: '1.0.0',
        exported_at: '2026-01-01T00:00:00.000Z',
        tasks: [
          {
            id: 1,
            title: 'Override Restored Task',
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
            model_planning: 'fable',
            model_run: 'haiku',
            effort_planning: 'medium',
            effort_run: 'max',
          },
        ],
      };

      service.importData(exportData);

      const tasks = taskService.listTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].model_planning).toBe('fable');
      expect(tasks[0].model_run).toBe('haiku');
      expect(tasks[0].effort_planning).toBe('medium');
      expect(tasks[0].effort_run).toBe('max');
    });

    it('should import an old-format export without model/effort overrides', () => {
      const exportData: ExportData = {
        version: '1.0.0',
        exported_at: '2026-01-01T00:00:00.000Z',
        tasks: [
          {
            id: 1,
            title: 'Legacy Task',
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

      service.importData(exportData);

      const tasks = taskService.listTasks();
      expect(tasks[0].model_planning).toBeNull();
      expect(tasks[0].model_run).toBeNull();
      expect(tasks[0].effort_planning).toBeNull();
      expect(tasks[0].effort_run).toBeNull();
    });

    it('should restore model/effort overrides stored in legacy metadata keys from a pre-migration export', () => {
      const exportData: ExportData = {
        version: '0.9.0',
        exported_at: '2026-01-01T00:00:00.000Z',
        tasks: [
          {
            id: 1,
            title: 'Legacy Metadata Override Task',
            body: null,
            author: null,
            assignees: null,
            status: 'backlog',
            parent_id: null,
            created_at: '2026-01-01T10:00:00.000Z',
            updated_at: '2026-01-01T10:00:00.000Z',
            tags: [],
            metadata: { 'model:run': 'sonnet', 'effort:planning': 'low' },
            comments: [],
            blocked_by: [],
            // No model_planning/model_run/effort_planning/effort_run fields — this
            // simulates an export file created before those columns existed.
          },
        ],
      };

      service.importData(exportData);

      const tasks = taskService.listTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].model_run).toBe('sonnet');
      expect(tasks[0].effort_planning).toBe('low');
      // Legacy override keys are absent, not fall back to some default
      expect(tasks[0].model_planning).toBeNull();
      expect(tasks[0].effort_run).toBeNull();

      // The legacy keys must not be re-written into task_metadata as dead rows —
      // nothing reads model/effort overrides from task_metadata anymore.
      const metadataRows = getStorageBackend().metadata.findByTaskId(tasks[0].id);
      const metadataKeys = metadataRows.map((m) => m.key);
      expect(metadataKeys).not.toContain('model:run');
      expect(metadataKeys).not.toContain('effort:planning');
    });

    it('should import tasks from an old-format export without priority/branch/is_archived', () => {
      const exportData: ExportData = {
        version: '1.0.0',
        exported_at: '2026-01-01T00:00:00.000Z',
        tasks: [
          {
            id: 1,
            title: 'Legacy Task',
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

      expect(() => service.importData(exportData)).not.toThrow();

      const tasks = taskService.listTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].priority).toBeNull();
      expect(tasks[0].branch).toBeNull();
      expect(tasks[0].is_archived).toBe(0);
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

      const newService = new ExportImportService(getStorageBackend());
      const result = newService.importData(exportedData);

      expect(result.importedCount).toBe(1);

      const newTaskService = new TaskService(getStorageBackend());
      const importedTasks = newTaskService.listTasks();
      expect(importedTasks).toHaveLength(1);
      expect(importedTasks[0].title).toBe('Original Task');
      expect(importedTasks[0].body).toBe('Original body');
      expect(importedTasks[0].author).toBe('alice');
      expect(importedTasks[0].status).toBe('in_progress');

      const newTaskTagService = new TaskTagService(getStorageBackend());
      const importedTags = newTaskTagService.getTagsForTask(importedTasks[0].id);
      expect(importedTags.map((t) => t.name)).toContain('roundtrip-tag');

      const newCommentService = new CommentService(getStorageBackend());
      const importedComments = newCommentService.listComments(importedTasks[0].id);
      expect(importedComments).toHaveLength(1);
      expect(importedComments[0].content).toBe('A comment');
    });

    it('should preserve priority, branch, and archived status through export and import cycle', () => {
      const backend = getStorageBackend();
      const originalTask = taskService.createTask({
        title: 'Archived Original',
        priority: 'high',
        branch: 'feat/99-archived-original',
      });
      backend.tasks.archiveMany([originalTask.id]);

      const exportedData = service.exportData();

      resetDatabase();

      const newService = new ExportImportService(getStorageBackend());
      newService.importData(exportedData);

      const newTaskService = new TaskService(getStorageBackend());
      const importedTasks = newTaskService.listTasks({ includeArchived: true });
      expect(importedTasks).toHaveLength(1);
      expect(importedTasks[0].priority).toBe('high');
      expect(importedTasks[0].branch).toBe('feat/99-archived-original');
      expect(importedTasks[0].is_archived).toBe(1);
    });

    it('should preserve model and effort overrides through export and import cycle', () => {
      taskService.createTask({
        title: 'Round Trip Overrides',
        model_planning: 'opus',
        model_run: 'sonnet',
        effort_planning: 'low',
        effort_run: 'xhigh',
      });

      const exportedData = service.exportData();

      resetDatabase();

      const newService = new ExportImportService(getStorageBackend());
      newService.importData(exportedData);

      const newTaskService = new TaskService(getStorageBackend());
      const importedTasks = newTaskService.listTasks();
      expect(importedTasks).toHaveLength(1);
      expect(importedTasks[0].model_planning).toBe('opus');
      expect(importedTasks[0].model_run).toBe('sonnet');
      expect(importedTasks[0].effort_planning).toBe('low');
      expect(importedTasks[0].effort_run).toBe('xhigh');
    });
  });
});
