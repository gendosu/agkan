import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn } from 'child_process';
import { createServer } from 'http';
import type { Server } from 'http';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const SCRIPT = resolve(__dirname, '../../src/hooks/hook-stop.mjs');

type Capture = { url: string | undefined; body: unknown };

function makeServer(): Promise<{ server: Server; port: number; captured: Capture[] }> {
  return new Promise((resolveFn) => {
    const captured: Capture[] = [];
    const server = createServer((req, res) => {
      let data = '';
      req.on('data', (c) => (data += c));
      req.on('end', () => {
        captured.push({ url: req.url, body: data ? JSON.parse(data) : null });
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true }));
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        resolveFn({ server, port: addr.port, captured });
      }
    });
  });
}

function runHook(stdinJson: unknown, env: Record<string, string>): Promise<number> {
  return new Promise((resolveFn) => {
    const proc = spawn('node', [SCRIPT], { env: { ...process.env, ...env } });
    proc.stdin.write(JSON.stringify(stdinJson));
    proc.stdin.end();
    proc.on('exit', (code) => resolveFn(code ?? 0));
  });
}

describe('hook-stop.mjs', () => {
  let svr: Awaited<ReturnType<typeof makeServer>>;
  let tmp: string;

  beforeAll(async () => {
    svr = await makeServer();
  });

  afterAll(() => {
    svr.server.close();
  });

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'hook-stop-'));
  });

  it('posts complete when last tool_use is not AskUserQuestion', async () => {
    const transcript = join(tmp, 't.jsonl');
    writeFileSync(
      transcript,
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'tool_use', name: 'Read', input: {} }] },
      }) + '\n'
    );
    const code = await runHook(
      { transcript_path: transcript, hook_event_name: 'Stop', stop_hook_active: false },
      {
        BOARD_TASK_ID: '5',
        BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
        BOARD_HOOK_TOKEN: 'tk',
      }
    );
    expect(code).toBe(0);
    const last = svr.captured.at(-1);
    expect(last?.url).toBe('/api/internal/hooks/stop');
    expect(last?.body).toEqual({ taskId: 5, reason: 'complete' });
  });

  it('does NOT post when last tool_use is AskUserQuestion', async () => {
    const before = svr.captured.length;
    const transcript = join(tmp, 't.jsonl');
    writeFileSync(
      transcript,
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'tool_use', name: 'AskUserQuestion', input: {} }] },
      }) + '\n'
    );
    const code = await runHook(
      { transcript_path: transcript, hook_event_name: 'Stop', stop_hook_active: false },
      {
        BOARD_TASK_ID: '5',
        BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
        BOARD_HOOK_TOKEN: 'tk',
      }
    );
    expect(code).toBe(0);
    expect(svr.captured.length).toBe(before);
  });

  it('does NOT post when stop_hook_active is true (avoid recursion)', async () => {
    const before = svr.captured.length;
    const transcript = join(tmp, 't.jsonl');
    writeFileSync(
      transcript,
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'tool_use', name: 'Read', input: {} }] },
      }) + '\n'
    );
    const code = await runHook(
      { transcript_path: transcript, hook_event_name: 'Stop', stop_hook_active: true },
      {
        BOARD_TASK_ID: '5',
        BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
        BOARD_HOOK_TOKEN: 'tk',
      }
    );
    expect(code).toBe(0);
    expect(svr.captured.length).toBe(before);
  });

  it('posts complete when payload has no stop_reason field (real Claude Code Stop hook input)', async () => {
    // The real Claude Code Stop hook input does NOT include `stop_reason`.
    // It includes: session_id, transcript_path, cwd, permission_mode,
    // hook_event_name, stop_hook_active, last_assistant_message.
    const transcript = join(tmp, 't.jsonl');
    writeFileSync(
      transcript,
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }] },
      }) + '\n'
    );
    const code = await runHook(
      {
        session_id: 'abc',
        transcript_path: transcript,
        cwd: '/workspace',
        permission_mode: 'bypassPermissions',
        hook_event_name: 'Stop',
        stop_hook_active: false,
        last_assistant_message: 'done',
      },
      {
        BOARD_TASK_ID: '7',
        BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
        BOARD_HOOK_TOKEN: 'tk',
      }
    );
    expect(code).toBe(0);
    const last = svr.captured.at(-1);
    expect(last?.url).toBe('/api/internal/hooks/stop');
    expect(last?.body).toEqual({ taskId: 7, reason: 'complete' });
  });

  it('does NOT post when last tool_use is Bash with run_in_background: true', async () => {
    const before = svr.captured.length;
    const transcript = join(tmp, 't.jsonl');
    writeFileSync(
      transcript,
      JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'Bash',
              input: { command: 'npm test', run_in_background: true },
            },
          ],
        },
      }) + '\n'
    );
    const code = await runHook(
      { transcript_path: transcript, hook_event_name: 'Stop', stop_hook_active: false },
      {
        BOARD_TASK_ID: '5',
        BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
        BOARD_HOOK_TOKEN: 'tk',
      }
    );
    expect(code).toBe(0);
    expect(svr.captured.length).toBe(before);
  });

  it('posts complete when last tool_use is Bash without run_in_background', async () => {
    const transcript = join(tmp, 't.jsonl');
    writeFileSync(
      transcript,
      JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'Bash',
              input: { command: 'ls', run_in_background: false },
            },
          ],
        },
      }) + '\n'
    );
    const code = await runHook(
      { transcript_path: transcript, hook_event_name: 'Stop', stop_hook_active: false },
      {
        BOARD_TASK_ID: '9',
        BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
        BOARD_HOOK_TOKEN: 'tk',
      }
    );
    expect(code).toBe(0);
    const last = svr.captured.at(-1);
    expect(last?.url).toBe('/api/internal/hooks/stop');
    expect(last?.body).toEqual({ taskId: 9, reason: 'complete' });
  });

  it('does NOT post when last tool_use is Monitor', async () => {
    const before = svr.captured.length;
    const transcript = join(tmp, 't.jsonl');
    writeFileSync(
      transcript,
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'tool_use', name: 'Monitor', input: {} }] },
      }) + '\n'
    );
    const code = await runHook(
      { transcript_path: transcript, hook_event_name: 'Stop', stop_hook_active: false },
      {
        BOARD_TASK_ID: '5',
        BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
        BOARD_HOOK_TOKEN: 'tk',
      }
    );
    expect(code).toBe(0);
    expect(svr.captured.length).toBe(before);
  });

  it('exits 0 silently when transcript_path cannot be read', async () => {
    const code = await runHook(
      { transcript_path: '/nonexistent/path.jsonl', hook_event_name: 'Stop', stop_hook_active: false },
      {
        BOARD_TASK_ID: '5',
        BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
        BOARD_HOOK_TOKEN: 'tk',
      }
    );
    expect(code).toBe(0);
  });
});
