import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn } from 'child_process';
import { createServer } from 'http';
import type { Server } from 'http';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const SCRIPT = resolve(__dirname, '../../src/hooks/hook-stop.mjs');

type Capture = { url: string | undefined; body: unknown };

function makeServer(): Promise<{
  server: Server;
  port: number;
  captured: Capture[];
  setStatus: (s: string | null) => void;
  setStatusHttpCode: (code: number) => void;
}> {
  return new Promise((resolveFn) => {
    const captured: Capture[] = [];
    let currentStatus: string | null = null;
    let statusHttpCode = 200;
    const server = createServer((req, res) => {
      if (req.method === 'GET' && (req.url ?? '').includes('/status')) {
        res.statusCode = statusHttpCode;
        res.end(JSON.stringify(statusHttpCode === 200 ? { status: currentStatus } : { error: 'err' }));
        return;
      }
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
        resolveFn({
          server,
          port: addr.port,
          captured,
          setStatus: (s) => {
            currentStatus = s;
          },
          setStatusHttpCode: (code) => {
            statusHttpCode = code;
          },
        });
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
    svr.setStatus(null);
    svr.setStatusHttpCode(200);
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

  it('does NOT post when last tool_use is Task with run_in_background: true', async () => {
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
              name: 'Task',
              input: { description: 'run agent', prompt: 'do something', run_in_background: true },
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

  it('posts complete when last tool_use is Task without run_in_background', async () => {
    const transcript = join(tmp, 't.jsonl');
    writeFileSync(
      transcript,
      JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'Task',
              input: { description: 'run agent', prompt: 'do something' },
            },
          ],
        },
      }) + '\n'
    );
    const code = await runHook(
      { transcript_path: transcript, hook_event_name: 'Stop', stop_hook_active: false },
      {
        BOARD_TASK_ID: '11',
        BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
        BOARD_HOOK_TOKEN: 'tk',
      }
    );
    expect(code).toBe(0);
    const last = svr.captured.at(-1);
    expect(last?.url).toBe('/api/internal/hooks/stop');
    expect(last?.body).toEqual({ taskId: 11, reason: 'complete' });
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

  it('posts complete when AskUserQuestion was answered and last turn has no tool_use', async () => {
    const transcript = join(tmp, 't.jsonl');
    writeFileSync(
      transcript,
      [
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [{ type: 'tool_use', id: 'ask-1', name: 'AskUserQuestion', input: { question: 'Proceed?' } }],
          },
        }),
        JSON.stringify({
          type: 'user',
          message: { content: [{ type: 'tool_result', tool_use_id: 'ask-1', content: 'yes' }] },
        }),
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Got it. Task complete.' }] },
        }),
      ].join('\n') + '\n'
    );
    const code = await runHook(
      { transcript_path: transcript, hook_event_name: 'Stop', stop_hook_active: false },
      {
        BOARD_TASK_ID: '20',
        BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
        BOARD_HOOK_TOKEN: 'tk',
      }
    );
    expect(code).toBe(0);
    const last = svr.captured.at(-1);
    expect(last?.url).toBe('/api/internal/hooks/stop');
    expect(last?.body).toEqual({ taskId: 20, reason: 'complete' });
  });

  it('posts complete when background Bash finished and last turn has no tool_use', async () => {
    const transcript = join(tmp, 't.jsonl');
    writeFileSync(
      transcript,
      [
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              { type: 'tool_use', id: 'bash-1', name: 'Bash', input: { command: 'npm test', run_in_background: true } },
            ],
          },
        }),
        JSON.stringify({
          type: 'user',
          message: {
            content: [
              { type: 'tool_result', tool_use_id: 'bash-1', content: 'Command running in background with ID: bk-1' },
            ],
          },
        }),
        JSON.stringify({
          type: 'queue-operation',
          operation: 'enqueue',
          timestamp: '2026-07-02T00:00:00Z',
          sessionId: 'sess-bash-1',
          content:
            '<task-notification>\n<task-id>bk-1</task-id>\n<tool-use-id>bash-1</tool-use-id>\n<output-file>/tmp/bk-1.output</output-file>\n<status>completed</status>\n<summary>Tests passed.</summary>\n</task-notification>',
        }),
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'All tests passed.' }] },
        }),
      ].join('\n') + '\n'
    );
    const code = await runHook(
      { transcript_path: transcript, hook_event_name: 'Stop', stop_hook_active: false },
      {
        BOARD_TASK_ID: '21',
        BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
        BOARD_HOOK_TOKEN: 'tk',
      }
    );
    expect(code).toBe(0);
    const last = svr.captured.at(-1);
    expect(last?.url).toBe('/api/internal/hooks/stop');
    expect(last?.body).toEqual({ taskId: 21, reason: 'complete' });
  });

  it('does NOT post when background Bash only has the immediate ack tool_result (no task-notification) and last turn has no tool_use', async () => {
    // Regression guard for defect B: the immediate background-start ack is itself a
    // tool_result, but it must NOT be mistaken for the real completion signal.
    const before = svr.captured.length;
    const transcript = join(tmp, 't.jsonl');
    writeFileSync(
      transcript,
      [
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'bash-1b',
                name: 'Bash',
                input: { command: 'npm test', run_in_background: true },
              },
            ],
          },
        }),
        JSON.stringify({
          type: 'user',
          message: {
            content: [
              { type: 'tool_result', tool_use_id: 'bash-1b', content: 'Command running in background with ID: bk-1b' },
            ],
          },
        }),
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Waiting for tests to finish.' }] },
        }),
      ].join('\n') + '\n'
    );
    const code = await runHook(
      { transcript_path: transcript, hook_event_name: 'Stop', stop_hook_active: false },
      {
        BOARD_TASK_ID: '21',
        BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
        BOARD_HOOK_TOKEN: 'tk',
      }
    );
    expect(code).toBe(0);
    expect(svr.captured.length).toBe(before);
  });

  it('does NOT post when an earlier-turn background Bash has no completion notification, even if the last tool_use is a different tool (regression: full-transcript scan, not last-tool-only)', async () => {
    const before = svr.captured.length;
    const transcript = join(tmp, 't.jsonl');
    writeFileSync(
      transcript,
      [
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'bg-1',
                name: 'Bash',
                input: { command: 'npx vitest run', run_in_background: true },
              },
            ],
          },
        }),
        JSON.stringify({
          type: 'user',
          message: {
            content: [
              { type: 'tool_result', tool_use_id: 'bg-1', content: 'Command running in background with ID: bkc1ziu9z' },
            ],
          },
        }),
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [{ type: 'tool_use', id: 'wake-1', name: 'ScheduleWakeup', input: {} }],
          },
        }),
      ].join('\n') + '\n'
    );
    const code = await runHook(
      { transcript_path: transcript, hook_event_name: 'Stop', stop_hook_active: false },
      {
        BOARD_TASK_ID: '24',
        BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
        BOARD_HOOK_TOKEN: 'tk',
      }
    );
    expect(code).toBe(0);
    expect(svr.captured.length).toBe(before);
  });

  it('posts complete when an earlier-turn background Bash has a matching task-notification, even though the last tool_use is a different tool', async () => {
    const transcript = join(tmp, 't.jsonl');
    writeFileSync(
      transcript,
      [
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'bg-2',
                name: 'Bash',
                input: { command: 'npx vitest run', run_in_background: true },
              },
            ],
          },
        }),
        JSON.stringify({
          type: 'user',
          message: {
            content: [
              { type: 'tool_result', tool_use_id: 'bg-2', content: 'Command running in background with ID: bkc2abcd' },
            ],
          },
        }),
        JSON.stringify({
          type: 'queue-operation',
          operation: 'enqueue',
          timestamp: '2026-07-02T00:01:00Z',
          sessionId: 'sess-bg-2',
          content:
            '<task-notification>\n<task-id>bkc2abcd</task-id>\n<tool-use-id>bg-2</tool-use-id>\n<output-file>/tmp/bkc2abcd.output</output-file>\n<status>completed</status>\n<summary>Run full test suite finished</summary>\n</task-notification>',
        }),
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Tests are all green.' }] },
        }),
      ].join('\n') + '\n'
    );
    const code = await runHook(
      { transcript_path: transcript, hook_event_name: 'Stop', stop_hook_active: false },
      {
        BOARD_TASK_ID: '25',
        BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
        BOARD_HOOK_TOKEN: 'tk',
      }
    );
    expect(code).toBe(0);
    const last = svr.captured.at(-1);
    expect(last?.url).toBe('/api/internal/hooks/stop');
    expect(last?.body).toEqual({ taskId: 25, reason: 'complete' });
  });

  it('does NOT post when an earlier-turn background Task has no completion notification, even if the last tool_use is a different tool', async () => {
    const before = svr.captured.length;
    const transcript = join(tmp, 't.jsonl');
    writeFileSync(
      transcript,
      [
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'bg-task-1',
                name: 'Task',
                input: { description: 'run agent', prompt: 'do something', run_in_background: true },
              },
            ],
          },
        }),
        JSON.stringify({
          type: 'user',
          message: {
            content: [{ type: 'tool_result', tool_use_id: 'bg-task-1', content: 'Task running in background.' }],
          },
        }),
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [{ type: 'tool_use', id: 'wake-2', name: 'ScheduleWakeup', input: {} }],
          },
        }),
      ].join('\n') + '\n'
    );
    const code = await runHook(
      { transcript_path: transcript, hook_event_name: 'Stop', stop_hook_active: false },
      {
        BOARD_TASK_ID: '26',
        BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
        BOARD_HOOK_TOKEN: 'tk',
      }
    );
    expect(code).toBe(0);
    expect(svr.captured.length).toBe(before);
  });

  it('posts complete when an earlier-turn background Task has a matching task-notification, even though the last tool_use is a different tool', async () => {
    const transcript = join(tmp, 't.jsonl');
    writeFileSync(
      transcript,
      [
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'bg-task-2',
                name: 'Task',
                input: { description: 'run agent', prompt: 'do something else', run_in_background: true },
              },
            ],
          },
        }),
        JSON.stringify({
          type: 'user',
          message: {
            content: [{ type: 'tool_result', tool_use_id: 'bg-task-2', content: 'Task running in background.' }],
          },
        }),
        JSON.stringify({
          type: 'queue-operation',
          operation: 'enqueue',
          timestamp: '2026-07-02T00:02:00Z',
          sessionId: 'sess-bg-task-2',
          content:
            '<task-notification>\n<task-id>bktask2xyz</task-id>\n<tool-use-id>bg-task-2</tool-use-id>\n<output-file>/tmp/bktask2xyz.output</output-file>\n<status>completed</status>\n<summary>Agent finished its work</summary>\n</task-notification>',
        }),
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Sub-agent finished successfully.' }] },
        }),
      ].join('\n') + '\n'
    );
    const code = await runHook(
      { transcript_path: transcript, hook_event_name: 'Stop', stop_hook_active: false },
      {
        BOARD_TASK_ID: '27',
        BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
        BOARD_HOOK_TOKEN: 'tk',
      }
    );
    expect(code).toBe(0);
    const last = svr.captured.at(-1);
    expect(last?.url).toBe('/api/internal/hooks/stop');
    expect(last?.body).toEqual({ taskId: 27, reason: 'complete' });
  });

  it('does NOT post when last turn ends with AskUserQuestion awaiting answer', async () => {
    const before = svr.captured.length;
    const transcript = join(tmp, 't.jsonl');
    writeFileSync(
      transcript,
      [
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'tool_use', id: 'r-1', name: 'Read', input: {} }] },
        }),
        JSON.stringify({
          type: 'user',
          message: { content: [{ type: 'tool_result', tool_use_id: 'r-1', content: 'file content' }] },
        }),
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [{ type: 'tool_use', id: 'ask-2', name: 'AskUserQuestion', input: { question: 'Continue?' } }],
          },
        }),
      ].join('\n') + '\n'
    );
    const code = await runHook(
      { transcript_path: transcript, hook_event_name: 'Stop', stop_hook_active: false },
      {
        BOARD_TASK_ID: '22',
        BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
        BOARD_HOOK_TOKEN: 'tk',
      }
    );
    expect(code).toBe(0);
    expect(svr.captured.length).toBe(before);
  });

  it('does NOT post when last turn starts background Bash with no completion yet', async () => {
    const before = svr.captured.length;
    const transcript = join(tmp, 't.jsonl');
    writeFileSync(
      transcript,
      [
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'tool_use', id: 'r-2', name: 'Read', input: {} }] },
        }),
        JSON.stringify({
          type: 'user',
          message: { content: [{ type: 'tool_result', tool_use_id: 'r-2', content: 'content' }] },
        }),
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'bash-2',
                name: 'Bash',
                input: { command: 'npm run build', run_in_background: true },
              },
            ],
          },
        }),
      ].join('\n') + '\n'
    );
    const code = await runHook(
      { transcript_path: transcript, hook_event_name: 'Stop', stop_hook_active: false },
      {
        BOARD_TASK_ID: '23',
        BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
        BOARD_HOOK_TOKEN: 'tk',
      }
    );
    expect(code).toBe(0);
    expect(svr.captured.length).toBe(before);
  });

  it('posts complete when BOARD_TARGET_STATUS is reached even with an unfinished background job (self-wakeup regression)', async () => {
    svr.setStatus('review');
    const transcript = join(tmp, 't.jsonl');
    writeFileSync(
      transcript,
      [
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'bg-sr',
                name: 'Task',
                input: { description: 'self-review', prompt: 'review', run_in_background: true },
              },
            ],
          },
        }),
        JSON.stringify({
          type: 'user',
          message: { content: [{ type: 'tool_result', tool_use_id: 'bg-sr', content: 'Task running in background.' }] },
        }),
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'tool_use', id: 'wake-sr', name: 'ScheduleWakeup', input: {} }] },
        }),
      ].join('\n') + '\n'
    );
    const code = await runHook(
      { transcript_path: transcript, hook_event_name: 'Stop', stop_hook_active: false },
      {
        BOARD_TASK_ID: '30',
        BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
        BOARD_HOOK_TOKEN: 'tk',
        BOARD_TARGET_STATUS: 'review',
      }
    );
    expect(code).toBe(0);
    const last = svr.captured.at(-1);
    expect(last?.url).toBe('/api/internal/hooks/stop');
    expect(last?.body).toEqual({ taskId: 30, reason: 'complete' });
  });

  it('posts complete when BOARD_TARGET_STATUS is reached and last tool is ScheduleWakeup with no background job', async () => {
    svr.setStatus('done');
    const transcript = join(tmp, 't.jsonl');
    writeFileSync(
      transcript,
      [
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'No further action needed.' }] },
        }),
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'tool_use', id: 'wake-2', name: 'ScheduleWakeup', input: {} }] },
        }),
      ].join('\n') + '\n'
    );
    const code = await runHook(
      { transcript_path: transcript, hook_event_name: 'Stop', stop_hook_active: false },
      {
        BOARD_TASK_ID: '31',
        BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
        BOARD_HOOK_TOKEN: 'tk',
        BOARD_TARGET_STATUS: 'done',
      }
    );
    expect(code).toBe(0);
    const last = svr.captured.at(-1);
    expect(last?.body).toEqual({ taskId: 31, reason: 'complete' });
  });

  it('treats done/closed as reached when target is review', async () => {
    svr.setStatus('done');
    const transcript = join(tmp, 't.jsonl');
    writeFileSync(
      transcript,
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'tool_use', id: 'wake-3', name: 'ScheduleWakeup', input: {} }] },
      }) + '\n'
    );
    const code = await runHook(
      { transcript_path: transcript, hook_event_name: 'Stop', stop_hook_active: false },
      {
        BOARD_TASK_ID: '32',
        BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
        BOARD_HOOK_TOKEN: 'tk',
        BOARD_TARGET_STATUS: 'review',
      }
    );
    expect(code).toBe(0);
    expect(svr.captured.at(-1)?.body).toEqual({ taskId: 32, reason: 'complete' });
  });

  it('does NOT post when target is done but status is only review, and a background job is unfinished', async () => {
    const before = svr.captured.length;
    svr.setStatus('review');
    const transcript = join(tmp, 't.jsonl');
    writeFileSync(
      transcript,
      [
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              { type: 'tool_use', id: 'bg-x', name: 'Bash', input: { command: 'npm test', run_in_background: true } },
            ],
          },
        }),
        JSON.stringify({
          type: 'user',
          message: {
            content: [
              { type: 'tool_result', tool_use_id: 'bg-x', content: 'Command running in background with ID: bk-x' },
            ],
          },
        }),
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'tool_use', id: 'wake-4', name: 'ScheduleWakeup', input: {} }] },
        }),
      ].join('\n') + '\n'
    );
    const code = await runHook(
      { transcript_path: transcript, hook_event_name: 'Stop', stop_hook_active: false },
      {
        BOARD_TASK_ID: '33',
        BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
        BOARD_HOOK_TOKEN: 'tk',
        BOARD_TARGET_STATUS: 'done',
      }
    );
    expect(code).toBe(0);
    expect(svr.captured.length).toBe(before);
  });

  it('does NOT post when last tool is AskUserQuestion even though the status has reached target (interactive guard has priority)', async () => {
    const before = svr.captured.length;
    svr.setStatus('review');
    const transcript = join(tmp, 't.jsonl');
    writeFileSync(
      transcript,
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'tool_use', id: 'ask-x', name: 'AskUserQuestion', input: {} }] },
      }) + '\n'
    );
    const code = await runHook(
      { transcript_path: transcript, hook_event_name: 'Stop', stop_hook_active: false },
      {
        BOARD_TASK_ID: '34',
        BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
        BOARD_HOOK_TOKEN: 'tk',
        BOARD_TARGET_STATUS: 'review',
      }
    );
    expect(code).toBe(0);
    expect(svr.captured.length).toBe(before);
  });

  it('falls back to normal flow (no crash) when the status endpoint returns non-200', async () => {
    svr.setStatusHttpCode(500);
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
        BOARD_TASK_ID: '35',
        BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
        BOARD_HOOK_TOKEN: 'tk',
        BOARD_TARGET_STATUS: 'review',
      }
    );
    expect(code).toBe(0);
    // status 判定はスキップされ、通常フロー(最後が Read・背景ジョブ無し)で complete を送る
    expect(svr.captured.at(-1)?.body).toEqual({ taskId: 35, reason: 'complete' });
  });
});
