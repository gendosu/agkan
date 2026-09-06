import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ensureAgyHookSettings } from '../../src/hooks/agyHookSettings';

describe('agyHookSettings', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'agy-hooks-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('creates hooks.json with a board-stop Stop entry when none exists', async () => {
    const path = await ensureAgyHookSettings(tmp);
    expect(existsSync(path)).toBe(true);
    const json = JSON.parse(readFileSync(path, 'utf-8'));
    expect(json['board-stop'].Stop[0].type).toBe('command');
    expect(json['board-stop'].Stop[0].command).toMatch(/hook-agy-notify\.mjs/);
    expect(json['board-stop'].Stop[0].command).toMatch(/^node "/);
  });

  it('preserves other named hooks already in the file', async () => {
    const path = join(tmp, 'hooks.json');
    writeFileSync(
      path,
      JSON.stringify({
        'lint-checker': { PostToolUse: [{ matcher: 'run_command', hooks: [{ command: './lint.sh' }] }] },
      }),
      'utf-8'
    );

    await ensureAgyHookSettings(tmp);
    const json = JSON.parse(readFileSync(path, 'utf-8'));
    expect(json['lint-checker']).toEqual({
      PostToolUse: [{ matcher: 'run_command', hooks: [{ command: './lint.sh' }] }],
    });
    expect(json['board-stop'].Stop[0].command).toMatch(/hook-agy-notify\.mjs/);
  });

  it('overwrites a stale board-stop entry without touching other keys', async () => {
    const path = join(tmp, 'hooks.json');
    writeFileSync(
      path,
      JSON.stringify({
        'board-stop': { Stop: [{ type: 'command', command: 'node /old/path/hook-agy-notify.mjs' }] },
        other: { PreInvocation: [{ type: 'command', command: './x.sh' }] },
      }),
      'utf-8'
    );

    await ensureAgyHookSettings(tmp);
    const json = JSON.parse(readFileSync(path, 'utf-8'));
    expect(json['board-stop'].Stop[0].command).not.toContain('/old/path/');
    expect(json.other).toEqual({ PreInvocation: [{ type: 'command', command: './x.sh' }] });
  });

  it('recovers from an invalid JSON file instead of failing', async () => {
    const path = join(tmp, 'hooks.json');
    writeFileSync(path, 'not json', 'utf-8');

    const resultPath = await ensureAgyHookSettings(tmp);
    const json = JSON.parse(readFileSync(resultPath, 'utf-8'));
    expect(json['board-stop'].Stop[0].command).toMatch(/hook-agy-notify\.mjs/);
  });

  it('returns the same path on subsequent calls', async () => {
    const p1 = await ensureAgyHookSettings(tmp);
    const p2 = await ensureAgyHookSettings(tmp);
    expect(p1).toBe(p2);
  });

  it('does not rewrite the file when nothing changed', async () => {
    const path = await ensureAgyHookSettings(tmp);
    const firstWrite = readFileSync(path, 'utf-8');
    await ensureAgyHookSettings(tmp);
    expect(readFileSync(path, 'utf-8')).toBe(firstWrite);
  });
});
