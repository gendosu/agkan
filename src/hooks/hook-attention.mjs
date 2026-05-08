#!/usr/bin/env node

const argSubcmd = process.argv[2];
const taskIdRaw = process.env.BOARD_TASK_ID;
const apiUrl = process.env.BOARD_API_URL;
const token = process.env.BOARD_HOOK_TOKEN;

if (!taskIdRaw || !apiUrl || !token) {
  process.exit(0);
}

const taskId = Number(taskIdRaw);

if (!Number.isFinite(taskId)) {
  process.exit(0);
}

// Ignore events from subagents — only the main session should trigger attention.
try {
  const { readFileSync } = await import('fs');
  const mainSessionId = readFileSync(`/tmp/board-main-session-${taskIdRaw}`, 'utf-8').trim();
  if (mainSessionId) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
    const currentSessionId = payload?.session_id;
    // Skip if no session_id or if it doesn't match the main session (subagent).
    if (!currentSessionId || currentSessionId !== mainSessionId) {
      process.exit(0);
    }
  }
} catch {
  // If the session file doesn't exist or stdin can't be parsed, proceed normally.
}

const state = argSubcmd === 'post' ? 'answered' : 'needs';

try {
  const res = await fetch(`${apiUrl}/api/internal/hooks/attention`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hook-token': token,
    },
    body: JSON.stringify({ taskId, state }),
  });
  if (!res.ok) {
    process.stderr.write(`hook-attention: API responded ${res.status}\n`);
  }
} catch (err) {
  process.stderr.write(`hook-attention: ${(err && err.message) || err}\n`);
}

process.exit(0);
