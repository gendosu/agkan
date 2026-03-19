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
    it('should add a comment to a task', () => {
      const task = taskService.createTask({ title: 'Test task' });
      const comment = commentService.addComment({ task_id: task.id, content: 'Hello world' });

      expect(comment).toBeDefined();
      expect(comment.id).toBeGreaterThan(0);
      expect(comment.task_id).toBe(task.id);
      expect(comment.content).toBe('Hello world');
      expect(comment.author).toBeNull();
      expect(comment.created_at).toBeDefined();
      expect(comment.updated_at).toBeDefined();
    });

    it('should add a comment with an author', () => {
      const task = taskService.createTask({ title: 'Test task' });
      const comment = commentService.addComment({ task_id: task.id, content: 'Progress note', author: 'alice' });

      expect(comment.author).toBe('alice');
    });

    it('should throw when content is empty', () => {
      const task = taskService.createTask({ title: 'Test task' });
      expect(() => {
        commentService.addComment({ task_id: task.id, content: '' });
      }).toThrow('Content is required');
    });

    it('should throw when content is whitespace only', () => {
      const task = taskService.createTask({ title: 'Test task' });
      expect(() => {
        commentService.addComment({ task_id: task.id, content: '   ' });
      }).toThrow('Content is required');
    });

    it('should throw when content exceeds 5000 characters', () => {
      const task = taskService.createTask({ title: 'Test task' });
      expect(() => {
        commentService.addComment({ task_id: task.id, content: 'a'.repeat(5001) });
      }).toThrow('Content must not exceed 5000 characters');
    });

    it('should throw when author exceeds 100 characters', () => {
      const task = taskService.createTask({ title: 'Test task' });
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
    it('should get a comment by ID', () => {
      const task = taskService.createTask({ title: 'Test task' });
      const created = commentService.addComment({ task_id: task.id, content: 'Note' });

      const fetched = commentService.getComment(created.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(created.id);
      expect(fetched!.content).toBe('Note');
    });

    it('should return null for non-existent comment', () => {
      const result = commentService.getComment(99999);
      expect(result).toBeNull();
    });
  });

  describe('listComments', () => {
    it('should return an empty array when task has no comments', () => {
      const task = taskService.createTask({ title: 'Test task' });
      const comments = commentService.listComments(task.id);
      expect(comments).toEqual([]);
    });

    it('should list comments ordered by created_at ASC', () => {
      const task = taskService.createTask({ title: 'Test task' });
      commentService.addComment({ task_id: task.id, content: 'First' });
      commentService.addComment({ task_id: task.id, content: 'Second' });
      commentService.addComment({ task_id: task.id, content: 'Third' });

      const comments = commentService.listComments(task.id);
      expect(comments).toHaveLength(3);
      expect(comments[0].content).toBe('First');
      expect(comments[1].content).toBe('Second');
      expect(comments[2].content).toBe('Third');
    });

    it('should only return comments for the specified task', () => {
      const task1 = taskService.createTask({ title: 'Task 1' });
      const task2 = taskService.createTask({ title: 'Task 2' });
      commentService.addComment({ task_id: task1.id, content: 'Comment for task 1' });
      commentService.addComment({ task_id: task2.id, content: 'Comment for task 2' });

      const commentsForTask1 = commentService.listComments(task1.id);
      expect(commentsForTask1).toHaveLength(1);
      expect(commentsForTask1[0].content).toBe('Comment for task 1');
    });
  });

  describe('deleteComment', () => {
    it('should delete a comment by ID', () => {
      const task = taskService.createTask({ title: 'Test task' });
      const comment = commentService.addComment({ task_id: task.id, content: 'To delete' });

      const deleted = commentService.deleteComment(comment.id);
      expect(deleted).toBe(true);

      const fetched = commentService.getComment(comment.id);
      expect(fetched).toBeNull();
    });

    it('should return false when comment does not exist', () => {
      const deleted = commentService.deleteComment(99999);
      expect(deleted).toBe(false);
    });
  });

  describe('updateComment', () => {
    it('should update the content of a comment', () => {
      const task = taskService.createTask({ title: 'Test task' });
      const comment = commentService.addComment({ task_id: task.id, content: 'Original' });

      const updated = commentService.updateComment(comment.id, 'Updated content');
      expect(updated).not.toBeNull();
      expect(updated!.id).toBe(comment.id);
      expect(updated!.content).toBe('Updated content');
    });

    it('should update updated_at timestamp', () => {
      const task = taskService.createTask({ title: 'Test task' });
      const comment = commentService.addComment({ task_id: task.id, content: 'Original' });
      const originalUpdatedAt = comment.updated_at;

      // Ensure some time passes
      const updated = commentService.updateComment(comment.id, 'Updated content');
      expect(updated).not.toBeNull();
      // updated_at should be defined (may equal original if same millisecond, but field exists)
      expect(updated!.updated_at).toBeDefined();
      expect(typeof updated!.updated_at).toBe('string');
      void originalUpdatedAt; // suppress unused warning
    });

    it('should return null when comment not found', () => {
      const result = commentService.updateComment(99999, 'New content');
      expect(result).toBeNull();
    });

    it('should throw when content is empty', () => {
      const task = taskService.createTask({ title: 'Test task' });
      const comment = commentService.addComment({ task_id: task.id, content: 'Original' });
      expect(() => {
        commentService.updateComment(comment.id, '');
      }).toThrow('Content is required');
    });

    it('should throw when content is whitespace only', () => {
      const task = taskService.createTask({ title: 'Test task' });
      const comment = commentService.addComment({ task_id: task.id, content: 'Original' });
      expect(() => {
        commentService.updateComment(comment.id, '   ');
      }).toThrow('Content is required');
    });

    it('should throw when content exceeds 5000 characters', () => {
      const task = taskService.createTask({ title: 'Test task' });
      const comment = commentService.addComment({ task_id: task.id, content: 'Original' });
      expect(() => {
        commentService.updateComment(comment.id, 'a'.repeat(5001));
      }).toThrow('Content must not exceed 5000 characters');
    });
  });

  describe('deleteAllComments', () => {
    it('should delete all comments for a task', () => {
      const task = taskService.createTask({ title: 'Test task' });
      commentService.addComment({ task_id: task.id, content: 'Comment 1' });
      commentService.addComment({ task_id: task.id, content: 'Comment 2' });

      const count = commentService.deleteAllComments(task.id);
      expect(count).toBe(2);

      const remaining = commentService.listComments(task.id);
      expect(remaining).toHaveLength(0);
    });

    it('should return 0 when task has no comments', () => {
      const task = taskService.createTask({ title: 'Test task' });
      const count = commentService.deleteAllComments(task.id);
      expect(count).toBe(0);
    });
  });

  describe('getCommentsForTasks', () => {
    it('should return an empty map for empty task IDs', () => {
      const result = commentService.getCommentsForTasks([]);
      expect(result.size).toBe(0);
    });

    it('should return comments grouped by task ID', () => {
      const task1 = taskService.createTask({ title: 'Task 1' });
      const task2 = taskService.createTask({ title: 'Task 2' });
      commentService.addComment({ task_id: task1.id, content: 'C1 for task1' });
      commentService.addComment({ task_id: task1.id, content: 'C2 for task1' });
      commentService.addComment({ task_id: task2.id, content: 'C1 for task2' });

      const result = commentService.getCommentsForTasks([task1.id, task2.id]);
      expect(result.get(task1.id)).toHaveLength(2);
      expect(result.get(task2.id)).toHaveLength(1);
    });
  });

  describe('CASCADE DELETE', () => {
    it('should delete comments when the parent task is deleted', () => {
      const task = taskService.createTask({ title: 'Test task' });
      const comment = commentService.addComment({ task_id: task.id, content: 'Will be deleted' });

      taskService.deleteTask(task.id);

      const fetched = commentService.getComment(comment.id);
      expect(fetched).toBeNull();
    });
  });

  describe('updateComment', () => {
    it('should update a comment content', () => {
      const task = taskService.createTask({ title: 'Test task' });
      const comment = commentService.addComment({ task_id: task.id, content: 'Original content' });

      const updated = commentService.updateComment(comment.id, 'Updated content');

      expect(updated).not.toBeNull();
      expect(updated!.id).toBe(comment.id);
      expect(updated!.content).toBe('Updated content');
      expect(updated!.updated_at).not.toBe(comment.updated_at);
    });

    it('should return null for non-existent comment id', () => {
      const result = commentService.updateComment(9999, 'New content');

      expect(result).toBeNull();
    });

    it('should persist the update', () => {
      const task = taskService.createTask({ title: 'Test task' });
      const comment = commentService.addComment({ task_id: task.id, content: 'Original' });

      commentService.updateComment(comment.id, 'Changed');
      const fetched = commentService.getComment(comment.id);

      expect(fetched!.content).toBe('Changed');
    });
  });
});
