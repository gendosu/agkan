import { describe, it, expect, vi, beforeEach } from 'vitest';

const ioHandlers: Record<string, ((...args: unknown[]) => void)> = {};
const controlHandlers: Record<string, ((...args: unknown[]) => void)> = {};

const mockIoServer = {
  on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
    ioHandlers[event] = handler;
  }),
  handleUpgrade: vi.fn(),
  emit: vi.fn(),
};

const mockControlServer = {
  on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
    controlHandlers[event] = handler;
  }),
  handleUpgrade: vi.fn(),
  emit: vi.fn(),
};

let instanceCount = 0;

vi.mock('ws', () => {
  class WebSocketServer {
    on: typeof mockIoServer.on;
    handleUpgrade: typeof mockIoServer.handleUpgrade;
    emit: typeof mockIoServer.emit;

    constructor() {
      instanceCount++;
      const srv = instanceCount % 2 === 1 ? mockIoServer : mockControlServer;
      this.on = srv.on;
      this.handleUpgrade = srv.handleUpgrade;
      this.emit = srv.emit;
    }
  }

  return {
    WebSocketServer,
    WebSocket: { OPEN: 1, CLOSED: 3 },
  };
});

import { createTerminalWsServer } from '../../src/terminal/wsTerminalServer';

function makeWs(readyState = 1) {
  const wsHandlers: Record<string, ((...args: unknown[]) => void)[]> = {};
  return {
    readyState,
    close: vi.fn(),
    send: vi.fn(),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!wsHandlers[event]) wsHandlers[event] = [];
      wsHandlers[event].push(handler);
    }),
    emit(event: string, ...args: unknown[]) {
      wsHandlers[event]?.forEach((h) => h(...args));
    },
  };
}

function makeMockService() {
  return {
    getSnapshot: vi.fn(() => null as string | null),
    subscribeRawOutput: vi.fn(() => vi.fn()),
    writeInput: vi.fn(),
    resize: vi.fn(),
  };
}

