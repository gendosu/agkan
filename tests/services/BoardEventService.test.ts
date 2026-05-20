import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BoardEventService } from '../../src/services/BoardEventService';

describe('BoardEventService', () => {
  let service: BoardEventService;

  beforeEach(() => {
    service = new BoardEventService();
  });

  it('calls listener when notify is called', () => {
    const listener = vi.fn();
    service.subscribe(listener);
    service.notify();
    expect(listener).toHaveBeenCalledOnce();
  });

  it('calls multiple listeners', () => {
    const l1 = vi.fn();
    const l2 = vi.fn();
    service.subscribe(l1);
    service.subscribe(l2);
    service.notify();
    expect(l1).toHaveBeenCalledOnce();
    expect(l2).toHaveBeenCalledOnce();
  });

  it('does not call listener after unsubscribe', () => {
    const listener = vi.fn();
    const unsub = service.subscribe(listener);
    unsub();
    service.notify();
    expect(listener).not.toHaveBeenCalled();
  });

  it('returns listener count', () => {
    expect(service.listenerCount()).toBe(0);
    const unsub = service.subscribe(vi.fn());
    expect(service.listenerCount()).toBe(1);
    unsub();
    expect(service.listenerCount()).toBe(0);
  });
});
