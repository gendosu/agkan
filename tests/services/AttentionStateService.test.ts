import { describe, it, expect, vi } from 'vitest';
import { AttentionStateService } from '../../src/services/AttentionStateService';

describe('AttentionStateService', () => {
  it('returns false for unknown taskId', () => {
    const svc = new AttentionStateService();
    expect(svc.getAttention(1)).toBe(false);
  });

  it('records attention state per taskId', () => {
    const svc = new AttentionStateService();
    svc.setAttention(1, true);
    svc.setAttention(2, false);
    expect(svc.getAttention(1)).toBe(true);
    expect(svc.getAttention(2)).toBe(false);
  });

  it('notifies subscribers on state change', () => {
    const svc = new AttentionStateService();
    const cb = vi.fn();
    svc.subscribe(cb);
    svc.setAttention(1, true);
    expect(cb).toHaveBeenCalledWith({ taskId: 1, needsAttention: true });
  });

  it('skips notification when state does not change', () => {
    const svc = new AttentionStateService();
    svc.setAttention(1, true);
    const cb = vi.fn();
    svc.subscribe(cb);
    svc.setAttention(1, true);
    expect(cb).not.toHaveBeenCalled();
  });

  it('listAttentionTasks returns only taskIds with needsAttention=true', () => {
    const svc = new AttentionStateService();
    svc.setAttention(1, true);
    svc.setAttention(2, false);
    svc.setAttention(3, true);
    expect(svc.listAttentionTasks().sort()).toEqual([1, 3]);
  });

  it('clearTask removes state and notifies if was true', () => {
    const svc = new AttentionStateService();
    svc.setAttention(1, true);
    const cb = vi.fn();
    svc.subscribe(cb);
    svc.clearTask(1);
    expect(svc.getAttention(1)).toBe(false);
    expect(cb).toHaveBeenCalledWith({ taskId: 1, needsAttention: false });
  });

  it('clearTask is silent when no state exists', () => {
    const svc = new AttentionStateService();
    const cb = vi.fn();
    svc.subscribe(cb);
    svc.clearTask(99);
    expect(cb).not.toHaveBeenCalled();
  });

  it('subscribe returns an unsubscribe function', () => {
    const svc = new AttentionStateService();
    const cb = vi.fn();
    const unsub = svc.subscribe(cb);
    unsub();
    svc.setAttention(1, true);
    expect(cb).not.toHaveBeenCalled();
  });
});
