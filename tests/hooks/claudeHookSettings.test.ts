import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ensureBoardHookSettings } from '../../src/hooks/claudeHookSettings';

describe('claudeHookSettings', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'board-hooks-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('creates a settings file with hook entries', async () => {
    const path = await ensureBoardHookSettings(tmp);
    expect(existsSync(path)).toBe(true);
    const json = JSON.parse(readFileSync(path, 'utf-8'));
    expect(json.hooks.PreToolUse[0].matcher).toBe('AskUserQuestion');
    expect(json.hooks.PostToolUse[0].matcher).toBe('AskUserQuestion');
    expect(json.hooks.Stop).toBeDefined();
  });

  it('hook commands include hook script absolute paths', async () => {
    const path = await ensureBoardHookSettings(tmp);
    const json = JSON.parse(readFileSync(path, 'utf-8'));
    const preCmd = json.hooks.PreToolUse[0].hooks[0].command;
    expect(preCmd).toMatch(/hook-attention\.mjs/);
    expect(preCmd).toMatch(/^node \//);
  });

  it('returns the same path on subsequent calls', async () => {
    const p1 = await ensureBoardHookSettings(tmp);
    const p2 = await ensureBoardHookSettings(tmp);
    expect(p1).toBe(p2);
  });
});
