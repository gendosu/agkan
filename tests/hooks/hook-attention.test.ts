import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { spawn } from 'child_process';
import { createServer } from 'http';
import type { Server } from 'http';
import { resolve } from 'path';
import { writeFileSync, unlinkSync, existsSync } from 'fs';

const SCRIPT = resolve(__dirname, '../../src/hooks/hook-attention.mjs');

type Capture = { headers: Record<string, string | string[] | undefined>; body: unknown };

function makeServer(): Promise<{ server: Server; port: number; captured: Capture[] }> {
  return new Promise((resolveFn) => {
    const captured: Capture[] = [];
    const server = createServer((req, res) => {
      let data = '';
      req.on('data', (c) => (data += c));
      req.on('end', () => {
        captured.push({ headers: req.headers, body: data ? JSON.parse(data) : null });
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

function runHook(args: string[], env: Record<string, string>, stdinData?: string): Promise<number> {
  return new Promise((resolveFn) => {
    const proc = spawn('node', [SCRIPT, ...args], {
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (stdinData !== undefined) {
      proc.stdin.write(stdinData);
    }
    proc.stdin.end();
    proc.on('exit', (code) => resolveFn(code ?? 0));
  });
}

describe('hook-attention.mjs', () => {
  let svr: Awaited<ReturnType<typeof makeServer>>;

  beforeAll(async () => {
    svr = await makeServer();
  });

  afterAll(() => {
    svr.server.close();
  });

  it('posts state="needs" when invoked with "pre"', async () => {
    const code = await runHook(['pre'], {
      BOARD_TASK_ID: '42',
      BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
      BOARD_HOOK_TOKEN: 'token-abc',
    });
    expect(code).toBe(0);
    const last = svr.captured.at(-1);
    expect(last?.headers['x-hook-token']).toBe('token-abc');
    expect(last?.body).toEqual({ taskId: 42, state: 'needs' });
  });

  it('posts state="answered" when invoked with "post"', async () => {
    const code = await runHook(['post'], {
      BOARD_TASK_ID: '7',
      BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
      BOARD_HOOK_TOKEN: 'token-xyz',
    });
    expect(code).toBe(0);
    const last = svr.captured.at(-1);
    expect(last?.body).toEqual({ taskId: 7, state: 'answered' });
  });

  it('exits 0 even when API is unreachable', async () => {
    const code = await runHook(['pre'], {
      BOARD_TASK_ID: '1',
      BOARD_API_URL: 'http://127.0.0.1:1', // unused port
      BOARD_HOOK_TOKEN: 't',
    });
    expect(code).toBe(0);
  });

  it('exits 0 silently when env vars are missing', async () => {
    const code = await runHook(['pre'], {});
    expect(code).toBe(0);
  });

  describe('subagent filtering', () => {
    const TASK_ID = '9901';
    const MAIN_SESSION = 'main-session-abc';
    const SUB_SESSION = 'sub-session-xyz';
    const sessionFile = `/tmp/board-main-session-${TASK_ID}`;

    beforeEach(() => {
      writeFileSync(sessionFile, MAIN_SESSION, 'utf-8');
    });

    afterEach(() => {
      if (existsSync(sessionFile)) unlinkSync(sessionFile);
    });

    it('fires API when session_id matches main session', async () => {
      const before = svr.captured.length;
      const code = await runHook(
        ['pre'],
        {
          BOARD_TASK_ID: TASK_ID,
          BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
          BOARD_HOOK_TOKEN: 'tok',
        },
        JSON.stringify({ session_id: MAIN_SESSION })
      );
      expect(code).toBe(0);
      expect(svr.captured.length).toBeGreaterThan(before);
      expect(svr.captured.at(-1)?.body).toEqual({ taskId: 9901, state: 'needs' });
    });

    it('skips API when session_id belongs to a subagent', async () => {
      const before = svr.captured.length;
      const code = await runHook(
        ['pre'],
        {
          BOARD_TASK_ID: TASK_ID,
          BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
          BOARD_HOOK_TOKEN: 'tok',
        },
        JSON.stringify({ session_id: SUB_SESSION })
      );
      expect(code).toBe(0);
      expect(svr.captured.length).toBe(before);
    });

    it('skips API for subagent on "post" (answered) as well', async () => {
      const before = svr.captured.length;
      const code = await runHook(
        ['post'],
        {
          BOARD_TASK_ID: TASK_ID,
          BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
          BOARD_HOOK_TOKEN: 'tok',
        },
        JSON.stringify({ session_id: SUB_SESSION })
      );
      expect(code).toBe(0);
      expect(svr.captured.length).toBe(before);
    });

    it('skips API when stdin payload has no session_id but session file exists', async () => {
      const before = svr.captured.length;
      const code = await runHook(
        ['pre'],
        {
          BOARD_TASK_ID: TASK_ID,
          BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
          BOARD_HOOK_TOKEN: 'tok',
        },
        JSON.stringify({})
      );
      expect(code).toBe(0);
      // No session_id in payload means we cannot confirm it's the main session → skip
      expect(svr.captured.length).toBe(before);
    });
  });
});
