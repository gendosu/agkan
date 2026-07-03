/**
 * @vitest-environment jsdom
 *
 * Tests for board client boardStream module (SSE singleton wrapper)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- MockEventSource for SSE tests ---
// Extends the pattern used in boardPolling.test.ts: also invokes the
// `onerror` property assignment (boardStream.ts assigns `es.onerror = fn`
// rather than using addEventListener('error', ...)).

class MockEventSource {
  url: string;
  readyState = 1;
  onerror: ((ev: Event) => void) | null = null;
  close = vi.fn();
  private _handlers: Map<string, EventListener[]> = new Map();
  static _instances: MockEventSource[] = [];

  constructor(url: string) {
    this.url = url;
    MockEventSource._instances.push(this);
  }

  addEventListener(type: string, handler: EventListener): void {
    if (!this._handlers.has(type)) this._handlers.set(type, []);
    this._handlers.get(type)!.push(handler);
  }

  dispatchEvent(type: string, data?: unknown): void {
    const event = new MessageEvent(type, { data: JSON.stringify(data ?? {}) });
    (this._handlers.get(type) ?? []).forEach((h) => h(event));
  }

  dispatchRaw(type: string, rawData: string): void {
    const event = new MessageEvent(type, { data: rawData });
    (this._handlers.get(type) ?? []).forEach((h) => h(event));
  }

  simulateOpen(): void {
    (this._handlers.get('open') ?? []).forEach((h) => h(new Event('open')));
  }

  simulateError(): void {
    this.readyState = 2;
    const event = new Event('error');
    (this._handlers.get('error') ?? []).forEach((h) => h(event));
    this.onerror?.(event);
  }

  static reset(): void {
    MockEventSource._instances = [];
  }

  static current(): MockEventSource {
    return MockEventSource._instances[MockEventSource._instances.length - 1];
  }
}

vi.mock('../../../src/board/client/connectionStatus', () => ({
  setStreamState: vi.fn(),
  registerReconnect: vi.fn().mockImplementation(() => vi.fn()),
}));

async function loadBoardStream() {
  vi.resetModules();
  const connectionStatus = await import('../../../src/board/client/connectionStatus');
  // The connectionStatus mock (from vi.mock factory) is a singleton that survives
  // vi.resetModules(), so its call history leaks across tests unless cleared here.
  vi.mocked(connectionStatus.setStreamState).mockClear();
  vi.mocked(connectionStatus.registerReconnect).mockClear();
  const boardStream = await import('../../../src/board/client/boardStream');
  return { boardStream, connectionStatus };
}

beforeEach(() => {
  vi.useFakeTimers();
  MockEventSource.reset();
  (global as unknown as Record<string, unknown>)['EventSource'] = MockEventSource;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('initBoardStream / connect', () => {
  it('creates an EventSource for /api/board/stream and marks the stream connecting', async () => {
    const { boardStream, connectionStatus } = await loadBoardStream();

    boardStream.initBoardStream();

    expect(MockEventSource._instances).toHaveLength(1);
    expect(MockEventSource.current().url).toBe('/api/board/stream');
    expect(connectionStatus.setStreamState).toHaveBeenCalledWith('board', 'connecting');
  });

  it('registers reconnectNow via registerReconnect', async () => {
    const { boardStream, connectionStatus } = await loadBoardStream();

    boardStream.initBoardStream();

    expect(connectionStatus.registerReconnect).toHaveBeenCalledWith(expect.any(Function));
  });

  it('marks the stream connected and resets backoff to 1000 on open', async () => {
    const { boardStream, connectionStatus } = await loadBoardStream();

    boardStream.initBoardStream();
    MockEventSource.current().simulateOpen();

    expect(connectionStatus.setStreamState).toHaveBeenCalledWith('board', 'connected');

    // Build up backoff via two consecutive errors (no open in between): 1000ms, then 2000ms.
    MockEventSource.current().simulateError();
    await vi.advanceTimersByTimeAsync(1000);
    expect(MockEventSource._instances).toHaveLength(2);

    MockEventSource.current().simulateError();
    await vi.advanceTimersByTimeAsync(2000);
    expect(MockEventSource._instances).toHaveLength(3);

    // Now open resets backoff back to 1000, so the next error should reconnect after 1000ms, not 4000ms.
    MockEventSource.current().simulateOpen();
    MockEventSource.current().simulateError();

    await vi.advanceTimersByTimeAsync(999);
    expect(MockEventSource._instances).toHaveLength(3);

    await vi.advanceTimersByTimeAsync(1);
    expect(MockEventSource._instances).toHaveLength(4);
  });

  it.each(['board-update', 'attention', 'running-tasks', 'confirm-complete'] as const)(
    'parses and dispatches %s events to registered listeners',
    async (type) => {
      const { boardStream } = await loadBoardStream();
      const listener = vi.fn();

      boardStream.initBoardStream();
      boardStream.addBoardStreamListener(type, listener);

      const payload = { hello: 'world' };
      MockEventSource.current().dispatchEvent(type, payload);

      expect(listener).toHaveBeenCalledWith(payload);
    }
  );

  it('swallows JSON parse errors without throwing and without dispatching', async () => {
    const { boardStream } = await loadBoardStream();
    const listener = vi.fn();

    boardStream.initBoardStream();
    boardStream.addBoardStreamListener('board-update', listener);

    expect(() => MockEventSource.current().dispatchRaw('board-update', 'not-valid-json')).not.toThrow();
    expect(listener).not.toHaveBeenCalled();
  });

  it('on error: marks disconnected, closes the source, and reconnects with exponential backoff up to 30000ms', async () => {
    const { boardStream, connectionStatus } = await loadBoardStream();

    boardStream.initBoardStream();
    const first = MockEventSource.current();

    first.simulateError();
    expect(connectionStatus.setStreamState).toHaveBeenCalledWith('board', 'disconnected');
    expect(first.close).toHaveBeenCalled();

    // 1st reconnect after 1000ms
    await vi.advanceTimersByTimeAsync(1000);
    expect(MockEventSource._instances).toHaveLength(2);

    // 2nd reconnect after 2000ms (backoff doubled)
    MockEventSource.current().simulateError();
    await vi.advanceTimersByTimeAsync(2000);
    expect(MockEventSource._instances).toHaveLength(3);

    // 3rd reconnect after 4000ms
    MockEventSource.current().simulateError();
    await vi.advanceTimersByTimeAsync(4000);
    expect(MockEventSource._instances).toHaveLength(4);
  });

  it('caps backoff at 30000ms', async () => {
    const { boardStream } = await loadBoardStream();

    boardStream.initBoardStream();

    // Drive backoff up past the cap: 1000 -> 2000 -> 4000 -> 8000 -> 16000 -> 32000(capped to 30000)
    const waits = [1000, 2000, 4000, 8000, 16000];
    for (const wait of waits) {
      MockEventSource.current().simulateError();
      await vi.advanceTimersByTimeAsync(wait);
    }
    expect(MockEventSource._instances).toHaveLength(6);

    MockEventSource.current().simulateError();
    await vi.advanceTimersByTimeAsync(29999);
    expect(MockEventSource._instances).toHaveLength(6);

    await vi.advanceTimersByTimeAsync(1);
    expect(MockEventSource._instances).toHaveLength(7);
  });

  it('does nothing on error once stopped', async () => {
    const { boardStream, connectionStatus } = await loadBoardStream();

    const cleanup = boardStream.initBoardStream();
    cleanup();
    vi.mocked(connectionStatus.setStreamState).mockClear();
    const instance = MockEventSource.current();
    vi.mocked(instance.close).mockClear();

    instance.simulateError();

    expect(connectionStatus.setStreamState).not.toHaveBeenCalled();
    expect(instance.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30000);
    expect(MockEventSource._instances).toHaveLength(1);
  });
});

describe('reconnectNow (invoked via registerReconnect callback)', () => {
  it('clears any pending timer, closes the current source, resets backoff, and reconnects immediately', async () => {
    const { boardStream, connectionStatus } = await loadBoardStream();

    boardStream.initBoardStream();
    const reconnectNow = vi.mocked(connectionStatus.registerReconnect).mock.calls[0][0];

    const first = MockEventSource.current();
    first.simulateError(); // schedules a reconnect timer at 1000ms

    reconnectNow();

    expect(first.close).toHaveBeenCalled();
    expect(MockEventSource._instances).toHaveLength(2);

    // The pending timer from the earlier error must have been cleared —
    // advancing past its original 1000ms delay must not create a 3rd instance.
    await vi.advanceTimersByTimeAsync(1000);
    expect(MockEventSource._instances).toHaveLength(2);
  });

  it('does nothing once stopped', async () => {
    const { boardStream, connectionStatus } = await loadBoardStream();

    const cleanup = boardStream.initBoardStream();
    const reconnectNow = vi.mocked(connectionStatus.registerReconnect).mock.calls[0][0];
    cleanup();

    const instanceCountAfterCleanup = MockEventSource._instances.length;
    reconnectNow();

    expect(MockEventSource._instances).toHaveLength(instanceCountAfterCleanup);
  });
});

describe('initBoardStream cleanup', () => {
  it('stops further reconnects, clears pending timers, unregisters, and closes the source', async () => {
    const { boardStream, connectionStatus } = await loadBoardStream();
    const unregister = vi.fn();
    vi.mocked(connectionStatus.registerReconnect).mockReturnValueOnce(unregister);

    const cleanup = boardStream.initBoardStream();
    const instance = MockEventSource.current();
    instance.simulateError(); // schedules a pending reconnect timer

    cleanup();

    expect(unregister).toHaveBeenCalled();
    expect(instance.close).toHaveBeenCalled();

    // The pending reconnect timer must have been cleared by cleanup.
    await vi.advanceTimersByTimeAsync(30000);
    expect(MockEventSource._instances).toHaveLength(1);
  });
});

describe('addBoardStreamListener', () => {
  it('invokes the listener when a matching event is dispatched', async () => {
    const { boardStream } = await loadBoardStream();
    const listener = vi.fn();

    boardStream.initBoardStream();
    boardStream.addBoardStreamListener('attention', listener);
    MockEventSource.current().dispatchEvent('attention', { taskId: 1 });

    expect(listener).toHaveBeenCalledWith({ taskId: 1 });
  });

  it('stops invoking the listener after the returned unregister function is called', async () => {
    const { boardStream } = await loadBoardStream();
    const listener = vi.fn();

    boardStream.initBoardStream();
    const unregister = boardStream.addBoardStreamListener('running-tasks', listener);
    unregister();
    MockEventSource.current().dispatchEvent('running-tasks', { ids: [1, 2] });

    expect(listener).not.toHaveBeenCalled();
  });
});
