// Singleton EventSource for /api/board/stream — all board features subscribe via addBoardStreamListener

import { setStreamState, registerReconnect } from './connectionStatus';

type BoardEventType = 'board-update' | 'attention' | 'running-tasks' | 'confirm-complete';
type Listener = (data: unknown) => void;

const listeners = new Map<BoardEventType, Listener[]>();

let es: EventSource | null = null;
let stopped = false;
let backoffMs = 1000;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function getListeners(type: BoardEventType): Listener[] {
  if (!listeners.has(type)) listeners.set(type, []);
  return listeners.get(type)!;
}

function dispatch(type: BoardEventType, data: unknown): void {
  getListeners(type).forEach((fn) => fn(data));
}

function connect(): void {
  es = new EventSource('/api/board/stream');
  setStreamState('board', 'connecting');

  es.addEventListener('open', () => {
    setStreamState('board', 'connected');
    backoffMs = 1000;
  });

  const boardEvents: BoardEventType[] = ['board-update', 'attention', 'running-tasks', 'confirm-complete'];
  boardEvents.forEach((type) => {
    es!.addEventListener(type, (event: MessageEvent) => {
      try {
        dispatch(type, JSON.parse(event.data));
      } catch {
        // ignore parse errors
      }
    });
  });

  es.onerror = () => {
    if (stopped) return;
    setStreamState('board', 'disconnected');
    es?.close();
    reconnectTimer = setTimeout(() => {
      backoffMs = Math.min(backoffMs * 2, 30000);
      connect();
    }, backoffMs);
  };
}

function reconnectNow(): void {
  if (stopped) return;
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  es?.close();
  backoffMs = 1000;
  connect();
}

export function initBoardStream(): () => void {
  stopped = false;
  connect();
  const unregister = registerReconnect(reconnectNow);
  return () => {
    stopped = true;
    if (reconnectTimer !== null) clearTimeout(reconnectTimer);
    unregister();
    es?.close();
  };
}

export function addBoardStreamListener(type: BoardEventType, fn: Listener): () => void {
  getListeners(type).push(fn);
  return () => {
    const arr = getListeners(type);
    const idx = arr.indexOf(fn);
    if (idx !== -1) arr.splice(idx, 1);
  };
}
