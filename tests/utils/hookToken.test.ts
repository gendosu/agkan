import { describe, it, expect } from 'vitest';
import { getHookToken, verifyHookToken } from '../../src/utils/hookToken';

describe('hookToken', () => {
  it('returns the same token for repeated getHookToken calls', () => {
    const t1 = getHookToken();
    const t2 = getHookToken();
    expect(t1).toBe(t2);
    expect(t1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('verifyHookToken returns true for the current token', () => {
    expect(verifyHookToken(getHookToken())).toBe(true);
  });

  it('verifyHookToken returns false for incorrect tokens', () => {
    expect(verifyHookToken('invalid')).toBe(false);
    expect(verifyHookToken('')).toBe(false);
  });
});
