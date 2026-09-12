import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ensureGrokHookSettings } from '../../src/hooks/grokHookSettings';

describe('grokHookSettings', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'grok-hooks-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('creates agkan-board-stop.json with a Stop entry when none exists', async () => {
    const path = await ensureGrokHookSettings(tmp);
    expect(existsSync(path)).toBe(true);
    expect(path).toBe(join(tmp, 'agkan-board-stop.json'));
    const json = JSON.parse(readFileSync(path, 'utf-8'));
    expect(json.hooks.Stop[0].hooks[0].type).toBe('command');
    expect(json.hooks.Stop[0].hooks[0].command).toMatch(/hook-grok-notify\.mjs/);
    expect(json.hooks.Stop[0].hooks[0].command).toMatch(/^node "/);
  });

  it('does not touch other json files in the same directory', async () => {
    const otherFile = join(tmp, 'herdr.json');
    const otherContent = JSON.stringify({ hooks: { SessionStart: [{ command: 'foo' }] } });
    writeFileSync(otherFile, otherContent, 'utf-8');

    await ensureGrokHookSettings(tmp);

    expect(readFileSync(otherFile, 'utf-8')).toBe(otherContent);
    const stopFile = join(tmp, 'agkan-board-stop.json');
    expect(existsSync(stopFile)).toBe(true);
  });

  it('returns the same path on subsequent calls', async () => {
    const p1 = await ensureGrokHookSettings(tmp);
    const p2 = await ensureGrokHookSettings(tmp);
    expect(p1).toBe(p2);
  });

  it('does not rewrite the file when nothing changed', async () => {
    const path = await ensureGrokHookSettings(tmp);
    const firstWrite = readFileSync(path, 'utf-8');
    await ensureGrokHookSettings(tmp);
    expect(readFileSync(path, 'utf-8')).toBe(firstWrite);
  });

  it('quotes hook script paths containing spaces', async () => {
    vi.resetModules();
    vi.doMock('path', async (importOriginal) => {
      const actual = await importOriginal();
      return { ...actual, resolve: () => '/path with space/hook-grok-notify.mjs' };
    });
    try {
      const { ensureGrokHookSettings: ensureWithSpacedPath } = await import('../../src/hooks/grokHookSettings');
      const path = await ensureWithSpacedPath(tmp);
      const json = JSON.parse(readFileSync(path, 'utf-8'));
      expect(json.hooks.Stop[0].hooks[0].command).toBe('node "/path with space/hook-grok-notify.mjs"');
    } finally {
      vi.doUnmock('path');
      vi.resetModules();
    }
  });
});
