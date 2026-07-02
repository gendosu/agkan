import { getHookToken } from '../utils/hookToken';
import { runTargetStatus } from '../utils/runTargetStatus';

/**
 * Board hook 用の環境変数を構築する。
 * - boardApiUrl が未設定(null/'')ならフック無効 = 空オブジェクト。
 * - command が目標statusを持つ(pr/run/direct)場合は BOARD_TARGET_STATUS を付与する。
 *   planning は目標statusを持たないため付与しない。
 */
export function buildHookEnv(taskId: number, boardApiUrl: string | null, command: string): Record<string, string> {
  const env: Record<string, string> = {};
  if (boardApiUrl === null || boardApiUrl === '') return env;
  env.BOARD_TASK_ID = String(taskId);
  env.BOARD_API_URL = boardApiUrl;
  env.BOARD_HOOK_TOKEN = getHookToken();
  const targetStatus = runTargetStatus(command);
  if (targetStatus) env.BOARD_TARGET_STATUS = targetStatus;
  return env;
}
