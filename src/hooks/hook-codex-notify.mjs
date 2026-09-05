#!/usr/bin/env node
// Codex `notify` hook: Codex runs `node <this file> '<json>'` after every agent turn.
// The payload arrives as a single argv entry (not on stdin) and the only event type Codex
// emits is `agent-turn-complete`. This is the Codex counterpart of hook-stop.mjs — Codex has
// no Stop hook, so without it a Board-launched Codex session never terminates on its own.

// Same contract as hook-stop.mjs: reached = current status matches target, or has advanced
// to a terminal status (review/done/closed). On fetch failure or non-200, returns false.
async function isTargetStatusReached(apiUrl, token, taskId, targetStatus) {
  try {
    const res = await fetch(`${apiUrl}/api/internal/tasks/${taskId}/status`, {
      method: 'GET',
      headers: { 'x-hook-token': token },
    });
    if (!res.ok) return false;
    const data = await res.json();
    const status = data && data.status;
    return status === targetStatus || status === 'review' || status === 'done' || status === 'closed';
  } catch (err) {
    process.stderr.write(`hook-codex-notify: status check failed: ${(err && err.message) || err}\n`);
    return false;
  }
}

async function notifyComplete(apiUrl, token, taskId) {
  try {
    const res = await fetch(`${apiUrl}/api/internal/hooks/stop`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hook-token': token,
      },
      body: JSON.stringify({ taskId, reason: 'complete' }),
    });
    if (!res.ok) {
      process.stderr.write(`hook-codex-notify: API responded ${res.status}\n`);
    } else {
      const data = await res.json().catch(() => null);
      if (data && data.ok === false) {
        process.stderr.write(`hook-codex-notify: server skipped stop (reason=${data.reason ?? 'unknown'})\n`);
      }
    }
  } catch (err) {
    process.stderr.write(`hook-codex-notify: ${(err && err.message) || err}\n`);
  }
}

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
    const reached = await isTargetStatusReached(apiUrl, token, taskId, targetStatus);
    if (reached) await notifyComplete(apiUrl, token, taskId);
    return;
  }

  await notifyComplete(apiUrl, token, taskId);
}

await main();
process.exit(0);
