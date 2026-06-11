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

// Returns true if a tool_result for toolUseId exists in any entry after afterIndex.
function isToolResultPresent(entries, toolUseId, afterIndex) {
  if (!toolUseId) return false;
  for (let i = afterIndex + 1; i < entries.length; i++) {
    const content = entries[i]?.message?.content;
    if (!Array.isArray(content)) continue;
    if (content.some((item) => item?.type === 'tool_result' && item?.tool_use_id === toolUseId)) {
      return true;
    }
  }
  return false;
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
  const lastTool = findLastToolUse(entries);
  if (lastTool?.name === 'AskUserQuestion') return;
  // When Claude ends a turn with a backgrounded Bash still running,
  // do not signal "complete" to the server: that would kill the PTY
  // session and abort the still-running background job.
  if (
    lastTool?.name === 'Bash' &&
    lastTool.input &&
    typeof lastTool.input === 'object' &&
    lastTool.input.run_in_background === true &&
    !isToolResultPresent(entries, lastTool.id, lastTool.entryIndex)
  ) {
    return;
  }
  // When Claude ends a turn with a backgrounded Task (sub-agent) still running,
  // do not signal "complete": that would kill the PTY session and abort the agent.
  if (
    lastTool?.name === 'Task' &&
    lastTool.input &&
    typeof lastTool.input === 'object' &&
    lastTool.input.run_in_background === true &&
    !isToolResultPresent(entries, lastTool.id, lastTool.entryIndex)
  ) {
    return;
  }
  // Monitor is always waiting for streamed events from a background process.
  // Signalling "complete" while Monitor is active would abort the wait.
  if (lastTool?.name === 'Monitor') {
    return;
  }

  const taskId = Number(taskIdRaw);
  if (!Number.isFinite(taskId)) return;

  // Check whether this is the main session or a sub-agent session.
  // Only the main session should notify the board; sub-agent sessions must be ignored.
  const sessionFile = `/tmp/board-main-session-${taskIdRaw}`;
  try {
    const mainSessionId = (await fs.readFile(sessionFile, 'utf-8')).trim();
    if (mainSessionId && mainSessionId !== payload?.session_id) {
      // This is a sub-agent stop — do not notify the board.
      return;
    }
    // This is the main session — clean up the file before notifying.
    await fs.unlink(sessionFile).catch(() => {});
  } catch {
    // file may not exist (e.g. hook-session-start was not used); proceed with API call.
  }

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

await main();
process.exit(0);
