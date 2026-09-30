#!/usr/bin/env node
// Codex `notify` hook: Codex runs `node <this file> '<json>'` after every agent turn.
// The payload arrives as a single argv entry (not on stdin). Board uses the
// `agent-turn-complete` notification to terminate completed Codex sessions,
// serving the same role as hook-stop.mjs does for Claude.

import { isTargetStatusReached, postStopComplete } from './board-stop-client.mjs';

const LOG_PREFIX = 'hook-codex-notify';

async function main() {
  const taskIdRaw = process.env.BOARD_TASK_ID;
  const apiUrl = process.env.BOARD_API_URL;
  const token = process.env.BOARD_HOOK_TOKEN;
  if (!taskIdRaw || !apiUrl || !token) return;

  let payload;
  try {
    payload = JSON.parse(process.argv[2]);
  } catch {
    return;
  }
  if (payload?.type !== 'agent-turn-complete') return;

  const taskId = Number(taskIdRaw);
  if (!Number.isFinite(taskId)) return;

  // When a target status is configured (pr/run/direct), status-reached is the only
  // termination signal, exactly as in hook-stop.mjs: a turn can end while the task is still
  // mid-flight (e.g. Codex asked a question), and killing the PTY then would destroy unsaved
  // progress. The safe failure mode is to leave the session running — it stays visible on
  // the board and can be stopped manually.
  const targetStatus = process.env.BOARD_TARGET_STATUS;
  if (targetStatus) {
    const reached = await isTargetStatusReached(apiUrl, token, taskId, targetStatus, LOG_PREFIX);
    if (reached) await postStopComplete(apiUrl, token, taskId, LOG_PREFIX);
    return;
  }

  // Planning is complete when the task is ready (or terminal). A notification alone
  // is not evidence of completion: it can arrive while planning is still in flight.
  // Deferred planning can legitimately leave the task in backlog. The launch prompt
  // also specifies an exact 'exit' completion message, which handles that outcome.
  const lastMessage = payload['last-assistant-message'];
  const explicitExit = typeof lastMessage === 'string' && lastMessage.trim() === 'exit';
  const reached = explicitExit || (await isTargetStatusReached(apiUrl, token, taskId, 'ready', LOG_PREFIX));
  process.stderr.write(
    `${LOG_PREFIX}: taskId=${taskId} turnId=${JSON.stringify(payload['turn-id'] ?? null)} planningComplete=${reached} explicitExit=${explicitExit}\n`
  );
  if (reached) await postStopComplete(apiUrl, token, taskId, LOG_PREFIX);
}

await main();
process.exit(0);
