/**
 * Tests for Claude settings.local.json integration
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { installSessionStartHook } from '../../../src/cli/integrations/claudeSettings';

const HOOK_COMMAND = 'agkan context --hook';
const MATCHER = 'startup|resume|clear|compact';

describe('installSessionStartHook', () => {
  let tmpDir: string;
  let settingsPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join('/tmp', 'agkan-claude-settings-test-'));
    settingsPath = path.join(tmpDir, '.claude', 'settings.local.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should create .claude directory when missing', () => {
    const result = installSessionStartHook(tmpDir);

    expect(result.status).toBe('created');
    expect(fs.existsSync(path.join(tmpDir, '.claude'))).toBe(true);
  });

  it('should create settings.local.json with agkan hook when file is missing', () => {
    const result = installSessionStartHook(tmpDir);

    expect(result.status).toBe('created');
    expect(fs.existsSync(settingsPath)).toBe(true);

    const config = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    expect(config.hooks.SessionStart).toHaveLength(1);
    expect(config.hooks.SessionStart[0].matcher).toBe(MATCHER);
    expect(config.hooks.SessionStart[0].hooks[0]).toEqual({ type: 'command', command: HOOK_COMMAND });
  });

  it('should merge into existing settings.local.json without touching other keys', () => {
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    const existing = { permissions: { allow: ['Bash(ls:*)'] } };
    fs.writeFileSync(settingsPath, JSON.stringify(existing, null, 2));

    const result = installSessionStartHook(tmpDir);

    expect(result.status).toBe('updated');
    const config = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    expect(config.permissions.allow).toEqual(['Bash(ls:*)']);
    expect(config.hooks.SessionStart[0].hooks[0].command).toBe(HOOK_COMMAND);
  });

  it('should append agkan hook when SessionStart already has other entries', () => {
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    const existing = {
      hooks: {
        SessionStart: [{ matcher: 'startup', hooks: [{ type: 'command', command: 'echo hi' }] }],
      },
    };
    fs.writeFileSync(settingsPath, JSON.stringify(existing, null, 2));

    const result = installSessionStartHook(tmpDir);

    expect(result.status).toBe('updated');
    const config = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    expect(config.hooks.SessionStart).toHaveLength(2);
    expect(config.hooks.SessionStart[0].hooks[0].command).toBe('echo hi');
    expect(config.hooks.SessionStart[1].hooks[0].command).toBe(HOOK_COMMAND);
  });

  it('should be idempotent when agkan hook already exists', () => {
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    const existing = {
      hooks: {
        SessionStart: [{ matcher: MATCHER, hooks: [{ type: 'command', command: HOOK_COMMAND }] }],
      },
    };
    const original = JSON.stringify(existing, null, 2);
    fs.writeFileSync(settingsPath, original);

    const result = installSessionStartHook(tmpDir);

    expect(result.status).toBe('skipped');
    expect(fs.readFileSync(settingsPath, 'utf8')).toBe(original);
  });

  it('should handle empty hooks property', () => {
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    fs.writeFileSync(settingsPath, JSON.stringify({ hooks: {} }, null, 2));

    const result = installSessionStartHook(tmpDir);

    expect(result.status).toBe('updated');
    const config = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    expect(config.hooks.SessionStart[0].hooks[0].command).toBe(HOOK_COMMAND);
  });

  it('should preserve tab indentation when existing file uses tabs', () => {
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    const existing = '{\n\t"permissions": {\n\t\t"allow": []\n\t}\n}\n';
    fs.writeFileSync(settingsPath, existing);

    installSessionStartHook(tmpDir);

    const written = fs.readFileSync(settingsPath, 'utf8');
    expect(written).toMatch(/^\{\n\t"/);
  });

  it('should preserve 4-space indentation when existing file uses 4 spaces', () => {
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    const existing = '{\n    "permissions": {\n        "allow": []\n    }\n}\n';
    fs.writeFileSync(settingsPath, existing);

    installSessionStartHook(tmpDir);

    const written = fs.readFileSync(settingsPath, 'utf8');
    expect(written).toMatch(/^\{\n {4}"/);
  });

  it('should return error result on unparseable JSON without throwing', () => {
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    fs.writeFileSync(settingsPath, '{ not valid json');

    const result = installSessionStartHook(tmpDir);

    expect(result.status).toBe('error');
    expect(result.message).toMatch(/parse|JSON/i);
  });
});
