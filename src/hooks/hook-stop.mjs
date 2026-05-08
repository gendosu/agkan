#!/usr/bin/env node
import { promises as fs } from 'fs';

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf-8');
}

function findLastToolUse(jsonl) {
  const lines = jsonl.split('\n').filter((l) => l.trim().length > 0);
  for (let i = lines.length - 1; i >= 0; i--) {
    let entry;
    try {
      entry = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    const content = entry?.message?.content;
    if (!Array.isArray(content)) continue;
    for (let j = content.length - 1; j >= 0; j--) {
      const item = content[j];
      if (item && item.type === 'tool_use' && typeof item.name === 'string') {
        return { name: item.name, input: item.input ?? {} };
      }
    }
  }
  return null;
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

  const lastTool = findLastToolUse(jsonl);
  if (lastTool?.name === 'AskUserQuestion') return;
  // When Claude ends a turn with a backgrounded Bash still running,
  // do not signal "complete" to the server: that would kill the PTY
  // session and abort the still-running background job.
  if (
    lastTool?.name === 'Bash' &&
    lastTool.input &&
    typeof lastTool.input === 'object' &&
    lastTool.input.run_in_background === true
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

  // Clean up the main-session file so stale IDs don't persist across task restarts.
  const sessionFile = `/tmp/board-main-session-${taskIdRaw}`;
  try {
    const mainSessionId = (await fs.readFile(sessionFile, 'utf-8')).trim();
    if (mainSessionId && mainSessionId === payload?.session_id) {
      await fs.unlink(sessionFile).catch(() => {});
    }
  } catch {
    // file may not exist; ignore
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
