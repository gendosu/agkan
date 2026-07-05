import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn } from 'child_process';
import { createServer } from 'http';
import type { Server } from 'http';
import { existsSync, mkdtempSync, unlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { buildHookEnv } from './hook-test-env';

const SCRIPT = resolve(__dirname, '../../src/hooks/hook-stop.mjs');

// Set by beforeEach below; runHook reads it to isolate BOARD_SESSION_MARKER_FILE per test.
let tmp: string;

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

// Defaults BOARD_SESSION_MARKER_FILE to a path inside the per-test mkdtemp dir so no test
// ever touches the real /tmp/board-main-session-<taskId> marker file, regardless of what
// taskId a test happens to use. Callers that need to assert on a specific marker path (or
// simulate no marker file at all) can still override it explicitly via `env`.
function runHook(stdinJson: unknown, env: Record<string, string>): Promise<number> {
  return new Promise((resolveFn) => {
    const proc = spawn('node', [SCRIPT], {
      env: buildHookEnv({ BOARD_SESSION_MARKER_FILE: join(tmp, 'session-marker'), ...env }),
    });
    proc.stdin.write(JSON.stringify(stdinJson));
    proc.stdin.end();
    proc.on('exit', (code) => resolveFn(code ?? 0));
  });
}

describe('hook-stop.mjs', () => {
  let svr: Awaited<ReturnType<typeof makeServer>>;

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

  it('posts complete when the task-notification is recorded as a plain string directly under message.content (#692)', async () => {
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
                id: 'bg-msg-str',
                name: 'Bash',
                input: { command: 'npx vitest run', run_in_background: true },
              },
            ],
          },
        }),
        JSON.stringify({
          type: 'user',
          message: {
            content: [{ type: 'tool_result', tool_use_id: 'bg-msg-str', content: 'Command running in background.' }],
          },
        }),
        JSON.stringify({
          type: 'user',
          message: {
            content: '<task-notification><tool-use-id>bg-msg-str</tool-use-id> done</task-notification>',
          },
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
        BOARD_TASK_ID: '692',
        BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
        BOARD_HOOK_TOKEN: 'tk',
      }
    );
    expect(code).toBe(0);
    const last = svr.captured.at(-1);
    expect(last?.url).toBe('/api/internal/hooks/stop');
    expect(last?.body).toEqual({ taskId: 692, reason: 'complete' });
  });

  it("posts complete when the task-notification is recorded inside a message.content block's `content` string (#692)", async () => {
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
                id: 'bg-block-content',
                name: 'Task',
                input: { description: 'run agent', prompt: 'do something', run_in_background: true },
              },
            ],
          },
        }),
        JSON.stringify({
          type: 'user',
          message: {
            content: [{ type: 'tool_result', tool_use_id: 'bg-block-content', content: 'Task running in background.' }],
          },
        }),
        JSON.stringify({
          type: 'user',
          message: {
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'unrelated',
                content: '<task-notification><tool-use-id>bg-block-content</tool-use-id> done</task-notification>',
              },
            ],
          },
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
        BOARD_TASK_ID: '693',
        BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
        BOARD_HOOK_TOKEN: 'tk',
      }
    );
    expect(code).toBe(0);
    const last = svr.captured.at(-1);
    expect(last?.url).toBe('/api/internal/hooks/stop');
    expect(last?.body).toEqual({ taskId: 693, reason: 'complete' });
  });

  it("posts complete when the task-notification is recorded inside a message.content block's `text` string (#692)", async () => {
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
                id: 'bg-block-text',
                name: 'Bash',
                input: { command: 'npx vitest run', run_in_background: true },
              },
            ],
          },
        }),
        JSON.stringify({
          type: 'user',
          message: {
            content: [{ type: 'tool_result', tool_use_id: 'bg-block-text', content: 'Command running in background.' }],
          },
        }),
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              {
                type: 'text',
                text: '<task-notification><tool-use-id>bg-block-text</tool-use-id> done</task-notification>',
              },
            ],
          },
        }),
      ].join('\n') + '\n'
    );
    const code = await runHook(
      { transcript_path: transcript, hook_event_name: 'Stop', stop_hook_active: false },
      {
        BOARD_TASK_ID: '694',
        BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
        BOARD_HOOK_TOKEN: 'tk',
      }
    );
    expect(code).toBe(0);
    const last = svr.captured.at(-1);
    expect(last?.url).toBe('/api/internal/hooks/stop');
    expect(last?.body).toEqual({ taskId: 694, reason: 'complete' });
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

  it('does NOT post complete when BOARD_TARGET_STATUS is reached but a background sub-agent is unfinished (orchestration regression: #666)', async () => {
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
    // The background-job guard must take priority over the status-reached check — a
    // still-running sub-agent must not be killed just because the status advanced.
    expect(svr.captured.length).toBe(before);
  });

  it('does NOT post complete when BOARD_TARGET_STATUS is reached but multiple background sub-agents are unfinished (multi-agent orchestration regression: #666)', async () => {
    const before = svr.captured.length;
    svr.setStatus('done');
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
                id: 'bg-agent-1',
                name: 'Task',
                input: { description: 'sub-agent-1', prompt: 'implement part A', run_in_background: true },
              },
              {
                type: 'tool_use',
                id: 'bg-agent-2',
                name: 'Task',
                input: { description: 'sub-agent-2', prompt: 'implement part B', run_in_background: true },
              },
            ],
          },
        }),
        JSON.stringify({
          type: 'user',
          message: {
            content: [
              { type: 'tool_result', tool_use_id: 'bg-agent-1', content: 'Task running in background.' },
              { type: 'tool_result', tool_use_id: 'bg-agent-2', content: 'Task running in background.' },
            ],
          },
        }),
        // sub-agent-1 finished, but sub-agent-2 is still running.
        JSON.stringify({
          type: 'user',
          message: { content: '<task-notification><tool-use-id>bg-agent-1</tool-use-id> done</task-notification>' },
        }),
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'tool_use', id: 'wake-multi', name: 'ScheduleWakeup', input: {} }] },
        }),
      ].join('\n') + '\n'
    );
    const code = await runHook(
      { transcript_path: transcript, hook_event_name: 'Stop', stop_hook_active: false },
      {
        BOARD_TASK_ID: '36',
        BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
        BOARD_HOOK_TOKEN: 'tk',
        BOARD_TARGET_STATUS: 'done',
      }
    );
    expect(code).toBe(0);
    expect(svr.captured.length).toBe(before);
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

  it('posts complete when target is done and status is review, with no unfinished background job (regression: #691 run/direct sessions must not linger when a PR was created)', async () => {
    svr.setStatus('review');
    const transcript = join(tmp, 't.jsonl');
    writeFileSync(
      transcript,
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'tool_use', id: 'wake-691', name: 'ScheduleWakeup', input: {} }] },
      }) + '\n'
    );
    const code = await runHook(
      { transcript_path: transcript, hook_event_name: 'Stop', stop_hook_active: false },
      {
        BOARD_TASK_ID: '691',
        BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
        BOARD_HOOK_TOKEN: 'tk',
        BOARD_TARGET_STATUS: 'done',
      }
    );
    expect(code).toBe(0);
    expect(svr.captured.at(-1)?.body).toEqual({ taskId: 691, reason: 'complete' });
  });

  it('does NOT post when target is done and status is review (now a reached terminal status) but a background job is still unfinished (#666 guard takes priority over the status check)', async () => {
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

  it('does NOT post complete when BOARD_TARGET_STATUS is set and the status endpoint returns non-200 (#667: status-reached is the only termination signal when a target is configured)', async () => {
    const before = svr.captured.length;
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
    // The status check failed (non-200), so isTargetStatusReached returns false. With
    // BOARD_TARGET_STATUS set there is no unconditional fallback anymore (#667) — the
    // session must stay alive (session residue, recoverable via manual stop) rather than
    // being killed in-flight based on an unrelated last-tool/background-job guard.
    expect(svr.captured.length).toBe(before);
  });

  it('does NOT post complete when BOARD_TARGET_STATUS is set, status has not reached target, and the last tool is Agent (not an interactive tool, not Bash/Task) — #667 core fix regression', async () => {
    const before = svr.captured.length;
    svr.setStatus('in_progress');
    const transcript = join(tmp, 't.jsonl');
    writeFileSync(
      transcript,
      JSON.stringify({
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', id: 'agent-1', name: 'Agent', input: { description: 'batch fix sub-agent' } }],
        },
      }) + '\n'
    );
    const code = await runHook(
      { transcript_path: transcript, hook_event_name: 'Stop', stop_hook_active: false },
      {
        BOARD_TASK_ID: '648',
        BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
        BOARD_HOOK_TOKEN: 'tk',
        BOARD_TARGET_STATUS: 'review',
      }
    );
    expect(code).toBe(0);
    // Before #667, none of the guards recognized `Agent` or matched, so the unconditional
    // complete at the bottom of main() fired regardless of status — killing the still
    // in-flight sub-agent (this is the exact reproduction of the reported bug on task #648).
    expect(svr.captured.length).toBe(before);
  });

  it('does NOT post complete when BOARD_TARGET_STATUS is set, status has not reached target, and a sub-agent is running via a background Task without an explicit run_in_background flag', async () => {
    const before = svr.captured.length;
    svr.setStatus('in_progress');
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
                id: 'bg-noflag-1',
                name: 'Task',
                input: { description: 'sub-agent', prompt: 'do work' },
              },
            ],
          },
        }),
        JSON.stringify({
          type: 'user',
          message: { content: [{ type: 'tool_result', tool_use_id: 'bg-noflag-1', content: 'Task running.' }] },
        }),
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'tool_use', id: 'wake-noflag', name: 'ScheduleWakeup', input: {} }] },
        }),
      ].join('\n') + '\n'
    );
    const code = await runHook(
      { transcript_path: transcript, hook_event_name: 'Stop', stop_hook_active: false },
      {
        BOARD_TASK_ID: '648',
        BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
        BOARD_HOOK_TOKEN: 'tk',
        BOARD_TARGET_STATUS: 'review',
      }
    );
    expect(code).toBe(0);
    // Task without run_in_background is not treated as a background job (matches
    // "posts complete when last tool_use is Task without run_in_background" above), so this
    // relies purely on the status-reached gate: status hasn't reached target, so no complete.
    expect(svr.captured.length).toBe(before);
  });

  it('posts complete unconditionally when BOARD_TARGET_STATUS is unset, even with a non-Bash/Task/interactive last tool (backward compatibility regression: legacy/planning sessions)', async () => {
    svr.setStatus(null);
    const transcript = join(tmp, 't.jsonl');
    writeFileSync(
      transcript,
      // 'Glob' is deliberately not Bash/Task/Agent/AskUserQuestion/Monitor, so none of the
      // guards above can match it — this isolates the legacy unconditional-complete path.
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'tool_use', id: 'glob-legacy', name: 'Glob', input: {} }] },
      }) + '\n'
    );
    const code = await runHook(
      { transcript_path: transcript, hook_event_name: 'Stop', stop_hook_active: false },
      {
        BOARD_TASK_ID: '40',
        BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
        BOARD_HOOK_TOKEN: 'tk',
      }
    );
    expect(code).toBe(0);
    // No BOARD_TARGET_STATUS means the legacy unconditional-complete path at the bottom of
    // main() still fires as before, regardless of what the last tool was.
    const last = svr.captured.at(-1);
    expect(last?.body).toEqual({ taskId: 40, reason: 'complete' });
  });

  it('does NOT post when BOARD_TARGET_STATUS is unset and an unflagged Agent sub-agent has no completion notification yet (auxiliary fix: planning session kill-in-flight guard)', async () => {
    const before = svr.captured.length;
    const transcript = join(tmp, 't.jsonl');
    writeFileSync(
      transcript,
      [
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [{ type: 'tool_use', id: 'agent-noflag-1', name: 'Agent', input: { description: 'sub-agent' } }],
          },
        }),
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'tool_use', id: 'wake-agent-1', name: 'ScheduleWakeup', input: {} }] },
        }),
      ].join('\n') + '\n'
    );
    const code = await runHook(
      { transcript_path: transcript, hook_event_name: 'Stop', stop_hook_active: false },
      {
        BOARD_TASK_ID: '41',
        BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
        BOARD_HOOK_TOKEN: 'tk',
      }
    );
    expect(code).toBe(0);
    expect(svr.captured.length).toBe(before);
  });

  it('posts complete when BOARD_TARGET_STATUS is unset and an unflagged Agent sub-agent has a matching task-notification', async () => {
    const transcript = join(tmp, 't.jsonl');
    writeFileSync(
      transcript,
      [
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [{ type: 'tool_use', id: 'agent-noflag-2', name: 'Agent', input: { description: 'sub-agent' } }],
          },
        }),
        JSON.stringify({
          type: 'queue-operation',
          operation: 'enqueue',
          timestamp: '2026-07-03T00:00:00Z',
          sessionId: 'sess-agent-noflag-2',
          content:
            '<task-notification>\n<task-id>agtask1</task-id>\n<tool-use-id>agent-noflag-2</tool-use-id>\n<status>completed</status>\n<summary>Sub-agent finished.</summary>\n</task-notification>',
        }),
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Sub-agent finished.' }] },
        }),
      ].join('\n') + '\n'
    );
    const code = await runHook(
      { transcript_path: transcript, hook_event_name: 'Stop', stop_hook_active: false },
      {
        BOARD_TASK_ID: '42',
        BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
        BOARD_HOOK_TOKEN: 'tk',
      }
    );
    expect(code).toBe(0);
    const last = svr.captured.at(-1);
    expect(last?.body).toEqual({ taskId: 42, reason: 'complete' });
  });

  it('does NOT treat an unflagged Agent as a background job when BOARD_TARGET_STATUS is set (scoping: Agent-without-flag detection must not wedge open pr/run sessions)', async () => {
    svr.setStatus('review');
    const transcript = join(tmp, 't.jsonl');
    writeFileSync(
      transcript,
      [
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [{ type: 'tool_use', id: 'agent-scoped-1', name: 'Agent', input: { description: 'sub-agent' } }],
          },
        }),
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'tool_use', id: 'wake-scoped-1', name: 'ScheduleWakeup', input: {} }] },
        }),
      ].join('\n') + '\n'
    );
    const code = await runHook(
      { transcript_path: transcript, hook_event_name: 'Stop', stop_hook_active: false },
      {
        BOARD_TASK_ID: '43',
        BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
        BOARD_HOOK_TOKEN: 'tk',
        BOARD_TARGET_STATUS: 'review',
      }
    );
    expect(code).toBe(0);
    // No <task-notification> was ever emitted for agent-scoped-1, so if Agent-without-flag
    // detection applied here too, this session would be wedged open forever even though the
    // status already reached its target. Because BOARD_TARGET_STATUS is set, the guard must
    // ignore the unflagged Agent and let the status-reached check drive completion instead.
    const last = svr.captured.at(-1);
    expect(last?.body).toEqual({ taskId: 43, reason: 'complete' });
  });

  it('does not leak a parent-process BOARD_TARGET_STATUS into a test override that omits it (regression: #690)', async () => {
    // Reproduces the reported bug: inside a real Board pr/run session, BOARD_TARGET_STATUS
    // is set on the parent process. A test override that doesn't mention the key must not
    // silently inherit it — this test simulates that parent state and asserts the hook still
    // takes the legacy unconditional-complete path (i.e. BOARD_TARGET_STATUS was actually
    // absent in the child, not merely absent from the override object).
    const original = process.env.BOARD_TARGET_STATUS;
    process.env.BOARD_TARGET_STATUS = 'review';
    try {
      svr.setStatus(null);
      const transcript = join(tmp, 't.jsonl');
      writeFileSync(
        transcript,
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'tool_use', id: 'glob-leak', name: 'Glob', input: {} }] },
        }) + '\n'
      );
      const code = await runHook(
        { transcript_path: transcript, hook_event_name: 'Stop', stop_hook_active: false },
        {
          BOARD_TASK_ID: '999',
          BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
          BOARD_HOOK_TOKEN: 'tk',
        }
      );
      expect(code).toBe(0);
      const last = svr.captured.at(-1);
      expect(last?.body).toEqual({ taskId: 999, reason: 'complete' });
    } finally {
      if (original === undefined) delete process.env.BOARD_TARGET_STATUS;
      else process.env.BOARD_TARGET_STATUS = original;
    }
  });

  it('never writes to the real /tmp/board-main-session-<taskId> marker file (regression: #690)', async () => {
    // Uses a task id unique to this file (not shared with the other hook test files'
    // regression tests) so parallel test-file execution can't race on the same real path.
    const TASK_ID_FOR_REGRESSION = '62703';
    const realMarker = `/tmp/board-main-session-${TASK_ID_FOR_REGRESSION}`;
    const original = process.env.BOARD_TASK_ID;
    process.env.BOARD_TASK_ID = TASK_ID_FOR_REGRESSION;
    // Defensive cleanup in case a prior crashed run left this behind.
    if (existsSync(realMarker)) unlinkSync(realMarker);
    try {
      const transcript = join(tmp, 't.jsonl');
      writeFileSync(
        transcript,
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'tool_use', name: 'Read', input: {} }] },
        }) + '\n'
      );
      const code = await runHook(
        { transcript_path: transcript, hook_event_name: 'Stop', stop_hook_active: false, session_id: 'test-sess' },
        {
          BOARD_TASK_ID: TASK_ID_FOR_REGRESSION,
          BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
          BOARD_HOOK_TOKEN: 'tk',
        }
      );
      expect(code).toBe(0);
      expect(existsSync(realMarker)).toBe(false);
    } finally {
      if (original === undefined) delete process.env.BOARD_TASK_ID;
      else process.env.BOARD_TASK_ID = original;
    }
  });
});
