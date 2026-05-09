import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'child_process';
import { unlinkSync, existsSync } from 'fs';
import { resolve } from 'path';

const SCRIPT = resolve(__dirname, '../../src/hooks/hook-session-start.mjs');

function runHook(stdinJson: unknown, env: Record<string, string>): Promise<number> {
  return new Promise((resolveFn) => {
    const proc = spawn('node', [SCRIPT], { env: { ...process.env, ...env } });
    proc.stdin.write(JSON.stringify(stdinJson));
    proc.stdin.end();
    proc.on('exit', (code) => resolveFn(code ?? 0));
  });
}

describe('hook-session-start.mjs', () => {
  const sessionFile = '/tmp/board-main-session-42';

  afterEach(() => {
    try {
      unlinkSync(sessionFile);
    } catch {
      // file may not exist
    }
  });

  it('exits 0 immediately when BOARD_TASK_ID is not set', async () => {
    const code = await runHook({ session_id: 'abc' }, {});
    expect(code).toBe(0);
    expect(existsSync(sessionFile)).toBe(false);
  });

  it('writes session_id to /tmp/board-main-session-<taskId>', async () => {
    const code = await runHook(
      { session_id: 'test-session-123', hook_event_name: 'SessionStart' },
      { BOARD_TASK_ID: '42' }
    );
    expect(code).toBe(0);
    expect(existsSync(sessionFile)).toBe(true);
    const { readFileSync } = await import('fs');
    expect(readFileSync(sessionFile, 'utf-8')).toBe('test-session-123');
  });

  it('exits 0 silently when payload has no session_id', async () => {
    const code = await runHook({ hook_event_name: 'SessionStart' }, { BOARD_TASK_ID: '42' });
    expect(code).toBe(0);
    expect(existsSync(sessionFile)).toBe(false);
  });

  it('exits 0 silently when stdin is invalid JSON', async () => {
    return new Promise<void>((resolveFn) => {
      const proc = spawn('node', [SCRIPT], {
        env: { ...process.env, BOARD_TASK_ID: '42' },
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
});
