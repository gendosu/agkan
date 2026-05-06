import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import { createServer } from 'http';
import type { Server } from 'http';
import { resolve } from 'path';

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

function runHook(args: string[], env: Record<string, string>): Promise<number> {
  return new Promise((resolveFn) => {
    const proc = spawn('node', [SCRIPT, ...args], { env: { ...process.env, ...env } });
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
});
