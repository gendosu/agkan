import { describe, it, expect, beforeEach } from 'vitest';
import { TaskService } from '../src/services/TaskService';
import { TagService } from '../src/services/TagService';
import { TaskTagService } from '../src/services/TaskTagService';
import { resetDatabase } from '../src/db/reset';

describe('TaskTagService', () => {
  let taskService: TaskService;
  let tagService: TagService;
  let taskTagService: TaskTagService;

  beforeEach(() => {
    // 各テストの前にデータベースをリセット
    resetDatabase();
    taskService = new TaskService();
    tagService = new TagService();
    taskTagService = new TaskTagService();
  });

  describe('addTagToTask', () => {
    it('タスクにタグを追加できる', () => {
      // タスクとタグを作成
      const task = taskService.createTask({ title: 'Fix bug' });
      const tag = tagService.createTag({ name: 'bug' });

      // タスクにタグを追加
      const taskTag = taskTagService.addTagToTask({
        task_id: task.id,
        tag_id: tag.id,
      });

      // タグが正しく追加されたことを検証
      expect(taskTag).toBeDefined();
      expect(taskTag.id).toBeDefined();
      expect(typeof taskTag.id).toBe('number');
      expect(taskTag.task_id).toBe(task.id);
      expect(taskTag.tag_id).toBe(tag.id);
      expect(taskTag.created_at).toBeDefined();
      expect(typeof taskTag.created_at).toBe('string');
    });

    it('1つのタスクに複数のタグを追加できる', () => {
      // タスクと2つのタグを作成
      const task = taskService.createTask({ title: 'Feature request' });
      const tag1 = tagService.createTag({ name: 'feature' });
      const tag2 = tagService.createTag({ name: 'urgent' });

      // タスクに2つのタグを追加
      const taskTag1 = taskTagService.addTagToTask({
        task_id: task.id,
        tag_id: tag1.id,
      });

      const taskTag2 = taskTagService.addTagToTask({
        task_id: task.id,
        tag_id: tag2.id,
      });

      // 両方のタグが正しく追加されたことを検証
      expect(taskTag1.task_id).toBe(task.id);
      expect(taskTag1.tag_id).toBe(tag1.id);
      expect(taskTag2.task_id).toBe(task.id);
      expect(taskTag2.tag_id).toBe(tag2.id);

      // タスクのタグIDリストを確認
      const tagIds = taskTagService.getTagIdsForTask(task.id);
      expect(tagIds).toHaveLength(2);
      expect(tagIds).toContain(tag1.id);
      expect(tagIds).toContain(tag2.id);
    });

    it('1つのタグを複数のタスクに追加できる', () => {
      // 2つのタスクと1つのタグを作成
      const task1 = taskService.createTask({ title: 'Bug 1' });
      const task2 = taskService.createTask({ title: 'Bug 2' });
      const tag = tagService.createTag({ name: 'bug' });

      // 2つのタスクに同じタグを追加
      const taskTag1 = taskTagService.addTagToTask({
        task_id: task1.id,
        tag_id: tag.id,
      });

      const taskTag2 = taskTagService.addTagToTask({
        task_id: task2.id,
        tag_id: tag.id,
      });

      // 両方のタスクに正しくタグが追加されたことを検証
      expect(taskTag1.task_id).toBe(task1.id);
      expect(taskTag1.tag_id).toBe(tag.id);
      expect(taskTag2.task_id).toBe(task2.id);
      expect(taskTag2.tag_id).toBe(tag.id);

      // タグのタスクIDリストを確認
      const taskIds = taskTagService.getTaskIdsForTag(tag.id);
      expect(taskIds).toHaveLength(2);
      expect(taskIds).toContain(task1.id);
      expect(taskIds).toContain(task2.id);
    });

    it('存在しないタスクIDでエラーが発生する', () => {
      // タグを作成
      const tag = tagService.createTag({ name: 'test' });

      // 存在しないタスクIDでタグを追加しようとするとエラー
      expect(() => {
        taskTagService.addTagToTask({
          task_id: 99999,
          tag_id: tag.id,
        });
      }).toThrow('Task with id 99999 does not exist');
    });

    it('存在しないタグIDでエラーが発生する', () => {
      // タスクを作成
      const task = taskService.createTask({ title: 'Test task' });

      // 存在しないタグIDでタグを追加しようとするとエラー
      expect(() => {
        taskTagService.addTagToTask({
          task_id: task.id,
          tag_id: 99999,
        });
      }).toThrow('Tag with id 99999 does not exist');
    });

    it('既に追加されているタグを再度追加しようとするとエラーが発生する', () => {
      // タスクとタグを作成
      const task = taskService.createTask({ title: 'Test task' });
      const tag = tagService.createTag({ name: 'test' });

      // タグを追加
      taskTagService.addTagToTask({
        task_id: task.id,
        tag_id: tag.id,
      });

      // 同じタグを再度追加しようとするとエラー
      expect(() => {
        taskTagService.addTagToTask({
          task_id: task.id,
          tag_id: tag.id,
        });
      }).toThrow(`Task ${task.id} already has tag ${tag.id}`);
    });
  });

  describe('removeTagFromTask', () => {
    it('タスクからタグを削除できる', () => {
      // タスクとタグを作成
      const task = taskService.createTask({ title: 'Test task' });
      const tag = tagService.createTag({ name: 'test' });

      // タグを追加
      taskTagService.addTagToTask({
        task_id: task.id,
        tag_id: tag.id,
      });

      // タグを削除
      const result = taskTagService.removeTagFromTask(task.id, tag.id);

      // 削除が成功したことを検証
      expect(result).toBe(true);

      // タグが削除されたことを確認
      const tagIds = taskTagService.getTagIdsForTask(task.id);
      expect(tagIds).toHaveLength(0);
    });

    it('存在しない関係の削除はfalseを返す', () => {
      // タスクとタグを作成（関係は作成しない）
      const task = taskService.createTask({ title: 'Test task' });
      const tag = tagService.createTag({ name: 'test' });

      // 存在しない関係を削除しようとする
      const result = taskTagService.removeTagFromTask(task.id, tag.id);

      // falseが返ることを検証
      expect(result).toBe(false);
    });
  });

  describe('hasTag', () => {
    it('タグが追加されているかを確認できる', () => {
      // タスクとタグを作成
      const task = taskService.createTask({ title: 'Test task' });
      const tag = tagService.createTag({ name: 'test' });

      // タグを追加前の状態を確認
      const beforeAdd = taskTagService.hasTag(task.id, tag.id);
      expect(beforeAdd).toBe(false);

      // タグを追加
      taskTagService.addTagToTask({
        task_id: task.id,
        tag_id: tag.id,
      });

      // タグが追加されたことを確認
      const afterAdd = taskTagService.hasTag(task.id, tag.id);
      expect(afterAdd).toBe(true);
    });
  });

  describe('getTagIdsForTask', () => {
    it('タスクのタグIDリストを取得できる', () => {
      // タスクと3つのタグを作成
      const task = taskService.createTask({ title: 'Test task' });
      const tag1 = tagService.createTag({ name: 'bug' });
      const tag2 = tagService.createTag({ name: 'feature' });
      const tag3 = tagService.createTag({ name: 'urgent' });

      // タグを順番に追加
      taskTagService.addTagToTask({ task_id: task.id, tag_id: tag1.id });
      taskTagService.addTagToTask({ task_id: task.id, tag_id: tag2.id });
      taskTagService.addTagToTask({ task_id: task.id, tag_id: tag3.id });

      // タグIDリストを取得
      const tagIds = taskTagService.getTagIdsForTask(task.id);

      // 正しい順序でタグIDが取得されることを検証
      expect(tagIds).toHaveLength(3);
      expect(tagIds[0]).toBe(tag1.id);
      expect(tagIds[1]).toBe(tag2.id);
      expect(tagIds[2]).toBe(tag3.id);
    });

    it('タグが存在しない場合は空配列を返す', () => {
      // タスクを作成（タグは追加しない）
      const task = taskService.createTask({ title: 'Test task' });

      // タグIDリストを取得
      const tagIds = taskTagService.getTagIdsForTask(task.id);

      // 空配列が返ることを検証
      expect(tagIds).toHaveLength(0);
      expect(Array.isArray(tagIds)).toBe(true);
    });
  });

  describe('getTagsForTask', () => {
    it('タスクのタグオブジェクトリストを取得できる', () => {
      // タスクと2つのタグを作成
      const task = taskService.createTask({ title: 'Test task' });
      const tag1 = tagService.createTag({ name: 'bug' });
      const tag2 = tagService.createTag({ name: 'feature' });

      // タグを追加
      taskTagService.addTagToTask({ task_id: task.id, tag_id: tag1.id });
      taskTagService.addTagToTask({ task_id: task.id, tag_id: tag2.id });

      // タグオブジェクトリストを取得
      const tags = taskTagService.getTagsForTask(task.id);

      // 正しくタグオブジェクトが取得されることを検証
      expect(tags).toHaveLength(2);
      expect(tags[0].id).toBe(tag1.id);
      expect(tags[0].name).toBe('bug');
      expect(tags[1].id).toBe(tag2.id);
      expect(tags[1].name).toBe('feature');
    });

    it('タグが存在しない場合は空配列を返す', () => {
      // タスクを作成（タグは追加しない）
      const task = taskService.createTask({ title: 'Test task' });

      // タグオブジェクトリストを取得
      const tags = taskTagService.getTagsForTask(task.id);

      // 空配列が返ることを検証
      expect(tags).toHaveLength(0);
      expect(Array.isArray(tags)).toBe(true);
    });
  });

  describe('getTaskIdsForTag', () => {
    it('タグが付与されているタスクIDリストを取得できる', () => {
      // 3つのタスクと1つのタグを作成
      const task1 = taskService.createTask({ title: 'Task 1' });
      const task2 = taskService.createTask({ title: 'Task 2' });
      const task3 = taskService.createTask({ title: 'Task 3' });
      const tag = tagService.createTag({ name: 'bug' });

      // 3つのタスクに同じタグを追加
      taskTagService.addTagToTask({ task_id: task1.id, tag_id: tag.id });
      taskTagService.addTagToTask({ task_id: task2.id, tag_id: tag.id });
      taskTagService.addTagToTask({ task_id: task3.id, tag_id: tag.id });

      // タスクIDリストを取得
      const taskIds = taskTagService.getTaskIdsForTag(tag.id);

      // 正しくタスクIDが取得されることを検証
      expect(taskIds).toHaveLength(3);
      expect(taskIds[0]).toBe(task1.id);
      expect(taskIds[1]).toBe(task2.id);
      expect(taskIds[2]).toBe(task3.id);
    });

    it('タグが付与されているタスクがない場合は空配列を返す', () => {
      // タグを作成（タスクには追加しない）
      const tag = tagService.createTag({ name: 'unused' });

      // タスクIDリストを取得
      const taskIds = taskTagService.getTaskIdsForTag(tag.id);

      // 空配列が返ることを検証
      expect(taskIds).toHaveLength(0);
      expect(Array.isArray(taskIds)).toBe(true);
    });
  });

  describe('getTasksForTag', () => {
    it('タグが付与されているタスクオブジェクトリストを取得できる', () => {
      // 2つのタスクと1つのタグを作成
      const task1 = taskService.createTask({ title: 'Task 1' });
      const task2 = taskService.createTask({ title: 'Task 2' });
      const tag = tagService.createTag({ name: 'bug' });

      // 2つのタスクにタグを追加
      taskTagService.addTagToTask({ task_id: task1.id, tag_id: tag.id });
      taskTagService.addTagToTask({ task_id: task2.id, tag_id: tag.id });

      // タスクオブジェクトリストを取得
      const tasks = taskTagService.getTasksForTag(tag.id);

      // 正しくタスクオブジェクトが取得されることを検証
      expect(tasks).toHaveLength(2);
      expect(tasks[0].id).toBe(task1.id);
      expect(tasks[0].title).toBe('Task 1');
      expect(tasks[1].id).toBe(task2.id);
      expect(tasks[1].title).toBe('Task 2');
    });

    it('タグが付与されているタスクがない場合は空配列を返す', () => {
      // タグを作成（タスクには追加しない）
      const tag = tagService.createTag({ name: 'unused' });

      // タスクオブジェクトリストを取得
      const tasks = taskTagService.getTasksForTag(tag.id);

      // 空配列が返ることを検証
      expect(tasks).toHaveLength(0);
      expect(Array.isArray(tasks)).toBe(true);
    });
  });

  describe('CASCADE DELETE', () => {
    it('タスク削除時にtask_tagsも削除される', () => {
      // タスクと2つのタグを作成
      const task = taskService.createTask({ title: 'Test task' });
      const tag1 = tagService.createTag({ name: 'bug' });
      const tag2 = tagService.createTag({ name: 'feature' });

      // タスクにタグを追加
      taskTagService.addTagToTask({ task_id: task.id, tag_id: tag1.id });
      taskTagService.addTagToTask({ task_id: task.id, tag_id: tag2.id });

      // タグが追加されたことを確認
      const tagsBefore = taskTagService.getTagIdsForTask(task.id);
      expect(tagsBefore).toHaveLength(2);

      // タスクを削除
      taskService.deleteTask(task.id);

      // task_tagsが自動的に削除されたことを検証
      const tagsAfter = taskTagService.getTagIdsForTask(task.id);
      expect(tagsAfter).toHaveLength(0);

      // タグ自体は削除されていないことを確認
      const tag1After = tagService.getTag(tag1.id);
      expect(tag1After).not.toBeNull();
      const tag2After = tagService.getTag(tag2.id);
      expect(tag2After).not.toBeNull();
    });

    it('タグ削除時にtask_tagsも削除される', () => {
      // 2つのタスクと1つのタグを作成
      const task1 = taskService.createTask({ title: 'Task 1' });
      const task2 = taskService.createTask({ title: 'Task 2' });
      const tag = tagService.createTag({ name: 'bug' });

      // 2つのタスクにタグを追加
      taskTagService.addTagToTask({ task_id: task1.id, tag_id: tag.id });
      taskTagService.addTagToTask({ task_id: task2.id, tag_id: tag.id });

      // タグが追加されたことを確認
      const tasksBefore = taskTagService.getTaskIdsForTag(tag.id);
      expect(tasksBefore).toHaveLength(2);

      // タグを削除
      tagService.deleteTag(tag.id);

      // task_tagsが自動的に削除されたことを検証
      const tasksAfter = taskTagService.getTaskIdsForTag(tag.id);
      expect(tasksAfter).toHaveLength(0);

      // タスク自体は削除されていないことを確認
      const task1After = taskService.getTask(task1.id);
      expect(task1After).not.toBeNull();
      const task2After = taskService.getTask(task2.id);
      expect(task2After).not.toBeNull();
    });
  });

  describe('getAllTaskTags', () => {
    it('全タスクのタグを一括取得できる', () => {
      // 2つのタスクと3つのタグを作成
      const task1 = taskService.createTask({ title: 'Task 1' });
      const task2 = taskService.createTask({ title: 'Task 2' });
      const tag1 = tagService.createTag({ name: 'bug' });
      const tag2 = tagService.createTag({ name: 'feature' });
      const tag3 = tagService.createTag({ name: 'urgent' });

      // task1にtag1とtag2を追加
      taskTagService.addTagToTask({ task_id: task1.id, tag_id: tag1.id });
      taskTagService.addTagToTask({ task_id: task1.id, tag_id: tag2.id });

      // task2にtag3を追加
      taskTagService.addTagToTask({ task_id: task2.id, tag_id: tag3.id });

      // 全タスクのタグを一括取得
      const taskTagsMap = taskTagService.getAllTaskTags();

      // Mapの形式が正しいことを検証
      expect(taskTagsMap).toBeInstanceOf(Map);
      expect(taskTagsMap.size).toBe(2);

      // task1のタグを確認
      const task1Tags = taskTagsMap.get(task1.id);
      expect(task1Tags).toBeDefined();
      expect(task1Tags!.length).toBe(2);
      expect(task1Tags![0].id).toBe(tag1.id);
      expect(task1Tags![0].name).toBe('bug');
      expect(task1Tags![1].id).toBe(tag2.id);
      expect(task1Tags![1].name).toBe('feature');

      // task2のタグを確認
      const task2Tags = taskTagsMap.get(task2.id);
      expect(task2Tags).toBeDefined();
      expect(task2Tags!.length).toBe(1);
      expect(task2Tags![0].id).toBe(tag3.id);
      expect(task2Tags![0].name).toBe('urgent');
    });

    it('タグが存在しない場合は空のMapを返す', () => {
      // タスクを作成（タグは追加しない）
      taskService.createTask({ title: 'Task 1' });

      // 全タスクのタグを一括取得
      const taskTagsMap = taskTagService.getAllTaskTags();

      // 空のMapが返ることを検証
      expect(taskTagsMap).toBeInstanceOf(Map);
      expect(taskTagsMap.size).toBe(0);
    });
  });

  describe('依存注入（Dependency Injection）', () => {
    it('外部から注入したTaskServiceインスタンスを使用できる', () => {
      // 外部で作成したTaskServiceインスタンスを注入
      const sharedTaskService = new TaskService();
      const sharedTagService = new TagService();
      const taskTagServiceWithDI = new TaskTagService(undefined, sharedTaskService, sharedTagService);

      // 注入されたサービス経由でタスクとタグを作成
      const task = sharedTaskService.createTask({ title: 'DI Test Task' });
      const tag = sharedTagService.createTag({ name: 'di-test' });

      // 注入されたサービスを使用してタグを追加
      const taskTag = taskTagServiceWithDI.addTagToTask({
        task_id: task.id,
        tag_id: tag.id,
      });

      expect(taskTag).toBeDefined();
      expect(taskTag.task_id).toBe(task.id);
      expect(taskTag.tag_id).toBe(tag.id);
    });

    it('注入されたTagServiceのみを指定できる', () => {
      // TagServiceのみを注入（TaskServiceはデフォルト）
      const sharedTagService = new TagService();
      const taskTagServiceWithTagDI = new TaskTagService(undefined, undefined, sharedTagService);

      const task = taskService.createTask({ title: 'Partial DI Task' });
      const tag = sharedTagService.createTag({ name: 'partial-di' });

      const taskTag = taskTagServiceWithTagDI.addTagToTask({
        task_id: task.id,
        tag_id: tag.id,
      });

      expect(taskTag).toBeDefined();
      expect(taskTag.task_id).toBe(task.id);
      expect(taskTag.tag_id).toBe(tag.id);
    });
  });
});
