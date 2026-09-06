import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn } from 'child_process';
import { createServer } from 'http';
import type { Server } from 'http';
import { resolve } from 'path';
import { buildHookEnv } from './hook-test-env';

const SCRIPT = resolve(__dirname, '../../src/hooks/hook-agy-notify.mjs');

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

// agy's Stop hook contract delivers the event JSON on stdin (not argv, unlike Codex's
// notify) and requires a JSON object back on stdout.
function runHook(stdinPayload: string, env: Record<string, string>): Promise<{ code: number; stdout: string }> {
  return new Promise((resolveFn) => {
    const proc = spawn('node', [SCRIPT], { env: buildHookEnv(env) });
    let stdout = '';
    proc.stdout.on('data', (c) => (stdout += c));
    proc.stdin.write(stdinPayload);
    proc.stdin.end();
    proc.on('exit', (code) => resolveFn({ code: code ?? 0, stdout }));
  });
}

const stopPayload = JSON.stringify({
  conversationId: 'c-1',
  workspacePaths: ['/work'],
  transcriptPath: '/work/.gemini/antigravity-cli/transcript.jsonl',
  artifactDirectoryPath: '/work/.gemini/antigravity-cli/artifacts',
  modelName: 'auto',
  executionNum: 1,
  terminationReason: 'NO_TOOL_CALL',
  error: '',
  fullyIdle: true,
});

describe('hook-agy-notify.mjs', () => {
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

  it('posts complete and replies with {} when no target status is configured', async () => {
    const before = svr.captured.length;
    const { code, stdout } = await runHook(stopPayload, baseEnv);
    expect(code).toBe(0);
    expect(stdout).toBe('{}');
    expect(svr.captured.length).toBe(before + 1);
    const last = svr.captured.at(-1);
    expect(last?.url).toBe('/api/internal/hooks/stop');
    expect(last?.body).toEqual({ taskId: 5, reason: 'complete' });
  });

  it('still replies with {} when the stdin payload is not JSON', async () => {
    const before = svr.captured.length;
    const { code, stdout } = await runHook('not json', baseEnv);
    expect(code).toBe(0);
    expect(stdout).toBe('{}');
    expect(svr.captured.length).toBe(before + 1);
  });

  it('does NOT post when BOARD_TASK_ID is not numeric', async () => {
    const before = svr.captured.length;
    const { stdout } = await runHook(stopPayload, { ...baseEnv, BOARD_TASK_ID: 'abc' });
    expect(stdout).toBe('{}');
    expect(svr.captured.length).toBe(before);
  });

  it('does NOT post when board env vars are missing', async () => {
    const before = svr.captured.length;
    const { stdout } = await runHook(stopPayload, {
      BOARD_TASK_ID: '5',
      BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
    });
    expect(stdout).toBe('{}');
    expect(svr.captured.length).toBe(before);
  });

  it('does NOT post when a target status is configured but not yet reached', async () => {
    const before = svr.captured.length;
    svr.setStatus('in_progress');
    const { stdout } = await runHook(stopPayload, { ...baseEnv, BOARD_TARGET_STATUS: 'review' });
    expect(stdout).toBe('{}');
    expect(svr.captured.length).toBe(before);
  });

  it('does NOT post when the status check fails', async () => {
    const before = svr.captured.length;
    svr.setStatusHttpCode(500);
    const { stdout } = await runHook(stopPayload, { ...baseEnv, BOARD_TARGET_STATUS: 'review' });
    expect(stdout).toBe('{}');
    expect(svr.captured.length).toBe(before);
  });

  it('posts complete when the target status has been reached', async () => {
    const before = svr.captured.length;
    svr.setStatus('review');
    const { stdout } = await runHook(stopPayload, { ...baseEnv, BOARD_TARGET_STATUS: 'review' });
    expect(stdout).toBe('{}');
    expect(svr.captured.length).toBe(before + 1);
    expect(svr.captured.at(-1)?.body).toEqual({ taskId: 5, reason: 'complete' });
  });

  it('posts complete when the task advanced past the target to a terminal status', async () => {
    const before = svr.captured.length;
    svr.setStatus('done');
    const { stdout } = await runHook(stopPayload, { ...baseEnv, BOARD_TARGET_STATUS: 'review' });
    expect(stdout).toBe('{}');
    expect(svr.captured.length).toBe(before + 1);
  });
});