describe('createTerminalWsServer', () => {
  let mockService: ReturnType<typeof makeMockService>;

  beforeEach(() => {
    instanceCount = 0;
    mockIoServer.on.mockClear();
    mockIoServer.handleUpgrade.mockClear();
    mockIoServer.emit.mockClear();
    mockControlServer.on.mockClear();
    mockControlServer.handleUpgrade.mockClear();
    mockControlServer.emit.mockClear();

    // Re-bind handlers on each call
    mockIoServer.on.mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
      ioHandlers[event] = handler;
    });
    mockControlServer.on.mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
      controlHandlers[event] = handler;
    });

    mockService = makeMockService();
  });

  it('exports a handleUpgrade function', () => {
    const server = createTerminalWsServer(mockService as never);
    expect(typeof server.handleUpgrade).toBe('function');
  });

  describe('handleUpgrade routing', () => {
    it('routes /io URL to ioServer', () => {
      const server = createTerminalWsServer(mockService as never);
      const req = { url: '/api/terminal/1/io' };
      const socket = { destroy: vi.fn() };
      const head = Buffer.alloc(0);
      server.handleUpgrade(req as never, socket as never, head);
      expect(mockIoServer.handleUpgrade).toHaveBeenCalledWith(req, socket, head, expect.any(Function));
    });

    it('routes /control URL to controlServer', () => {
      const server = createTerminalWsServer(mockService as never);
      const req = { url: '/api/terminal/1/control' };
      const socket = { destroy: vi.fn() };
      const head = Buffer.alloc(0);
      server.handleUpgrade(req as never, socket as never, head);
      expect(mockControlServer.handleUpgrade).toHaveBeenCalledWith(req, socket, head, expect.any(Function));
    });

    it('destroys socket for invalid URL', () => {
      const server = createTerminalWsServer(mockService as never);
      const req = { url: '/api/terminal/1/unknown' };
      const socket = { destroy: vi.fn() };
      server.handleUpgrade(req as never, socket as never, Buffer.alloc(0));
      expect(socket.destroy).toHaveBeenCalled();
    });
  });

  describe('IO connection handler', () => {
    beforeEach(() => {
      createTerminalWsServer(mockService as never);
    });

    it('closes with 1008 for invalid taskId', () => {
      const ws = makeWs();
      ioHandlers['connection'](ws, { url: '/api/terminal/abc/io' });
      expect(ws.close).toHaveBeenCalledWith(1008, 'Invalid taskId');
    });

    it('closes with 1008 for empty URL', () => {
      const ws = makeWs();
      ioHandlers['connection'](ws, { url: '' });
      expect(ws.close).toHaveBeenCalledWith(1008, 'Invalid taskId');
    });

    it('closes with 1008 for suffix mismatch (control instead of io)', () => {
      const ws = makeWs();
      ioHandlers['connection'](ws, { url: '/api/terminal/1/control' });
      expect(ws.close).toHaveBeenCalledWith(1008, 'Invalid taskId');
    });

    it('sends snapshot when readyState is OPEN and snapshot exists', () => {
      mockService.getSnapshot.mockReturnValue('hello snapshot');
      const ws = makeWs(1); // OPEN
      ioHandlers['connection'](ws, { url: '/api/terminal/5/io' });
      expect(ws.send).toHaveBeenCalledWith(Buffer.from('hello snapshot'));
    });

    it('does not send snapshot when readyState is not OPEN', () => {
      mockService.getSnapshot.mockReturnValue('hello snapshot');
      const ws = makeWs(3); // CLOSED
      ioHandlers['connection'](ws, { url: '/api/terminal/5/io' });
      expect(ws.send).not.toHaveBeenCalled();
    });

    it('does not send snapshot when snapshot is null', () => {
      mockService.getSnapshot.mockReturnValue(null);
      const ws = makeWs(1);
      ioHandlers['connection'](ws, { url: '/api/terminal/5/io' });
      expect(ws.send).not.toHaveBeenCalled();
    });

    it('calls writeInput on string message', () => {
      const ws = makeWs(1);
      ioHandlers['connection'](ws, { url: '/api/terminal/5/io' });
      ws.emit('message', 'hello');
      expect(mockService.writeInput).toHaveBeenCalledWith(5, 'hello');
    });

    it('calls writeInput on Buffer message', () => {
      const ws = makeWs(1);
      ioHandlers['connection'](ws, { url: '/api/terminal/5/io' });
      ws.emit('message', Buffer.from('world'));
      expect(mockService.writeInput).toHaveBeenCalledWith(5, 'world');
    });

    it('calls unsub on close', () => {
      const unsub = vi.fn();
      mockService.subscribeRawOutput.mockReturnValue(unsub);
      const ws = makeWs(1);
      ioHandlers['connection'](ws, { url: '/api/terminal/5/io' });
      ws.emit('close');
      expect(unsub).toHaveBeenCalled();
    });

    it('calls unsub on error', () => {
      const unsub = vi.fn();
      mockService.subscribeRawOutput.mockReturnValue(unsub);
      const ws = makeWs(1);
      ioHandlers['connection'](ws, { url: '/api/terminal/5/io' });
      ws.emit('error');
      expect(unsub).toHaveBeenCalled();
    });

    it('sends raw output data when readyState is OPEN', () => {
      let outputCallback: ((data: string) => void) | null = null;
      mockService.subscribeRawOutput.mockImplementation((_id: unknown, cb: (data: string) => void) => {
        outputCallback = cb;
        return vi.fn();
      });
      const ws = makeWs(1);
      ioHandlers['connection'](ws, { url: '/api/terminal/5/io' });
      outputCallback!('output data');
      expect(ws.send).toHaveBeenCalledWith(Buffer.from('output data'));
    });
  });

  describe('Control connection handler', () => {
    beforeEach(() => {
      createTerminalWsServer(mockService as never);
    });

    it('closes with 1008 for invalid taskId', () => {
      const ws = makeWs();
      controlHandlers['connection'](ws, { url: '/api/terminal/abc/control' });
      expect(ws.close).toHaveBeenCalledWith(1008, 'Invalid taskId');
    });

    it('closes with 1008 for suffix mismatch (io instead of control)', () => {
      const ws = makeWs();
      controlHandlers['connection'](ws, { url: '/api/terminal/1/io' });
      expect(ws.close).toHaveBeenCalledWith(1008, 'Invalid taskId');
    });

    it('calls resize on valid resize message (string)', () => {
      const ws = makeWs(1);
      controlHandlers['connection'](ws, { url: '/api/terminal/3/control' });
      ws.emit('message', JSON.stringify({ type: 'resize', cols: 80, rows: 24 }));
      expect(mockService.resize).toHaveBeenCalledWith(3, 80, 24);
    });

    it('calls resize on valid resize message (Buffer)', () => {
      const ws = makeWs(1);
      controlHandlers['connection'](ws, { url: '/api/terminal/3/control' });
      ws.emit('message', Buffer.from(JSON.stringify({ type: 'resize', cols: 100, rows: 30 })));
      expect(mockService.resize).toHaveBeenCalledWith(3, 100, 30);
    });

    it('does not crash on invalid JSON message', () => {
      const ws = makeWs(1);
      controlHandlers['connection'](ws, { url: '/api/terminal/3/control' });
      expect(() => ws.emit('message', 'not json')).not.toThrow();
    });

    it('ignores non-resize message types', () => {
      const ws = makeWs(1);
      controlHandlers['connection'](ws, { url: '/api/terminal/3/control' });
      ws.emit('message', JSON.stringify({ type: 'ping' }));
      expect(mockService.resize).not.toHaveBeenCalled();
    });

    it('ignores resize message with missing cols/rows', () => {
      const ws = makeWs(1);
      controlHandlers['connection'](ws, { url: '/api/terminal/3/control' });
      ws.emit('message', JSON.stringify({ type: 'resize', cols: 80 }));
      expect(mockService.resize).not.toHaveBeenCalled();
    });
  });
});
