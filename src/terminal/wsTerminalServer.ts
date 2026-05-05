import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { Duplex } from 'stream';
import type { PtySessionService } from './PtySessionService';

function parseTaskId(url: string | undefined, suffix: 'io' | 'control'): number | null {
  if (!url) return null;
  const m = url.match(/\/api\/terminal\/(\d+)\/(io|control)/);
  if (!m || m[2] !== suffix) return null;
  const id = Number(m[1]);
  return isNaN(id) ? null : id;
}

export function createTerminalWsServer(ptyService: PtySessionService): {
  handleUpgrade: (req: IncomingMessage, socket: Duplex, head: Buffer) => void;
} {
  const ioServer = new WebSocketServer({ noServer: true });
  const controlServer = new WebSocketServer({ noServer: true });

  ioServer.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const taskId = parseTaskId(req.url, 'io');
    if (taskId === null) {
      ws.close(1008, 'Invalid taskId');
      return;
    }

    const snapshot = ptyService.getSnapshot(taskId);
    if (snapshot && ws.readyState === WebSocket.OPEN) {
      ws.send(Buffer.from(snapshot));
    }

    const unsub = ptyService.subscribeRawOutput(taskId, (data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(Buffer.from(data));
      }
    });

    ws.on('message', (msg: Buffer | string) => {
      const text = typeof msg === 'string' ? msg : msg.toString('utf8');
      ptyService.writeInput(taskId, text);
    });

    ws.on('close', () => {
      unsub();
    });
    ws.on('error', () => {
      unsub();
    });
  });

  controlServer.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const taskId = parseTaskId(req.url, 'control');
    if (taskId === null) {
      ws.close(1008, 'Invalid taskId');
      return;
    }

    ws.on('message', (msg: Buffer | string) => {
      try {
        const text = typeof msg === 'string' ? msg : msg.toString('utf8');
        const data = JSON.parse(text) as { type: string; cols?: number; rows?: number };
        if (data.type === 'resize' && typeof data.cols === 'number' && typeof data.rows === 'number') {
          ptyService.resize(taskId, data.cols, data.rows);
        }
      } catch {
        // Ignore malformed messages
      }
    });
  });

  return {
    handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
      const url = req.url ?? '';
      if (url.includes('/io')) {
        ioServer.handleUpgrade(req, socket as never, head, (ws) => {
          ioServer.emit('connection', ws, req);
        });
      } else if (url.includes('/control')) {
        controlServer.handleUpgrade(req, socket as never, head, (ws) => {
          controlServer.emit('connection', ws, req);
        });
      } else {
        socket.destroy();
      }
    },
  };
}
