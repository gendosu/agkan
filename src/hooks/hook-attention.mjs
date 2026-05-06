#!/usr/bin/env node

const argSubcmd = process.argv[2];
const taskIdRaw = process.env.BOARD_TASK_ID;
const apiUrl = process.env.BOARD_API_URL;
const token = process.env.BOARD_HOOK_TOKEN;

if (!taskIdRaw || !apiUrl || !token) {
  process.exit(0);
}

const state = argSubcmd === 'post' ? 'answered' : 'needs';
const taskId = Number(taskIdRaw);

if (!Number.isFinite(taskId)) {
  process.exit(0);
}

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
