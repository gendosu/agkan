import { describe, it, expect, beforeEach } from 'vitest';
import { MetadataService } from '../../src/services/MetadataService';
import { TaskService } from '../../src/services/TaskService';
import { resetDatabase } from '../../src/db/reset';

describe('MetadataService', () => {
  let metadataService: MetadataService;
  let taskService: TaskService;

  beforeEach(() => {
    resetDatabase();
    metadataService = new MetadataService();
    taskService = new TaskService();
  });

  describe('setMetadata', () => {
    it('should create new metadata for a task', () => {
      const task = taskService.createTask({ title: 'Test task' });
      const metadata = metadataService.setMetadata({ task_id: task.id, key: 'priority', value: 'high' });

      expect(metadata).toBeDefined();
      expect(metadata.task_id).toBe(task.id);
      expect(metadata.key).toBe('priority');
      expect(metadata.value).toBe('high');
      expect(metadata.created_at).toBeDefined();
      expect(metadata.updated_at).toBeDefined();
    });

    it('should update existing metadata when key already exists', () => {
      const task = taskService.createTask({ title: 'Test task' });
      metadataService.setMetadata({ task_id: task.id, key: 'status', value: 'active' });

      const updated = metadataService.setMetadata({ task_id: task.id, key: 'status', value: 'inactive' });

      expect(updated.value).toBe('inactive');
      expect(updated.task_id).toBe(task.id);
      expect(updated.key).toBe('status');
    });

    it('should allow multiple keys for the same task', () => {
      const task = taskService.createTask({ title: 'Test task' });
      metadataService.setMetadata({ task_id: task.id, key: 'key1', value: 'value1' });
      metadataService.setMetadata({ task_id: task.id, key: 'key2', value: 'value2' });

      const meta1 = metadataService.getMetadataByKey(task.id, 'key1');
      const meta2 = metadataService.getMetadataByKey(task.id, 'key2');

      expect(meta1!.value).toBe('value1');
      expect(meta2!.value).toBe('value2');
    });

    it('should allow the same key for different tasks', () => {
      const task1 = taskService.createTask({ title: 'Task 1' });
      const task2 = taskService.createTask({ title: 'Task 2' });
      metadataService.setMetadata({ task_id: task1.id, key: 'category', value: 'A' });
      metadataService.setMetadata({ task_id: task2.id, key: 'category', value: 'B' });

      const meta1 = metadataService.getMetadataByKey(task1.id, 'category');
      const meta2 = metadataService.getMetadataByKey(task2.id, 'category');

      expect(meta1!.value).toBe('A');
      expect(meta2!.value).toBe('B');
    });

    it('should store empty string as value', () => {
      const task = taskService.createTask({ title: 'Test task' });
      const metadata = metadataService.setMetadata({ task_id: task.id, key: 'notes', value: '' });

      expect(metadata.value).toBe('');
    });
  });

  describe('getMetadataByKey', () => {
    it('should return metadata by task ID and key', () => {
      const task = taskService.createTask({ title: 'Test task' });
      metadataService.setMetadata({ task_id: task.id, key: 'env', value: 'production' });

      const result = metadataService.getMetadataByKey(task.id, 'env');

      expect(result).not.toBeNull();
      expect(result!.task_id).toBe(task.id);
      expect(result!.key).toBe('env');
      expect(result!.value).toBe('production');
    });

    it('should return null when key does not exist for task', () => {
      const task = taskService.createTask({ title: 'Test task' });

      const result = metadataService.getMetadataByKey(task.id, 'nonexistent');

      expect(result).toBeNull();
    });

    it('should return null for non-existent task ID', () => {
      const result = metadataService.getMetadataByKey(99999, 'somekey');

      expect(result).toBeNull();
    });

    it('should not return metadata for a different task with the same key', () => {
      const task1 = taskService.createTask({ title: 'Task 1' });
      const task2 = taskService.createTask({ title: 'Task 2' });
      metadataService.setMetadata({ task_id: task1.id, key: 'shared-key', value: 'task1-value' });

      const result = metadataService.getMetadataByKey(task2.id, 'shared-key');

      expect(result).toBeNull();
    });
  });

  describe('listMetadata', () => {
    it('should return all metadata for a task', () => {
      const task = taskService.createTask({ title: 'Test task' });
      metadataService.setMetadata({ task_id: task.id, key: 'a', value: '1' });
      metadataService.setMetadata({ task_id: task.id, key: 'b', value: '2' });
      metadataService.setMetadata({ task_id: task.id, key: 'c', value: '3' });

      const list = metadataService.listMetadata(task.id);

      expect(list).toHaveLength(3);
      const keys = list.map((m) => m.key);
      expect(keys).toContain('a');
      expect(keys).toContain('b');
      expect(keys).toContain('c');
    });

    it('should return empty array when task has no metadata', () => {
      const task = taskService.createTask({ title: 'Test task' });

      const list = metadataService.listMetadata(task.id);

      expect(list).toEqual([]);
    });

    it('should return empty array for non-existent task ID', () => {
      const list = metadataService.listMetadata(99999);

      expect(list).toEqual([]);
    });

    it('should only return metadata for the specified task', () => {
      const task1 = taskService.createTask({ title: 'Task 1' });
      const task2 = taskService.createTask({ title: 'Task 2' });
      metadataService.setMetadata({ task_id: task1.id, key: 'k1', value: 'v1' });
      metadataService.setMetadata({ task_id: task2.id, key: 'k2', value: 'v2' });

      const list = metadataService.listMetadata(task1.id);

      expect(list).toHaveLength(1);
      expect(list[0].key).toBe('k1');
    });

    it('should return metadata ordered by created_at DESC', () => {
      const task = taskService.createTask({ title: 'Test task' });
      metadataService.setMetadata({ task_id: task.id, key: 'first', value: '1' });
      metadataService.setMetadata({ task_id: task.id, key: 'second', value: '2' });

      const list = metadataService.listMetadata(task.id);

      // Entries are ordered by created_at DESC; the last inserted appears first
      expect(list).toHaveLength(2);
      expect(list[0].key).toBe('second');
      expect(list[1].key).toBe('first');
    });
  });

  describe('deleteMetadata', () => {
    it('should delete existing metadata and return true', () => {
      const task = taskService.createTask({ title: 'Test task' });
      metadataService.setMetadata({ task_id: task.id, key: 'temp', value: 'data' });

      const result = metadataService.deleteMetadata(task.id, 'temp');

      expect(result).toBe(true);
      expect(metadataService.getMetadataByKey(task.id, 'temp')).toBeNull();
    });

    it('should return false when metadata does not exist', () => {
      const task = taskService.createTask({ title: 'Test task' });

      const result = metadataService.deleteMetadata(task.id, 'nonexistent');

      expect(result).toBe(false);
    });

    it('should only delete the specified key, not other keys', () => {
      const task = taskService.createTask({ title: 'Test task' });
      metadataService.setMetadata({ task_id: task.id, key: 'keep', value: 'here' });
      metadataService.setMetadata({ task_id: task.id, key: 'remove', value: 'gone' });

      metadataService.deleteMetadata(task.id, 'remove');

      expect(metadataService.getMetadataByKey(task.id, 'keep')).not.toBeNull();
      expect(metadataService.getMetadataByKey(task.id, 'remove')).toBeNull();
    });

    it('should return false for non-existent task ID', () => {
      const result = metadataService.deleteMetadata(99999, 'somekey');

      expect(result).toBe(false);
    });
  });

  describe('getAllTasksMetadata', () => {
    it('should return an empty map when no metadata exists', () => {
      const result = metadataService.getAllTasksMetadata();

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });

    it('should return a map of task_id to metadata arrays', () => {
      const task1 = taskService.createTask({ title: 'Task 1' });
      const task2 = taskService.createTask({ title: 'Task 2' });
      metadataService.setMetadata({ task_id: task1.id, key: 'x', value: '10' });
      metadataService.setMetadata({ task_id: task1.id, key: 'y', value: '20' });
      metadataService.setMetadata({ task_id: task2.id, key: 'z', value: '30' });

      const result = metadataService.getAllTasksMetadata();

      expect(result.size).toBe(2);
      expect(result.get(task1.id)).toHaveLength(2);
      expect(result.get(task2.id)).toHaveLength(1);
    });

    it('should not include tasks without metadata in the map', () => {
      const task1 = taskService.createTask({ title: 'Task with metadata' });
      const task2 = taskService.createTask({ title: 'Task without metadata' });
      metadataService.setMetadata({ task_id: task1.id, key: 'key', value: 'val' });

      const result = metadataService.getAllTasksMetadata();

      expect(result.has(task1.id)).toBe(true);
      expect(result.has(task2.id)).toBe(false);
    });

    it('should contain correct metadata values for each task', () => {
      const task = taskService.createTask({ title: 'Task' });
      metadataService.setMetadata({ task_id: task.id, key: 'env', value: 'staging' });

      const result = metadataService.getAllTasksMetadata();

      const taskMeta = result.get(task.id);
      expect(taskMeta).toBeDefined();
      expect(taskMeta![0].key).toBe('env');
      expect(taskMeta![0].value).toBe('staging');
    });
  });

  describe('deleteAllMetadata', () => {
    it('should delete all metadata for a task and return count', () => {
      const task = taskService.createTask({ title: 'Test task' });
      metadataService.setMetadata({ task_id: task.id, key: 'a', value: '1' });
      metadataService.setMetadata({ task_id: task.id, key: 'b', value: '2' });
      metadataService.setMetadata({ task_id: task.id, key: 'c', value: '3' });

      const count = metadataService.deleteAllMetadata(task.id);

      expect(count).toBe(3);
      expect(metadataService.listMetadata(task.id)).toHaveLength(0);
    });

    it('should return 0 when task has no metadata', () => {
      const task = taskService.createTask({ title: 'Test task' });

      const count = metadataService.deleteAllMetadata(task.id);

      expect(count).toBe(0);
    });

    it('should only delete metadata for the specified task', () => {
      const task1 = taskService.createTask({ title: 'Task 1' });
      const task2 = taskService.createTask({ title: 'Task 2' });
      metadataService.setMetadata({ task_id: task1.id, key: 'k1', value: 'v1' });
      metadataService.setMetadata({ task_id: task2.id, key: 'k2', value: 'v2' });

      metadataService.deleteAllMetadata(task1.id);

      expect(metadataService.listMetadata(task1.id)).toHaveLength(0);
      expect(metadataService.listMetadata(task2.id)).toHaveLength(1);
    });

    it('should return 0 for non-existent task ID', () => {
      const count = metadataService.deleteAllMetadata(99999);

      expect(count).toBe(0);
    });
  });

  describe('CASCADE DELETE', () => {
    it('should delete all metadata when the parent task is deleted', () => {
      const task = taskService.createTask({ title: 'Test task' });
      metadataService.setMetadata({ task_id: task.id, key: 'will-be-gone', value: 'data' });

      taskService.deleteTask(task.id);

      const remaining = metadataService.listMetadata(task.id);
      expect(remaining).toHaveLength(0);
    });
  });
});
