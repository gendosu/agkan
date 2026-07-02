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

// Board から現在の task status を取得し、run の目標statusへ到達済みかを判定する。
// 到達 = current が target と一致、または done/closed（terminal）に達している。
// 取得に失敗（ネットワーク/非200）した場合は false を返し、通常のガード判定へフォールバックする。
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

// 完了を board へ通知する。メインセッションのセッションファイルを片付けてから POST する。
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

  // メインセッション判定（サブエージェントの Stop は board へ通知しない）。
  // ここではまだ unlink しない（対話ガード等で return する場合に判別情報を失わないため）。
  // unlink は実際に complete を送る notifyComplete 内でのみ行う。
  const sessionFile = `/tmp/board-main-session-${taskIdRaw}`;
  try {
    const mainSessionId = (await fs.readFile(sessionFile, 'utf-8')).trim();
    if (mainSessionId && mainSessionId !== payload?.session_id) {
      return; // サブエージェントの Stop
    }
  } catch {
    // ファイルが無い場合（hook-session-start 未使用など）はメインとして続行
  }

  const lastTool = findLastToolUse(entries);
  if (lastTool?.name === 'AskUserQuestion') return;
  // Monitor は background プロセスのイベント待ち。complete を送ると待機を中断してしまう。
  if (lastTool?.name === 'Monitor') return;

  // status 基準の終了判定: 目標statusに到達していれば、背景ジョブ/ScheduleWakeup ガードを
  // 上書きして complete を送る（エージェント自身が status を前進させた事実を終了信号とする）。
  const targetStatus = process.env.BOARD_TARGET_STATUS;
  if (targetStatus) {
    const reached = await isTargetStatusReached(apiUrl, token, taskId, targetStatus);
    if (reached) {
      await notifyComplete(apiUrl, token, taskId, sessionFile);
      return;
    }
  }

  // 背景 Bash/Task が過去ターンで起動され未完了なら、complete を送らずセッションを維持する。
  const backgroundJobIds = findBackgroundJobToolUses(entries);
  const hasUnfinishedBackgroundJob = backgroundJobIds.some((id) => !isBackgroundJobComplete(entries, id));
  if (hasUnfinishedBackgroundJob) return;

  await notifyComplete(apiUrl, token, taskId, sessionFile);
}

await main();
process.exit(0);
