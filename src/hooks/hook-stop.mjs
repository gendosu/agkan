#!/usr/bin/env node
import { promises as fs } from 'fs';

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf-8');
}

function parseTranscript(jsonl) {
  return jsonl
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

// Returns the last tool_use from the last assistant turn only.
// Scanning the full transcript would find tool_uses from previous turns (e.g., an
// AskUserQuestion that was already answered, or a background job that already finished),
// causing guards to fire incorrectly and leaving the terminal alive after completion.
function findLastToolUse(entries) {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry?.type !== 'assistant') continue;
    const content = entry?.message?.content;
    if (!Array.isArray(content)) continue;
    for (let j = content.length - 1; j >= 0; j--) {
      const item = content[j];
      if (item && item.type === 'tool_use' && typeof item.name === 'string') {
        return { name: item.name, input: item.input ?? {}, id: item.id ?? null, entryIndex: i };
      }
    }
    // Last assistant turn has no tool_use — safe to terminate.
    return null;
  }
  return null;
}

// Collects every tool_use across the ENTIRE transcript (not just the last turn) whose
// name is Bash or Task and whose input has run_in_background === true.
// A background job may have been started several turns ago and still be running while
// the current turn ends on an unrelated tool (e.g. ScheduleWakeup) — the last-tool-only
// view used by findLastToolUse cannot see it, so a full scan is required here.
function findBackgroundJobToolUses(entries) {
  const jobs = [];
  for (const entry of entries) {
    if (entry?.type !== 'assistant') continue;
    const content = entry?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const item of content) {
      if (
        item?.type === 'tool_use' &&
        (item.name === 'Bash' || item.name === 'Task') &&
        item.input &&
        typeof item.input === 'object' &&
        item.input.run_in_background === true
      ) {
        // A missing id means we cannot verify completion at all — treat conservatively
        // as unfinished rather than silently skipping the guard.
        jobs.push(item.id ?? null);
      }
    }
  }
  return jobs;
}

// The real completion signal for a background Bash/Task is a `<task-notification>` block
// (delivered via a queue-operation transcript entry's `content` string) whose
// `<tool-use-id>` matches the original tool_use id. The immediate "running in background"
// ack is a normal tool_result and must NOT be mistaken for completion.
function isBackgroundJobComplete(entries, toolUseId) {
  const marker = `<tool-use-id>${toolUseId}</tool-use-id>`;
  for (const entry of entries) {
    if (typeof entry?.content === 'string' && entry.content.includes(marker)) {
      return true;
    }
  }
  return false;
}

// Fetches the current task status from the board and checks whether it has reached the
// run's target status. Reached = current status matches target, or has advanced to a
// terminal status (done/closed). On fetch failure or non-200, returns false so the caller
// falls through to the normal guard checks instead of overriding them.
async function isTargetStatusReached(apiUrl, token, taskId, targetStatus) {
  try {
    const res = await fetch(`${apiUrl}/api/internal/tasks/${taskId}/status`, {
      method: 'GET',
      headers: { 'x-hook-token': token },
    });
    if (!res.ok) return false;
    const data = await res.json();
    const status = data && data.status;
    return status === targetStatus || status === 'done' || status === 'closed';
  } catch (err) {
    process.stderr.write(`hook-stop: status check failed: ${(err && err.message) || err}\n`);
    return false;
  }
}

// Notifies the board of completion. Unlinks the main session's session file first, then
// POSTs the completion — the file is only removed once completion is actually reported.
async function notifyComplete(apiUrl, token, taskId, sessionFile) {
  await fs.unlink(sessionFile).catch(() => {});
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
      process.stderr.write(`hook-stop: API responded ${res.status}\n`);
    }
  } catch (err) {
    process.stderr.write(`hook-stop: ${(err && err.message) || err}\n`);
  }
}

async function main() {
  const taskIdRaw = process.env.BOARD_TASK_ID;
  const apiUrl = process.env.BOARD_API_URL;
  const token = process.env.BOARD_HOOK_TOKEN;
  if (!taskIdRaw || !apiUrl || !token) return;

  let payload;
  try {
    const stdin = await readStdin();
    payload = JSON.parse(stdin);
  } catch {
    return;
  }

  // Avoid recursion: when the stop hook itself was the cause of the stop event,
  // Claude sets stop_hook_active=true. We must not act again in that case.
  if (payload?.stop_hook_active === true) return;

  const transcriptPath = payload?.transcript_path;
  if (typeof transcriptPath !== 'string') return;

  let jsonl;
  try {
    jsonl = await fs.readFile(transcriptPath, 'utf-8');
  } catch (err) {
    process.stderr.write(`hook-stop: read transcript failed: ${err.message}\n`);
    return;
  }

  const entries = parseTranscript(jsonl);

  const taskId = Number(taskIdRaw);
  if (!Number.isFinite(taskId)) return;

  // Determine whether this is the main session or a sub-agent session (a sub-agent's
  // Stop must not notify the board). Do not unlink the session file here yet — if an
  // interactive guard below causes an early return, we would lose the marker needed to
  // tell the main session apart from a sub-agent. It is only unlinked inside
  // notifyComplete, right before the completion POST is actually sent.
  const sessionFile = `/tmp/board-main-session-${taskIdRaw}`;
  try {
    const mainSessionId = (await fs.readFile(sessionFile, 'utf-8')).trim();
    if (mainSessionId && mainSessionId !== payload?.session_id) {
      return; // Sub-agent's Stop
    }
  } catch {
    // No file means hook-session-start was not used; proceed as the main session.
  }

  const lastTool = findLastToolUse(entries);
  if (lastTool?.name === 'AskUserQuestion') return;
  // Monitor is always waiting for streamed events from a background process.
  // Signalling "complete" while Monitor is active would abort the wait.
  if (lastTool?.name === 'Monitor') return;

  // If a background Bash/Task (e.g. an orchestrated sub-agent) was started in an earlier
  // turn and hasn't completed yet, keep the session alive instead of sending complete.
  // This guard takes priority over the status-based check below: a sub-agent advancing
  // the task's status (even to a terminal one) is not a reliable completion signal while
  // other background work is still in flight — sending complete here would tear down the
  // PTY process tree and kill the still-running sub-agent along with it (see #666).
  const backgroundJobIds = findBackgroundJobToolUses(entries);
  const hasUnfinishedBackgroundJob = backgroundJobIds.some((id) => !isBackgroundJobComplete(entries, id));
  if (hasUnfinishedBackgroundJob) return;

  // Status-based termination check: if the target status has been reached, send complete.
  // This is what lets a ScheduleWakeup self-wakeup loop (#665) terminate even though there
  // is no further tool_use to react to — safe here because the guard above has already
  // confirmed there is no unfinished background job left to protect.
  const targetStatus = process.env.BOARD_TARGET_STATUS;
  if (targetStatus) {
    const reached = await isTargetStatusReached(apiUrl, token, taskId, targetStatus);
    if (reached) {
      await notifyComplete(apiUrl, token, taskId, sessionFile);
      return;
    }
  }

  await notifyComplete(apiUrl, token, taskId, sessionFile);
}

await main();
process.exit(0);
