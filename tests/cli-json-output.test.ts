import { describe, it, expect, beforeEach } from 'vitest';
import { execSync } from 'child_process';
import { resetDatabase } from '../src/db/reset';

/**
 * CLI JSON Output Tests
 *
 * すべてのCLIコマンドの--jsonオプションで出力されるJSONの形式を検証します。
 * - JSON.parse()でパース可能であること
 * - 必須フィールドが存在すること
 * - データ型が正しいこと
 * - エラーケースで適切なエラーJSONが返ること
 */
describe('CLI JSON Output Format', () => {
  const CLI_PATH = 'node dist/cli/index.js';

  beforeEach(() => {
    // 各テストの前にデータベースをリセット
    resetDatabase();
  });

  /**
   * Helper: コマンドを実行してJSON出力を取得
   */
  function runCommand(command: string): Record<string, unknown> {
    try {
      const output = execSync(`${CLI_PATH} ${command}`, { encoding: 'utf-8' });
      return JSON.parse(output) as Record<string, unknown>;
    } catch (error: unknown) {
      // エラーの場合でもJSONを返すコマンドがある
      if (error && typeof error === 'object' && 'stdout' in error && typeof error.stdout === 'string') {
        try {
          return JSON.parse(error.stdout) as Record<string, unknown>;
        } catch {
          throw error;
        }
      }
      throw error;
    }
  }

  describe('task add --json', () => {
    it('JSON.parse()でパース可能であること', () => {
      const output = execSync(`${CLI_PATH} task add "Test Task" --json`, { encoding: 'utf-8' });
      expect(() => JSON.parse(output)).not.toThrow();
    });

    it('success フィールドが存在すること', () => {
      const json = runCommand('task add "Test Task" --json');
      expect(json).toHaveProperty('success');
      expect(typeof json.success).toBe('boolean');
      expect(json.success).toBe(true);
    });

    it('task オブジェクトが存在し、必須フィールドを持つこと', () => {
      const json = runCommand('task add "Test Task" --json');
      expect(json).toHaveProperty('task');
      expect(json.task).toBeDefined();

      // 必須フィールドの検証
      expect(json.task).toHaveProperty('id');
      expect(typeof json.task.id).toBe('number');
      expect(json.task.id).toBeGreaterThan(0);

      expect(json.task).toHaveProperty('title');
      expect(typeof json.task.title).toBe('string');
      expect(json.task.title).toBe('Test Task');

      expect(json.task).toHaveProperty('status');
      expect(typeof json.task.status).toBe('string');

      expect(json.task).toHaveProperty('created_at');
      expect(typeof json.task.created_at).toBe('string');

      expect(json.task).toHaveProperty('updated_at');
      expect(typeof json.task.updated_at).toBe('string');
    });

    it('parent, blockedBy, blocking フィールドが存在すること', () => {
      const json = runCommand('task add "Test Task" --json');
      expect(json).toHaveProperty('parent');
      expect(json).toHaveProperty('blockedBy');
      expect(json).toHaveProperty('blocking');
    });

    it('--parent オプション付きで親タスクが設定されること', () => {
      const parent = runCommand('task add "Parent Task" --json');
      const child = runCommand(`task add "Child Task" --parent ${parent.task.id} --json`);

      expect(child.parent).toBeDefined();
      expect(child.parent.id).toBe(parent.task.id);
    });

    it('--blocked-by オプション付きでブロック関係が設定されること', () => {
      const blocker = runCommand('task add "Blocker Task" --json');
      const blocked = runCommand(`task add "Blocked Task" --blocked-by ${blocker.task.id} --json`);

      expect(blocked.blockedBy).toBeDefined();
      expect(Array.isArray(blocked.blockedBy)).toBe(true);
      expect(blocked.blockedBy.length).toBe(1);
      expect(blocked.blockedBy[0].id).toBe(blocker.task.id);
    });
  });

  describe('task list --json', () => {
    beforeEach(() => {
      // テストデータを作成
      runCommand('task add "Task 1" --json');
      runCommand('task add "Task 2" --json');
      runCommand('task add "Task 3" --json');
    });

    it('JSON.parse()でパース可能であること', () => {
      const output = execSync(`${CLI_PATH} task list --json`, { encoding: 'utf-8' });
      expect(() => JSON.parse(output)).not.toThrow();
    });

    it('tasks 配列が存在すること', () => {
      const json = runCommand('task list --json');
      expect(json).toHaveProperty('tasks');
      expect(Array.isArray(json.tasks)).toBe(true);
    });

    it('tasks 配列の各要素が必須フィールドを持つこと', () => {
      const json = runCommand('task list --json');
      expect(Array.isArray(json.tasks)).toBe(true);
      const tasks = json.tasks as Array<Record<string, unknown>>;
      expect(tasks.length).toBeGreaterThan(0);

      tasks.forEach((task) => {
        expect(task).toHaveProperty('id');
        expect(typeof task.id).toBe('number');
        expect(task).toHaveProperty('title');
        expect(typeof task.title).toBe('string');
        expect(task).toHaveProperty('status');
        expect(typeof task.status).toBe('string');
      });
    });

    it('空のリストが空配列を返すこと', () => {
      resetDatabase(); // データベースをクリア
      const json = runCommand('task list --json');
      expect(json.tasks).toEqual([]);
      expect(json.tasks.length).toBe(0);
    });

    it('--status オプションでフィルタリングされること', () => {
      // in_progress ステータスのタスクを作成
      const task = runCommand('task add "In Progress Task" --json');
      const taskObj = task.task as { id: number };
      execSync(`${CLI_PATH} task update ${taskObj.id} status in_progress --json`, { stdio: 'ignore' });

      const json = runCommand('task list --status in_progress --json');
      const tasks = json.tasks as Array<Record<string, unknown>>;
      expect(tasks.length).toBeGreaterThan(0);
      tasks.forEach((task) => {
        expect(task.status).toBe('in_progress');
      });
    });
  });

  describe('task get --json', () => {
    let taskId: number;

    beforeEach(() => {
      const result = runCommand('task add "Test Task" --json');
      taskId = result.task.id;
    });

    it('JSON.parse()でパース可能であること', () => {
      const output = execSync(`${CLI_PATH} task get ${taskId} --json`, { encoding: 'utf-8' });
      expect(() => JSON.parse(output)).not.toThrow();
    });

    it('task オブジェクトが存在し、必須フィールドを持つこと', () => {
      const json = runCommand(`task get ${taskId} --json`);
      expect(json).toHaveProperty('task');

      expect(json.task).toHaveProperty('id');
      expect(json.task.id).toBe(taskId);
      expect(json.task).toHaveProperty('title');
      expect(json.task).toHaveProperty('status');
      expect(json.task).toHaveProperty('created_at');
      expect(json.task).toHaveProperty('updated_at');
    });

    it('無効なIDでエラーを返すこと', () => {
      try {
        execSync(`${CLI_PATH} task get 99999 --json`, { encoding: 'utf-8', stdio: 'pipe' });
        expect.fail('Should throw error');
      } catch (error: unknown) {
        if (error && typeof error === 'object' && 'status' in error) {
          expect(error.status).not.toBe(0);
        }
      }
    });
  });

  describe('task update --json', () => {
    let taskId: number;

    beforeEach(() => {
      const result = runCommand('task add "Update Target" --json');
      taskId = result.task.id as number;
    });

    it('JSON.parse()でパース可能であること', () => {
      const output = execSync(`${CLI_PATH} task update ${taskId} status in_progress --json`, { encoding: 'utf-8' });
      expect(() => JSON.parse(output)).not.toThrow();
    });

    it('success, task, counts フィールドが存在すること', () => {
      const json = runCommand(`task update ${taskId} status in_progress --json`);
      expect(json).toHaveProperty('success');
      expect(json.success).toBe(true);
      expect(json).toHaveProperty('task');
      expect(json).toHaveProperty('counts');
      expect((json.task as Record<string, unknown>).status).toBe('in_progress');
    });

    it('無効なステータスでエラーJSONを返すこと', () => {
      const json = runCommand(`task update ${taskId} status invalid_status --json`);
      expect(json).toHaveProperty('success');
      expect(json.success).toBe(false);
      expect(json).toHaveProperty('error');
    });
  });

  describe('task find --json', () => {
    beforeEach(() => {
      runCommand('task add "Find Test Task 1" --json');
      runCommand('task add "Find Test Task 2" --json');
      runCommand('task add "Different Task" --json');
    });

    it('JSON.parse()でパース可能であること', () => {
      const output = execSync(`${CLI_PATH} task find "Find" --json`, { encoding: 'utf-8' });
      expect(() => JSON.parse(output)).not.toThrow();
    });

    it('tasks 配列が存在すること', () => {
      const json = runCommand('task find "Find" --json');
      expect(json).toHaveProperty('tasks');
      expect(Array.isArray(json.tasks)).toBe(true);
    });

    it('検索結果が正しくフィルタリングされること', () => {
      const json = runCommand('task find "Find Test" --json');
      const tasks = json.tasks as Array<Record<string, unknown>>;
      expect(tasks.length).toBe(2);
      tasks.forEach((task) => {
        expect(task.title).toContain('Find Test');
      });
    });

    it('空の検索結果が空配列を返すこと', () => {
      const json = runCommand('task find "NonExistentKeyword" --json');
      expect(json.tasks).toEqual([]);
      expect(json.tasks.length).toBe(0);
    });
  });

  describe('task count --json', () => {
    beforeEach(() => {
      // 複数のステータスのタスクを作成
      const task1 = runCommand('task add "Task 1" --json');
      const task2 = runCommand('task add "Task 2" --json');
      const task1Obj = task1.task as { id: number };
      const task2Obj = task2.task as { id: number };
      execSync(`${CLI_PATH} task update ${task1Obj.id} status in_progress --json`, { stdio: 'ignore' });
      execSync(`${CLI_PATH} task update ${task2Obj.id} status done --json`, { stdio: 'ignore' });
      runCommand('task add "Task 3" --json');
    });

    it('JSON.parse()でパース可能であること', () => {
      const output = execSync(`${CLI_PATH} task count --json`, { encoding: 'utf-8' });
      expect(() => JSON.parse(output)).not.toThrow();
    });

    it('total フィールドが存在すること', () => {
      const json = runCommand('task count --json');
      expect(json).toHaveProperty('total');
      expect(typeof json.total).toBe('number');
      expect(json.total).toBeGreaterThan(0);
    });

    it('ステータス別のカウントフィールドが存在すること', () => {
      const json = runCommand('task count --json');
      expect(json).toHaveProperty('counts');
      expect(json.counts).toHaveProperty('backlog');
      expect(json.counts).toHaveProperty('ready');
      expect(json.counts).toHaveProperty('in_progress');
      expect(json.counts).toHaveProperty('done');
      expect(json.counts).toHaveProperty('closed');

      // 各フィールドが数値であること
      expect(typeof json.counts.backlog).toBe('number');
      expect(typeof json.counts.ready).toBe('number');
      expect(typeof json.counts.in_progress).toBe('number');
      expect(typeof json.counts.done).toBe('number');
      expect(typeof json.counts.closed).toBe('number');
    });

    it('カウント結果が正しいこと', () => {
      const json = runCommand('task count --json');
      expect(json.total).toBe(3);
      expect(json.counts.backlog).toBe(1);
      expect(json.counts.in_progress).toBe(1);
      expect(json.counts.done).toBe(1);
    });

    it('--status オプションで特定ステータスのカウントが取得できること', () => {
      const json = runCommand('task count --status in_progress --json');
      expect(json).toHaveProperty('status');
      expect(json.status).toBe('in_progress');
      expect(json).toHaveProperty('count');
      expect(typeof json.count).toBe('number');
      expect(json.count).toBe(1);
    });

    it('空のデータベースで0を返すこと', () => {
      resetDatabase();
      const json = runCommand('task count --json');
      expect(json.total).toBe(0);
      expect(json.counts.backlog).toBe(0);
      expect(json.counts.ready).toBe(0);
      expect(json.counts.in_progress).toBe(0);
      expect(json.counts.done).toBe(0);
      expect(json.counts.closed).toBe(0);
    });
  });

  describe('task update-parent --json', () => {
    let parentId: number;
    let childId: number;

    beforeEach(() => {
      const parent = runCommand('task add "Parent Task" --json');
      const child = runCommand('task add "Child Task" --json');
      parentId = parent.task.id;
      childId = child.task.id;
    });

    it('JSON.parse()でパース可能であること', () => {
      const output = execSync(`${CLI_PATH} task update-parent ${childId} ${parentId} --json`, { encoding: 'utf-8' });
      expect(() => JSON.parse(output)).not.toThrow();
    });

    it('success フィールドが存在すること', () => {
      const json = runCommand(`task update-parent ${childId} ${parentId} --json`);
      expect(json).toHaveProperty('success');
      expect(typeof json.success).toBe('boolean');
      expect(json.success).toBe(true);
    });

    it('task, parent フィールドが存在すること', () => {
      const json = runCommand(`task update-parent ${childId} ${parentId} --json`);
      expect(json).toHaveProperty('task');
      expect(json).toHaveProperty('parent');
      expect(json.task.id).toBe(childId);
      expect(json.parent.id).toBe(parentId);
    });

    it('親タスクの削除（null設定）が可能であること', () => {
      runCommand(`task update-parent ${childId} ${parentId} --json`);
      const json = runCommand(`task update-parent ${childId} null --json`);
      expect(json.success).toBe(true);
      expect(json.parent).toBeNull();
    });

    it('無効なタスクIDでエラーを返すこと', () => {
      try {
        execSync(`${CLI_PATH} task update-parent 99999 ${parentId} --json`, { encoding: 'utf-8', stdio: 'pipe' });
        expect.fail('Should throw error');
      } catch (error: unknown) {
        if (error && typeof error === 'object' && 'status' in error) {
          expect(error.status).not.toBe(0);
        }
      }
    });
  });

  describe('task block list --json', () => {
    let task1Id: number;
    let task2Id: number;
    let task3Id: number;

    beforeEach(() => {
      const task1 = runCommand('task add "Task 1" --json');
      const task2 = runCommand('task add "Task 2" --json');
      const task3 = runCommand('task add "Task 3" --json');
      task1Id = task1.task.id;
      task2Id = task2.task.id;
      task3Id = task3.task.id;

      // task2 は task1 にブロックされている
      // task3 は task2 にブロックされている
      // task block add コマンドはJSON出力をサポートしていない
      execSync(`${CLI_PATH} task block add ${task1Id} ${task2Id}`, { stdio: 'ignore' });
      execSync(`${CLI_PATH} task block add ${task2Id} ${task3Id}`, { stdio: 'ignore' });
    });

    it('JSON.parse()でパース可能であること', () => {
      const output = execSync(`${CLI_PATH} task block list ${task2Id} --json`, { encoding: 'utf-8' });
      expect(() => JSON.parse(output)).not.toThrow();
    });

    it('task, blockedBy, blocking フィールドが存在すること', () => {
      const json = runCommand(`task block list ${task2Id} --json`);
      expect(json).toHaveProperty('task');
      expect(json).toHaveProperty('blockedBy');
      expect(json).toHaveProperty('blocking');

      expect(json.task.id).toBe(task2Id);
      expect(Array.isArray(json.blockedBy)).toBe(true);
      expect(Array.isArray(json.blocking)).toBe(true);
    });

    it('ブロック関係が正しく表示されること', () => {
      const json = runCommand(`task block list ${task2Id} --json`);

      // task2 は task1 にブロックされている
      expect(json.blockedBy.length).toBe(1);
      expect(json.blockedBy[0].id).toBe(task1Id);

      // task2 は task3 をブロックしている
      expect(json.blocking.length).toBe(1);
      expect(json.blocking[0].id).toBe(task3Id);
    });

    it('ブロック関係がないタスクで空配列を返すこと', () => {
      const newTask = runCommand('task add "No Block Task" --json');
      const json = runCommand(`task block list ${newTask.task.id} --json`);

      expect(json.blockedBy).toEqual([]);
      expect(json.blocking).toEqual([]);
    });

    it('無効なタスクIDでエラーを返すこと', () => {
      try {
        execSync(`${CLI_PATH} task block list 99999 --json`, { encoding: 'utf-8', stdio: 'pipe' });
        expect.fail('Should throw error');
      } catch (error: unknown) {
        if (error && typeof error === 'object' && 'status' in error) {
          expect(error.status).not.toBe(0);
        }
      }
    });
  });

  describe('tag list --json', () => {
    let tag1Id: number;
    let tag2Id: number;
    let task1Id: number;
    let task2Id: number;

    beforeEach(() => {
      const task1 = runCommand('task add "Task 1" --json');
      const task2 = runCommand('task add "Task 2" --json');
      task1Id = task1.task.id;
      task2Id = task2.task.id;

      // タグを作成してIDを取得
      execSync(`${CLI_PATH} tag add "tag1"`, { stdio: 'ignore' });
      execSync(`${CLI_PATH} tag add "tag2"`, { stdio: 'ignore' });

      const tagList = runCommand('tag list --json');
      const tags = tagList.tags as Array<{ id: number; name: string }>;
      const tag1 = tags.find((t) => t.name === 'tag1');
      const tag2 = tags.find((t) => t.name === 'tag2');
      if (!tag1 || !tag2) throw new Error('Tags not found');
      tag1Id = tag1.id;
      tag2Id = tag2.id;

      // タスクにタグを付与
      execSync(`${CLI_PATH} tag attach ${task1Id} ${tag1Id}`, { stdio: 'ignore' });
      execSync(`${CLI_PATH} tag attach ${task1Id} ${tag2Id}`, { stdio: 'ignore' });
      execSync(`${CLI_PATH} tag attach ${task2Id} ${tag1Id}`, { stdio: 'ignore' });
    });

    it('JSON.parse()でパース可能であること', () => {
      const output = execSync(`${CLI_PATH} tag list --json`, { encoding: 'utf-8' });
      expect(() => JSON.parse(output)).not.toThrow();
    });

    it('totalCount, tags フィールドが存在すること', () => {
      const json = runCommand('tag list --json');
      expect(json).toHaveProperty('totalCount');
      expect(json).toHaveProperty('tags');
      expect(typeof json.totalCount).toBe('number');
      expect(Array.isArray(json.tags)).toBe(true);
    });

    it('tags 配列の各要素が name, taskCount フィールドを持つこと', () => {
      const json = runCommand('tag list --json');
      const tags = json.tags as Array<Record<string, unknown>>;
      expect(tags.length).toBeGreaterThan(0);

      tags.forEach((tag) => {
        expect(tag).toHaveProperty('name');
        expect(typeof tag.name).toBe('string');
        expect(tag).toHaveProperty('taskCount');
        expect(typeof tag.taskCount).toBe('number');
        expect(tag.taskCount).toBeGreaterThan(0);
      });
    });

    it('タグのカウントが正しいこと', () => {
      const json = runCommand('tag list --json');
      const tags = json.tags as Array<{ name: string; taskCount: number }>;
      const tag1 = tags.find((t) => t.name === 'tag1');
      const tag2 = tags.find((t) => t.name === 'tag2');

      expect(tag1).toBeDefined();
      expect(tag1.taskCount).toBe(2);
      expect(tag2).toBeDefined();
      expect(tag2.taskCount).toBe(1);
    });

    it('タグがない場合に空配列を返すこと', () => {
      resetDatabase();
      runCommand('task add "Task without tags" --json');

      const json = runCommand('tag list --json');
      expect(json.totalCount).toBe(0);
      expect(json.tags).toEqual([]);
    });
  });

  describe('tag show --json', () => {
    let taskId: number;
    let tag1Id: number;
    let tag2Id: number;

    beforeEach(() => {
      const task = runCommand('task add "Test Task" --json');
      taskId = task.task.id;

      // タグを作成
      execSync(`${CLI_PATH} tag add "tag1"`, { stdio: 'ignore' });
      execSync(`${CLI_PATH} tag add "tag2"`, { stdio: 'ignore' });

      // タグIDを取得
      const tagList = runCommand('tag list --json');
      const tags = tagList.tags as Array<{ id: number; name: string }>;
      const tag1 = tags.find((t) => t.name === 'tag1');
      const tag2 = tags.find((t) => t.name === 'tag2');
      if (!tag1 || !tag2) throw new Error('Tags not found');
      tag1Id = tag1.id;
      tag2Id = tag2.id;

      // タスクにタグを付与
      execSync(`${CLI_PATH} tag attach ${taskId} ${tag1Id}`, { stdio: 'ignore' });
      execSync(`${CLI_PATH} tag attach ${taskId} ${tag2Id}`, { stdio: 'ignore' });
    });

    it('JSON.parse()でパース可能であること', () => {
      const output = execSync(`${CLI_PATH} tag show ${taskId} --json`, { encoding: 'utf-8' });
      expect(() => JSON.parse(output)).not.toThrow();
    });

    it('task, tags フィールドが存在すること', () => {
      const json = runCommand(`tag show ${taskId} --json`);
      expect(json).toHaveProperty('task');
      expect(json).toHaveProperty('tags');
      expect(json.task.id).toBe(taskId);
      expect(Array.isArray(json.tags)).toBe(true);
    });

    it('tags 配列の各要素が name フィールドを持つこと', () => {
      const json = runCommand(`tag show ${taskId} --json`);
      const tags = json.tags as Array<Record<string, unknown>>;
      expect(tags.length).toBe(2);

      tags.forEach((tag) => {
        expect(tag).toHaveProperty('name');
        expect(typeof tag.name).toBe('string');
      });
    });

    it('タグがないタスクで空配列を返すこと', () => {
      const newTask = runCommand('task add "No Tags Task" --json');
      const json = runCommand(`tag show ${newTask.task.id} --json`);

      expect(json.tags).toEqual([]);
      expect(json.tags.length).toBe(0);
    });

    it('無効なタスクIDでエラーを返すこと', () => {
      try {
        execSync(`${CLI_PATH} tag show 99999 --json`, { encoding: 'utf-8', stdio: 'pipe' });
        expect.fail('Should throw error');
      } catch (error: unknown) {
        if (error && typeof error === 'object' && 'status' in error) {
          expect(error.status).not.toBe(0);
        }
      }
    });
  });
});
