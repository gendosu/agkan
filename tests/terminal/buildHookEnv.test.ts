import { describe, it, expect } from 'vitest';
import { buildHookEnv } from '../../src/terminal/buildHookEnv';

describe('buildHookEnv', () => {
  it('returns empty object when boardApiUrl is null', () => {
    expect(buildHookEnv(5, null, 'run')).toEqual({});
  });

  it('returns empty object when boardApiUrl is empty string', () => {
    expect(buildHookEnv(5, '', 'run')).toEqual({});
  });

  it('injects BOARD_TASK_ID / BOARD_API_URL / BOARD_HOOK_TOKEN and BOARD_TARGET_STATUS=review for pr', () => {
    const env = buildHookEnv(5, 'http://127.0.0.1:9999', 'pr');
    expect(env.BOARD_TASK_ID).toBe('5');
    expect(env.BOARD_API_URL).toBe('http://127.0.0.1:9999');
    expect(env.BOARD_HOOK_TOKEN).toEqual(expect.any(String));
    expect(env.BOARD_TARGET_STATUS).toBe('review');
  });

  it('injects BOARD_TARGET_STATUS=done for run', () => {
    expect(buildHookEnv(5, 'http://127.0.0.1:9999', 'run').BOARD_TARGET_STATUS).toBe('done');
  });

  it('injects BOARD_TARGET_STATUS=done for direct', () => {
    expect(buildHookEnv(5, 'http://127.0.0.1:9999', 'direct').BOARD_TARGET_STATUS).toBe('done');
  });

  it('omits BOARD_TARGET_STATUS for planning but keeps the other vars', () => {
    const env = buildHookEnv(5, 'http://127.0.0.1:9999', 'planning');
    expect(env.BOARD_TARGET_STATUS).toBeUndefined();
    expect(env.BOARD_TASK_ID).toBe('5');
    expect(env.BOARD_API_URL).toBe('http://127.0.0.1:9999');
  });
});
