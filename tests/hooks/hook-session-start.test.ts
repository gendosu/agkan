import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'child_process';
import { existsSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { buildHookEnv } from './hook-test-env';

const SCRIPT = resolve(__dirname, '../../src/hooks/hook-session-start.mjs');
const REAL_SESSION_FILE = '/tmp/board-main-session-42';

function runHook(stdinJson: unknown, env: Record<string, string>): Promise<number> {
  return new Promise((resolveFn) => {
    const proc = spawn('node', [SCRIPT], { env: buildHookEnv(env) });
    proc.stdin.write(JSON.stringify(stdinJson));
    proc.stdin.end();
    proc.on('exit', (code) => resolveFn(code ?? 0));
  });
}

describe('hook-session-start.mjs', () => {
  let tmp: string;
  let sessionFile: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'hook-session-start-'));
    sessionFile = join(tmp, 'board-main-session-42');
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('exits 0 immediately when BOARD_TASK_ID is not set', async () => {
    const code = await runHook({ session_id: 'abc' }, { BOARD_SESSION_MARKER_FILE: sessionFile });
    expect(code).toBe(0);
    expect(existsSync(sessionFile)).toBe(false);
    expect(existsSync(REAL_SESSION_FILE)).toBe(false);
  });

  it('writes session_id to the session marker file', async () => {
    const code = await runHook(
      { session_id: 'test-session-123', hook_event_name: 'SessionStart' },
      { BOARD_TASK_ID: '42', BOARD_SESSION_MARKER_FILE: sessionFile }
    );
    expect(code).toBe(0);
    expect(existsSync(sessionFile)).toBe(true);
    const { readFileSync } = await import('fs');
    expect(readFileSync(sessionFile, 'utf-8')).toBe('test-session-123');
    expect(existsSync(REAL_SESSION_FILE)).toBe(false);
  });

  it('exits 0 silently when payload has no session_id', async () => {
    const code = await runHook(
      { hook_event_name: 'SessionStart' },
      { BOARD_TASK_ID: '42', BOARD_SESSION_MARKER_FILE: sessionFile }
    );
    expect(code).toBe(0);
    expect(existsSync(sessionFile)).toBe(false);
  });

  it('exits 0 silently when stdin is invalid JSON', async () => {
    return new Promise<void>((resolveFn) => {
      const proc = spawn('node', [SCRIPT], {
        env: buildHookEnv({ BOARD_TASK_ID: '42', BOARD_SESSION_MARKER_FILE: sessionFile }),
      });
      proc.stdin.write('not-json');
      proc.stdin.end();
      proc.on('exit', (code) => {
        expect(code).toBe(0);
        expect(existsSync(sessionFile)).toBe(false);
        resolveFn();
      });
    });
  });

  it('does not contaminate the real marker file even when the parent env has BOARD_* set (regression: #690)', async () => {
    const originalTaskId = process.env.BOARD_TASK_ID;
    const originalMarker = process.env.BOARD_SESSION_MARKER_FILE;
    // Uses a task id unique to this file (not shared with the other hook test files'
    // regression tests) so parallel test-file execution can't race on the same real path.
    process.env.BOARD_TASK_ID = '62701';
    delete process.env.BOARD_SESSION_MARKER_FILE;
    try {
      const code = await runHook({ session_id: 'abc' }, {});
      expect(code).toBe(0);
      expect(existsSync(REAL_SESSION_FILE)).toBe(false);
      expect(existsSync('/tmp/board-main-session-62701')).toBe(false);
    } finally {
      if (originalTaskId === undefined) delete process.env.BOARD_TASK_ID;
      else process.env.BOARD_TASK_ID = originalTaskId;
      if (originalMarker === undefined) delete process.env.BOARD_SESSION_MARKER_FILE;
      else process.env.BOARD_SESSION_MARKER_FILE = originalMarker;
    }
  });
});
