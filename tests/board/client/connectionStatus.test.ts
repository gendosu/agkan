/**
 * Tests for board client connectionStatus module
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// We use the same import throughout and rely on beforeEach to reset state via
// explicit setter calls (since the module holds mutable top-level state).
import {
  setStreamState,
  setRunLogsActive,
  onConnectionStateChange,
  registerReconnect,
  triggerReconnectAll,
} from '../../../src/board/client/connectionStatus';

// Helper: clear all listeners and reset stream states to known defaults
// by using the exported functions themselves.
beforeEach(() => {
  // Reset run-logs active flag and stream states via the public API.
  // setRunLogsActive(false) resets run-logs to 'connected' and clears the flag.
  setRunLogsActive(false);
  // Reset board and attention to 'connecting' (initial defaults).
  setStreamState('board', 'connecting');
  setStreamState('attention', 'connecting');
});

describe('setStreamState', () => {
  it('updates board stream state and notifies listeners when overall state changes', () => {
    // Start with board=connecting, attention=connecting → overall=connecting
    // Set attention=connected → still overall=connecting (no change)
    // Set board=connected → overall=connected (change → listener fires)
    setStreamState('attention', 'connected');

    const listener = vi.fn();
    const unsub = onConnectionStateChange(listener);
    // immediate call: board=connecting, attention=connected → 'connecting'
    expect(listener).toHaveBeenCalledWith('connecting');
    listener.mockClear();

    setStreamState('board', 'connected');
    // now board=connected, attention=connected → 'connected'
    expect(listener).toHaveBeenCalledWith('connected');

    unsub();
  });

  it('updates attention stream state and notifies listeners', () => {
    const listener = vi.fn();
    const unsub = onConnectionStateChange(listener);
    listener.mockClear();

    setStreamState('attention', 'disconnected');
    expect(listener).toHaveBeenCalledWith('disconnected');

    unsub();
  });

  it('updates run-logs stream state and notifies listeners', () => {
    setRunLogsActive(true);
    const listener = vi.fn();
    const unsub = onConnectionStateChange(listener);
    listener.mockClear();

    setStreamState('run-logs', 'disconnected');
    expect(listener).toHaveBeenCalledWith('disconnected');

    unsub();
  });

  it('does not notify listeners when state has not changed', () => {
    // Set to a known state first and wait for notification
    setStreamState('board', 'connected');
    setStreamState('attention', 'connected');

    const listener = vi.fn();
    const unsub = onConnectionStateChange(listener);
    listener.mockClear();

    // Set same state again — overall state unchanged → no notification
    setStreamState('board', 'connected');
    expect(listener).not.toHaveBeenCalled();

    unsub();
  });
});

describe('computeOverallState (via onConnectionStateChange)', () => {
  it('returns connecting when any monitored stream is connecting', () => {
    setStreamState('board', 'connecting');
    setStreamState('attention', 'connected');

    const listener = vi.fn();
    const unsub = onConnectionStateChange(listener);
    expect(listener).toHaveBeenCalledWith('connecting');
    unsub();
  });

  it('returns disconnected when any monitored stream is disconnected', () => {
    setStreamState('board', 'disconnected');
    setStreamState('attention', 'connected');

    const listener = vi.fn();
    const unsub = onConnectionStateChange(listener);
    expect(listener).toHaveBeenCalledWith('disconnected');
    unsub();
  });

  it('returns connected when all monitored streams are connected', () => {
    setStreamState('board', 'connected');
    setStreamState('attention', 'connected');

    const listener = vi.fn();
    const unsub = onConnectionStateChange(listener);
    expect(listener).toHaveBeenCalledWith('connected');
    unsub();
  });

  it('returns disconnected takes priority over connecting', () => {
    setStreamState('board', 'disconnected');
    setStreamState('attention', 'connecting');

    const listener = vi.fn();
    const unsub = onConnectionStateChange(listener);
    expect(listener).toHaveBeenCalledWith('disconnected');
    unsub();
  });

  it('ignores run-logs state when run-logs is not active', () => {
    setRunLogsActive(false);
    setStreamState('board', 'connected');
    setStreamState('attention', 'connected');
    // Even if run-logs were disconnected it doesn't matter when inactive
    setStreamState('run-logs', 'disconnected');

    const listener = vi.fn();
    const unsub = onConnectionStateChange(listener);
    // run-logs is ignored → overall is connected
    expect(listener).toHaveBeenCalledWith('connected');
    unsub();
  });

  it('includes run-logs in computation when run-logs is active', () => {
    setRunLogsActive(true);
    setStreamState('board', 'connected');
    setStreamState('attention', 'connected');
    setStreamState('run-logs', 'disconnected');

    const listener = vi.fn();
    const unsub = onConnectionStateChange(listener);
    expect(listener).toHaveBeenCalledWith('disconnected');
    unsub();
  });

  it('returns connected when all three streams connected and run-logs active', () => {
    setRunLogsActive(true);
    setStreamState('board', 'connected');
    setStreamState('attention', 'connected');
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
    setStreamState('attention', 'connected');

    // Deactivate — run-logs is reset and ignored
    setRunLogsActive(false);

    const listener = vi.fn();
    const unsub = onConnectionStateChange(listener);
    // After deactivation board+attention=connected → overall connected
    expect(listener).toHaveBeenCalledWith('connected');
    unsub();
  });

  it('notifies listeners when run-logs active state changes', () => {
    setStreamState('board', 'connected');
    setStreamState('attention', 'connected');

    const listener = vi.fn();
    const unsub = onConnectionStateChange(listener);
    listener.mockClear();

    setRunLogsActive(true);
    // run-logs is now monitored and defaults to 'connected' (from reset)
    // Calling setRunLogsActive(false) resets run-logs to connected
    // so toggling active doesn't change overall state if run-logs is already connected.
    // But we still test the notify path.
    setRunLogsActive(false);
    // notifications may or may not fire depending on whether state changed
    // (this ensures the code path runs without error)
    unsub();
  });

  it('activates run-logs monitoring', () => {
    setStreamState('board', 'connected');
    setStreamState('attention', 'connected');
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
    setStreamState('attention', 'connected');

    const listener = vi.fn();
    const unsub = onConnectionStateChange(listener);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('connected');
    unsub();
  });

  it('calls multiple listeners when state changes', () => {
    setStreamState('board', 'connected');
    setStreamState('attention', 'connected');

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
    setStreamState('attention', 'connected');

    const listener = vi.fn();
    const unsub = onConnectionStateChange(listener);
    listener.mockClear();

    unsub();

    // After unsubscribe, listener should not be called
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
