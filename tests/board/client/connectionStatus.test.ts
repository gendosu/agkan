/**
 * Tests for board client connectionStatus module
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  setStreamState,
  setRunLogsActive,
  onConnectionStateChange,
  registerReconnect,
  triggerReconnectAll,
} from '../../../src/board/client/connectionStatus';

beforeEach(() => {
  setRunLogsActive(false);
  setStreamState('board', 'connecting');
});

describe('setStreamState', () => {
  it('updates board stream state and notifies listeners when overall state changes', () => {
    setStreamState('board', 'connecting');

    const listener = vi.fn();
    const unsub = onConnectionStateChange(listener);
    expect(listener).toHaveBeenCalledWith('connecting');
    listener.mockClear();

    setStreamState('board', 'connected');
    expect(listener).toHaveBeenCalledWith('connected');

    unsub();
  });

  it('updates run-logs stream state and notifies listeners', () => {
    setRunLogsActive(true);
    setStreamState('board', 'connected');
    const listener = vi.fn();
    const unsub = onConnectionStateChange(listener);
    listener.mockClear();

    setStreamState('run-logs', 'disconnected');
    expect(listener).toHaveBeenCalledWith('disconnected');

    unsub();
  });

  it('does not notify listeners when state has not changed', () => {
    setStreamState('board', 'connected');

    const listener = vi.fn();
    const unsub = onConnectionStateChange(listener);
    listener.mockClear();

    setStreamState('board', 'connected');
    expect(listener).not.toHaveBeenCalled();

    unsub();
  });
});

describe('computeOverallState (via onConnectionStateChange)', () => {
  it('returns connecting when board is connecting', () => {
    setStreamState('board', 'connecting');

    const listener = vi.fn();
    const unsub = onConnectionStateChange(listener);
    expect(listener).toHaveBeenCalledWith('connecting');
    unsub();
  });

  it('returns disconnected when board is disconnected', () => {
    setStreamState('board', 'disconnected');

    const listener = vi.fn();
    const unsub = onConnectionStateChange(listener);
    expect(listener).toHaveBeenCalledWith('disconnected');
    unsub();
  });

  it('returns connected when board is connected', () => {
    setStreamState('board', 'connected');

    const listener = vi.fn();
    const unsub = onConnectionStateChange(listener);
    expect(listener).toHaveBeenCalledWith('connected');
    unsub();
  });

  it('ignores run-logs state when run-logs is not active', () => {
    setRunLogsActive(false);
    setStreamState('board', 'connected');
    setStreamState('run-logs', 'disconnected');

    const listener = vi.fn();
    const unsub = onConnectionStateChange(listener);
    expect(listener).toHaveBeenCalledWith('connected');
    unsub();
  });

  it('includes run-logs in computation when run-logs is active', () => {
    setRunLogsActive(true);
    setStreamState('board', 'connected');
    setStreamState('run-logs', 'disconnected');

    const listener = vi.fn();
    const unsub = onConnectionStateChange(listener);
    expect(listener).toHaveBeenCalledWith('disconnected');
    unsub();
  });

  it('returns connected when board and run-logs are connected and run-logs active', () => {
    setRunLogsActive(true);
    setStreamState('board', 'connected');
    setStreamState('run-logs', 'connected');

    const listener = vi.fn();
    const unsub = onConnectionStateChange(listener);
    expect(listener).toHaveBeenCalledWith('connected');
    unsub();
  });
});

describe('setRunLogsActive', () => {
  it('resets run-logs stream state to connected when deactivated', () => {
    setRunLogsActive(true);
    setStreamState('run-logs', 'disconnected');
    setStreamState('board', 'connected');

    setRunLogsActive(false);

    const listener = vi.fn();
    const unsub = onConnectionStateChange(listener);
    expect(listener).toHaveBeenCalledWith('connected');
    unsub();
  });

  it('notifies listeners when run-logs active state changes', () => {
    setStreamState('board', 'connected');

    const listener = vi.fn();
    const unsub = onConnectionStateChange(listener);
    listener.mockClear();

    setRunLogsActive(true);
    setRunLogsActive(false);
    unsub();
  });

  it('activates run-logs monitoring', () => {
    setStreamState('board', 'connected');
    setRunLogsActive(true);
    setStreamState('run-logs', 'connecting');

    const listener = vi.fn();
    const unsub = onConnectionStateChange(listener);
    expect(listener).toHaveBeenCalledWith('connecting');
    unsub();
  });
});

describe('onConnectionStateChange', () => {
  it('calls listener immediately with current state upon subscription', () => {
    setStreamState('board', 'connected');

    const listener = vi.fn();
    const unsub = onConnectionStateChange(listener);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('connected');
    unsub();
  });

  it('calls multiple listeners when state changes', () => {
    setStreamState('board', 'connected');

    const listener1 = vi.fn();
    const listener2 = vi.fn();
    const unsub1 = onConnectionStateChange(listener1);
    const unsub2 = onConnectionStateChange(listener2);
    listener1.mockClear();
    listener2.mockClear();

    setStreamState('board', 'disconnected');
    expect(listener1).toHaveBeenCalledWith('disconnected');
    expect(listener2).toHaveBeenCalledWith('disconnected');

    unsub1();
    unsub2();
  });

  it('returns an unsubscribe function that removes the listener', () => {
    setStreamState('board', 'connected');

    const listener = vi.fn();
    const unsub = onConnectionStateChange(listener);
    listener.mockClear();

    unsub();

    setStreamState('board', 'disconnected');
    expect(listener).not.toHaveBeenCalled();
  });

  it('unsubscribe is idempotent (calling twice does not throw)', () => {
    const listener = vi.fn();
    const unsub = onConnectionStateChange(listener);
    expect(() => {
      unsub();
      unsub();
    }).not.toThrow();
  });
});

describe('registerReconnect', () => {
  it('registers a reconnect callback', () => {
    const callback = vi.fn();
    const unsub = registerReconnect(callback);

    triggerReconnectAll();
    expect(callback).toHaveBeenCalledTimes(1);

    unsub();
  });

  it('registers multiple reconnect callbacks and triggers all', () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const unsub1 = registerReconnect(cb1);
    const unsub2 = registerReconnect(cb2);

    triggerReconnectAll();
    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);

    unsub1();
    unsub2();
  });

  it('returns an unsubscribe function that removes the reconnect callback', () => {
    const callback = vi.fn();
    const unsub = registerReconnect(callback);
    unsub();

    triggerReconnectAll();
    expect(callback).not.toHaveBeenCalled();
  });

  it('unsubscribe is idempotent (calling twice does not throw)', () => {
    const callback = vi.fn();
    const unsub = registerReconnect(callback);
    expect(() => {
      unsub();
      unsub();
    }).not.toThrow();
  });
});

describe('triggerReconnectAll', () => {
  it('does nothing when no reconnect callbacks are registered', () => {
    expect(() => triggerReconnectAll()).not.toThrow();
  });

  it('calls all registered reconnect callbacks', () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const unsub1 = registerReconnect(cb1);
    const unsub2 = registerReconnect(cb2);

    triggerReconnectAll();
    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);

    unsub1();
    unsub2();
  });
});
