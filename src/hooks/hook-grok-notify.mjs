#!/usr/bin/env node
// grok Stop hook: grok runs this command synchronously when a turn completes, feeding the Stop
// event's JSON payload on stdin. Registration lives in ~/.grok/hooks/agkan-board-stop.json (see
// grokHookSettings.ts) rather than a per-task file, so this command is shared by every grok
// invocation on the machine — the BOARD_* env var guard below is what keeps it a no-op for a
// manually-run grok session outside the board.
//
// grok also fires Stop at session teardown (reason: "channel_closed" / "shutdown"). To avoid
// premature completion, this hook only reports completion when reason === "end_turn".
// The response must never ask grok to block or continue. The hook exits cleanly with exit code 0
// and empty / {} output.

import { isTargetStatusReached, postStopComplete } from './board-stop-client.mjs';

const LOG_PREFIX = 'hook-grok-notify';

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf-8');
}

async function main() {
  const rawInput = await readStdin().catch(() => '');
  let reason = null;
  if (rawInput) {
    try {
      const parsed = JSON.parse(rawInput);
      if (parsed && typeof parsed === 'object') {
        reason = parsed.reason;
      }
    } catch {
      // Non-JSON stdin payload or malformed input — do not complete
      return;
    }
  }

  // Only end_turn signals turn completion (ignore channel_closed, shutdown, etc.)
  if (reason !== 'end_turn') return;

  const taskIdRaw = process.env.BOARD_TASK_ID;
  const apiUrl = process.env.BOARD_API_URL;
  const token = process.env.BOARD_HOOK_TOKEN;
  if (!taskIdRaw || !apiUrl || !token) return;

  const taskId = Number(taskIdRaw);
  if (!Number.isFinite(taskId)) return;

  // Same target-status contract as hook-stop.mjs / hook-agy-notify.mjs: when a target
  // status is configured (pr/run/direct), it is the only termination signal, since a Stop
  // event can fire mid-flight. The safe failure mode is to leave the session running.
  const targetStatus = process.env.BOARD_TARGET_STATUS;
  if (targetStatus) {
    const reached = await isTargetStatusReached(apiUrl, token, taskId, targetStatus, LOG_PREFIX);
    if (reached) await postStopComplete(apiUrl, token, taskId, LOG_PREFIX);
    return;
  }

  // No target status (planning session): complete unconditionally.
  await postStopComplete(apiUrl, token, taskId, LOG_PREFIX);
}

await main();
// No explicit process.exit() here: stdout to a pipe is written asynchronously on some
// platforms, and exiting immediately after write() can truncate it before it flushes.
process.stdout.write('{}');
