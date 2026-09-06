import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn } from 'child_process';
import { createServer } from 'http';
import type { Server } from 'http';
import { resolve } from 'path';
import { buildHookEnv } from './hook-test-env';

const SCRIPT = resolve(__dirname, '../../src/hooks/hook-codex-notify.mjs');

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

// Codex `notify` passes the event payload as a single JSON argv entry (not on stdin).
function runHook(argvPayload: string, env: Record<string, string>): Promise<number> {
  return new Promise((resolveFn) => {
    const proc = spawn('node', [SCRIPT, argvPayload], { env: buildHookEnv(env) });
    proc.stdin.end();
    proc.on('exit', (code) => resolveFn(code ?? 0));
  });
}

const turnComplete = {
  type: 'agent-turn-complete',
  'thread-id': 'th-1',
  'turn-id': 'tu-1',
  cwd: '/work',
  'input-messages': ['Task ID: 5'],
  'last-assistant-message': 'exit',
};

describe('hook-codex-notify.mjs', () => {
  let svr: Awaited<ReturnType<typeof makeServer>>;
  let baseEnv: Record<string, string>;

  beforeAll(async () => {
    svr = await makeServer();
    baseEnv = {
      BOARD_TASK_ID: '5',
      BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
      BOARD_HOOK_TOKEN: 'tk',
    };
  });

  afterAll(() => {
    svr.server.close();
  });

  beforeEach(() => {
    svr.setStatus(null);
    svr.setStatusHttpCode(200);
  });

  it('posts complete on agent-turn-complete when no target status is configured', async () => {
    const before = svr.captured.length;
    const code = await runHook(JSON.stringify(turnComplete), baseEnv);
    expect(code).toBe(0);
    expect(svr.captured.length).toBe(before + 1);
    const last = svr.captured.at(-1);
    expect(last?.url).toBe('/api/internal/hooks/stop');
    expect(last?.body).toEqual({ taskId: 5, reason: 'complete' });
  });

  it('does NOT post for a payload of another type', async () => {
    const before = svr.captured.length;
    const code = await runHook(JSON.stringify({ ...turnComplete, type: 'something-else' }), baseEnv);
    expect(code).toBe(0);
    expect(svr.captured.length).toBe(before);
  });

  it('does NOT post when the argv payload is not JSON', async () => {
    const before = svr.captured.length;
    expect(await runHook('not json', baseEnv)).toBe(0);
    expect(svr.captured.length).toBe(before);
  });

  it('does NOT post when the argv payload is missing', async () => {
    const before = svr.captured.length;
    const proc = spawn('node', [SCRIPT], { env: buildHookEnv(baseEnv) });
    proc.stdin.end();
    const code = await new Promise<number>((r) => proc.on('exit', (c) => r(c ?? 0)));
    expect(code).toBe(0);
    expect(svr.captured.length).toBe(before);
  });

  it('does NOT post when BOARD_TASK_ID is not numeric', async () => {
    const before = svr.captured.length;
    expect(await runHook(JSON.stringify(turnComplete), { ...baseEnv, BOARD_TASK_ID: 'abc' })).toBe(0);
    expect(svr.captured.length).toBe(before);
  });

  it('does NOT post when board env vars are missing', async () => {
    const before = svr.captured.length;
    const code = await runHook(JSON.stringify(turnComplete), {
      BOARD_TASK_ID: '5',
      BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
    });
    expect(code).toBe(0);
    expect(svr.captured.length).toBe(before);
  });

  it('does NOT post when a target status is configured but not yet reached', async () => {
    const before = svr.captured.length;
    svr.setStatus('in_progress');
    const code = await runHook(JSON.stringify(turnComplete), { ...baseEnv, BOARD_TARGET_STATUS: 'review' });
    expect(code).toBe(0);
    expect(svr.captured.length).toBe(before);
  });

  it('does NOT post when the status check fails, even on agent-turn-complete', async () => {
    const before = svr.captured.length;
    svr.setStatusHttpCode(500);
    const code = await runHook(JSON.stringify(turnComplete), { ...baseEnv, BOARD_TARGET_STATUS: 'review' });
    expect(code).toBe(0);
    expect(svr.captured.length).toBe(before);
  });

  it('posts complete when the target status has been reached', async () => {
    const before = svr.captured.length;
    svr.setStatus('review');
    const code = await runHook(JSON.stringify(turnComplete), { ...baseEnv, BOARD_TARGET_STATUS: 'review' });
    expect(code).toBe(0);
    expect(svr.captured.length).toBe(before + 1);
    expect(svr.captured.at(-1)?.body).toEqual({ taskId: 5, reason: 'complete' });
  });

  it('posts complete when the task advanced past the target to a terminal status', async () => {
    const before = svr.captured.length;
    svr.setStatus('done');
    const code = await runHook(JSON.stringify(turnComplete), { ...baseEnv, BOARD_TARGET_STATUS: 'review' });
    expect(code).toBe(0);
    expect(svr.captured.length).toBe(before + 1);
  });
});
