// Shared "which ready task should run next" logic, used by both Board's
// BulkRunService and the CLI's `task run-all` command so the two stay in sync.

import { TaskService } from '../services/TaskService';
import { TaskBlockService } from '../services/TaskBlockService';
import { PRIORITY_ORDER } from '../models';

/**
 * Selects the next ready task to launch: status 'ready', no unresolved blockers
 * (a blocker counts as resolved once it is done/closed/review), ordered by
 * priority then id ascending. `skippedTaskIds` lets a caller exclude ids it has
 * already tried and failed to launch (e.g. a per-task catalog miss) without
 * those tasks re-appearing on the next call.
 */
export function selectNextTask(
  ts: TaskService,
  tbs: TaskBlockService,
  skippedTaskIds: ReadonlySet<number> = new Set()
): number | null {
  const tasks = ts.listTasks({ status: 'ready' }, 'id', 'asc');
  const allBlocks = tbs.getAllBlocks();

  // Build map of blocked_task_id -> blocker_task_ids
  const blockedByMap = new Map<number, number[]>();
  for (const block of allBlocks) {
    if (!blockedByMap.has(block.blocked_task_id)) {
      blockedByMap.set(block.blocked_task_id, []);
    }
    blockedByMap.get(block.blocked_task_id)!.push(block.blocker_task_id);
  }

  const available = tasks.filter((task) => {
    if (skippedTaskIds.has(task.id)) return false;
    const blockerIds = blockedByMap.get(task.id) ?? [];
    return blockerIds.every((bid) => {
      const blocker = ts.getTask(bid);
      return !blocker || blocker.status === 'done' || blocker.status === 'closed' || blocker.status === 'review';
    });
  });

  available.sort((a, b) => {
    const oa = a.priority ? (PRIORITY_ORDER[a.priority] ?? 4) : 4;
    const ob = b.priority ? (PRIORITY_ORDER[b.priority] ?? 4) : 4;
    if (oa !== ob) return oa - ob;
    return a.id - b.id;
  });

  return available.length > 0 ? available[0].id : null;
}
