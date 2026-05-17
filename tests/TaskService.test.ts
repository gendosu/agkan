import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TaskService } from '../src/services/TaskService';
import { TagService } from '../src/services/TagService';
import { resetDatabase } from '../src/db/reset';
import { createMockStorageBackend } from './utils/mock-database';
import type { StorageBackend } from '../src/db/types/repository';

describe('TaskService', () => {
  let taskService: TaskService;

  beforeEach(() => {
    // Reset database before each test
    resetDatabase();
    taskService = new TaskService();
  });

  describe('createTask', () => {
    it('Basic task creation test - Create task by specifying only title', () => {
      // Create a task
      const task = taskService.createTask({
        title: 'Test Task',
      });

      // Verify
      expect(task).toBeDefined();
      expect(task.id).toBeDefined();
      expect(typeof task.id).toBe('number');
      expect(task.id).toBeGreaterThan(0);

      expect(task.title).toBe('Test Task');

      expect(task.created_at).toBeDefined();
      expect(typeof task.created_at).toBe('string');

      expect(task.updated_at).toBeDefined();
      expect(typeof task.updated_at).toBe('string');

      expect(task.status).toBe('backlog');
    });

    it('Complete task creation test - Create task by specifying all fields', () => {
      // Create a task with all fields specified
      const task = taskService.createTask({
        title: 'Complete Task',
        body: 'Detailed task description',
        author: 'Test Author',
        status: 'in_progress',
      });

      // Verify specified fields
      expect(task.title).toBe('Complete Task');
      expect(task.body).toBe('Detailed task description');
      expect(task.author).toBe('Test Author');
      expect(task.status).toBe('in_progress');

      // Verify auto-generated fields
      expect(task.id).toBeDefined();
      expect(typeof task.id).toBe('number');
      expect(task.id).toBeGreaterThan(0);

      expect(task.created_at).toBeDefined();
      expect(typeof task.created_at).toBe('string');

      expect(task.updated_at).toBeDefined();
      expect(typeof task.updated_at).toBe('string');
    });

    it('Error when required field (title) is empty', () => {
      expect(() => {
        taskService.createTask({ title: '' });
      }).toThrow('Title is required');
    });

    it('Error when title contains only whitespace', () => {
      expect(() => {
        taskService.createTask({ title: '   ' });
      }).toThrow('Title is required');
    });

    it('Error when title exceeds 200 characters', () => {
      expect(() => {
        taskService.createTask({ title: 'a'.repeat(201) });
      }).toThrow('Title must not exceed 200 characters');
    });

    it('Error when body exceeds 10000 characters', () => {
      expect(() => {
        taskService.createTask({ title: 'valid title', body: 'b'.repeat(10001) });
      }).toThrow('Body must not exceed 10000 characters');
    });

    it('Error when author exceeds 100 characters', () => {
      expect(() => {
        taskService.createTask({ title: 'valid title', author: 'c'.repeat(101) });
      }).toThrow('Author must not exceed 100 characters');
    });

    it('Create task with assignees specified', () => {
      const task = taskService.createTask({
        title: 'Test Task',
        assignees: 'user1,user2,user3',
      });

      expect(task.assignees).toBe('user1,user2,user3');
    });

    it('assignees becomes null when not specified', () => {
      const task = taskService.createTask({ title: 'Test Task' });

      expect(task.assignees).toBeNull();
    });

    it('Error when assignees exceeds 500 characters', () => {
      expect(() => {
        taskService.createTask({ title: 'valid title', assignees: 'a'.repeat(501) });
      }).toThrow('Assignees must not exceed 500 characters');
    });

    it('Create task with priority specified', () => {
      const task = taskService.createTask({
        title: 'Test Task',
        priority: 'high',
      });

      expect(task.priority).toBe('high');
    });

    it('priority becomes null when not specified', () => {
      const task = taskService.createTask({ title: 'Test Task' });

      expect(task.priority).toBeNull();
    });

    it('Can create tasks with all priority values', () => {
      const priorities = ['critical', 'high', 'medium', 'low'] as const;
      for (const priority of priorities) {
        const task = taskService.createTask({
          title: `Task-${priority}`,
          priority,
        });
        expect(task.priority).toBe(priority);
      }
    });

    it('Create task with branch specified', () => {
      const task = taskService.createTask({
        title: 'Test Task',
        branch: 'feature/my-branch',
      });

      expect(task.branch).toBe('feature/my-branch');
    });

    it('branch becomes null when not specified', () => {
      const task = taskService.createTask({ title: 'Test Task' });

      expect(task.branch).toBeNull();
    });
  });

  describe('getTask', () => {
    it('Get task by ID when task exists', () => {
      // Create a task for testing
      const createdTask = taskService.createTask({
        title: 'Get Test Task',
        body: 'This task is for get testing',
        author: 'Tester',
        status: 'in_progress',
      });

      // Get the created task by ID
      const retrievedTask = taskService.getTask(createdTask.id);

      // Verify the retrieved task exists
      expect(retrievedTask).toBeDefined();

      // Verify all fields are retrieved correctly
      expect(retrievedTask!.id).toBe(createdTask.id);
      expect(retrievedTask!.title).toBe('Get Test Task');
      expect(retrievedTask!.body).toBe('This task is for get testing');
      expect(retrievedTask!.author).toBe('Tester');
      expect(retrievedTask!.status).toBe('in_progress');
      expect(retrievedTask!.created_at).toBeDefined();
      expect(retrievedTask!.updated_at).toBeDefined();
    });

    it('Get task by ID when task does not exist', () => {
      // Try to get a task with non-existent ID
      const retrievedTask = taskService.getTask(99999);

      // Verify null is returned
      expect(retrievedTask).toBeNull();
    });
  });

  describe('listTasks', () => {
    it('Get all tasks without filter - Create multiple tasks and retrieve all in descending order by creation time', () => {
      // Create multiple tasks (ensure created_at is different by creating sequentially)
      const task1 = taskService.createTask({
        title: 'First Task',
        body: 'Oldest task',
        author: 'User A',
        status: 'backlog',
      });

      const task2 = taskService.createTask({
        title: 'Second Task',
        body: 'Second created task',
        author: 'User B',
        status: 'in_progress',
      });

      const task3 = taskService.createTask({
        title: 'Third Task',
        body: 'Latest task',
        author: 'User C',
        status: 'done',
      });

      // Get all tasks without filter
      const allTasks = taskService.listTasks();

      // Verify 3 tasks are retrieved
      expect(allTasks).toBeDefined();
      expect(allTasks.length).toBe(3);

      // Verify tasks are retrieved in descending order by created_at (newest first)
      expect(allTasks[0].id).toBe(task3.id);
      expect(allTasks[0].title).toBe('Third Task');
      expect(allTasks[1].id).toBe(task2.id);
      expect(allTasks[1].title).toBe('Second Task');
      expect(allTasks[2].id).toBe(task1.id);
      expect(allTasks[2].title).toBe('First Task');

      // Verify each task's fields are retrieved correctly
      expect(allTasks[0].body).toBe('Latest task');
      expect(allTasks[0].author).toBe('User C');
      expect(allTasks[0].status).toBe('done');
      expect(allTasks[0].created_at).toBeDefined();
      expect(allTasks[0].updated_at).toBeDefined();
    });

    it('Filter by status - Create multiple tasks with different statuses and filter by specific status', () => {
      // Create tasks with different statuses
      const task1 = taskService.createTask({
        title: 'Backlog Task',
        body: 'Task with backlog status',
        author: 'User A',
        status: 'backlog',
      });

      const task2 = taskService.createTask({
        title: 'In Progress Task 1',
        body: 'Task with in_progress status 1',
        author: 'User B',
        status: 'in_progress',
      });

      const task3 = taskService.createTask({
        title: 'In Progress Task 2',
        body: 'Task with in_progress status 2',
        author: 'User C',
        status: 'in_progress',
      });

      const task4 = taskService.createTask({
        title: 'Completed Task',
        body: 'Task with done status',
        author: 'User D',
        status: 'done',
      });

      // Filter by in_progress status
      const inProgressTasks = taskService.listTasks({ status: 'in_progress' });

      // Verify 2 in_progress tasks are retrieved
      expect(inProgressTasks).toBeDefined();
      expect(inProgressTasks.length).toBe(2);

      // Verify all retrieved tasks have in_progress status
      expect(inProgressTasks[0].status).toBe('in_progress');
      expect(inProgressTasks[1].status).toBe('in_progress');

      // Verify tasks are retrieved in newest order (descending by created_at)
      expect(inProgressTasks[0].id).toBe(task3.id);
      expect(inProgressTasks[0].title).toBe('In Progress Task 2');
      expect(inProgressTasks[1].id).toBe(task2.id);
      expect(inProgressTasks[1].title).toBe('In Progress Task 1');

      // Verify tasks with other statuses are not included
      const taskIds = inProgressTasks.map((t) => t.id);
      expect(taskIds).not.toContain(task1.id); // backlog task is not included
      expect(taskIds).not.toContain(task4.id); // done task is not included
    });

    it('Filter by author - Create multiple tasks by different authors and filter by specific author', () => {
      // Create tasks by different authors
      const task1 = taskService.createTask({
        title: "Alice's Task 1",
        body: 'Task 1 created by Alice',
        author: 'Alice',
        status: 'backlog',
      });

      const task2 = taskService.createTask({
        title: "Bob's Task 1",
        body: 'Task 1 created by Bob',
        author: 'Bob',
        status: 'in_progress',
      });

      const task3 = taskService.createTask({
        title: "Bob's Task 2",
        body: 'Task 2 created by Bob',
        author: 'Bob',
        status: 'done',
      });

      const task4 = taskService.createTask({
        title: "Charlie's Task 1",
        body: 'Task 1 created by Charlie',
        author: 'Charlie',
        status: 'backlog',
      });

      const task5 = taskService.createTask({
        title: "Bob's Task 3",
        body: 'Task 3 created by Bob',
        author: 'Bob',
        status: 'backlog',
      });

      // Filter by Bob as author
      const bobTasks = taskService.listTasks({ author: 'Bob' });

      // Verify 3 tasks by Bob are retrieved
      expect(bobTasks).toBeDefined();
      expect(bobTasks.length).toBe(3);

      // Verify all retrieved tasks are created by Bob
      expect(bobTasks[0].author).toBe('Bob');
      expect(bobTasks[1].author).toBe('Bob');
      expect(bobTasks[2].author).toBe('Bob');

      // Verify tasks are retrieved in newest order (descending by created_at)
      expect(bobTasks[0].id).toBe(task5.id);
      expect(bobTasks[0].title).toBe("Bob's Task 3");
      expect(bobTasks[1].id).toBe(task3.id);
      expect(bobTasks[1].title).toBe("Bob's Task 2");
      expect(bobTasks[2].id).toBe(task2.id);
      expect(bobTasks[2].title).toBe("Bob's Task 1");

      // Verify tasks by other authors are not included
      const taskIds = bobTasks.map((t) => t.id);
      expect(taskIds).not.toContain(task1.id); // Alice's task is not included
      expect(taskIds).not.toContain(task4.id); // Charlie's task is not included
    });

    it('Combined filter (status + author) - Filter by both status and author', () => {
      // Create tasks with different status and author combinations
      const task1 = taskService.createTask({
        title: 'Alice - Backlog',
        body: "Alice's backlog task",
        author: 'Alice',
        status: 'backlog',
      });

      const task2 = taskService.createTask({
        title: 'Alice - In Progress',
        body: "Alice's in_progress task",
        author: 'Alice',
        status: 'in_progress',
      });

      const task3 = taskService.createTask({
        title: 'Bob - Backlog',
        body: "Bob's backlog task",
        author: 'Bob',
        status: 'backlog',
      });

      const task4 = taskService.createTask({
        title: 'Bob - In Progress',
        body: "Bob's in_progress task",
        author: 'Bob',
        status: 'in_progress',
      });

      const task5 = taskService.createTask({
        title: 'Alice - Done',
        body: "Alice's done task",
        author: 'Alice',
        status: 'done',
      });

      // Filter by status='in_progress' AND author='Alice'
      const filteredTasks = taskService.listTasks({ status: 'in_progress', author: 'Alice' });

      // Verify only 1 task is retrieved
      expect(filteredTasks).toBeDefined();
      expect(filteredTasks.length).toBe(1);

      // Verify the retrieved task meets both conditions
      expect(filteredTasks[0].id).toBe(task2.id);
      expect(filteredTasks[0].title).toBe('Alice - In Progress');
      expect(filteredTasks[0].status).toBe('in_progress');
      expect(filteredTasks[0].author).toBe('Alice');

      // Verify other tasks are not included
      const taskIds = filteredTasks.map((t) => t.id);
      expect(taskIds).not.toContain(task1.id); // Alice's backlog is not included
      expect(taskIds).not.toContain(task3.id); // Bob's backlog is not included
      expect(taskIds).not.toContain(task4.id); // Bob's in_progress is not included
      expect(taskIds).not.toContain(task5.id); // Alice's done is not included
    });

    it('Filter by assignees - Use LIKE matching to narrow down CSV format assignees field', () => {
      const task1 = taskService.createTask({
        title: 'Task assigned to Alice',
        assignees: 'Alice',
        status: 'backlog',
      });

      const task2 = taskService.createTask({
        title: 'Task assigned to Alice and Bob',
        assignees: 'Alice,Bob',
        status: 'in_progress',
      });

      const task3 = taskService.createTask({
        title: 'Task assigned to Bob',
        assignees: 'Bob',
        status: 'backlog',
      });

      const task4 = taskService.createTask({
        title: 'Task assigned to Charlie',
        assignees: 'Charlie',
        status: 'backlog',
      });

      taskService.createTask({
        title: 'Task with no assignees',
        status: 'backlog',
      });

      // Filter by Alice: task1, task2 match
      const aliceTasks = taskService.listTasks({ assignees: 'Alice' });
      expect(aliceTasks).toHaveLength(2);
      const aliceIds = aliceTasks.map((t) => t.id);
      expect(aliceIds).toContain(task1.id);
      expect(aliceIds).toContain(task2.id);

      // Filter by Bob: task2, task3 match
      const bobTasks = taskService.listTasks({ assignees: 'Bob' });
      expect(bobTasks).toHaveLength(2);
      const bobIds = bobTasks.map((t) => t.id);
      expect(bobIds).toContain(task2.id);
      expect(bobIds).toContain(task3.id);

      // Filter by Charlie: task4 only
      const charlieTasks = taskService.listTasks({ assignees: 'Charlie' });
      expect(charlieTasks).toHaveLength(1);
      expect(charlieTasks[0].id).toBe(task4.id);

      // Filter by non-existent assignee: 0 results
      const nonExistentTasks = taskService.listTasks({ assignees: 'David' });
      expect(nonExistentTasks).toHaveLength(0);
    });

    it('Combined filter with assignees - Combination of assignees and status', () => {
      taskService.createTask({
        title: 'Alice backlog',
        assignees: 'Alice',
        status: 'backlog',
      });

      const task2 = taskService.createTask({
        title: 'Alice in_progress',
        assignees: 'Alice',
        status: 'in_progress',
      });

      taskService.createTask({
        title: 'Bob in_progress',
        assignees: 'Bob',
        status: 'in_progress',
      });

      // assignees='Alice' AND status='in_progress'
      const filtered = taskService.listTasks({ assignees: 'Alice', status: 'in_progress' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe(task2.id);
    });

    it('Filter by multiple statuses - Specify status array to get tasks with multiple statuses simultaneously', () => {
      const task1 = taskService.createTask({
        title: 'Backlog Task',
        status: 'backlog',
      });

      const task2 = taskService.createTask({
        title: 'Ready Task',
        status: 'ready',
      });

      const task3 = taskService.createTask({
        title: 'In Progress Task',
        status: 'in_progress',
      });

      const task4 = taskService.createTask({
        title: 'Done Task',
        status: 'done',
      });

      // Filter by multiple statuses (backlog, ready)
      const filteredTasks = taskService.listTasks({ status: ['backlog', 'ready'] });

      expect(filteredTasks).toBeDefined();
      expect(filteredTasks.length).toBe(2);
      expect(filteredTasks.every((t) => t.status === 'backlog' || t.status === 'ready')).toBe(true);

      const taskIds = filteredTasks.map((t) => t.id);
      expect(taskIds).toContain(task1.id);
      expect(taskIds).toContain(task2.id);
      expect(taskIds).not.toContain(task3.id);
      expect(taskIds).not.toContain(task4.id);
    });

    it('Combined filter with multiple statuses and author', () => {
      taskService.createTask({
        title: 'Alice Backlog',
        author: 'Alice',
        status: 'backlog',
      });

      taskService.createTask({
        title: 'Alice In Progress',
        author: 'Alice',
        status: 'in_progress',
      });

      taskService.createTask({
        title: 'Bob Backlog',
        author: 'Bob',
        status: 'backlog',
      });

      taskService.createTask({
        title: 'Alice Done',
        author: 'Alice',
        status: 'done',
      });

      // Multiple statuses + author filter
      const filteredTasks = taskService.listTasks({
        status: ['backlog', 'in_progress'],
        author: 'Alice',
      });

      expect(filteredTasks.length).toBe(2);
      expect(filteredTasks.every((t) => t.author === 'Alice')).toBe(true);
      expect(filteredTasks.every((t) => t.status === 'backlog' || t.status === 'in_progress')).toBe(true);
    });

    it('Filter works correctly when single status is passed as array', () => {
      taskService.createTask({ title: 'Ready Task', status: 'ready' });
      taskService.createTask({ title: 'Backlog Task', status: 'backlog' });

      const filteredTasks = taskService.listTasks({ status: ['ready'] });

      expect(filteredTasks.length).toBe(1);
      expect(filteredTasks[0].status).toBe('ready');
    });

    it('Can sort by id in ascending order', () => {
      const task1 = taskService.createTask({ title: 'Task A', status: 'backlog' });
      const task2 = taskService.createTask({ title: 'Task B', status: 'backlog' });
      const task3 = taskService.createTask({ title: 'Task C', status: 'backlog' });

      const tasks = taskService.listTasks({}, 'id', 'asc');
      expect(tasks[0].id).toBe(task1.id);
      expect(tasks[1].id).toBe(task2.id);
      expect(tasks[2].id).toBe(task3.id);
    });

    it('Can sort by id in descending order', () => {
      const task1 = taskService.createTask({ title: 'Task A', status: 'backlog' });
      const task2 = taskService.createTask({ title: 'Task B', status: 'backlog' });
      const task3 = taskService.createTask({ title: 'Task C', status: 'backlog' });

      const tasks = taskService.listTasks({}, 'id', 'desc');
      expect(tasks[0].id).toBe(task3.id);
      expect(tasks[1].id).toBe(task2.id);
      expect(tasks[2].id).toBe(task1.id);
    });

    it('Can sort by title in ascending order', () => {
      taskService.createTask({ title: 'Charlie', status: 'backlog' });
      taskService.createTask({ title: 'Alice', status: 'backlog' });
      taskService.createTask({ title: 'Bob', status: 'backlog' });

      const tasks = taskService.listTasks({}, 'title', 'asc');
      expect(tasks[0].title).toBe('Alice');
      expect(tasks[1].title).toBe('Bob');
      expect(tasks[2].title).toBe('Charlie');
    });

    it('Can sort by status in ascending order', () => {
      taskService.createTask({ title: 'Task In Progress', status: 'in_progress' });
      taskService.createTask({ title: 'Task Backlog', status: 'backlog' });
      taskService.createTask({ title: 'Task Done', status: 'done' });

      const tasks = taskService.listTasks({}, 'status', 'asc');
      expect(tasks[0].status).toBe('backlog');
      expect(tasks[1].status).toBe('done');
      expect(tasks[2].status).toBe('in_progress');
    });

    it('Can sort by updated_at in descending order', () => {
      const task1 = taskService.createTask({ title: 'Task A', status: 'backlog' });
      taskService.createTask({ title: 'Task B', status: 'backlog' });
      // Update task1 to make its updated_at newer
      taskService.updateTask(task1.id, { title: 'Task A Updated' });

      const tasks = taskService.listTasks({}, 'updated_at', 'desc');
      expect(tasks[0].title).toBe('Task A Updated');
    });

    it('Default sort remains created_at descending', () => {
      const task1 = taskService.createTask({ title: 'First', status: 'backlog' });
      const task2 = taskService.createTask({ title: 'Second', status: 'backlog' });

      const tasks = taskService.listTasks();
      expect(tasks[0].id).toBe(task2.id);
      expect(tasks[1].id).toBe(task1.id);
    });

    it('Can use filters and sort together', () => {
      taskService.createTask({ title: 'Charlie', status: 'in_progress' });
      taskService.createTask({ title: 'Alice', status: 'in_progress' });
      taskService.createTask({ title: 'Bob', status: 'backlog' });

      const tasks = taskService.listTasks({ status: 'in_progress' }, 'title', 'asc');
      expect(tasks.length).toBe(2);
      expect(tasks[0].title).toBe('Alice');
      expect(tasks[1].title).toBe('Charlie');
    });

    it('Can filter tasks by priority', () => {
      taskService.createTask({ title: 'Critical Task', priority: 'critical' });
      taskService.createTask({ title: 'High Task', priority: 'high' });
      taskService.createTask({ title: 'No Priority Task' });

      const criticalTasks = taskService.listTasks({ priority: 'critical' });
      expect(criticalTasks.length).toBe(1);
      expect(criticalTasks[0].title).toBe('Critical Task');

      const highTasks = taskService.listTasks({ priority: 'high' });
      expect(highTasks.length).toBe(1);
      expect(highTasks[0].title).toBe('High Task');
    });

    it('Can sort by priority in descending order (critical > high > medium > low > unset)', () => {
      taskService.createTask({ title: 'Low Task', priority: 'low' });
      taskService.createTask({ title: 'No Priority Task' });
      taskService.createTask({ title: 'High Task', priority: 'high' });
      taskService.createTask({ title: 'Critical Task', priority: 'critical' });
      taskService.createTask({ title: 'Medium Task', priority: 'medium' });

      const tasks = taskService.listTasks({}, 'priority', 'desc');
      expect(tasks[0].title).toBe('Critical Task');
      expect(tasks[1].title).toBe('High Task');
      expect(tasks[2].title).toBe('Medium Task');
      expect(tasks[3].title).toBe('Low Task');
      expect(tasks[4].title).toBe('No Priority Task');
    });

    it('Can sort by priority in ascending order (unset > low > medium > high > critical)', () => {
      taskService.createTask({ title: 'Low Task', priority: 'low' });
      taskService.createTask({ title: 'No Priority Task' });
      taskService.createTask({ title: 'High Task', priority: 'high' });
      taskService.createTask({ title: 'Critical Task', priority: 'critical' });
      taskService.createTask({ title: 'Medium Task', priority: 'medium' });

      const tasks = taskService.listTasks({}, 'priority', 'asc');
      expect(tasks[0].title).toBe('No Priority Task');
      expect(tasks[1].title).toBe('Low Task');
      expect(tasks[2].title).toBe('Medium Task');
      expect(tasks[3].title).toBe('High Task');
      expect(tasks[4].title).toBe('Critical Task');
    });
  });

  describe('updateTask', () => {
    it('Update title - After creating a task, update only the title and verify other fields are unchanged', () => {
      // Create a task with complete data
      const createdTask = taskService.createTask({
        title: 'Original Title',
        body: 'Original Body',
        author: 'Original Author',
        status: 'in_progress',
      });

      // Save original values
      const originalTitle = createdTask.title;
      const originalBody = createdTask.body;
      const originalAuthor = createdTask.author;
      const originalStatus = createdTask.status;
      const originalCreatedAt = createdTask.created_at;

      // Update only the title
      const updatedTask = taskService.updateTask(createdTask.id, {
        title: 'New Title',
      });

      // Verify the updated task is returned
      expect(updatedTask).toBeDefined();
      expect(updatedTask).not.toBeNull();

      // Verify the title is updated
      expect(updatedTask!.title).toBe('New Title');
      expect(updatedTask!.title).not.toBe(originalTitle);

      // Verify other fields are unchanged
      expect(updatedTask!.body).toBe(originalBody);
      expect(updatedTask!.author).toBe(originalAuthor);
      expect(updatedTask!.status).toBe(originalStatus);
      expect(updatedTask!.created_at).toBe(originalCreatedAt);

      // Verify updated_at is updated
      expect(updatedTask!.updated_at).toBeDefined();
      // Note: Depending on timestamp precision, updated_at might be the same value,
      // but at least verify the updated_at field exists
      expect(typeof updatedTask!.updated_at).toBe('string');

      // Verify the same result is obtained via getTask()
      const retrievedTask = taskService.getTask(createdTask.id);
      expect(retrievedTask).toBeDefined();
      expect(retrievedTask!.title).toBe('New Title');
      expect(retrievedTask!.body).toBe(originalBody);
      expect(retrievedTask!.author).toBe(originalAuthor);
      expect(retrievedTask!.status).toBe(originalStatus);
    });

    it('Update body - After creating a task, update only the body and verify other fields are unchanged', () => {
      // Create a task with complete data
      const createdTask = taskService.createTask({
        title: 'Original Title',
        body: 'Original Body',
        author: 'Original Author',
        status: 'in_progress',
      });

      // Save original values
      const originalTitle = createdTask.title;
      const originalBody = createdTask.body;
      const originalAuthor = createdTask.author;
      const originalStatus = createdTask.status;
      const originalCreatedAt = createdTask.created_at;

      // Update only the body
      const updatedTask = taskService.updateTask(createdTask.id, {
        body: 'New Body',
      });

      // Verify the updated task is returned
      expect(updatedTask).toBeDefined();
      expect(updatedTask).not.toBeNull();

      // Verify the body is updated
      expect(updatedTask!.body).toBe('New Body');
      expect(updatedTask!.body).not.toBe(originalBody);

      // Verify other fields are unchanged
      expect(updatedTask!.title).toBe(originalTitle);
      expect(updatedTask!.author).toBe(originalAuthor);
      expect(updatedTask!.status).toBe(originalStatus);
      expect(updatedTask!.created_at).toBe(originalCreatedAt);

      // Verify updated_at is updated
      expect(updatedTask!.updated_at).toBeDefined();
      expect(typeof updatedTask!.updated_at).toBe('string');

      // Verify the same result is obtained via getTask()
      const retrievedTask = taskService.getTask(createdTask.id);
      expect(retrievedTask).toBeDefined();
      expect(retrievedTask!.body).toBe('New Body');
      expect(retrievedTask!.title).toBe(originalTitle);
      expect(retrievedTask!.author).toBe(originalAuthor);
      expect(retrievedTask!.status).toBe(originalStatus);
    });

    it('Update author - After creating a task, update only the author and verify other fields are unchanged', () => {
      // Create a task with complete data
      const createdTask = taskService.createTask({
        title: 'Original Title',
        body: 'Original Body',
        author: 'Original Author',
        status: 'in_progress',
      });

      // Save original values
      const originalTitle = createdTask.title;
      const originalBody = createdTask.body;
      const originalAuthor = createdTask.author;
      const originalStatus = createdTask.status;
      const originalCreatedAt = createdTask.created_at;

      // Update only the author
      const updatedTask = taskService.updateTask(createdTask.id, {
        author: 'New Author',
      });

      // Verify the updated task is returned
      expect(updatedTask).toBeDefined();
      expect(updatedTask).not.toBeNull();

      // Verify the author is updated
      expect(updatedTask!.author).toBe('New Author');
      expect(updatedTask!.author).not.toBe(originalAuthor);

      // Verify other fields are unchanged
      expect(updatedTask!.title).toBe(originalTitle);
      expect(updatedTask!.body).toBe(originalBody);
      expect(updatedTask!.status).toBe(originalStatus);
      expect(updatedTask!.created_at).toBe(originalCreatedAt);

      // Verify updated_at is updated
      expect(updatedTask!.updated_at).toBeDefined();
      expect(typeof updatedTask!.updated_at).toBe('string');

      // Verify the same result is obtained via getTask()
      const retrievedTask = taskService.getTask(createdTask.id);
      expect(retrievedTask).toBeDefined();
      expect(retrievedTask!.author).toBe('New Author');
      expect(retrievedTask!.title).toBe(originalTitle);
      expect(retrievedTask!.body).toBe(originalBody);
      expect(retrievedTask!.status).toBe(originalStatus);
    });

    it('Update assignees - After creating a task, update assignees and verify other fields are unchanged', () => {
      const createdTask = taskService.createTask({
        title: 'Original Title',
        body: 'Original Body',
        author: 'Original Author',
        assignees: 'user1,user2',
        status: 'in_progress',
      });

      const originalTitle = createdTask.title;
      const originalBody = createdTask.body;
      const originalAuthor = createdTask.author;
      const originalStatus = createdTask.status;

      const updatedTask = taskService.updateTask(createdTask.id, {
        assignees: 'user3,user4,user5',
      });

      expect(updatedTask).toBeDefined();
      expect(updatedTask).not.toBeNull();
      expect(updatedTask!.assignees).toBe('user3,user4,user5');
      expect(updatedTask!.title).toBe(originalTitle);
      expect(updatedTask!.body).toBe(originalBody);
      expect(updatedTask!.author).toBe(originalAuthor);
      expect(updatedTask!.status).toBe(originalStatus);
    });

    it('Error when assignees exceeds 500 characters during update', () => {
      const createdTask = taskService.createTask({ title: 'Test Task' });

      expect(() => {
        taskService.updateTask(createdTask.id, { assignees: 'a'.repeat(501) });
      }).toThrow('Assignees must not exceed 500 characters');
    });

    it('Empty string for assignees is converted to null', () => {
      const createdTask = taskService.createTask({
        title: 'Test Task',
        assignees: 'user1,user2',
      });

      const updatedTask = taskService.updateTask(createdTask.id, {
        assignees: '',
      });

      expect(updatedTask).toBeDefined();
      expect(updatedTask).not.toBeNull();
      expect(updatedTask!.assignees).toBeNull();
    });

    it('Update priority - Can set priority', () => {
      const createdTask = taskService.createTask({ title: 'Test Task' });

      const updatedTask = taskService.updateTask(createdTask.id, {
        priority: 'critical',
      });

      expect(updatedTask).toBeDefined();
      expect(updatedTask!.priority).toBe('critical');
    });

    it('Update priority - Can set priority to null', () => {
      const createdTask = taskService.createTask({
        title: 'Test Task',
        priority: 'high',
      });

      const updatedTask = taskService.updateTask(createdTask.id, {
        priority: null,
      });

      expect(updatedTask).toBeDefined();
      expect(updatedTask!.priority).toBeNull();
    });

    it('Update status - After creating a task, update only the status and verify other fields are unchanged', () => {
      // Create a task with complete data
      const createdTask = taskService.createTask({
        title: 'Original Title',
        body: 'Original Body',
        author: 'Original Author',
        status: 'backlog',
      });

      // Save original values
      const originalTitle = createdTask.title;
      const originalBody = createdTask.body;
      const originalAuthor = createdTask.author;
      const originalStatus = createdTask.status;
      const originalCreatedAt = createdTask.created_at;

      // Update only the status (backlog → ready)
      const updatedTask = taskService.updateTask(createdTask.id, {
        status: 'ready',
      });

      // Verify the updated task is returned
      expect(updatedTask).toBeDefined();
      expect(updatedTask).not.toBeNull();

      // Verify the status is updated
      expect(updatedTask!.status).toBe('ready');
      expect(updatedTask!.status).not.toBe(originalStatus);

      // Verify other fields are unchanged
      expect(updatedTask!.title).toBe(originalTitle);
      expect(updatedTask!.body).toBe(originalBody);
      expect(updatedTask!.author).toBe(originalAuthor);
      expect(updatedTask!.created_at).toBe(originalCreatedAt);

      // Verify updated_at is updated
      expect(updatedTask!.updated_at).toBeDefined();
      expect(typeof updatedTask!.updated_at).toBe('string');

      // Verify the same result is obtained via getTask()
      const retrievedTask = taskService.getTask(createdTask.id);
      expect(retrievedTask).toBeDefined();
      expect(retrievedTask!.status).toBe('ready');
      expect(retrievedTask!.title).toBe(originalTitle);
      expect(retrievedTask!.body).toBe(originalBody);
      expect(retrievedTask!.author).toBe(originalAuthor);
    });

    it('Update multiple fields simultaneously - Update title, body, and status at the same time and verify all fields are updated correctly', () => {
      // Create a task with complete data
      const createdTask = taskService.createTask({
        title: 'Original Title',
        body: 'Original Body',
        author: 'Original Author',
        status: 'backlog',
      });

      // Save original values
      const originalTitle = createdTask.title;
      const originalBody = createdTask.body;
      const originalAuthor = createdTask.author;
      const originalStatus = createdTask.status;
      const originalCreatedAt = createdTask.created_at;

      // Update multiple fields simultaneously (title, body, status)
      const updatedTask = taskService.updateTask(createdTask.id, {
        title: 'New Title',
        body: 'New Body',
        status: 'in_progress',
      });

      // Verify the updated task is returned
      expect(updatedTask).toBeDefined();
      expect(updatedTask).not.toBeNull();

      // Verify all updated fields are correct
      expect(updatedTask!.title).toBe('New Title');
      expect(updatedTask!.title).not.toBe(originalTitle);

      expect(updatedTask!.body).toBe('New Body');
      expect(updatedTask!.body).not.toBe(originalBody);

      expect(updatedTask!.status).toBe('in_progress');
      expect(updatedTask!.status).not.toBe(originalStatus);

      // Verify unchanged fields remain the same
      expect(updatedTask!.author).toBe(originalAuthor);
      expect(updatedTask!.created_at).toBe(originalCreatedAt);

      // Verify updated_at is updated
      expect(updatedTask!.updated_at).toBeDefined();
      expect(typeof updatedTask!.updated_at).toBe('string');

      // Verify the same result is obtained via getTask()
      const retrievedTask = taskService.getTask(createdTask.id);
      expect(retrievedTask).toBeDefined();
      expect(retrievedTask!.title).toBe('New Title');
      expect(retrievedTask!.body).toBe('New Body');
      expect(retrievedTask!.status).toBe('in_progress');
      expect(retrievedTask!.author).toBe(originalAuthor);
    });

    it('Update non-existent task - Attempt to update with non-existent ID and verify null is returned', () => {
      // Attempt to update with non-existent ID (99999)
      const updatedTask = taskService.updateTask(99999, {
        title: 'New Title',
      });

      // Verify null is returned
      expect(updatedTask).toBeNull();
    });

    it('Error when updating title to empty string', () => {
      const task = taskService.createTask({ title: 'Original' });
      expect(() => {
        taskService.updateTask(task.id, { title: '' });
      }).toThrow('Title is required');
    });

    it('Error when updating title to exceed 200 characters', () => {
      const task = taskService.createTask({ title: 'Original' });
      expect(() => {
        taskService.updateTask(task.id, { title: 'a'.repeat(201) });
      }).toThrow('Title must not exceed 200 characters');
    });

    it('Error when updating body to exceed 10000 characters', () => {
      const task = taskService.createTask({ title: 'Original' });
      expect(() => {
        taskService.updateTask(task.id, { body: 'b'.repeat(10001) });
      }).toThrow('Body must not exceed 10000 characters');
    });

    it('Error when updating author to exceed 100 characters', () => {
      const task = taskService.createTask({ title: 'Original' });
      expect(() => {
        taskService.updateTask(task.id, { author: 'c'.repeat(101) });
      }).toThrow('Author must not exceed 100 characters');
    });

    it('Update with null values - Set body and author to null and verify null is correctly saved', () => {
      // Create a task with values for body and author
      const createdTask = taskService.createTask({
        title: 'Test Task',
        body: 'Original Body',
        author: 'Original Author',
        status: 'backlog',
      });

      // Verify values are set at creation
      expect(createdTask.body).toBe('Original Body');
      expect(createdTask.author).toBe('Original Author');

      // Update body and author to null
      const updatedTask = taskService.updateTask(createdTask.id, {
        body: null as string | null,
        author: null as string | null,
      });

      // Verify the updated task is returned
      expect(updatedTask).toBeDefined();
      expect(updatedTask).not.toBeNull();

      // Verify body and author are null
      expect(updatedTask!.body).toBeNull();
      expect(updatedTask!.author).toBeNull();

      // Verify other fields are unchanged
      expect(updatedTask!.title).toBe('Test Task');
      expect(updatedTask!.status).toBe('backlog');

      // Verify the same result is obtained via getTask()
      const retrievedTask = taskService.getTask(createdTask.id);
      expect(retrievedTask).toBeDefined();
      expect(retrievedTask!.body).toBeNull();
      expect(retrievedTask!.author).toBeNull();
      expect(retrievedTask!.title).toBe('Test Task');
      expect(retrievedTask!.status).toBe('backlog');
    });

    it('Can update branch', () => {
      const createdTask = taskService.createTask({ title: 'Test Task' });

      const updatedTask = taskService.updateTask(createdTask.id, {
        branch: 'feature/updated-branch',
      });

      expect(updatedTask).toBeDefined();
      expect(updatedTask!.branch).toBe('feature/updated-branch');

      const retrievedTask = taskService.getTask(createdTask.id);
      expect(retrievedTask!.branch).toBe('feature/updated-branch');
    });
  });

  describe('deleteTask', () => {
    it('Delete existing task - After creating a task, delete it and verify deletion success and null return on retrieval', () => {
      // Create a task
      const createdTask = taskService.createTask({
        title: 'Task for Delete Test',
        body: 'This task will be deleted',
        author: 'Tester',
        status: 'backlog',
      });

      // Verify task is created
      expect(createdTask).toBeDefined();
      expect(createdTask.id).toBeDefined();

      // Delete the task
      const deleteResult = taskService.deleteTask(createdTask.id);

      // Verify deletion succeeded (true is returned)
      expect(deleteResult).toBe(true);

      // Retrieve the task after deletion
      const retrievedTask = taskService.getTask(createdTask.id);

      // Verify deleted task returns null
      expect(retrievedTask).toBeNull();
    });

    it('Delete non-existent task - Attempt to delete with non-existent ID and verify false is returned', () => {
      // Attempt to delete with non-existent ID (99999)
      const deleteResult = taskService.deleteTask(99999);

      // Verify deletion failed (false is returned)
      expect(deleteResult).toBe(false);
    });
  });

  describe('Integration scenario tests', () => {
    it('Full task lifecycle test - Verify the complete flow from creation through status transitions, information addition, to deletion', () => {
      // 1. Create task (backlog)
      const createdTask = taskService.createTask({
        title: 'Lifecycle Test Task',
        status: 'backlog',
      });

      expect(createdTask).toBeDefined();
      expect(createdTask.id).toBeDefined();
      expect(createdTask.title).toBe('Lifecycle Test Task');
      expect(createdTask.status).toBe('backlog');
      expect(createdTask.body).toBeNull();
      expect(createdTask.author).toBeNull();

      const taskId = createdTask.id;

      // 2. Update status (backlog → ready)
      const readyTask = taskService.updateTask(taskId, {
        status: 'ready',
      });

      expect(readyTask).toBeDefined();
      expect(readyTask).not.toBeNull();
      expect(readyTask!.status).toBe('ready');
      expect(readyTask!.title).toBe('Lifecycle Test Task');

      // 3. Add body field
      const taskWithBody = taskService.updateTask(taskId, {
        body: 'Detailed task description',
      });

      expect(taskWithBody).toBeDefined();
      expect(taskWithBody).not.toBeNull();
      expect(taskWithBody!.body).toBe('Detailed task description');
      expect(taskWithBody!.status).toBe('ready');

      // 4. Update status (ready → in_progress)
      const inProgressTask = taskService.updateTask(taskId, {
        status: 'in_progress',
      });

      expect(inProgressTask).toBeDefined();
      expect(inProgressTask).not.toBeNull();
      expect(inProgressTask!.status).toBe('in_progress');
      expect(inProgressTask!.body).toBe('Detailed task description');

      // 5. Add author field
      const taskWithAuthor = taskService.updateTask(taskId, {
        author: 'Test Assignee',
      });

      expect(taskWithAuthor).toBeDefined();
      expect(taskWithAuthor).not.toBeNull();
      expect(taskWithAuthor!.author).toBe('Test Assignee');
      expect(taskWithAuthor!.status).toBe('in_progress');
      expect(taskWithAuthor!.body).toBe('Detailed task description');

      // 6. Update status (in_progress → done)
      const doneTask = taskService.updateTask(taskId, {
        status: 'done',
      });

      expect(doneTask).toBeDefined();
      expect(doneTask).not.toBeNull();
      expect(doneTask!.status).toBe('done');
      expect(doneTask!.author).toBe('Test Assignee');
      expect(doneTask!.body).toBe('Detailed task description');

      // 7. Update status (done → closed)
      const closedTask = taskService.updateTask(taskId, {
        status: 'closed',
      });

      expect(closedTask).toBeDefined();
      expect(closedTask).not.toBeNull();
      expect(closedTask!.status).toBe('closed');
      expect(closedTask!.title).toBe('Lifecycle Test Task');
      expect(closedTask!.body).toBe('Detailed task description');
      expect(closedTask!.author).toBe('Test Assignee');

      // 8. Delete the task
      const deleteResult = taskService.deleteTask(taskId);

      expect(deleteResult).toBe(true);

      // 9. Verify after deletion
      const deletedTask = taskService.getTask(taskId);

      expect(deletedTask).toBeNull();
    });

    it('Create and manage multiple tasks test - Create 10 tasks, perform filtering, updating, and deletion, and verify operations do not interfere with each other', () => {
      // 1. Create 10 tasks (different statuses, authors)
      const task1 = taskService.createTask({
        title: 'Task 1',
        body: 'Alice - backlog',
        author: 'Alice',
        status: 'backlog',
      });

      const task2 = taskService.createTask({
        title: 'Task 2',
        body: 'Alice - ready',
        author: 'Alice',
        status: 'ready',
      });

      const task3 = taskService.createTask({
        title: 'Task 3',
        body: 'Alice - in_progress',
        author: 'Alice',
        status: 'in_progress',
      });

      const task4 = taskService.createTask({
        title: 'Task 4',
        body: 'Bob - backlog',
        author: 'Bob',
        status: 'backlog',
      });

      const task5 = taskService.createTask({
        title: 'Task 5',
        body: 'Bob - ready',
        author: 'Bob',
        status: 'ready',
      });

      const task6 = taskService.createTask({
        title: 'Task 6',
        body: 'Bob - in_progress',
        author: 'Bob',
        status: 'in_progress',
      });

      const task7 = taskService.createTask({
        title: 'Task 7',
        body: 'Charlie - done',
        author: 'Charlie',
        status: 'done',
      });

      const task8 = taskService.createTask({
        title: 'Task 8',
        body: 'Charlie - closed',
        author: 'Charlie',
        status: 'closed',
      });

      const task9 = taskService.createTask({
        title: 'Task 9',
        body: 'David - backlog',
        author: 'David',
        status: 'backlog',
      });

      const task10 = taskService.createTask({
        title: 'Task 10',
        body: 'David - in_progress',
        author: 'David',
        status: 'in_progress',
      });

      // 2. Verify filtering works correctly
      // Get all tasks (10)
      const allTasks = taskService.listTasks();
      expect(allTasks.length).toBe(10);

      // Filter by backlog status (3: task1, task4, task9)
      const backlogTasks = taskService.listTasks({ status: 'backlog' });
      expect(backlogTasks.length).toBe(3);
      expect(backlogTasks.every((t) => t.status === 'backlog')).toBe(true);

      // Filter by in_progress status (3: task3, task6, task10)
      const inProgressTasks = taskService.listTasks({ status: 'in_progress' });
      expect(inProgressTasks.length).toBe(3);
      expect(inProgressTasks.every((t) => t.status === 'in_progress')).toBe(true);

      // Filter by Alice author (3: task1, task2, task3)
      const aliceTasks = taskService.listTasks({ author: 'Alice' });
      expect(aliceTasks.length).toBe(3);
      expect(aliceTasks.every((t) => t.author === 'Alice')).toBe(true);

      // Filter by Bob author (3: task4, task5, task6)
      const bobTasks = taskService.listTasks({ author: 'Bob' });
      expect(bobTasks.length).toBe(3);
      expect(bobTasks.every((t) => t.author === 'Bob')).toBe(true);

      // Combined filter: status='backlog' AND author='Bob' (1: task4)
      const bobBacklogTasks = taskService.listTasks({ status: 'backlog', author: 'Bob' });
      expect(bobBacklogTasks.length).toBe(1);
      expect(bobBacklogTasks[0].id).toBe(task4.id);

      // 3. Update some tasks (task2, task5, task8)
      const updatedTask2 = taskService.updateTask(task2.id, {
        status: 'in_progress',
        body: 'Alice - ready → in_progress',
      });
      expect(updatedTask2).not.toBeNull();
      expect(updatedTask2!.status).toBe('in_progress');
      expect(updatedTask2!.body).toBe('Alice - ready → in_progress');

      const updatedTask5 = taskService.updateTask(task5.id, {
        status: 'done',
        body: 'Bob - ready → done',
      });
      expect(updatedTask5).not.toBeNull();
      expect(updatedTask5!.status).toBe('done');
      expect(updatedTask5!.body).toBe('Bob - ready → done');

      const updatedTask8 = taskService.updateTask(task8.id, {
        title: 'Task 8 (Updated)',
      });
      expect(updatedTask8).not.toBeNull();
      expect(updatedTask8!.title).toBe('Task 8 (Updated)');
      expect(updatedTask8!.status).toBe('closed');

      // 4. Delete some tasks (task1, task7, task9)
      const deleteResult1 = taskService.deleteTask(task1.id);
      expect(deleteResult1).toBe(true);

      const deleteResult7 = taskService.deleteTask(task7.id);
      expect(deleteResult7).toBe(true);

      const deleteResult9 = taskService.deleteTask(task9.id);
      expect(deleteResult9).toBe(true);

      // 5. Verify remaining tasks are unaffected
      // Get all remaining tasks (7: 10 - 3 deleted)
      const remainingTasks = taskService.listTasks();
      expect(remainingTasks.length).toBe(7);

      // Deleted tasks cannot be retrieved
      expect(taskService.getTask(task1.id)).toBeNull();
      expect(taskService.getTask(task7.id)).toBeNull();
      expect(taskService.getTask(task9.id)).toBeNull();

      // Updated tasks retain their updated content
      const verifyTask2 = taskService.getTask(task2.id);
      expect(verifyTask2).not.toBeNull();
      expect(verifyTask2!.status).toBe('in_progress');
      expect(verifyTask2!.body).toBe('Alice - ready → in_progress');
      expect(verifyTask2!.author).toBe('Alice');

      const verifyTask5 = taskService.getTask(task5.id);
      expect(verifyTask5).not.toBeNull();
      expect(verifyTask5!.status).toBe('done');
      expect(verifyTask5!.body).toBe('Bob - ready → done');
      expect(verifyTask5!.author).toBe('Bob');

      const verifyTask8 = taskService.getTask(task8.id);
      expect(verifyTask8).not.toBeNull();
      expect(verifyTask8!.title).toBe('Task 8 (Updated)');
      expect(verifyTask8!.status).toBe('closed');

      // Tasks that were neither updated nor deleted retain original data
      const verifyTask3 = taskService.getTask(task3.id);
      expect(verifyTask3).not.toBeNull();
      expect(verifyTask3!.title).toBe('Task 3');
      expect(verifyTask3!.body).toBe('Alice - in_progress');
      expect(verifyTask3!.author).toBe('Alice');
      expect(verifyTask3!.status).toBe('in_progress');

      const verifyTask4 = taskService.getTask(task4.id);
      expect(verifyTask4).not.toBeNull();
      expect(verifyTask4!.title).toBe('Task 4');
      expect(verifyTask4!.body).toBe('Bob - backlog');
      expect(verifyTask4!.author).toBe('Bob');
      expect(verifyTask4!.status).toBe('backlog');

      const verifyTask6 = taskService.getTask(task6.id);
      expect(verifyTask6).not.toBeNull();
      expect(verifyTask6!.title).toBe('Task 6');
      expect(verifyTask6!.body).toBe('Bob - in_progress');
      expect(verifyTask6!.author).toBe('Bob');
      expect(verifyTask6!.status).toBe('in_progress');

      const verifyTask10 = taskService.getTask(task10.id);
      expect(verifyTask10).not.toBeNull();
      expect(verifyTask10!.title).toBe('Task 10');
      expect(verifyTask10!.body).toBe('David - in_progress');
      expect(verifyTask10!.author).toBe('David');
      expect(verifyTask10!.status).toBe('in_progress');

      // 6. Verify filtering reflects updates
      // Filter by in_progress status (4: task2 updated, task3, task6, task10)
      const updatedInProgressTasks = taskService.listTasks({ status: 'in_progress' });
      expect(updatedInProgressTasks.length).toBe(4);

      // Filter by done status (1: task5 updated)
      const doneTasks = taskService.listTasks({ status: 'done' });
      expect(doneTasks.length).toBe(1);
      expect(doneTasks[0].id).toBe(task5.id);

      // Filter by backlog status (1: task4 only, task1 deleted, task9 deleted)
      const updatedBacklogTasks = taskService.listTasks({ status: 'backlog' });
      expect(updatedBacklogTasks.length).toBe(1);
      expect(updatedBacklogTasks[0].id).toBe(task4.id);
    });
  });

  describe('getTaskCountByStatus', () => {
    it('Count test when tasks exist for all statuses', () => {
      taskService.createTask({ title: 'Task 1', status: 'backlog' });
      taskService.createTask({ title: 'Task 2', status: 'backlog' });
      taskService.createTask({ title: 'Task 3', status: 'ready' });
      taskService.createTask({ title: 'Task 4', status: 'in_progress' });
      taskService.createTask({ title: 'Task 5', status: 'in_progress' });
      taskService.createTask({ title: 'Task 6', status: 'in_progress' });
      taskService.createTask({ title: 'Task 7', status: 'done' });
      taskService.createTask({ title: 'Task 8', status: 'closed' });

      const counts = taskService.getTaskCountByStatus();

      expect(counts.backlog).toBe(2);
      expect(counts.ready).toBe(1);
      expect(counts.in_progress).toBe(3);
      expect(counts.done).toBe(1);
      expect(counts.closed).toBe(1);
    });

    it('Count test when there are 0 tasks', () => {
      const counts = taskService.getTaskCountByStatus();

      expect(counts.backlog).toBe(0);
      expect(counts.ready).toBe(0);
      expect(counts.in_progress).toBe(0);
      expect(counts.done).toBe(0);
      expect(counts.closed).toBe(0);
    });

    it('Count test when tasks exist only for specific statuses', () => {
      taskService.createTask({ title: 'Task 1', status: 'in_progress' });
      taskService.createTask({ title: 'Task 2', status: 'in_progress' });

      const counts = taskService.getTaskCountByStatus();

      expect(counts.backlog).toBe(0);
      expect(counts.ready).toBe(0);
      expect(counts.in_progress).toBe(2);
      expect(counts.done).toBe(0);
      expect(counts.closed).toBe(0);
    });

    it('Count test after task update - Status change is reflected in count', () => {
      const task = taskService.createTask({ title: 'Task 1', status: 'backlog' });

      let counts = taskService.getTaskCountByStatus();
      expect(counts.backlog).toBe(1);
      expect(counts.in_progress).toBe(0);

      taskService.updateTask(task.id, { status: 'in_progress' });

      counts = taskService.getTaskCountByStatus();
      expect(counts.backlog).toBe(0);
      expect(counts.in_progress).toBe(1);
    });

    it('Count test after task deletion - Deletion is reflected in count', () => {
      const task1 = taskService.createTask({ title: 'Task 1', status: 'done' });
      taskService.createTask({ title: 'Task 2', status: 'done' });

      let counts = taskService.getTaskCountByStatus();
      expect(counts.done).toBe(2);

      taskService.deleteTask(task1.id);

      counts = taskService.getTaskCountByStatus();
      expect(counts.done).toBe(1);
    });
  });

  describe('searchTasks', () => {
    it('Keyword search - Search for tasks matching title', () => {
      // Create test tasks
      taskService.createTask({ title: 'Test Task 1', body: 'Body A', status: 'backlog' });
      taskService.createTask({ title: 'Important Meeting', body: 'Body B', status: 'in_progress' });
      taskService.createTask({ title: 'Test Task 2', body: 'Body C', status: 'ready' });
      taskService.createTask({ title: 'Shopping List', body: 'Body D', status: 'done' });

      // Search by "Test" keyword
      const results = taskService.searchTasks('Test');

      // Verify 2 tasks are found (done/closed are excluded)
      expect(results).toHaveLength(2);
      expect(results[0].title).toContain('Test');
      expect(results[1].title).toContain('Test');
    });

    it('Keyword search - Search for tasks matching body', () => {
      // Create test tasks
      taskService.createTask({ title: 'Task 1', body: 'Important Content', status: 'backlog' });
      taskService.createTask({ title: 'Task 2', body: 'Regular Content', status: 'in_progress' });
      taskService.createTask({ title: 'Task 3', body: 'Important Topic', status: 'ready' });

      // Search by "Important" keyword
      const results = taskService.searchTasks('Important');

      // Verify 2 tasks are found
      expect(results).toHaveLength(2);
      expect(results.every((t) => t.body && t.body.includes('Important'))).toBe(true);
    });

    it('Keyword search - Tasks with done/closed status are excluded', () => {
      // Create test tasks
      taskService.createTask({ title: 'Active Task', body: 'Body', status: 'in_progress' });
      taskService.createTask({ title: 'Completed Task', body: 'Body', status: 'done' });
      taskService.createTask({ title: 'Closed Task', body: 'Body', status: 'closed' });

      // Search by "Task" keyword
      const results = taskService.searchTasks('Task');

      // Verify only 1 task is found (done/closed are excluded)
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Active Task');
      expect(results[0].status).toBe('in_progress');
    });

    it('Keyword search - include done/closed in search results with includeAll=true', () => {
      // Create test tasks
      taskService.createTask({ title: 'Active Task', body: 'Body', status: 'in_progress' });
      taskService.createTask({ title: 'Completed Task', body: 'Body', status: 'done' });
      taskService.createTask({ title: 'Closed Task', body: 'Body', status: 'closed' });

      // Search with includeAll=true for "Task" keyword
      const results = taskService.searchTasks('Task', true);

      // Verify all 3 tasks are found
      expect(results).toHaveLength(3);
      expect(results.map((t) => t.status)).toContain('in_progress');
      expect(results.map((t) => t.status)).toContain('done');
      expect(results.map((t) => t.status)).toContain('closed');
    });

    it('Keyword search - Return empty array when no matching tasks found', () => {
      // Create test tasks
      taskService.createTask({ title: 'Task 1', body: 'Body A', status: 'backlog' });
      taskService.createTask({ title: 'Task 2', body: 'Body B', status: 'in_progress' });

      // Search for non-matching keyword
      const results = taskService.searchTasks('Non-existent Keyword');

      // Verify empty array is returned
      expect(results).toHaveLength(0);
    });

    it('Numeric keyword - Search by ID with exact match', () => {
      const task1 = taskService.createTask({ title: 'Unique Task', status: 'backlog' });
      taskService.createTask({ title: 'Another Task', status: 'backlog' });

      const results = taskService.searchTasks(String(task1.id));

      expect(results.some((t) => t.id === task1.id)).toBe(true);
    });

    it('Numeric keyword - Search by ID in done status tasks (without --all)', () => {
      const task = taskService.createTask({ title: 'Completed Task', status: 'done' });

      // Search by ID with includeAll=false (default) → can bypass status filter
      const results = taskService.searchTasks(String(task.id));

      expect(results.some((t) => t.id === task.id)).toBe(true);
    });

    it('Numeric keyword - Title/body LIKE search also works simultaneously', () => {
      const task1 = taskService.createTask({ title: 'Unique Title 999', status: 'backlog' });
      const task2 = taskService.createTask({ title: 'Task to be searched by ID', status: 'backlog' });

      // Search by task2's ID - task2 matches ID, task1 doesn't match ID or title/body
      const results = taskService.searchTasks(String(task2.id));

      expect(results.some((t) => t.id === task2.id)).toBe(true);
      // task1 doesn't match because ID doesn't match and title/body doesn't contain task2's ID text (normally)
      expect(results.every((t) => t.id !== task1.id || String(task1.title).includes(String(task2.id)))).toBe(true);
    });
  });

  describe('Parent-Child Relationships', () => {
    it('Can create task with parent task specified', () => {
      // Create parent task
      const parent = taskService.createTask({ title: 'Parent Task' });

      // Create child task with parent task specified
      const child = taskService.createTask({
        title: 'Child Task',
        parent_id: parent.id,
      });

      // Verify child task's parent_id is correctly set
      expect(child.parent_id).toBe(parent.id);
    });

    it('Error when non-existent parent ID is specified', () => {
      // Attempt to create task with non-existent parent ID
      expect(() => {
        taskService.createTask({ title: 'Task', parent_id: 99999 });
      }).toThrow('Parent task with id 99999 does not exist');
    });

    it('Can retrieve child tasks', () => {
      // Create parent task
      const parent = taskService.createTask({ title: 'Parent' });

      // Create 2 child tasks
      const child1 = taskService.createTask({ title: 'Child 1', parent_id: parent.id });
      const child2 = taskService.createTask({ title: 'Child 2', parent_id: parent.id });

      // Retrieve child tasks
      const children = taskService.getChildTasks(parent.id);

      // Verify 2 child tasks are retrieved
      expect(children).toHaveLength(2);
      expect(children[0].id).toBe(child1.id);
      expect(children[0].title).toBe('Child 1');
      expect(children[1].id).toBe(child2.id);
      expect(children[1].title).toBe('Child 2');
    });

    it('Can retrieve parent task', () => {
      // Create parent and child tasks
      const parent = taskService.createTask({ title: 'Parent Task' });
      const child = taskService.createTask({ title: 'Child Task', parent_id: parent.id });

      // Retrieve parent task from child
      const retrievedParent = taskService.getParentTask(child.id);

      // Verify parent task is correctly retrieved
      expect(retrievedParent).not.toBeNull();
      expect(retrievedParent!.id).toBe(parent.id);
      expect(retrievedParent!.title).toBe('Parent Task');
    });

    it('getParentTask returns null when task has no parent', () => {
      // Create task without parent
      const task = taskService.createTask({ title: 'Root Task' });

      // Retrieve parent task
      const parent = taskService.getParentTask(task.id);

      // Verify null is returned
      expect(parent).toBeNull();
    });

    it('Circular reference is detected', () => {
      // Create task1
      const task1 = taskService.createTask({ title: 'Task 1' });
      // Create task2 as child of task1
      const task2 = taskService.createTask({ title: 'Task 2', parent_id: task1.id });

      // Attempting to set task2 as parent of task1 causes circular reference error
      expect(() => {
        taskService.updateTask(task1.id, { parent_id: task2.id });
      }).toThrow(/cycle|circular/i);
    });

    it('Error when attempting to set self as parent', () => {
      // Create a task
      const task = taskService.createTask({ title: 'Task' });

      // Attempting to set self as parent causes circular reference error
      expect(() => {
        taskService.updateTask(task.id, { parent_id: task.id });
      }).toThrow(/cycle|circular/i);
    });

    it('Child tasks become orphaned when parent task is deleted', () => {
      // Create parent and child tasks
      const parent = taskService.createTask({ title: 'Parent' });
      const child = taskService.createTask({ title: 'Child', parent_id: parent.id });

      // Delete parent task
      taskService.deleteTask(parent.id);

      // Retrieve child task
      const updatedChild = taskService.getTask(child.id);

      // Verify child task still exists but parent_id is null
      expect(updatedChild).not.toBeNull();
      expect(updatedChild!.parent_id).toBeNull();
    });

    it('Can recursively retrieve descendant tasks', () => {
      // Create 3-level task structure
      // Task 1
      //   - Task 2
      //     - Task 3
      //     - Task 4
      //   - Task 5
      const task1 = taskService.createTask({ title: 'Task 1' });
      const task2 = taskService.createTask({ title: 'Task 2', parent_id: task1.id });
      const task3 = taskService.createTask({ title: 'Task 3', parent_id: task2.id });
      const task4 = taskService.createTask({ title: 'Task 4', parent_id: task2.id });
      const task5 = taskService.createTask({ title: 'Task 5', parent_id: task1.id });

      // Recursively retrieve descendant tasks of task1
      const descendants = taskService.getDescendantTasks(task1.id);

      // Verify 4 descendant tasks are retrieved (task2, task3, task4, task5)
      expect(descendants).toHaveLength(4);

      // Verify all descendant tasks are included
      const descendantIds = descendants.map((t) => t.id);
      expect(descendantIds).toContain(task2.id);
      expect(descendantIds).toContain(task3.id);
      expect(descendantIds).toContain(task4.id);
      expect(descendantIds).toContain(task5.id);
    });

    it('getDescendantTasks returns empty array when task has no descendants', () => {
      // Create a task without children
      const task = taskService.createTask({ title: 'Leaf Task' });

      // Retrieve descendant tasks
      const descendants = taskService.getDescendantTasks(task.id);

      // Verify empty array is returned
      expect(descendants).toHaveLength(0);
    });

    it('Can retrieve root task - With parent existing', () => {
      // Create 3-level task structure
      // grandparent -> parent -> child
      const grandparent = taskService.createTask({ title: 'Grandparent' });
      const parent = taskService.createTask({ title: 'Parent', parent_id: grandparent.id });
      const child = taskService.createTask({ title: 'Child', parent_id: parent.id });

      // Retrieve root task from child
      const root = taskService.getRootTask(child.id);

      // Verify root task is grandparent
      expect(root).not.toBeNull();
      expect(root!.id).toBe(grandparent.id);
      expect(root!.title).toBe('Grandparent');
    });

    it('Can retrieve root task - When task has no parent, returns self', () => {
      // Create task without parent
      const task = taskService.createTask({ title: 'Root Task' });

      // Retrieve root task
      const root = taskService.getRootTask(task.id);

      // Verify self is returned
      expect(root).not.toBeNull();
      expect(root!.id).toBe(task.id);
      expect(root!.title).toBe('Root Task');
    });

    it('Retrieve root task - Returns null for non-existent task ID', () => {
      // Retrieve root task for non-existent ID
      const root = taskService.getRootTask(99999);

      // Verify null is returned
      expect(root).toBeNull();
    });

    it('Retrieve root task - When parent task is deleted mid-chain', () => {
      // Create 3-level task structure
      const grandparent = taskService.createTask({ title: 'Grandparent' });
      const parent = taskService.createTask({ title: 'Parent', parent_id: grandparent.id });
      const child = taskService.createTask({ title: 'Child', parent_id: parent.id });

      // Delete intermediate parent task (parent_id becomes null)
      taskService.deleteTask(parent.id);

      // Retrieve root task from child
      const root = taskService.getRootTask(child.id);

      // Verify orphaned child itself is returned
      expect(root).not.toBeNull();
      expect(root!.id).toBe(child.id);
    });

    it('Can update parent_id to null', () => {
      // Create parent-child relationship
      const parent = taskService.createTask({ title: 'Parent' });
      const child = taskService.createTask({ title: 'Child', parent_id: parent.id });

      // Verify parent_id is set
      expect(child.parent_id).toBe(parent.id);

      // Update parent_id to null
      const updatedChild = taskService.updateTask(child.id, { parent_id: null });

      // Verify parent_id is null
      expect(updatedChild).not.toBeNull();
      expect(updatedChild!.parent_id).toBeNull();
    });

    it('Can update parent_id to existing parent task', () => {
      // Create 2 parent tasks and 1 child task
      const parent1 = taskService.createTask({ title: 'Parent 1' });
      const parent2 = taskService.createTask({ title: 'Parent 2' });
      const child = taskService.createTask({ title: 'Child', parent_id: parent1.id });

      // Verify initial parent is parent1
      expect(child.parent_id).toBe(parent1.id);

      // Update parent_id to parent2
      const updatedChild = taskService.updateTask(child.id, { parent_id: parent2.id });

      // Verify parent_id is changed to parent2
      expect(updatedChild).not.toBeNull();
      expect(updatedChild!.parent_id).toBe(parent2.id);
    });

    it('Error when updating to non-existent parent ID', () => {
      // Create a task
      const task = taskService.createTask({ title: 'Task' });

      // Attempt to update parent_id to non-existent ID
      expect(() => {
        taskService.updateTask(task.id, { parent_id: 99999 });
      }).toThrow('Parent task with id 99999 does not exist');
    });
  });

  describe('TaskService with Mock Database', () => {
    let mockBackend: StorageBackend;
    let taskService: TaskService;

    beforeEach(() => {
      mockBackend = createMockStorageBackend();
      taskService = new TaskService(mockBackend);
    });

    afterEach(() => {
      mockBackend.close();
    });

    it('should create task with mock database', () => {
      const task = taskService.createTask({
        title: 'Test Task',
        status: 'backlog',
      });

      expect(task.id).toBeDefined();
      expect(task.title).toBe('Test Task');
      expect(task.status).toBe('backlog');
      expect(task.created_at).toBeDefined();
      expect(task.updated_at).toBeDefined();
    });

    it('should get task with mock database', () => {
      // Create a task
      const created = taskService.createTask({
        title: 'Get Test Task',
        body: 'Test body',
        author: 'Test Author',
        status: 'in_progress',
      });

      // Get the task
      const retrieved = taskService.getTask(created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(created.id);
      expect(retrieved!.title).toBe('Get Test Task');
      expect(retrieved!.body).toBe('Test body');
      expect(retrieved!.author).toBe('Test Author');
      expect(retrieved!.status).toBe('in_progress');
    });

    it('should update task with mock database', () => {
      // Create a task
      const created = taskService.createTask({
        title: 'Original Title',
        status: 'backlog',
      });

      // Update the task
      const updated = taskService.updateTask(created.id, {
        title: 'Updated Title',
        status: 'in_progress',
      });

      expect(updated).not.toBeNull();
      expect(updated!.title).toBe('Updated Title');
      expect(updated!.status).toBe('in_progress');

      // Verify via get
      const retrieved = taskService.getTask(created.id);
      expect(retrieved!.title).toBe('Updated Title');
      expect(retrieved!.status).toBe('in_progress');
    });

    it('should list tasks with mock database', () => {
      // Create multiple tasks
      taskService.createTask({ title: 'Task 1', status: 'backlog' });
      taskService.createTask({ title: 'Task 2', status: 'in_progress' });
      taskService.createTask({ title: 'Task 3', status: 'backlog' });

      // List all tasks
      const allTasks = taskService.listTasks();
      expect(allTasks).toHaveLength(3);

      // List with filter
      const backlogTasks = taskService.listTasks({ status: 'backlog' });
      expect(backlogTasks).toHaveLength(2);
      expect(backlogTasks.every((t) => t.status === 'backlog')).toBe(true);
    });

    it('should delete task with mock database', () => {
      // Create a task
      const created = taskService.createTask({
        title: 'Task to Delete',
        status: 'backlog',
      });

      // Delete the task
      const result = taskService.deleteTask(created.id);
      expect(result).toBe(true);

      // Verify deletion
      const retrieved = taskService.getTask(created.id);
      expect(retrieved).toBeNull();
    });

    it('should handle parent-child relationships with mock database', () => {
      // Create parent task
      const parent = taskService.createTask({ title: 'Parent Task' });

      // Create child task
      const child = taskService.createTask({
        title: 'Child Task',
        parent_id: parent.id,
      });

      expect(child.parent_id).toBe(parent.id);

      // Get children
      const children = taskService.getChildTasks(parent.id);
      expect(children).toHaveLength(1);
      expect(children[0].id).toBe(child.id);

      // Get parent
      const retrievedParent = taskService.getParentTask(child.id);
      expect(retrievedParent).not.toBeNull();
      expect(retrievedParent!.id).toBe(parent.id);
    });
  });

  describe('createTask with tagIds (transactional tag attachment)', () => {
    let mockBackend: StorageBackend;
    let taskService: TaskService;
    let tagService: TagService;

    beforeEach(() => {
      mockBackend = createMockStorageBackend();
      taskService = new TaskService(mockBackend);
      tagService = new TagService(mockBackend);
    });

    afterEach(() => {
      mockBackend.close();
    });

    it('creates task without tags when tagIds is not provided', () => {
      const task = taskService.createTask({ title: 'No tags task' });

      expect(task.id).toBeDefined();
      const attachedTags = mockBackend.taskTags.findTagsByTaskId(task.id);
      expect(attachedTags).toHaveLength(0);
    });

    it('creates task without tags when tagIds is empty array', () => {
      const task = taskService.createTask({ title: 'Empty tags task', tagIds: [] });

      expect(task.id).toBeDefined();
      const attachedTags = mockBackend.taskTags.findTagsByTaskId(task.id);
      expect(attachedTags).toHaveLength(0);
    });

    it('creates task and attaches tags atomically when tagIds is provided', () => {
      const tag1 = tagService.createTag({ name: 'frontend' });
      const tag2 = tagService.createTag({ name: 'backend' });

      const task = taskService.createTask({
        title: 'Tagged task',
        tagIds: [tag1.id, tag2.id],
      });

      expect(task.id).toBeDefined();
      const attachedTags = mockBackend.taskTags.findTagsByTaskId(task.id);
      expect(attachedTags).toHaveLength(2);
      const attachedTagIds = attachedTags.map((t) => t.id).sort();
      expect(attachedTagIds).toEqual([tag1.id, tag2.id].sort());
    });

    it('rolls back task creation when tag attachment fails (orphan prevention)', () => {
      const tag = tagService.createTag({ name: 'valid-tag' });
      const nonExistentTagId = 99999;

      // Spy on taskTags.create to make it fail on the second call (non-existent tag)
      const originalCreate = mockBackend.taskTags.create.bind(mockBackend.taskTags);
      vi.spyOn(mockBackend.taskTags, 'create').mockImplementation((input) => {
        if (input.tag_id === nonExistentTagId) {
          throw new Error('FOREIGN KEY constraint failed');
        }
        return originalCreate(input);
      });

      const tasksBefore = taskService.listTasks();

      expect(() => {
        taskService.createTask({
          title: 'Task with invalid tag',
          tagIds: [tag.id, nonExistentTagId],
        });
      }).toThrow();

      // The task should not exist — transaction was rolled back
      const tasksAfter = taskService.listTasks();
      expect(tasksAfter).toHaveLength(tasksBefore.length);
    });

    it('transaction ensures all tags are attached or none', () => {
      const tag1 = tagService.createTag({ name: 'tag-a' });
      const tag2 = tagService.createTag({ name: 'tag-b' });

      // Both tags exist — all should be attached successfully
      const task = taskService.createTask({
        title: 'All-or-nothing task',
        tagIds: [tag1.id, tag2.id],
      });

      const attachedTags = mockBackend.taskTags.findTagsByTaskId(task.id);
      expect(attachedTags).toHaveLength(2);
    });
  });
});
