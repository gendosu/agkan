import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

let _terminal: Terminal | null = null;
let _fitAddon: FitAddon | null = null;
let _ioWs: WebSocket | null = null;
let _controlWs: WebSocket | null = null;
let _currentTaskId: number | null = null;
let _resizeObserver: ResizeObserver | null = null;
let _inputDisposable: { dispose(): void } | null = null;
let _claudeButtonUpdateCallback: (() => void) | null = null;

export function registerClaudeButtonUpdateCallback(cb: () => void): void {
  _claudeButtonUpdateCallback = cb;
}

function getModalElements() {
  return {
    overlay: document.getElementById('claude-terminal-modal') as HTMLElement | null,
    title: document.getElementById('claude-terminal-title') as HTMLElement | null,
    container: document.getElementById('claude-terminal-container') as HTMLElement | null,
    stopBtn: document.getElementById('claude-terminal-stop-btn') as HTMLButtonElement | null,
    closeBtn: document.getElementById('claude-terminal-close-btn') as HTMLButtonElement | null,
    modalClose: document.getElementById('claude-terminal-modal-close') as HTMLButtonElement | null,
  };
}

function closeWebSockets(): void {
  _ioWs?.close();
  _ioWs = null;
  _controlWs?.close();
  _controlWs = null;
}

export function closeClaudeTerminalModal(): void {
  closeWebSockets();
  _resizeObserver?.disconnect();
  _resizeObserver = null;
  const { overlay } = getModalElements();
  overlay?.classList.remove('show');
}

export function openClaudeTerminalModal(taskId: number): void {
  closeWebSockets();
  _currentTaskId = taskId;

  const { overlay, title, container, stopBtn } = getModalElements();
  if (!overlay || !container) return;

  title!.textContent = `Claude Terminal #${taskId}`;
  stopBtn!.disabled = false;
  stopBtn!.textContent = 'Stop';
  overlay.classList.add('show');

  // Initialize xterm.js terminal once; reuse across modal open/close
  if (!_terminal) {
    _terminal = new Terminal({
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
    _fitAddon.fit();
  } else {
    // Reattach to container in case it was detached
    _terminal.reset();
  }

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
  _inputDisposable?.dispose();
  _inputDisposable = _terminal.onData((data) => {
    if (_ioWs?.readyState === WebSocket.OPEN) {
      _ioWs.send(data);
    }
  });

  // Control WebSocket for terminal resize
  _controlWs = new WebSocket(`${base}/api/terminal/${taskId}/control`);

  const sendResize = () => {
    _fitAddon?.fit();
    if (_controlWs?.readyState === WebSocket.OPEN && _terminal) {
      const { cols, rows } = _terminal;
      _controlWs.send(JSON.stringify({ type: 'resize', cols, rows }));
    }
  };

  _resizeObserver?.disconnect();
  _resizeObserver = new ResizeObserver(sendResize);
  _resizeObserver.observe(container);

  _controlWs.onopen = () => {
    sendResize();
  };
}

async function handleStop(): Promise<void> {
  if (_currentTaskId === null) return;
  const { stopBtn } = getModalElements();
  if (stopBtn) {
    stopBtn.disabled = true;
    stopBtn.textContent = 'Stopping...';
  }
  try {
    await fetch(`/api/claude/tasks/${_currentTaskId}/run`, { method: 'DELETE' });
  } catch {
    // Ignore network errors
  }
  if (_claudeButtonUpdateCallback) _claudeButtonUpdateCallback();
}

export function initClaudeTerminalModal(): void {
  const { overlay, stopBtn, closeBtn, modalClose } = getModalElements();

  modalClose?.addEventListener('click', () => closeClaudeTerminalModal());
  closeBtn?.addEventListener('click', () => closeClaudeTerminalModal());
  stopBtn?.addEventListener('click', () => {
    void handleStop();
  });
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) closeClaudeTerminalModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay?.classList.contains('show')) {
      closeClaudeTerminalModal();
    }
  });
}
