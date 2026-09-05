#!/usr/bin/env node
// Codex `notify` hook: Codex runs `node <this file> '<json>'` after every agent turn.
// The payload arrives as a single argv entry (not on stdin) and the only event type Codex
// emits is `agent-turn-complete`. This is the Codex counterpart of hook-stop.mjs — Codex has
// no Stop hook, so without it a Board-launched Codex session never terminates on its own.

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

  // No target status (planning session): complete unconditionally, as hook-stop.mjs does.
  // Unlike Claude Code there is no AskUserQuestion/transcript to inspect, so a Codex turn
  // that ends by asking the user a question also ends the session here.
  await postStopComplete(apiUrl, token, taskId, LOG_PREFIX);
}

await main();
process.exit(0);
