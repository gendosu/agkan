import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { TERMINAL_ROWS } from '../../terminal/terminalDimensions';
import '@xterm/xterm/css/xterm.css';

let _terminal: Terminal | null = null;
let _fitAddon: FitAddon | null = null;
let _ioWs: WebSocket | null = null;
let _controlWs: WebSocket | null = null;
let _currentTaskId: number | null = null;
let _resizeObserver: ResizeObserver | null = null;
let _inputDisposable: { dispose(): void } | null = null;
export function getCurrentTerminalTaskId(): number | null {
  return _currentTaskId;
}

function closeWebSockets(): void {
  _ioWs?.close();
  _ioWs = null;
  _controlWs?.close();
  _controlWs = null;
}

/**
 * Disconnect WebSockets and resize observer, but preserve the xterm.js display
 * (so output remains visible after a session completes).
 */
export function detachTerminal(): void {
  closeWebSockets();
  _resizeObserver?.disconnect();
  _resizeObserver = null;
  _inputDisposable?.dispose();
  _inputDisposable = null;
}

/**
 * Initialize (or reuse) the xterm.js terminal, attach it to the given container,
 * and connect to the PTY WebSocket endpoints for the given task.
 */
export function attachTerminalToTab(taskId: number, container: HTMLElement): void {
  // If already attached to this same task, just refit and bail out so we don't
  // tear down a live session.
  if (_currentTaskId === taskId && _ioWs && _ioWs.readyState !== WebSocket.CLOSED) {
    fitTerminal();
    return;
  }

  detachTerminal();
  _currentTaskId = taskId;

  if (!_terminal) {
    _terminal = new Terminal({
      rows: TERMINAL_ROWS,
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#0d1117',
        foreground: '#e6edf3',
        cursor: '#e6edf3',
        selectionBackground: 'rgba(100,150,255,0.3)',
      },
      scrollback: 5000,
    });
    _fitAddon = new FitAddon();
    _terminal.loadAddon(_fitAddon);
    _terminal.open(container);
  } else {
    // Re-open into the (possibly new) container and clear previous output for the new task.
    _terminal.reset();
    if (_terminal.element?.parentElement !== container) {
      _terminal.open(container);
    }
  }
  fitTerminal();

  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const base = `${proto}//${location.host}`;

  _ioWs = new WebSocket(`${base}/api/terminal/${taskId}/io`);
  _ioWs.binaryType = 'arraybuffer';

  _ioWs.onmessage = (e) => {
    const data = e.data instanceof ArrayBuffer ? new TextDecoder().decode(e.data) : (e.data as string);
    _terminal?.write(data);
  };

  _ioWs.onerror = () => {
    _terminal?.write('\r\n[Connection error]\r\n');
  };

  // Forward user keystrokes to PTY
  _inputDisposable = _terminal.onData((data) => {
    if (_ioWs?.readyState === WebSocket.OPEN) {
      _ioWs.send(data);
    }
  });

  _controlWs = new WebSocket(`${base}/api/terminal/${taskId}/control`);

  _resizeObserver = new ResizeObserver(fitTerminal);
  _resizeObserver.observe(container);

  _controlWs.onopen = () => {
    fitTerminal();
  };
}

/**
 * A new PTY session has started for the task currently shown in the terminal
 * (e.g. Run all picked up a task whose terminal still shows its planning log).
 * Tear down the stale connection, clear the previous output, and reconnect so
 * only the new session's log is displayed. No-op if this task is not the one
 * currently displayed.
 */
export function reattachTerminalForNewSession(taskId: number): void {
  if (_currentTaskId !== taskId || !_terminal) return;
  const container = _terminal.element?.parentElement;
  if (!(container instanceof HTMLElement)) return;
  // Explicitly detach first so that attachTerminalToTab's internal detach call
  // finds everything already null (idempotent). The explicit call here also
  // nulls _ioWs, which is required to bypass attachTerminalToTab's reuse guard
  // (the guard early-returns when _currentTaskId === taskId AND _ioWs is open).
  detachTerminal();
  attachTerminalToTab(taskId, container);
}

/**
 * Fit the width while preserving the PTY's initial row count. Safe to call when the
 * Terminal tab becomes visible (e.g. after a tab switch).
 */
export function fitTerminal(): void {
  const dimensions = _fitAddon?.proposeDimensions();
  if (!_terminal || !dimensions || !Number.isFinite(dimensions.cols) || dimensions.cols < 2) return;

  // Do not call fit(): it would briefly shrink xterm below the fixed PTY height.
  _terminal.resize(dimensions.cols, TERMINAL_ROWS);
  if (_controlWs?.readyState === WebSocket.OPEN) {
    _controlWs.send(JSON.stringify({ type: 'resize', cols: _terminal.cols, rows: _terminal.rows }));
  }
}

/**
 * Issue a stop request for the given task. Returns true on HTTP success.
 */
export async function stopTerminal(taskId: number): Promise<boolean> {
  try {
    const res = await fetch(`/api/claude/tasks/${taskId}/run`, { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
  }
}
