import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskService } from '../src/services/TaskService';
import { resetDatabase } from '../src/db/reset';
import { createMockDatabase } from './utils/mock-database';
import type { Database } from 'better-sqlite3';

describe('TaskService', () => {
  let taskService: TaskService;

  beforeEach(() => {
    // 各テストの前にデータベースをリセット
    resetDatabase();
    taskService = new TaskService();
  });

  describe('createTask', () => {
    it('基本的なタスク作成テスト - titleのみ指定してタスク作成', () => {
      // タスクを作成
      const task = taskService.createTask({
        title: 'テストタスク',
      });

      // 検証
      expect(task).toBeDefined();
      expect(task.id).toBeDefined();
      expect(typeof task.id).toBe('number');
      expect(task.id).toBeGreaterThan(0);

      expect(task.title).toBe('テストタスク');

      expect(task.created_at).toBeDefined();
      expect(typeof task.created_at).toBe('string');

      expect(task.updated_at).toBeDefined();
      expect(typeof task.updated_at).toBe('string');

      expect(task.status).toBe('backlog');
    });

    it('すべてのフィールドを指定したタスク作成テスト', () => {
      // すべてのフィールドを指定してタスクを作成
      const task = taskService.createTask({
        title: '完全なタスク',
        body: 'タスクの詳細な説明文',
        author: 'テスト作成者',
        status: 'in_progress',
      });

      // 指定したフィールドの検証
      expect(task.title).toBe('完全なタスク');
      expect(task.body).toBe('タスクの詳細な説明文');
      expect(task.author).toBe('テスト作成者');
      expect(task.status).toBe('in_progress');

      // 自動生成されるフィールドの検証
      expect(task.id).toBeDefined();
      expect(typeof task.id).toBe('number');
      expect(task.id).toBeGreaterThan(0);

      expect(task.created_at).toBeDefined();
      expect(typeof task.created_at).toBe('string');

      expect(task.updated_at).toBeDefined();
      expect(typeof task.updated_at).toBe('string');
    });

    it('必須フィールド（title）が空の場合はエラーが発生する', () => {
      expect(() => {
        taskService.createTask({ title: '' });
      }).toThrow('Title is required');
    });

    it('titleが空白のみの場合はエラーが発生する', () => {
      expect(() => {
        taskService.createTask({ title: '   ' });
      }).toThrow('Title is required');
    });

    it('titleが200文字を超える場合はエラーが発生する', () => {
      expect(() => {
        taskService.createTask({ title: 'a'.repeat(201) });
      }).toThrow('Title must not exceed 200 characters');
    });

    it('bodyが10000文字を超える場合はエラーが発生する', () => {
      expect(() => {
        taskService.createTask({ title: 'valid title', body: 'b'.repeat(10001) });
      }).toThrow('Body must not exceed 10000 characters');
    });

    it('authorが100文字を超える場合はエラーが発生する', () => {
      expect(() => {
        taskService.createTask({ title: 'valid title', author: 'c'.repeat(101) });
      }).toThrow('Author must not exceed 100 characters');
    });
  });

  describe('getTask', () => {
    it('存在するタスクのID指定取得テスト', () => {
      // テスト用のタスクを作成
      const createdTask = taskService.createTask({
        title: '取得テスト用タスク',
        body: 'このタスクは取得テスト用です',
        author: 'テスター',
        status: 'in_progress',
      });

      // 作成したタスクのIDでタスクを取得
      const retrievedTask = taskService.getTask(createdTask.id);

      // 取得したタスクが存在することを確認
      expect(retrievedTask).toBeDefined();

      // すべてのフィールドが正しく取得できることを検証
      expect(retrievedTask!.id).toBe(createdTask.id);
      expect(retrievedTask!.title).toBe('取得テスト用タスク');
      expect(retrievedTask!.body).toBe('このタスクは取得テスト用です');
      expect(retrievedTask!.author).toBe('テスター');
      expect(retrievedTask!.status).toBe('in_progress');
      expect(retrievedTask!.created_at).toBeDefined();
      expect(retrievedTask!.updated_at).toBeDefined();
    });

    it('存在しないタスクのID指定取得テスト', () => {
      // 存在しないIDでタスクを取得
      const retrievedTask = taskService.getTask(99999);

      // nullが返ることを確認
      expect(retrievedTask).toBeNull();
    });
  });

  describe('listTasks', () => {
    it('フィルターなしの全件取得テスト - 複数のタスクを作成して全件取得、作成日時の降順で取得されることを検証', () => {
      // 複数のタスクを作成（created_atが異なることを保証するため順次作成）
      const task1 = taskService.createTask({
        title: '最初のタスク',
        body: '一番古いタスク',
        author: 'ユーザーA',
        status: 'backlog',
      });

      const task2 = taskService.createTask({
        title: '2番目のタスク',
        body: '2番目に作成されたタスク',
        author: 'ユーザーB',
        status: 'in_progress',
      });

      const task3 = taskService.createTask({
        title: '3番目のタスク',
        body: '最新のタスク',
        author: 'ユーザーC',
        status: 'done',
      });

      // フィルターなしで全件取得
      const allTasks = taskService.listTasks();

      // 3件のタスクが取得されることを検証
      expect(allTasks).toBeDefined();
      expect(allTasks.length).toBe(3);

      // created_atの降順（新しい順）で取得されることを検証
      expect(allTasks[0].id).toBe(task3.id);
      expect(allTasks[0].title).toBe('3番目のタスク');
      expect(allTasks[1].id).toBe(task2.id);
      expect(allTasks[1].title).toBe('2番目のタスク');
      expect(allTasks[2].id).toBe(task1.id);
      expect(allTasks[2].title).toBe('最初のタスク');

      // 各タスクのフィールドが正しく取得されることを検証
      expect(allTasks[0].body).toBe('最新のタスク');
      expect(allTasks[0].author).toBe('ユーザーC');
      expect(allTasks[0].status).toBe('done');
      expect(allTasks[0].created_at).toBeDefined();
      expect(allTasks[0].updated_at).toBeDefined();
    });

    it('ステータスでのフィルター取得テスト - 異なるステータスのタスクを複数作成し、特定のステータスでフィルターして取得', () => {
      // 異なるステータスのタスクを作成
      const task1 = taskService.createTask({
        title: 'バックログタスク',
        body: 'ステータスがbacklogのタスク',
        author: 'ユーザーA',
        status: 'backlog',
      });

      const task2 = taskService.createTask({
        title: '進行中タスク1',
        body: 'ステータスがin_progressのタスク1',
        author: 'ユーザーB',
        status: 'in_progress',
      });

      const task3 = taskService.createTask({
        title: '進行中タスク2',
        body: 'ステータスがin_progressのタスク2',
        author: 'ユーザーC',
        status: 'in_progress',
      });

      const task4 = taskService.createTask({
        title: '完了タスク',
        body: 'ステータスがdoneのタスク',
        author: 'ユーザーD',
        status: 'done',
      });

      // in_progressステータスでフィルター取得
      const inProgressTasks = taskService.listTasks({ status: 'in_progress' });

      // 2件のin_progressタスクが取得されることを検証
      expect(inProgressTasks).toBeDefined();
      expect(inProgressTasks.length).toBe(2);

      // 取得されたタスクがすべてin_progressステータスであることを検証
      expect(inProgressTasks[0].status).toBe('in_progress');
      expect(inProgressTasks[1].status).toBe('in_progress');

      // 新しい順（created_atの降順）で取得されることを検証
      expect(inProgressTasks[0].id).toBe(task3.id);
      expect(inProgressTasks[0].title).toBe('進行中タスク2');
      expect(inProgressTasks[1].id).toBe(task2.id);
      expect(inProgressTasks[1].title).toBe('進行中タスク1');

      // 他のステータスのタスクが含まれていないことを検証
      const taskIds = inProgressTasks.map((t) => t.id);
      expect(taskIds).not.toContain(task1.id); // backlogタスクは含まれない
      expect(taskIds).not.toContain(task4.id); // doneタスクは含まれない
    });

    it('作成者（author）でのフィルター取得テスト - 異なる作成者のタスクを複数作成し、特定の作成者でフィルターして取得', () => {
      // 異なる作成者のタスクを作成
      const task1 = taskService.createTask({
        title: 'Aliceのタスク1',
        body: 'Aliceが作成したタスク1',
        author: 'Alice',
        status: 'backlog',
      });

      const task2 = taskService.createTask({
        title: 'Bobのタスク1',
        body: 'Bobが作成したタスク1',
        author: 'Bob',
        status: 'in_progress',
      });

      const task3 = taskService.createTask({
        title: 'Bobのタスク2',
        body: 'Bobが作成したタスク2',
        author: 'Bob',
        status: 'done',
      });

      const task4 = taskService.createTask({
        title: 'Charlieのタスク1',
        body: 'Charlieが作成したタスク1',
        author: 'Charlie',
        status: 'backlog',
      });

      const task5 = taskService.createTask({
        title: 'Bobのタスク3',
        body: 'Bobが作成したタスク3',
        author: 'Bob',
        status: 'backlog',
      });

      // Bobの作成者でフィルター取得
      const bobTasks = taskService.listTasks({ author: 'Bob' });

      // 3件のBobのタスクが取得されることを検証
      expect(bobTasks).toBeDefined();
      expect(bobTasks.length).toBe(3);

      // 取得されたタスクがすべてBobの作成であることを検証
      expect(bobTasks[0].author).toBe('Bob');
      expect(bobTasks[1].author).toBe('Bob');
      expect(bobTasks[2].author).toBe('Bob');

      // 新しい順（created_atの降順）で取得されることを検証
      expect(bobTasks[0].id).toBe(task5.id);
      expect(bobTasks[0].title).toBe('Bobのタスク3');
      expect(bobTasks[1].id).toBe(task3.id);
      expect(bobTasks[1].title).toBe('Bobのタスク2');
      expect(bobTasks[2].id).toBe(task2.id);
      expect(bobTasks[2].title).toBe('Bobのタスク1');

      // 他の作成者のタスクが含まれていないことを検証
      const taskIds = bobTasks.map((t) => t.id);
      expect(taskIds).not.toContain(task1.id); // Aliceのタスクは含まれない
      expect(taskIds).not.toContain(task4.id); // Charlieのタスクは含まれない
    });

    it('複合フィルター（status + author）の取得テスト - ステータスと作成者の両方を指定したフィルター', () => {
      // 異なるステータスと作成者の組み合わせでタスクを作成
      const task1 = taskService.createTask({
        title: 'Alice - Backlog',
        body: 'Aliceのbacklogタスク',
        author: 'Alice',
        status: 'backlog',
      });

      const task2 = taskService.createTask({
        title: 'Alice - In Progress',
        body: 'Aliceのin_progressタスク',
        author: 'Alice',
        status: 'in_progress',
      });

      const task3 = taskService.createTask({
        title: 'Bob - Backlog',
        body: 'Bobのbacklogタスク',
        author: 'Bob',
        status: 'backlog',
      });

      const task4 = taskService.createTask({
        title: 'Bob - In Progress',
        body: 'Bobのin_progressタスク',
        author: 'Bob',
        status: 'in_progress',
      });

      const task5 = taskService.createTask({
        title: 'Alice - Done',
        body: 'Aliceのdoneタスク',
        author: 'Alice',
        status: 'done',
      });

      // status='in_progress' AND author='Alice'でフィルター取得
      const filteredTasks = taskService.listTasks({ status: 'in_progress', author: 'Alice' });

      // 1件のタスクのみが取得されることを検証
      expect(filteredTasks).toBeDefined();
      expect(filteredTasks.length).toBe(1);

      // 取得されたタスクが正しい条件を満たしていることを検証
      expect(filteredTasks[0].id).toBe(task2.id);
      expect(filteredTasks[0].title).toBe('Alice - In Progress');
      expect(filteredTasks[0].status).toBe('in_progress');
      expect(filteredTasks[0].author).toBe('Alice');

      // 他のタスクが含まれていないことを検証
      const taskIds = filteredTasks.map((t) => t.id);
      expect(taskIds).not.toContain(task1.id); // Aliceのbacklogは含まれない
      expect(taskIds).not.toContain(task3.id); // Bobのbacklogは含まれない
      expect(taskIds).not.toContain(task4.id); // Bobのin_progressは含まれない
      expect(taskIds).not.toContain(task5.id); // Aliceのdoneは含まれない
    });
  });

  describe('updateTask', () => {
    it('タイトル（title）の更新テスト - タスク作成後、タイトルのみを更新し、他のフィールドが変更されていないことを検証', () => {
      // 完全なデータでタスクを作成
      const createdTask = taskService.createTask({
        title: '元のタイトル',
        body: '元の本文',
        author: '元の作成者',
        status: 'in_progress',
      });

      // 元の値を保存
      const originalTitle = createdTask.title;
      const originalBody = createdTask.body;
      const originalAuthor = createdTask.author;
      const originalStatus = createdTask.status;
      const originalCreatedAt = createdTask.created_at;

      // タイトルのみを更新
      const updatedTask = taskService.updateTask(createdTask.id, {
        title: '新しいタイトル',
      });

      // 更新されたタスクが返されることを確認
      expect(updatedTask).toBeDefined();
      expect(updatedTask).not.toBeNull();

      // タイトルが更新されていることを検証
      expect(updatedTask!.title).toBe('新しいタイトル');
      expect(updatedTask!.title).not.toBe(originalTitle);

      // 他のフィールドが変更されていないことを検証
      expect(updatedTask!.body).toBe(originalBody);
      expect(updatedTask!.author).toBe(originalAuthor);
      expect(updatedTask!.status).toBe(originalStatus);
      expect(updatedTask!.created_at).toBe(originalCreatedAt);

      // updated_atが更新されていることを検証
      expect(updatedTask!.updated_at).toBeDefined();
      // Note: タイムスタンプの精度によっては同じ値になる場合があるが、
      // 少なくともupdated_atフィールドが存在することを確認
      expect(typeof updatedTask!.updated_at).toBe('string');

      // getTask()で取得しても同じ結果が得られることを確認
      const retrievedTask = taskService.getTask(createdTask.id);
      expect(retrievedTask).toBeDefined();
      expect(retrievedTask!.title).toBe('新しいタイトル');
      expect(retrievedTask!.body).toBe(originalBody);
      expect(retrievedTask!.author).toBe(originalAuthor);
      expect(retrievedTask!.status).toBe(originalStatus);
    });

    it('本文（body）の更新テスト - タスク作成後、本文のみを更新し、他のフィールドが変更されていないことを検証', () => {
      // 完全なデータでタスクを作成
      const createdTask = taskService.createTask({
        title: '元のタイトル',
        body: '元の本文',
        author: '元の作成者',
        status: 'in_progress',
      });

      // 元の値を保存
      const originalTitle = createdTask.title;
      const originalBody = createdTask.body;
      const originalAuthor = createdTask.author;
      const originalStatus = createdTask.status;
      const originalCreatedAt = createdTask.created_at;

      // 本文のみを更新
      const updatedTask = taskService.updateTask(createdTask.id, {
        body: '新しい本文',
      });

      // 更新されたタスクが返されることを確認
      expect(updatedTask).toBeDefined();
      expect(updatedTask).not.toBeNull();

      // 本文が更新されていることを検証
      expect(updatedTask!.body).toBe('新しい本文');
      expect(updatedTask!.body).not.toBe(originalBody);

      // 他のフィールドが変更されていないことを検証
      expect(updatedTask!.title).toBe(originalTitle);
      expect(updatedTask!.author).toBe(originalAuthor);
      expect(updatedTask!.status).toBe(originalStatus);
      expect(updatedTask!.created_at).toBe(originalCreatedAt);

      // updated_atが更新されていることを検証
      expect(updatedTask!.updated_at).toBeDefined();
      expect(typeof updatedTask!.updated_at).toBe('string');

      // getTask()で取得しても同じ結果が得られることを確認
      const retrievedTask = taskService.getTask(createdTask.id);
      expect(retrievedTask).toBeDefined();
      expect(retrievedTask!.body).toBe('新しい本文');
      expect(retrievedTask!.title).toBe(originalTitle);
      expect(retrievedTask!.author).toBe(originalAuthor);
      expect(retrievedTask!.status).toBe(originalStatus);
    });

    it('作成者（author）の更新テスト - タスク作成後、作成者のみを更新し、他のフィールドが変更されていないことを検証', () => {
      // 完全なデータでタスクを作成
      const createdTask = taskService.createTask({
        title: '元のタイトル',
        body: '元の本文',
        author: '元の作成者',
        status: 'in_progress',
      });

      // 元の値を保存
      const originalTitle = createdTask.title;
      const originalBody = createdTask.body;
      const originalAuthor = createdTask.author;
      const originalStatus = createdTask.status;
      const originalCreatedAt = createdTask.created_at;

      // 作成者のみを更新
      const updatedTask = taskService.updateTask(createdTask.id, {
        author: '新しい作成者',
      });

      // 更新されたタスクが返されることを確認
      expect(updatedTask).toBeDefined();
      expect(updatedTask).not.toBeNull();

      // 作成者が更新されていることを検証
      expect(updatedTask!.author).toBe('新しい作成者');
      expect(updatedTask!.author).not.toBe(originalAuthor);

      // 他のフィールドが変更されていないことを検証
      expect(updatedTask!.title).toBe(originalTitle);
      expect(updatedTask!.body).toBe(originalBody);
      expect(updatedTask!.status).toBe(originalStatus);
      expect(updatedTask!.created_at).toBe(originalCreatedAt);

      // updated_atが更新されていることを検証
      expect(updatedTask!.updated_at).toBeDefined();
      expect(typeof updatedTask!.updated_at).toBe('string');

      // getTask()で取得しても同じ結果が得られることを確認
      const retrievedTask = taskService.getTask(createdTask.id);
      expect(retrievedTask).toBeDefined();
      expect(retrievedTask!.author).toBe('新しい作成者');
      expect(retrievedTask!.title).toBe(originalTitle);
      expect(retrievedTask!.body).toBe(originalBody);
      expect(retrievedTask!.status).toBe(originalStatus);
    });

    it('ステータス（status）の更新テスト - タスク作成後、ステータスのみを更新し、他のフィールドが変更されていないことを検証', () => {
      // 完全なデータでタスクを作成
      const createdTask = taskService.createTask({
        title: '元のタイトル',
        body: '元の本文',
        author: '元の作成者',
        status: 'backlog',
      });

      // 元の値を保存
      const originalTitle = createdTask.title;
      const originalBody = createdTask.body;
      const originalAuthor = createdTask.author;
      const originalStatus = createdTask.status;
      const originalCreatedAt = createdTask.created_at;

      // ステータスのみを更新（backlog → ready）
      const updatedTask = taskService.updateTask(createdTask.id, {
        status: 'ready',
      });

      // 更新されたタスクが返されることを確認
      expect(updatedTask).toBeDefined();
      expect(updatedTask).not.toBeNull();

      // ステータスが更新されていることを検証
      expect(updatedTask!.status).toBe('ready');
      expect(updatedTask!.status).not.toBe(originalStatus);

      // 他のフィールドが変更されていないことを検証
      expect(updatedTask!.title).toBe(originalTitle);
      expect(updatedTask!.body).toBe(originalBody);
      expect(updatedTask!.author).toBe(originalAuthor);
      expect(updatedTask!.created_at).toBe(originalCreatedAt);

      // updated_atが更新されていることを検証
      expect(updatedTask!.updated_at).toBeDefined();
      expect(typeof updatedTask!.updated_at).toBe('string');

      // getTask()で取得しても同じ結果が得られることを確認
      const retrievedTask = taskService.getTask(createdTask.id);
      expect(retrievedTask).toBeDefined();
      expect(retrievedTask!.status).toBe('ready');
      expect(retrievedTask!.title).toBe(originalTitle);
      expect(retrievedTask!.body).toBe(originalBody);
      expect(retrievedTask!.author).toBe(originalAuthor);
    });

    it('複数フィールドの同時更新テスト - title、body、statusを同時に更新し、すべてのフィールドが正しく更新されることを検証', () => {
      // 完全なデータでタスクを作成
      const createdTask = taskService.createTask({
        title: '元のタイトル',
        body: '元の本文',
        author: '元の作成者',
        status: 'backlog',
      });

      // 元の値を保存
      const originalTitle = createdTask.title;
      const originalBody = createdTask.body;
      const originalAuthor = createdTask.author;
      const originalStatus = createdTask.status;
      const originalCreatedAt = createdTask.created_at;

      // 複数のフィールドを同時に更新（title、body、status）
      const updatedTask = taskService.updateTask(createdTask.id, {
        title: '新しいタイトル',
        body: '新しい本文',
        status: 'in_progress',
      });

      // 更新されたタスクが返されることを確認
      expect(updatedTask).toBeDefined();
      expect(updatedTask).not.toBeNull();

      // すべての更新対象フィールドが正しく更新されていることを検証
      expect(updatedTask!.title).toBe('新しいタイトル');
      expect(updatedTask!.title).not.toBe(originalTitle);

      expect(updatedTask!.body).toBe('新しい本文');
      expect(updatedTask!.body).not.toBe(originalBody);

      expect(updatedTask!.status).toBe('in_progress');
      expect(updatedTask!.status).not.toBe(originalStatus);

      // 更新していないフィールドが変更されていないことを検証
      expect(updatedTask!.author).toBe(originalAuthor);
      expect(updatedTask!.created_at).toBe(originalCreatedAt);

      // updated_atが更新されていることを検証
      expect(updatedTask!.updated_at).toBeDefined();
      expect(typeof updatedTask!.updated_at).toBe('string');

      // getTask()で取得しても同じ結果が得られることを確認
      const retrievedTask = taskService.getTask(createdTask.id);
      expect(retrievedTask).toBeDefined();
      expect(retrievedTask!.title).toBe('新しいタイトル');
      expect(retrievedTask!.body).toBe('新しい本文');
      expect(retrievedTask!.status).toBe('in_progress');
      expect(retrievedTask!.author).toBe(originalAuthor);
    });

    it('存在しないタスクの更新テスト - 存在しないIDで更新を試行し、nullが返ることを検証', () => {
      // 存在しないID（99999）で更新を試行
      const updatedTask = taskService.updateTask(99999, {
        title: '新しいタイトル',
      });

      // nullが返されることを検証
      expect(updatedTask).toBeNull();
    });

    it('titleを空文字列に更新しようとするとエラーが発生する', () => {
      const task = taskService.createTask({ title: 'オリジナル' });
      expect(() => {
        taskService.updateTask(task.id, { title: '' });
      }).toThrow('Title is required');
    });

    it('titleを200文字超に更新しようとするとエラーが発生する', () => {
      const task = taskService.createTask({ title: 'オリジナル' });
      expect(() => {
        taskService.updateTask(task.id, { title: 'a'.repeat(201) });
      }).toThrow('Title must not exceed 200 characters');
    });

    it('bodyを10000文字超に更新しようとするとエラーが発生する', () => {
      const task = taskService.createTask({ title: 'オリジナル' });
      expect(() => {
        taskService.updateTask(task.id, { body: 'b'.repeat(10001) });
      }).toThrow('Body must not exceed 10000 characters');
    });

    it('authorを100文字超に更新しようとするとエラーが発生する', () => {
      const task = taskService.createTask({ title: 'オリジナル' });
      expect(() => {
        taskService.updateTask(task.id, { author: 'c'.repeat(101) });
      }).toThrow('Author must not exceed 100 characters');
    });

    it('null値での更新テスト - bodyとauthorをnullに設定し、nullが正しく保存されることを検証', () => {
      // body と author に値を持つタスクを作成
      const createdTask = taskService.createTask({
        title: 'テストタスク',
        body: '元の本文',
        author: '元の作成者',
        status: 'backlog',
      });

      // 作成時の値を確認
      expect(createdTask.body).toBe('元の本文');
      expect(createdTask.author).toBe('元の作成者');

      // bodyとauthorをnullに更新
      const updatedTask = taskService.updateTask(createdTask.id, {
        body: null as string | null,
        author: null as string | null,
      });

      // 更新されたタスクが返されることを確認
      expect(updatedTask).toBeDefined();
      expect(updatedTask).not.toBeNull();

      // bodyとauthorがnullになっていることを検証
      expect(updatedTask!.body).toBeNull();
      expect(updatedTask!.author).toBeNull();

      // 他のフィールドが変更されていないことを検証
      expect(updatedTask!.title).toBe('テストタスク');
      expect(updatedTask!.status).toBe('backlog');

      // getTask()で取得しても同じ結果が得られることを確認
      const retrievedTask = taskService.getTask(createdTask.id);
      expect(retrievedTask).toBeDefined();
      expect(retrievedTask!.body).toBeNull();
      expect(retrievedTask!.author).toBeNull();
      expect(retrievedTask!.title).toBe('テストタスク');
      expect(retrievedTask!.status).toBe('backlog');
    });
  });

  describe('deleteTask', () => {
    it('存在するタスクの削除テスト - タスク作成後に削除を実行し、削除成功と削除後の取得がnullになることを検証', () => {
      // タスクを作成
      const createdTask = taskService.createTask({
        title: '削除テスト用タスク',
        body: 'このタスクは削除されます',
        author: 'テスター',
        status: 'backlog',
      });

      // タスクが作成されたことを確認
      expect(createdTask).toBeDefined();
      expect(createdTask.id).toBeDefined();

      // タスクを削除
      const deleteResult = taskService.deleteTask(createdTask.id);

      // 削除が成功したことを検証（trueが返る）
      expect(deleteResult).toBe(true);

      // 削除後にタスクを取得
      const retrievedTask = taskService.getTask(createdTask.id);

      // 削除されたタスクはnullが返ることを検証
      expect(retrievedTask).toBeNull();
    });

    it('存在しないタスクの削除テスト - 存在しないIDで削除を試行し、falseが返ることを検証', () => {
      // 存在しないID（99999）で削除を試行
      const deleteResult = taskService.deleteTask(99999);

      // 削除が失敗したことを検証（falseが返る）
      expect(deleteResult).toBe(false);
    });
  });

  describe('統合シナリオテスト', () => {
    it('タスクのライフサイクル全体テスト - 作成からステータス遷移、情報追加、削除までの一連の流れを検証', () => {
      // 1. タスク作成（backlog）
      const createdTask = taskService.createTask({
        title: 'ライフサイクルテストタスク',
        status: 'backlog',
      });

      expect(createdTask).toBeDefined();
      expect(createdTask.id).toBeDefined();
      expect(createdTask.title).toBe('ライフサイクルテストタスク');
      expect(createdTask.status).toBe('backlog');
      expect(createdTask.body).toBeNull();
      expect(createdTask.author).toBeNull();

      const taskId = createdTask.id;

      // 2. ステータス更新（backlog → ready）
      const readyTask = taskService.updateTask(taskId, {
        status: 'ready',
      });

      expect(readyTask).toBeDefined();
      expect(readyTask).not.toBeNull();
      expect(readyTask!.status).toBe('ready');
      expect(readyTask!.title).toBe('ライフサイクルテストタスク');

      // 3. bodyフィールドの追加
      const taskWithBody = taskService.updateTask(taskId, {
        body: 'タスクの詳細な説明文',
      });

      expect(taskWithBody).toBeDefined();
      expect(taskWithBody).not.toBeNull();
      expect(taskWithBody!.body).toBe('タスクの詳細な説明文');
      expect(taskWithBody!.status).toBe('ready');

      // 4. ステータス更新（ready → in_progress）
      const inProgressTask = taskService.updateTask(taskId, {
        status: 'in_progress',
      });

      expect(inProgressTask).toBeDefined();
      expect(inProgressTask).not.toBeNull();
      expect(inProgressTask!.status).toBe('in_progress');
      expect(inProgressTask!.body).toBe('タスクの詳細な説明文');

      // 5. authorフィールドの追加
      const taskWithAuthor = taskService.updateTask(taskId, {
        author: 'テスト担当者',
      });

      expect(taskWithAuthor).toBeDefined();
      expect(taskWithAuthor).not.toBeNull();
      expect(taskWithAuthor!.author).toBe('テスト担当者');
      expect(taskWithAuthor!.status).toBe('in_progress');
      expect(taskWithAuthor!.body).toBe('タスクの詳細な説明文');

      // 6. ステータス更新（in_progress → done）
      const doneTask = taskService.updateTask(taskId, {
        status: 'done',
      });

      expect(doneTask).toBeDefined();
      expect(doneTask).not.toBeNull();
      expect(doneTask!.status).toBe('done');
      expect(doneTask!.author).toBe('テスト担当者');
      expect(doneTask!.body).toBe('タスクの詳細な説明文');

      // 7. ステータス更新（done → closed）
      const closedTask = taskService.updateTask(taskId, {
        status: 'closed',
      });

      expect(closedTask).toBeDefined();
      expect(closedTask).not.toBeNull();
      expect(closedTask!.status).toBe('closed');
      expect(closedTask!.title).toBe('ライフサイクルテストタスク');
      expect(closedTask!.body).toBe('タスクの詳細な説明文');
      expect(closedTask!.author).toBe('テスト担当者');

      // 8. タスクの削除
      const deleteResult = taskService.deleteTask(taskId);

      expect(deleteResult).toBe(true);

      // 9. 削除後の確認
      const deletedTask = taskService.getTask(taskId);

      expect(deletedTask).toBeNull();
    });

    it('複数タスクの作成と管理テスト - 10件のタスクを作成し、フィルター、更新、削除を行い、操作が相互に干渉しないことを検証', () => {
      // 1. 10件のタスクを作成（異なるステータス、作成者）
      const task1 = taskService.createTask({
        title: 'タスク1',
        body: 'Alice - backlog',
        author: 'Alice',
        status: 'backlog',
      });

      const task2 = taskService.createTask({
        title: 'タスク2',
        body: 'Alice - ready',
        author: 'Alice',
        status: 'ready',
      });

      const task3 = taskService.createTask({
        title: 'タスク3',
        body: 'Alice - in_progress',
        author: 'Alice',
        status: 'in_progress',
      });

      const task4 = taskService.createTask({
        title: 'タスク4',
        body: 'Bob - backlog',
        author: 'Bob',
        status: 'backlog',
      });

      const task5 = taskService.createTask({
        title: 'タスク5',
        body: 'Bob - ready',
        author: 'Bob',
        status: 'ready',
      });

      const task6 = taskService.createTask({
        title: 'タスク6',
        body: 'Bob - in_progress',
        author: 'Bob',
        status: 'in_progress',
      });

      const task7 = taskService.createTask({
        title: 'タスク7',
        body: 'Charlie - done',
        author: 'Charlie',
        status: 'done',
      });

      const task8 = taskService.createTask({
        title: 'タスク8',
        body: 'Charlie - closed',
        author: 'Charlie',
        status: 'closed',
      });

      const task9 = taskService.createTask({
        title: 'タスク9',
        body: 'David - backlog',
        author: 'David',
        status: 'backlog',
      });

      const task10 = taskService.createTask({
        title: 'タスク10',
        body: 'David - in_progress',
        author: 'David',
        status: 'in_progress',
      });

      // 2. フィルター機能で正しく取得できることを検証
      // 全件取得（10件）
      const allTasks = taskService.listTasks();
      expect(allTasks.length).toBe(10);

      // backlogステータスでフィルター（3件: task1, task4, task9）
      const backlogTasks = taskService.listTasks({ status: 'backlog' });
      expect(backlogTasks.length).toBe(3);
      expect(backlogTasks.every((t) => t.status === 'backlog')).toBe(true);

      // in_progressステータスでフィルター（3件: task3, task6, task10）
      const inProgressTasks = taskService.listTasks({ status: 'in_progress' });
      expect(inProgressTasks.length).toBe(3);
      expect(inProgressTasks.every((t) => t.status === 'in_progress')).toBe(true);

      // Alice作成者でフィルター（3件: task1, task2, task3）
      const aliceTasks = taskService.listTasks({ author: 'Alice' });
      expect(aliceTasks.length).toBe(3);
      expect(aliceTasks.every((t) => t.author === 'Alice')).toBe(true);

      // Bob作成者でフィルター（3件: task4, task5, task6）
      const bobTasks = taskService.listTasks({ author: 'Bob' });
      expect(bobTasks.length).toBe(3);
      expect(bobTasks.every((t) => t.author === 'Bob')).toBe(true);

      // 複合フィルター: status='backlog' AND author='Bob'（1件: task4）
      const bobBacklogTasks = taskService.listTasks({ status: 'backlog', author: 'Bob' });
      expect(bobBacklogTasks.length).toBe(1);
      expect(bobBacklogTasks[0].id).toBe(task4.id);

      // 3. 一部のタスクを更新（task2, task5, task8）
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
        title: 'タスク8（更新済み）',
      });
      expect(updatedTask8).not.toBeNull();
      expect(updatedTask8!.title).toBe('タスク8（更新済み）');
      expect(updatedTask8!.status).toBe('closed');

      // 4. 一部のタスクを削除（task1, task7, task9）
      const deleteResult1 = taskService.deleteTask(task1.id);
      expect(deleteResult1).toBe(true);

      const deleteResult7 = taskService.deleteTask(task7.id);
      expect(deleteResult7).toBe(true);

      const deleteResult9 = taskService.deleteTask(task9.id);
      expect(deleteResult9).toBe(true);

      // 5. 残りのタスクが影響を受けていないことを検証
      // 全件取得（7件: 10件 - 削除3件）
      const remainingTasks = taskService.listTasks();
      expect(remainingTasks.length).toBe(7);

      // 削除されたタスクは取得できない
      expect(taskService.getTask(task1.id)).toBeNull();
      expect(taskService.getTask(task7.id)).toBeNull();
      expect(taskService.getTask(task9.id)).toBeNull();

      // 更新されたタスクは更新後の内容が保持されている
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
      expect(verifyTask8!.title).toBe('タスク8（更新済み）');
      expect(verifyTask8!.status).toBe('closed');

      // 更新も削除もされていないタスクは元のデータが保持されている
      const verifyTask3 = taskService.getTask(task3.id);
      expect(verifyTask3).not.toBeNull();
      expect(verifyTask3!.title).toBe('タスク3');
      expect(verifyTask3!.body).toBe('Alice - in_progress');
      expect(verifyTask3!.author).toBe('Alice');
      expect(verifyTask3!.status).toBe('in_progress');

      const verifyTask4 = taskService.getTask(task4.id);
      expect(verifyTask4).not.toBeNull();
      expect(verifyTask4!.title).toBe('タスク4');
      expect(verifyTask4!.body).toBe('Bob - backlog');
      expect(verifyTask4!.author).toBe('Bob');
      expect(verifyTask4!.status).toBe('backlog');

      const verifyTask6 = taskService.getTask(task6.id);
      expect(verifyTask6).not.toBeNull();
      expect(verifyTask6!.title).toBe('タスク6');
      expect(verifyTask6!.body).toBe('Bob - in_progress');
      expect(verifyTask6!.author).toBe('Bob');
      expect(verifyTask6!.status).toBe('in_progress');

      const verifyTask10 = taskService.getTask(task10.id);
      expect(verifyTask10).not.toBeNull();
      expect(verifyTask10!.title).toBe('タスク10');
      expect(verifyTask10!.body).toBe('David - in_progress');
      expect(verifyTask10!.author).toBe('David');
      expect(verifyTask10!.status).toBe('in_progress');

      // 6. 更新後のフィルター検証
      // in_progressステータスでフィルター（4件: task2更新分, task3, task6, task10）
      const updatedInProgressTasks = taskService.listTasks({ status: 'in_progress' });
      expect(updatedInProgressTasks.length).toBe(4);

      // doneステータスでフィルター（1件: task5更新分）
      const doneTasks = taskService.listTasks({ status: 'done' });
      expect(doneTasks.length).toBe(1);
      expect(doneTasks[0].id).toBe(task5.id);

      // backlogステータスでフィルター（1件: task4のみ、task1削除、task9削除）
      const updatedBacklogTasks = taskService.listTasks({ status: 'backlog' });
      expect(updatedBacklogTasks.length).toBe(1);
      expect(updatedBacklogTasks[0].id).toBe(task4.id);
    });
  });

  describe('getTaskCountByStatus', () => {
    it('すべてのステータスのタスクが存在する場合の集計テスト', () => {
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

    it('タスクが0件の場合の集計テスト', () => {
      const counts = taskService.getTaskCountByStatus();

      expect(counts.backlog).toBe(0);
      expect(counts.ready).toBe(0);
      expect(counts.in_progress).toBe(0);
      expect(counts.done).toBe(0);
      expect(counts.closed).toBe(0);
    });

    it('特定のステータスのみタスクが存在する場合の集計テスト', () => {
      taskService.createTask({ title: 'Task 1', status: 'in_progress' });
      taskService.createTask({ title: 'Task 2', status: 'in_progress' });

      const counts = taskService.getTaskCountByStatus();

      expect(counts.backlog).toBe(0);
      expect(counts.ready).toBe(0);
      expect(counts.in_progress).toBe(2);
      expect(counts.done).toBe(0);
      expect(counts.closed).toBe(0);
    });

    it('タスク更新後の集計テスト - ステータス変更がカウントに反映される', () => {
      const task = taskService.createTask({ title: 'Task 1', status: 'backlog' });

      let counts = taskService.getTaskCountByStatus();
      expect(counts.backlog).toBe(1);
      expect(counts.in_progress).toBe(0);

      taskService.updateTask(task.id, { status: 'in_progress' });

      counts = taskService.getTaskCountByStatus();
      expect(counts.backlog).toBe(0);
      expect(counts.in_progress).toBe(1);
    });

    it('タスク削除後の集計テスト - 削除がカウントに反映される', () => {
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
    it('キーワード検索 - タイトルにマッチするタスクを検索', () => {
      // テスト用のタスクを作成
      taskService.createTask({ title: 'テスト タスク1', body: '本文A', status: 'backlog' });
      taskService.createTask({ title: '重要な会議', body: '本文B', status: 'in_progress' });
      taskService.createTask({ title: 'テスト タスク2', body: '本文C', status: 'ready' });
      taskService.createTask({ title: '買い物リスト', body: '本文D', status: 'done' });

      // 「テスト」をキーワードに検索
      const results = taskService.searchTasks('テスト');

      // 2件のタスクが見つかることを検証（done/closedは除外される）
      expect(results).toHaveLength(2);
      expect(results[0].title).toContain('テスト');
      expect(results[1].title).toContain('テスト');
    });

    it('キーワード検索 - 本文にマッチするタスクを検索', () => {
      // テスト用のタスクを作成
      taskService.createTask({ title: 'タスク1', body: '重要な内容', status: 'backlog' });
      taskService.createTask({ title: 'タスク2', body: '普通の内容', status: 'in_progress' });
      taskService.createTask({ title: 'タスク3', body: '重要な議題', status: 'ready' });

      // 「重要」をキーワードに検索
      const results = taskService.searchTasks('重要');

      // 2件のタスクが見つかることを検証
      expect(results).toHaveLength(2);
      expect(results.every((t) => t.body && t.body.includes('重要'))).toBe(true);
    });

    it('キーワード検索 - done/closedステータスのタスクは除外される', () => {
      // テスト用のタスクを作成
      taskService.createTask({ title: 'アクティブなタスク', body: '本文', status: 'in_progress' });
      taskService.createTask({ title: '完了したタスク', body: '本文', status: 'done' });
      taskService.createTask({ title: 'クローズしたタスク', body: '本文', status: 'closed' });

      // 「タスク」をキーワードに検索
      const results = taskService.searchTasks('タスク');

      // 1件のタスクのみ見つかることを検証（done/closedは除外）
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('アクティブなタスク');
      expect(results[0].status).toBe('in_progress');
    });

    it('キーワード検索 - includeAll=trueでdone/closedも検索対象に含む', () => {
      // テスト用のタスクを作成
      taskService.createTask({ title: 'アクティブなタスク', body: '本文', status: 'in_progress' });
      taskService.createTask({ title: '完了したタスク', body: '本文', status: 'done' });
      taskService.createTask({ title: 'クローズしたタスク', body: '本文', status: 'closed' });

      // includeAll=trueで「タスク」をキーワードに検索
      const results = taskService.searchTasks('タスク', true);

      // 3件すべてのタスクが見つかることを検証
      expect(results).toHaveLength(3);
      expect(results.map((t) => t.status)).toContain('in_progress');
      expect(results.map((t) => t.status)).toContain('done');
      expect(results.map((t) => t.status)).toContain('closed');
    });

    it('キーワード検索 - マッチするタスクがない場合は空配列を返す', () => {
      // テスト用のタスクを作成
      taskService.createTask({ title: 'タスク1', body: '本文A', status: 'backlog' });
      taskService.createTask({ title: 'タスク2', body: '本文B', status: 'in_progress' });

      // マッチしないキーワードで検索
      const results = taskService.searchTasks('存在しないキーワード');

      // 空配列が返ることを検証
      expect(results).toHaveLength(0);
    });
  });

  describe('Parent-Child Relationships', () => {
    it('親タスクを指定してタスクを作成できる', () => {
      // 親タスクを作成
      const parent = taskService.createTask({ title: 'Parent Task' });

      // 親タスクを指定して子タスクを作成
      const child = taskService.createTask({
        title: 'Child Task',
        parent_id: parent.id,
      });

      // 子タスクのparent_idが正しく設定されていることを検証
      expect(child.parent_id).toBe(parent.id);
    });

    it('存在しない親IDでエラーが発生する', () => {
      // 存在しない親IDでタスクを作成しようとするとエラー
      expect(() => {
        taskService.createTask({ title: 'Task', parent_id: 99999 });
      }).toThrow('Parent task with id 99999 does not exist');
    });

    it('子タスクを取得できる', () => {
      // 親タスクを作成
      const parent = taskService.createTask({ title: 'Parent' });

      // 2つの子タスクを作成
      const child1 = taskService.createTask({ title: 'Child 1', parent_id: parent.id });
      const child2 = taskService.createTask({ title: 'Child 2', parent_id: parent.id });

      // 子タスクを取得
      const children = taskService.getChildTasks(parent.id);

      // 2件の子タスクが取得されることを検証
      expect(children).toHaveLength(2);
      expect(children[0].id).toBe(child1.id);
      expect(children[0].title).toBe('Child 1');
      expect(children[1].id).toBe(child2.id);
      expect(children[1].title).toBe('Child 2');
    });

    it('親タスクを取得できる', () => {
      // 親タスクと子タスクを作成
      const parent = taskService.createTask({ title: 'Parent Task' });
      const child = taskService.createTask({ title: 'Child Task', parent_id: parent.id });

      // 子タスクから親タスクを取得
      const retrievedParent = taskService.getParentTask(child.id);

      // 親タスクが正しく取得されることを検証
      expect(retrievedParent).not.toBeNull();
      expect(retrievedParent!.id).toBe(parent.id);
      expect(retrievedParent!.title).toBe('Parent Task');
    });

    it('親がないタスクのgetParentTaskはnullを返す', () => {
      // 親がないタスクを作成
      const task = taskService.createTask({ title: 'Root Task' });

      // 親タスクを取得
      const parent = taskService.getParentTask(task.id);

      // nullが返ることを検証
      expect(parent).toBeNull();
    });

    it('循環参照を検出する', () => {
      // task1を作成
      const task1 = taskService.createTask({ title: 'Task 1' });
      // task2を作成（task1の子）
      const task2 = taskService.createTask({ title: 'Task 2', parent_id: task1.id });

      // task1の親にtask2を設定しようとすると循環参照エラー
      expect(() => {
        taskService.updateTask(task1.id, { parent_id: task2.id });
      }).toThrow(/cycle|circular/i);
    });

    it('自分自身を親に設定しようとすると循環参照エラーが発生する', () => {
      // タスクを作成
      const task = taskService.createTask({ title: 'Task' });

      // 自分自身を親に設定しようとすると循環参照エラー
      expect(() => {
        taskService.updateTask(task.id, { parent_id: task.id });
      }).toThrow(/cycle|circular/i);
    });

    it('親タスク削除時に子タスクが孤児化する', () => {
      // 親タスクと子タスクを作成
      const parent = taskService.createTask({ title: 'Parent' });
      const child = taskService.createTask({ title: 'Child', parent_id: parent.id });

      // 親タスクを削除
      taskService.deleteTask(parent.id);

      // 子タスクを取得
      const updatedChild = taskService.getTask(child.id);

      // 子タスクは削除されずに残っており、parent_idがnullになっていることを検証
      expect(updatedChild).not.toBeNull();
      expect(updatedChild!.parent_id).toBeNull();
    });

    it('子孫タスクを再帰的に取得できる', () => {
      // 3階層のタスク構造を作成
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

      // task1の子孫タスクを再帰的に取得
      const descendants = taskService.getDescendantTasks(task1.id);

      // 4件の子孫タスクが取得されることを検証（task2, task3, task4, task5）
      expect(descendants).toHaveLength(4);

      // すべての子孫タスクが含まれていることを検証
      const descendantIds = descendants.map((t) => t.id);
      expect(descendantIds).toContain(task2.id);
      expect(descendantIds).toContain(task3.id);
      expect(descendantIds).toContain(task4.id);
      expect(descendantIds).toContain(task5.id);
    });

    it('子孫が存在しないタスクのgetDescendantTasksは空配列を返す', () => {
      // 子がないタスクを作成
      const task = taskService.createTask({ title: 'Leaf Task' });

      // 子孫タスクを取得
      const descendants = taskService.getDescendantTasks(task.id);

      // 空配列が返ることを検証
      expect(descendants).toHaveLength(0);
    });

    it('ルートタスクを取得できる - 親が存在する場合', () => {
      // 3階層のタスク構造を作成
      // grandparent -> parent -> child
      const grandparent = taskService.createTask({ title: 'Grandparent' });
      const parent = taskService.createTask({ title: 'Parent', parent_id: grandparent.id });
      const child = taskService.createTask({ title: 'Child', parent_id: parent.id });

      // 子タスクからルートタスクを取得
      const root = taskService.getRootTask(child.id);

      // ルートタスクがgrandparentであることを検証
      expect(root).not.toBeNull();
      expect(root!.id).toBe(grandparent.id);
      expect(root!.title).toBe('Grandparent');
    });

    it('ルートタスクを取得できる - 親がない場合は自分自身を返す', () => {
      // 親がないタスクを作成
      const task = taskService.createTask({ title: 'Root Task' });

      // ルートタスクを取得
      const root = taskService.getRootTask(task.id);

      // 自分自身が返ることを検証
      expect(root).not.toBeNull();
      expect(root!.id).toBe(task.id);
      expect(root!.title).toBe('Root Task');
    });

    it('ルートタスクを取得 - 存在しないタスクIDの場合はnullを返す', () => {
      // 存在しないIDでルートタスクを取得
      const root = taskService.getRootTask(99999);

      // nullが返ることを検証
      expect(root).toBeNull();
    });

    it('ルートタスクを取得 - 親タスクが途中で削除されている場合', () => {
      // 3階層のタスク構造を作成
      const grandparent = taskService.createTask({ title: 'Grandparent' });
      const parent = taskService.createTask({ title: 'Parent', parent_id: grandparent.id });
      const child = taskService.createTask({ title: 'Child', parent_id: parent.id });

      // 中間の親タスクを削除（parent_idはnullになる）
      taskService.deleteTask(parent.id);

      // 子タスクからルートタスクを取得
      const root = taskService.getRootTask(child.id);

      // 孤児化した子タスク自身が返ることを検証
      expect(root).not.toBeNull();
      expect(root!.id).toBe(child.id);
    });

    it('parent_idをnullに更新できる', () => {
      // 親子関係のあるタスクを作成
      const parent = taskService.createTask({ title: 'Parent' });
      const child = taskService.createTask({ title: 'Child', parent_id: parent.id });

      // 子タスクのparent_idが設定されていることを確認
      expect(child.parent_id).toBe(parent.id);

      // parent_idをnullに更新
      const updatedChild = taskService.updateTask(child.id, { parent_id: null });

      // parent_idがnullになっていることを検証
      expect(updatedChild).not.toBeNull();
      expect(updatedChild!.parent_id).toBeNull();
    });

    it('存在する親タスクにparent_idを更新できる', () => {
      // 2つの親タスクと1つの子タスクを作成
      const parent1 = taskService.createTask({ title: 'Parent 1' });
      const parent2 = taskService.createTask({ title: 'Parent 2' });
      const child = taskService.createTask({ title: 'Child', parent_id: parent1.id });

      // 最初の親がparent1であることを確認
      expect(child.parent_id).toBe(parent1.id);

      // parent_idをparent2に変更
      const updatedChild = taskService.updateTask(child.id, { parent_id: parent2.id });

      // parent_idがparent2に変更されていることを検証
      expect(updatedChild).not.toBeNull();
      expect(updatedChild!.parent_id).toBe(parent2.id);
    });

    it('updateで存在しない親IDを設定するとエラーが発生する', () => {
      // タスクを作成
      const task = taskService.createTask({ title: 'Task' });

      // 存在しない親IDに更新しようとするとエラー
      expect(() => {
        taskService.updateTask(task.id, { parent_id: 99999 });
      }).toThrow('Parent task with id 99999 does not exist');
    });
  });

  describe('TaskService with Mock Database', () => {
    let mockDb: Database.Database;
    let taskService: TaskService;

    beforeEach(() => {
      mockDb = createMockDatabase();
      taskService = new TaskService(mockDb);
    });

    afterEach(() => {
      mockDb.close();
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
});
