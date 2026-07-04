import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, statSync, chmodSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  makeExecutable,
  resolveSpawnHelperPath,
  findSpawnHelperInPackage,
} from '../../src/terminal/ensureSpawnHelperExecutable';

const EXEC_BITS = 0o111;

describe('makeExecutable', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'spawn-helper-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('adds execute bits to a non-executable file and reports it changed', () => {
    const file = join(dir, 'spawn-helper');
    writeFileSync(file, 'binary');
    chmodSync(file, 0o644);

    const changed = makeExecutable(file);

    expect(changed).toBe(true);
    expect(statSync(file).mode & EXEC_BITS).toBe(EXEC_BITS);
  });

  it('leaves an already-executable file unchanged and reports no change', () => {
    const file = join(dir, 'spawn-helper');
    writeFileSync(file, 'binary');
    chmodSync(file, 0o755);

    const changed = makeExecutable(file);

    expect(changed).toBe(false);
    expect(statSync(file).mode & EXEC_BITS).toBe(EXEC_BITS);
  });

  it('does not throw and reports no change for a non-existent path', () => {
    const file = join(dir, 'does-not-exist');

    expect(() => makeExecutable(file)).not.toThrow();
    expect(makeExecutable(file)).toBe(false);
  });
});

describe('findSpawnHelperInPackage', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'node-pty-pkg-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('prefers build/Release over prebuilds, matching node-pty own load order', () => {
    mkdirSync(join(dir, 'build', 'Release'), { recursive: true });
    writeFileSync(join(dir, 'build', 'Release', 'spawn-helper'), 'compiled');
    mkdirSync(join(dir, 'prebuilds', 'linux-x64'), { recursive: true });
    writeFileSync(join(dir, 'prebuilds', 'linux-x64', 'spawn-helper'), 'prebuilt');

    const found = findSpawnHelperInPackage(dir, ['build/Release', 'build/Debug', 'prebuilds/linux-x64']);

    expect(found).toBe(join(dir, 'build', 'Release', 'spawn-helper'));
  });

  it('falls back to prebuilds when there is no compiled build output (e.g. macOS via pnpm)', () => {
    mkdirSync(join(dir, 'prebuilds', 'darwin-arm64'), { recursive: true });
    writeFileSync(join(dir, 'prebuilds', 'darwin-arm64', 'spawn-helper'), 'prebuilt');

    const found = findSpawnHelperInPackage(dir, ['build/Release', 'build/Debug', 'prebuilds/darwin-arm64']);

    expect(found).toBe(join(dir, 'prebuilds', 'darwin-arm64', 'spawn-helper'));
  });

  it('returns null when spawn-helper exists nowhere in the search dirs', () => {
    const found = findSpawnHelperInPackage(dir, ['build/Release', 'build/Debug', 'prebuilds/linux-x64']);

    expect(found).toBeNull();
  });
});

describe('resolveSpawnHelperPath', () => {
  it('resolves node-pty spawn-helper when this environment has a native build for it', () => {
    // node-pty uses conpty/winpty on win32 (no spawn-helper), and some CI
    // environments install node-pty without a compiled or bundled native
    // addon for the runner's platform (this project's tests mock node-pty
    // entirely, see PtySessionService.test.ts, so real PTY spawning is never
    // exercised there). resolveSpawnHelperPath() returning null in either
    // case is expected, not a regression; findSpawnHelperInPackage above
    // already covers the lookup-order logic with fixtures.
    const helper = resolveSpawnHelperPath();
    if (helper === null) return;

    expect(helper.endsWith('spawn-helper')).toBe(true);
    expect(existsSync(helper)).toBe(true);
  });
});
