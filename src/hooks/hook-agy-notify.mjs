#!/usr/bin/env node
// agy Stop hook: agy runs this command synchronously when its execution loop is about to
// terminate, feeding the Stop event's JSON payload on stdin, and requires a JSON object on
// stdout within its default 30s timeout (unlike Codex's notify, which passes its payload as
// an argv entry and expects no response). Registration lives in the single, global
// ~/.gemini/config/hooks.json (see agyHookSettings.ts) rather than a per-task file, so this
// command is shared by every agy invocation on the machine — the BOARD_* env var guard below
// is what keeps it a no-op for a manually-run agy session outside the board.
//
// The response must never ask agy to continue: `{ decision: "continue" }` would force the
// loop to keep going, which this hook has no reason to do — it only reports completion.

import { isTargetStatusReached, postStopComplete } from './board-stop-client.mjs';

const LOG_PREFIX = 'hook-agy-notify';

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf-8');
}

async function main() {
  await readStdin().catch(() => {});

  const taskIdRaw = process.env.BOARD_TASK_ID;
  const apiUrl = process.env.BOARD_API_URL;
  const token = process.env.BOARD_HOOK_TOKEN;
  if (!taskIdRaw || !apiUrl || !token) return;

  const taskId = Number(taskIdRaw);
  if (!Number.isFinite(taskId)) return;

  // Same target-status contract as hook-stop.mjs / hook-codex-notify.mjs: when a target
  // status is configured (pr/run/direct), it is the only termination signal, since a Stop
  // event can fire mid-flight (e.g. agy asked a question and is waiting). The safe failure
  // mode is to leave the session running.
  const targetStatus = process.env.BOARD_TARGET_STATUS;
  if (targetStatus) {
    const reached = await isTargetStatusReached(apiUrl, token, taskId, targetStatus, LOG_PREFIX);
    if (reached) await postStopComplete(apiUrl, token, taskId, LOG_PREFIX);
    return;
  }

  // No target status (planning session): complete unconditionally, as the other hooks do.
  await postStopComplete(apiUrl, token, taskId, LOG_PREFIX);
}

await main();
// No explicit process.exit() here: stdout to a pipe is written asynchronously on some
// platforms, and exiting immediately after write() can truncate it before it flushes. With
// nothing else keeping the event loop alive, Node exits on its own (code 0) once the write
// completes.
process.stdout.write('{}');
