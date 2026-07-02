import { describe, it, expect } from 'vitest';
import { runTargetStatus } from '../../src/utils/runTargetStatus';

describe('runTargetStatus', () => {
  it('returns review for pr', () => {
    expect(runTargetStatus('pr')).toBe('review');
  });
  it('returns done for run', () => {
    expect(runTargetStatus('run')).toBe('done');
  });
  it('returns done for direct', () => {
    expect(runTargetStatus('direct')).toBe('done');
  });
  it('returns null for planning', () => {
    expect(runTargetStatus('planning')).toBeNull();
  });
});
