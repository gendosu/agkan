import type { TaskStatus } from '../models';

/**
 * Board run の command から run 完了の目標status を返す。
 * - pr        → 'review'
 * - run/direct → 'done'
 * - planning  → null（目標statusを持たない = status基準の終了判定対象外）
 */
export function runTargetStatus(command: string): TaskStatus | null {
  if (command === 'planning') return null;
  if (command === 'pr') return 'review';
  return 'done';
}
