import { describe, it, expect, beforeEach } from 'vitest';
import { CommentService } from '../../src/services/CommentService';
import { TaskService } from '../../src/services/TaskService';
import { resetDatabase } from '../../src/db/reset';

describe('CommentService', () => {
  let commentService: CommentService;
  let taskService: TaskService;

  beforeEach(() => {
    resetDatabase();
    commentService = new CommentService();
    taskService = new TaskService();
  });

  describe('addComment', () => {
    it('コメントを追加できる', () => {
      const task = taskService.createTask({ title: 'テストタスク' });
      const comment = commentService.addComment({
        task_id: task.id,
        content: 'テストコメント',
      });

      expect(comment).toBeDefined();
      expect(comment.id).toBeDefined();
      expect(typeof comment.id).toBe('number');
      expect(comment.task_id).toBe(task.id);
      expect(comment.content).toBe('テストコメント');
      expect(comment.author).toBeNull();
      expect(comment.created_at).toBeDefined();
      expect(comment.updated_at).toBeDefined();
    });

    it('authorを指定してコメントを追加できる', () => {
      const task = taskService.createTask({ title: 'テストタスク' });
      const comment = commentService.addComment({
        task_id: task.id,
        author: 'testuser',
        content: 'テストコメント',
      });

      expect(comment.author).toBe('testuser');
    });

    it('contentが空の場合エラーが発生する', () => {
      const task = taskService.createTask({ title: 'テストタスク' });
      expect(() => {
        commentService.addComment({ task_id: task.id, content: '' });
      }).toThrow('Content is required');
    });

    it('contentが空白のみの場合エラーが発生する', () => {
      const task = taskService.createTask({ title: 'テストタスク' });
      expect(() => {
        commentService.addComment({ task_id: task.id, content: '   ' });
      }).toThrow('Content is required');
    });

    it('contentが5000文字を超える場合エラーが発生する', () => {
      const task = taskService.createTask({ title: 'テストタスク' });
      expect(() => {
        commentService.addComment({ task_id: task.id, content: 'a'.repeat(5001) });
      }).toThrow('Content must not exceed 5000 characters');
    });

    it('authorが100文字を超える場合エラーが発生する', () => {
      const task = taskService.createTask({ title: 'テストタスク' });
      expect(() => {
        commentService.addComment({
          task_id: task.id,
          content: 'valid content',
          author: 'a'.repeat(101),
        });
      }).toThrow('Author must not exceed 100 characters');
    });
  });

  describe('getComment', () => {
    it('IDでコメントを取得できる', () => {
      const task = taskService.createTask({ title: 'テストタスク' });
      const created = commentService.addComment({ task_id: task.id, content: 'テストコメント' });

      const fetched = commentService.getComment(created.id);
      expect(fetched).toBeDefined();
      expect(fetched!.id).toBe(created.id);
      expect(fetched!.content).toBe('テストコメント');
    });

    it('存在しないIDの場合nullを返す', () => {
      const result = commentService.getComment(9999);
      expect(result).toBeNull();
    });
  });

  describe('listComments', () => {
    it('タスクのコメント一覧を取得できる', () => {
      const task = taskService.createTask({ title: 'テストタスク' });
      commentService.addComment({ task_id: task.id, content: 'コメント1' });
      commentService.addComment({ task_id: task.id, content: 'コメント2' });
      commentService.addComment({ task_id: task.id, content: 'コメント3' });

      const comments = commentService.listComments(task.id);
      expect(comments).toHaveLength(3);
      expect(comments[0].content).toBe('コメント1');
      expect(comments[1].content).toBe('コメント2');
      expect(comments[2].content).toBe('コメント3');
    });

    it('コメントがない場合空配列を返す', () => {
      const task = taskService.createTask({ title: 'テストタスク' });
      const comments = commentService.listComments(task.id);
      expect(comments).toHaveLength(0);
    });

    it('他のタスクのコメントは含まない', () => {
      const task1 = taskService.createTask({ title: 'タスク1' });
      const task2 = taskService.createTask({ title: 'タスク2' });
      commentService.addComment({ task_id: task1.id, content: 'タスク1のコメント' });
      commentService.addComment({ task_id: task2.id, content: 'タスク2のコメント' });

      const comments = commentService.listComments(task1.id);
      expect(comments).toHaveLength(1);
      expect(comments[0].content).toBe('タスク1のコメント');
    });
  });

  describe('deleteComment', () => {
    it('コメントを削除できる', () => {
      const task = taskService.createTask({ title: 'テストタスク' });
      const comment = commentService.addComment({ task_id: task.id, content: 'テストコメント' });

      const result = commentService.deleteComment(comment.id);
      expect(result).toBe(true);

      const fetched = commentService.getComment(comment.id);
      expect(fetched).toBeNull();
    });

    it('存在しないIDの場合falseを返す', () => {
      const result = commentService.deleteComment(9999);
      expect(result).toBe(false);
    });
  });

  describe('deleteAllComments', () => {
    it('タスクの全コメントを削除できる', () => {
      const task = taskService.createTask({ title: 'テストタスク' });
      commentService.addComment({ task_id: task.id, content: 'コメント1' });
      commentService.addComment({ task_id: task.id, content: 'コメント2' });

      const count = commentService.deleteAllComments(task.id);
      expect(count).toBe(2);

      const comments = commentService.listComments(task.id);
      expect(comments).toHaveLength(0);
    });
  });

  describe('CASCADE DELETE', () => {
    it('タスク削除時にコメントも削除される', () => {
      const task = taskService.createTask({ title: 'テストタスク' });
      const comment = commentService.addComment({ task_id: task.id, content: 'テストコメント' });

      taskService.deleteTask(task.id);

      const fetched = commentService.getComment(comment.id);
      expect(fetched).toBeNull();
    });
  });

  describe('getCommentsForTasks', () => {
    it('複数タスクのコメントを一度に取得できる', () => {
      const task1 = taskService.createTask({ title: 'タスク1' });
      const task2 = taskService.createTask({ title: 'タスク2' });
      commentService.addComment({ task_id: task1.id, content: 'タスク1コメント1' });
      commentService.addComment({ task_id: task1.id, content: 'タスク1コメント2' });
      commentService.addComment({ task_id: task2.id, content: 'タスク2コメント1' });

      const map = commentService.getCommentsForTasks([task1.id, task2.id]);
      expect(map.get(task1.id)).toHaveLength(2);
      expect(map.get(task2.id)).toHaveLength(1);
    });

    it('空配列の場合空のMapを返す', () => {
      const map = commentService.getCommentsForTasks([]);
      expect(map.size).toBe(0);
    });
  });
});
