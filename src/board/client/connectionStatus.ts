// Aggregates connection state across all SSE streams

type StreamKey = 'board' | 'run-logs';
type ConnectionState = 'connected' | 'connecting' | 'disconnected';

type Listener = (state: ConnectionState) => void;

const streamStates: Record<StreamKey, ConnectionState> = {
  board: 'connecting',
  'run-logs': 'connected', // Not always active; treated as connected when not in use
};

let activeRunLogs = false;
const listeners: Listener[] = [];

function computeOverallState(): ConnectionState {
  const monitored: StreamKey[] = activeRunLogs ? ['board', 'run-logs'] : ['board'];
  if (monitored.some((k) => streamStates[k] === 'disconnected')) return 'disconnected';
  if (monitored.some((k) => streamStates[k] === 'connecting')) return 'connecting';
  return 'connected';
}

let lastEmitted: ConnectionState | null = null;

function notify(): void {
  const state = computeOverallState();
  if (state === lastEmitted) return;
  lastEmitted = state;
  listeners.forEach((fn) => fn(state));
}

export function setStreamState(key: StreamKey, state: ConnectionState): void {
  streamStates[key] = state;
  notify();
}

export function setRunLogsActive(active: boolean): void {
  activeRunLogs = active;
  if (!active) streamStates['run-logs'] = 'connected';
  notify();
}

export function onConnectionStateChange(fn: Listener): () => void {
  listeners.push(fn);
  fn(computeOverallState());
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx !== -1) listeners.splice(idx, 1);
  };
}

let reconnectCallbacks: (() => void)[] = [];

export function registerReconnect(fn: () => void): () => void {
  reconnectCallbacks.push(fn);
  return () => {
    const idx = reconnectCallbacks.indexOf(fn);
    if (idx !== -1) reconnectCallbacks.splice(idx, 1);
  };
}

export function triggerReconnectAll(): void {
  reconnectCallbacks.forEach((fn) => fn());
}
