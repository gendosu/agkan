import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { spawn } from 'child_process';
import { createServer } from 'http';
import type { Server } from 'http';
import { resolve, join } from 'path';
import { writeFileSync, mkdtempSync, rmSync, existsSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { buildHookEnv } from './hook-test-env';

const SCRIPT = resolve(__dirname, '../../src/hooks/hook-attention.mjs');

// Set by beforeEach below; runHook defaults BOARD_SESSION_MARKER_FILE to a path inside this
// dir so no test ever touches the real /tmp/board-main-session-<taskId> marker file.
let tmp: string;

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
      env: buildHookEnv({ BOARD_SESSION_MARKER_FILE: join(tmp, 'session-marker'), ...env }),
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

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'hook-attention-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
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
    let sessionFile: string;

    beforeEach(() => {
      sessionFile = join(tmp, 'session-marker');
      writeFileSync(sessionFile, MAIN_SESSION, 'utf-8');
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

  it('never reads the real /tmp/board-main-session-<taskId> marker file even when the parent env has BOARD_TASK_ID set (regression: #690)', async () => {
    // Uses a task id unique to this file (not shared with the other hook test files'
    // regression tests) so parallel test-file execution can't race on the same real path.
    const TASK_ID_FOR_REGRESSION = '62702';
    const realMarker = `/tmp/board-main-session-${TASK_ID_FOR_REGRESSION}`;
    const original = process.env.BOARD_TASK_ID;
    // Defensive cleanup in case a prior crashed run left this behind.
    if (existsSync(realMarker)) unlinkSync(realMarker);
    try {
      process.env.BOARD_TASK_ID = TASK_ID_FOR_REGRESSION;
      writeFileSync(realMarker, 'real-session-id', 'utf-8');
      const code = await runHook(
        ['pre'],
        {
          BOARD_TASK_ID: TASK_ID_FOR_REGRESSION,
          BOARD_API_URL: `http://127.0.0.1:${svr.port}`,
          BOARD_HOOK_TOKEN: 'tok',
        },
        JSON.stringify({ session_id: 'unrelated-session' })
      );
      expect(code).toBe(0);
      // The hook must consult the isolated BOARD_SESSION_MARKER_FILE, not the real marker
      // (which holds a different session id) — so it should still fire, not skip.
      const last = svr.captured.at(-1);
      expect(last?.body).toEqual({ taskId: Number(TASK_ID_FOR_REGRESSION), state: 'needs' });
      expect(existsSync(realMarker)).toBe(true);
    } finally {
      if (existsSync(realMarker)) unlinkSync(realMarker);
      if (original === undefined) delete process.env.BOARD_TASK_ID;
      else process.env.BOARD_TASK_ID = original;
    }
  });
});
