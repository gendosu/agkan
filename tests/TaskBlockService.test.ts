import { describe, it, expect, beforeEach } from 'vitest';
import { TaskService } from '../src/services/TaskService';
import { TaskBlockService } from '../src/services/TaskBlockService';
import { resetDatabase } from '../src/db/reset';

describe('TaskBlockService', () => {
  let taskService: TaskService;
  let taskBlockService: TaskBlockService;

  beforeEach(() => {
    // 各テストの前にデータベースをリセット
    resetDatabase();
    taskService = new TaskService();
    taskBlockService = new TaskBlockService();
  });

  describe('addBlock', () => {
    it('ブロック関係を追加できる', () => {
      // 2つのタスクを作成
      const task1 = taskService.createTask({ title: 'Task 1' });
      const task2 = taskService.createTask({ title: 'Task 2' });

      // ブロック関係を追加（task1がtask2をブロック）
      const block = taskBlockService.addBlock({
        blocker_task_id: task1.id,
        blocked_task_id: task2.id,
      });

      // ブロック関係が正しく作成されたことを検証
      expect(block).toBeDefined();
      expect(block.id).toBeDefined();
      expect(typeof block.id).toBe('number');
      expect(block.blocker_task_id).toBe(task1.id);
      expect(block.blocked_task_id).toBe(task2.id);
      expect(block.created_at).toBeDefined();
      expect(typeof block.created_at).toBe('string');
    });

    it('複数のブロック関係を追加できる - 1つのタスクが複数のタスクをブロック', () => {
      // 3つのタスクを作成
      const task1 = taskService.createTask({ title: 'Task 1' });
      const task2 = taskService.createTask({ title: 'Task 2' });
      const task3 = taskService.createTask({ title: 'Task 3' });

      // task1がtask2とtask3をブロック
      const block1 = taskBlockService.addBlock({
        blocker_task_id: task1.id,
        blocked_task_id: task2.id,
      });

      const block2 = taskBlockService.addBlock({
        blocker_task_id: task1.id,
        blocked_task_id: task3.id,
      });

      // 両方のブロック関係が正しく作成されたことを検証
      expect(block1.blocker_task_id).toBe(task1.id);
      expect(block1.blocked_task_id).toBe(task2.id);
      expect(block2.blocker_task_id).toBe(task1.id);
      expect(block2.blocked_task_id).toBe(task3.id);
    });

    it('複数のブロック関係を追加できる - 1つのタスクが複数のタスクにブロックされる', () => {
      // 3つのタスクを作成
      const task1 = taskService.createTask({ title: 'Task 1' });
      const task2 = taskService.createTask({ title: 'Task 2' });
      const task3 = taskService.createTask({ title: 'Task 3' });

      // task1とtask2がtask3をブロック
      const block1 = taskBlockService.addBlock({
        blocker_task_id: task1.id,
        blocked_task_id: task3.id,
      });

      const block2 = taskBlockService.addBlock({
        blocker_task_id: task2.id,
        blocked_task_id: task3.id,
      });

      // 両方のブロック関係が正しく作成されたことを検証
      expect(block1.blocker_task_id).toBe(task1.id);
      expect(block1.blocked_task_id).toBe(task3.id);
      expect(block2.blocker_task_id).toBe(task2.id);
      expect(block2.blocked_task_id).toBe(task3.id);
    });

    it('存在しないブロッカータスクIDでエラーが発生する', () => {
      // タスクを1つ作成
      const task = taskService.createTask({ title: 'Task' });

      // 存在しないブロッカーIDでブロック関係を追加しようとするとエラー
      expect(() => {
        taskBlockService.addBlock({
          blocker_task_id: 99999,
          blocked_task_id: task.id,
        });
      }).toThrow('Blocker task with id 99999 does not exist');
    });

    it('存在しないブロックされるタスクIDでエラーが発生する', () => {
      // タスクを1つ作成
      const task = taskService.createTask({ title: 'Task' });

      // 存在しないブロックされるIDでブロック関係を追加しようとするとエラー
      expect(() => {
        taskBlockService.addBlock({
          blocker_task_id: task.id,
          blocked_task_id: 99999,
        });
      }).toThrow('Blocked task with id 99999 does not exist');
    });

    it('自己参照を禁止する', () => {
      // タスクを作成
      const task = taskService.createTask({ title: 'Task' });

      // 自分自身をブロックしようとするとエラー
      expect(() => {
        taskBlockService.addBlock({
          blocker_task_id: task.id,
          blocked_task_id: task.id,
        });
      }).toThrow('Task cannot block itself');
    });

    it('ブロック循環参照を検出する - 2タスク間の直接的な循環', () => {
      // 2つのタスクを作成
      const task1 = taskService.createTask({ title: 'Task 1' });
      const task2 = taskService.createTask({ title: 'Task 2' });

      // task1がtask2をブロック
      taskBlockService.addBlock({
        blocker_task_id: task1.id,
        blocked_task_id: task2.id,
      });

      // task2がtask1をブロックしようとすると循環参照エラー
      expect(() => {
        taskBlockService.addBlock({
          blocker_task_id: task2.id,
          blocked_task_id: task1.id,
        });
      }).toThrow(/cycle|circular/i);
    });

    it('ブロック循環参照を検出する - 3タスク以上の間接的な循環', () => {
      // 3つのタスクを作成
      const task1 = taskService.createTask({ title: 'Task 1' });
      const task2 = taskService.createTask({ title: 'Task 2' });
      const task3 = taskService.createTask({ title: 'Task 3' });

      // task1 -> task2 -> task3 のブロック関係を作成
      taskBlockService.addBlock({
        blocker_task_id: task1.id,
        blocked_task_id: task2.id,
      });

      taskBlockService.addBlock({
        blocker_task_id: task2.id,
        blocked_task_id: task3.id,
      });

      // task3がtask1をブロックしようとすると循環参照エラー
      expect(() => {
        taskBlockService.addBlock({
          blocker_task_id: task3.id,
          blocked_task_id: task1.id,
        });
      }).toThrow(/cycle|circular/i);
    });

    it('ブロック循環参照を検出する - 複雑な依存関係での循環検出', () => {
      // 5つのタスクを作成
      const task1 = taskService.createTask({ title: 'Task 1' });
      const task2 = taskService.createTask({ title: 'Task 2' });
      const task3 = taskService.createTask({ title: 'Task 3' });
      const task4 = taskService.createTask({ title: 'Task 4' });
      const task5 = taskService.createTask({ title: 'Task 5' });

      // 複雑な依存関係を作成
      // task1 -> task2, task3
      // task2 -> task4
      // task3 -> task5
      taskBlockService.addBlock({
        blocker_task_id: task1.id,
        blocked_task_id: task2.id,
      });

      taskBlockService.addBlock({
        blocker_task_id: task1.id,
        blocked_task_id: task3.id,
      });

      taskBlockService.addBlock({
        blocker_task_id: task2.id,
        blocked_task_id: task4.id,
      });

      taskBlockService.addBlock({
        blocker_task_id: task3.id,
        blocked_task_id: task5.id,
      });

      // task4がtask1をブロックしようとすると循環参照エラー
      expect(() => {
        taskBlockService.addBlock({
          blocker_task_id: task4.id,
          blocked_task_id: task1.id,
        });
      }).toThrow(/cycle|circular/i);
    });
  });

  describe('removeBlock', () => {
    it('ブロック関係を削除できる', () => {
      // 2つのタスクを作成
      const task1 = taskService.createTask({ title: 'Task 1' });
      const task2 = taskService.createTask({ title: 'Task 2' });

      // ブロック関係を追加
      taskBlockService.addBlock({
        blocker_task_id: task1.id,
        blocked_task_id: task2.id,
      });

      // ブロック関係を削除
      const result = taskBlockService.removeBlock(task1.id, task2.id);

      // 削除が成功したことを検証
      expect(result).toBe(true);

      // ブロック関係が削除されたことを確認
      const blockers = taskBlockService.getBlockerTaskIds(task2.id);
      expect(blockers).toHaveLength(0);
    });

    it('存在しないブロック関係の削除はfalseを返す', () => {
      // 2つのタスクを作成（ブロック関係は作成しない）
      const task1 = taskService.createTask({ title: 'Task 1' });
      const task2 = taskService.createTask({ title: 'Task 2' });

      // 存在しないブロック関係を削除しようとする
      const result = taskBlockService.removeBlock(task1.id, task2.id);

      // 削除が失敗したことを検証
      expect(result).toBe(false);
    });

    it('複数のブロック関係のうち特定の関係のみを削除できる', () => {
      // 3つのタスクを作成
      const task1 = taskService.createTask({ title: 'Task 1' });
      const task2 = taskService.createTask({ title: 'Task 2' });
      const task3 = taskService.createTask({ title: 'Task 3' });

      // task1がtask2とtask3をブロック
      taskBlockService.addBlock({
        blocker_task_id: task1.id,
        blocked_task_id: task2.id,
      });

      taskBlockService.addBlock({
        blocker_task_id: task1.id,
        blocked_task_id: task3.id,
      });

      // task1とtask2のブロック関係のみを削除
      const result = taskBlockService.removeBlock(task1.id, task2.id);

      // 削除が成功したことを検証
      expect(result).toBe(true);

      // task1とtask2のブロック関係が削除されたことを確認
      const blockers2 = taskBlockService.getBlockerTaskIds(task2.id);
      expect(blockers2).toHaveLength(0);

      // task1とtask3のブロック関係は残っていることを確認
      const blockers3 = taskBlockService.getBlockerTaskIds(task3.id);
      expect(blockers3).toHaveLength(1);
      expect(blockers3[0]).toBe(task1.id);
    });
  });

  describe('getBlockedTaskIds', () => {
    it('ブロックしているタスクIDを取得できる', () => {
      // 3つのタスクを作成
      const task1 = taskService.createTask({ title: 'Task 1' });
      const task2 = taskService.createTask({ title: 'Task 2' });
      const task3 = taskService.createTask({ title: 'Task 3' });

      // task1がtask2とtask3をブロック
      taskBlockService.addBlock({
        blocker_task_id: task1.id,
        blocked_task_id: task2.id,
      });

      taskBlockService.addBlock({
        blocker_task_id: task1.id,
        blocked_task_id: task3.id,
      });

      // task1がブロックしているタスクIDを取得
      const blockedIds = taskBlockService.getBlockedTaskIds(task1.id);

      // 2件のタスクIDが取得されることを検証
      expect(blockedIds).toHaveLength(2);
      expect(blockedIds).toContain(task2.id);
      expect(blockedIds).toContain(task3.id);
    });

    it('ブロックしていないタスクは空配列を返す', () => {
      // タスクを作成（ブロック関係は作成しない）
      const task = taskService.createTask({ title: 'Task' });

      // ブロックしているタスクIDを取得
      const blockedIds = taskBlockService.getBlockedTaskIds(task.id);

      // 空配列が返ることを検証
      expect(blockedIds).toHaveLength(0);
    });

    it('存在しないタスクIDでは空配列を返す', () => {
      // 存在しないタスクIDでブロックしているタスクIDを取得
      const blockedIds = taskBlockService.getBlockedTaskIds(99999);

      // 空配列が返ることを検証
      expect(blockedIds).toHaveLength(0);
    });
  });

  describe('getBlockerTaskIds', () => {
    it('ブロックされているタスクのブロッカーIDを取得できる', () => {
      // 3つのタスクを作成
      const task1 = taskService.createTask({ title: 'Task 1' });
      const task2 = taskService.createTask({ title: 'Task 2' });
      const task3 = taskService.createTask({ title: 'Task 3' });

      // task1とtask2がtask3をブロック
      taskBlockService.addBlock({
        blocker_task_id: task1.id,
        blocked_task_id: task3.id,
      });

      taskBlockService.addBlock({
        blocker_task_id: task2.id,
        blocked_task_id: task3.id,
      });

      // task3をブロックしているタスクIDを取得
      const blockerIds = taskBlockService.getBlockerTaskIds(task3.id);

      // 2件のブロッカーIDが取得されることを検証
      expect(blockerIds).toHaveLength(2);
      expect(blockerIds).toContain(task1.id);
      expect(blockerIds).toContain(task2.id);
    });

    it('ブロックされていないタスクは空配列を返す', () => {
      // タスクを作成（ブロック関係は作成しない）
      const task = taskService.createTask({ title: 'Task' });

      // ブロッカータスクIDを取得
      const blockerIds = taskBlockService.getBlockerTaskIds(task.id);

      // 空配列が返ることを検証
      expect(blockerIds).toHaveLength(0);
    });

    it('存在しないタスクIDでは空配列を返す', () => {
      // 存在しないタスクIDでブロッカータスクIDを取得
      const blockerIds = taskBlockService.getBlockerTaskIds(99999);

      // 空配列が返ることを検証
      expect(blockerIds).toHaveLength(0);
    });
  });

  describe('CASCADE DELETE', () => {
    it('タスク削除時にブロック関係も削除される - ブロッカー側の削除', () => {
      // 2つのタスクを作成
      const task1 = taskService.createTask({ title: 'Task 1' });
      const task2 = taskService.createTask({ title: 'Task 2' });

      // task1がtask2をブロック
      taskBlockService.addBlock({
        blocker_task_id: task1.id,
        blocked_task_id: task2.id,
      });

      // ブロック関係が作成されたことを確認
      const blockersBefore = taskBlockService.getBlockerTaskIds(task2.id);
      expect(blockersBefore).toHaveLength(1);
      expect(blockersBefore[0]).toBe(task1.id);

      // ブロッカータスク（task1）を削除
      taskService.deleteTask(task1.id);

      // ブロック関係が自動的に削除されたことを検証
      const blockersAfter = taskBlockService.getBlockerTaskIds(task2.id);
      expect(blockersAfter).toHaveLength(0);

      // task2は削除されていないことを確認
      const task2After = taskService.getTask(task2.id);
      expect(task2After).not.toBeNull();
      expect(task2After!.id).toBe(task2.id);
    });

    it('タスク削除時にブロック関係も削除される - ブロックされる側の削除', () => {
      // 2つのタスクを作成
      const task1 = taskService.createTask({ title: 'Task 1' });
      const task2 = taskService.createTask({ title: 'Task 2' });

      // task1がtask2をブロック
      taskBlockService.addBlock({
        blocker_task_id: task1.id,
        blocked_task_id: task2.id,
      });

      // ブロック関係が作成されたことを確認
      const blockedBefore = taskBlockService.getBlockedTaskIds(task1.id);
      expect(blockedBefore).toHaveLength(1);
      expect(blockedBefore[0]).toBe(task2.id);

      // ブロックされるタスク（task2）を削除
      taskService.deleteTask(task2.id);

      // ブロック関係が自動的に削除されたことを検証
      const blockedAfter = taskBlockService.getBlockedTaskIds(task1.id);
      expect(blockedAfter).toHaveLength(0);

      // task1は削除されていないことを確認
      const task1After = taskService.getTask(task1.id);
      expect(task1After).not.toBeNull();
      expect(task1After!.id).toBe(task1.id);
    });

    it('タスク削除時に複数のブロック関係が削除される', () => {
      // 4つのタスクを作成
      const task1 = taskService.createTask({ title: 'Task 1' });
      const task2 = taskService.createTask({ title: 'Task 2' });
      const task3 = taskService.createTask({ title: 'Task 3' });
      const task4 = taskService.createTask({ title: 'Task 4' });

      // task1がtask2とtask3をブロック
      // task4がtask1をブロック
      taskBlockService.addBlock({
        blocker_task_id: task1.id,
        blocked_task_id: task2.id,
      });

      taskBlockService.addBlock({
        blocker_task_id: task1.id,
        blocked_task_id: task3.id,
      });

      taskBlockService.addBlock({
        blocker_task_id: task4.id,
        blocked_task_id: task1.id,
      });

      // task1を削除
      taskService.deleteTask(task1.id);

      // task1に関連するすべてのブロック関係が削除されたことを検証
      const blockers2 = taskBlockService.getBlockerTaskIds(task2.id);
      expect(blockers2).toHaveLength(0);

      const blockers3 = taskBlockService.getBlockerTaskIds(task3.id);
      expect(blockers3).toHaveLength(0);

      const blocked4 = taskBlockService.getBlockedTaskIds(task4.id);
      expect(blocked4).toHaveLength(0);

      // 他のタスクは削除されていないことを確認
      expect(taskService.getTask(task2.id)).not.toBeNull();
      expect(taskService.getTask(task3.id)).not.toBeNull();
      expect(taskService.getTask(task4.id)).not.toBeNull();
    });
  });

  describe('統合シナリオテスト', () => {
    it('複雑な依存関係の作成・削除・検証シナリオ', () => {
      // 5つのタスクを作成
      const task1 = taskService.createTask({ title: 'Task 1' });
      const task2 = taskService.createTask({ title: 'Task 2' });
      const task3 = taskService.createTask({ title: 'Task 3' });
      const task4 = taskService.createTask({ title: 'Task 4' });
      const task5 = taskService.createTask({ title: 'Task 5' });

      // 複雑な依存関係を作成
      // task1 -> task2, task3
      // task2 -> task4
      // task3 -> task5
      taskBlockService.addBlock({
        blocker_task_id: task1.id,
        blocked_task_id: task2.id,
      });

      taskBlockService.addBlock({
        blocker_task_id: task1.id,
        blocked_task_id: task3.id,
      });

      taskBlockService.addBlock({
        blocker_task_id: task2.id,
        blocked_task_id: task4.id,
      });

      taskBlockService.addBlock({
        blocker_task_id: task3.id,
        blocked_task_id: task5.id,
      });

      // 依存関係の検証
      const blocked1 = taskBlockService.getBlockedTaskIds(task1.id);
      expect(blocked1).toHaveLength(2);
      expect(blocked1).toContain(task2.id);
      expect(blocked1).toContain(task3.id);

      const blocked2 = taskBlockService.getBlockedTaskIds(task2.id);
      expect(blocked2).toHaveLength(1);
      expect(blocked2[0]).toBe(task4.id);

      const blockers4 = taskBlockService.getBlockerTaskIds(task4.id);
      expect(blockers4).toHaveLength(1);
      expect(blockers4[0]).toBe(task2.id);

      // ブロック関係を一部削除
      taskBlockService.removeBlock(task1.id, task2.id);

      // 削除後の検証
      const blocked1After = taskBlockService.getBlockedTaskIds(task1.id);
      expect(blocked1After).toHaveLength(1);
      expect(blocked1After[0]).toBe(task3.id);

      const blockers2After = taskBlockService.getBlockerTaskIds(task2.id);
      expect(blockers2After).toHaveLength(0);

      // task2はまだtask4をブロックしていることを確認
      const blocked2After = taskBlockService.getBlockedTaskIds(task2.id);
      expect(blocked2After).toHaveLength(1);
      expect(blocked2After[0]).toBe(task4.id);
    });

    it('ブロック関係削除後に循環参照が可能になるケース', () => {
      // 3つのタスクを作成
      const task1 = taskService.createTask({ title: 'Task 1' });
      const task2 = taskService.createTask({ title: 'Task 2' });
      const task3 = taskService.createTask({ title: 'Task 3' });

      // task1 -> task2 -> task3 のブロック関係を作成
      taskBlockService.addBlock({
        blocker_task_id: task1.id,
        blocked_task_id: task2.id,
      });

      taskBlockService.addBlock({
        blocker_task_id: task2.id,
        blocked_task_id: task3.id,
      });

      // この状態でtask3がtask1をブロックしようとすると循環参照エラー
      expect(() => {
        taskBlockService.addBlock({
          blocker_task_id: task3.id,
          blocked_task_id: task1.id,
        });
      }).toThrow(/cycle|circular/i);

      // task2 -> task3 のブロック関係を削除
      taskBlockService.removeBlock(task2.id, task3.id);

      // 削除後はtask3がtask1をブロックできるようになる（循環が切れたため）
      const block = taskBlockService.addBlock({
        blocker_task_id: task3.id,
        blocked_task_id: task1.id,
      });

      expect(block.blocker_task_id).toBe(task3.id);
      expect(block.blocked_task_id).toBe(task1.id);
    });
  });

  describe('依存注入（Dependency Injection）', () => {
    it('外部から注入したTaskServiceインスタンスを使用できる', () => {
      // 外部で作成したTaskServiceインスタンスを注入
      const sharedTaskService = new TaskService();
      const taskBlockServiceWithDI = new TaskBlockService(undefined, sharedTaskService);

      // 注入されたサービス経由でタスクを作成
      const task1 = sharedTaskService.createTask({ title: 'DI Blocker Task' });
      const task2 = sharedTaskService.createTask({ title: 'DI Blocked Task' });

      // 注入されたTaskServiceを使用してブロック関係を追加
      const block = taskBlockServiceWithDI.addBlock({
        blocker_task_id: task1.id,
        blocked_task_id: task2.id,
      });

      expect(block).toBeDefined();
      expect(block.blocker_task_id).toBe(task1.id);
      expect(block.blocked_task_id).toBe(task2.id);
    });
  });
});
