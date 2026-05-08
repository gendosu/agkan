#!/usr/bin/env node

// Records the main session_id so hook-attention.mjs can ignore subagent events.
const taskIdRaw = process.env.BOARD_TASK_ID;

if (!taskIdRaw) {
  process.exit(0);
}

try {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const payload = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
  const sessionId = payload?.session_id;
  if (sessionId) {
    const { writeFileSync } = await import('fs');
    writeFileSync(`/tmp/board-main-session-${taskIdRaw}`, sessionId, 'utf-8');
  }
} catch {
  // best-effort; don't block startup
}

process.exit(0);
