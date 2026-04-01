// Claude streaming modal: SSE reception, log display, and stop button

let _currentEventSource: EventSource | null = null;
let _currentTaskId: number | null = null;
let _claudeButtonUpdateCallback: (() => void) | null = null;

export function registerClaudeButtonUpdateCallback(cb: () => void): void {
  _claudeButtonUpdateCallback = cb;
}

export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

function getModalElements() {
  return {
    overlay: document.getElementById('claude-stream-modal') as HTMLElement | null,
    title: document.getElementById('claude-stream-modal-title') as HTMLElement | null,
    log: document.getElementById('claude-stream-log') as HTMLElement | null,
    status: document.getElementById('claude-stream-status') as HTMLElement | null,
    stopBtn: document.getElementById('claude-stream-stop-btn') as HTMLButtonElement | null,
    closeBtn: document.getElementById('claude-stream-close-btn') as HTMLButtonElement | null,
    modalClose: document.getElementById('claude-stream-modal-close') as HTMLButtonElement | null,
  };
}

function isAutoScrollEnabled(log: HTMLElement): boolean {
  const threshold = 50;
  return log.scrollHeight - log.scrollTop - log.clientHeight <= threshold;
}

function appendToLog(log: HTMLElement, text: string, className?: string): void {
  const shouldScroll = isAutoScrollEnabled(log);
  const line = document.createElement('div');
  line.textContent = text;
  if (className) {
    line.className = className;
  }
  log.appendChild(line);
  if (shouldScroll) {
    log.scrollTop = log.scrollHeight;
  }
}

function closeEventSource(): void {
  if (_currentEventSource) {
    _currentEventSource.close();
    _currentEventSource = null;
  }
}

export function closeClaudeStreamModal(): void {
  closeEventSource();
  const { overlay } = getModalElements();
  overlay?.classList.remove('show');
}

export function openClaudeStreamModal(taskId: number): void {
  // Close any existing EventSource
  closeEventSource();
  _currentTaskId = taskId;

  const { overlay, title, log, status, stopBtn } = getModalElements();
  if (!overlay || !title || !log || !status || !stopBtn) return;

  // Reset UI
  title.textContent = `Claude Output #${taskId}`;
  log.innerHTML = '';
  status.textContent = 'Connecting...';
  stopBtn.disabled = false;
  stopBtn.textContent = 'Stop';

  overlay.classList.add('show');

  // Connect to SSE
  const es = new EventSource(`/api/claude/tasks/${taskId}/stream`);
  _currentEventSource = es;

  es.addEventListener('text', (event: Event) => {
    const msgEvent = event as MessageEvent;
    try {
      const data = JSON.parse(msgEvent.data) as { text: string };
      appendToLog(log, stripAnsi(data.text));
    } catch {
      // Ignore parse errors
    }
  });

  es.addEventListener('tool_use', (event: Event) => {
    const msgEvent = event as MessageEvent;
    try {
      const data = JSON.parse(msgEvent.data) as { name: string; input?: Record<string, unknown> };
      const mainArg = data.input?.path ?? data.input?.command ?? '';
      const displayText = mainArg ? `\uD83D\uDD27 ${data.name}: ${mainArg}` : `\uD83D\uDD27 ${data.name}`;
      appendToLog(log, displayText, 'claude-stream-tool-use');
    } catch {
      // Ignore parse errors
    }
  });

  es.addEventListener('end', (event: Event) => {
    const msgEvent = event as MessageEvent;
    try {
      const data = JSON.parse(msgEvent.data) as { exitCode: number };
      status.textContent = `Done (exit ${data.exitCode})`;
    } catch {
      status.textContent = 'Done';
    }
    closeEventSource();
    stopBtn.disabled = true;
  });

  es.addEventListener('error', (event: Event) => {
    const msgEvent = event as MessageEvent;
    try {
      const data = JSON.parse(msgEvent.data) as { message: string };
      status.textContent = `Error: ${data.message}`;
    } catch {
      status.textContent = 'Error';
    }
    closeEventSource();
    stopBtn.disabled = true;
  });

  es.onerror = () => {
    if (_currentEventSource === es) {
      closeEventSource();
      status.textContent = 'Disconnected';
      stopBtn.disabled = true;
    }
  };
}

async function handleStop(): Promise<void> {
  if (_currentTaskId === null) return;

  const { stopBtn, status } = getModalElements();
  if (!stopBtn || !status) return;

  const taskId = _currentTaskId;
  closeEventSource();
  stopBtn.disabled = true;
  stopBtn.textContent = 'Stopping...';

  try {
    await fetch(`/api/claude/tasks/${taskId}/run`, { method: 'DELETE' });
  } catch {
    // Ignore network errors
  }

  stopBtn.textContent = 'Stopped';
  status.textContent = 'Stopped';

  if (_claudeButtonUpdateCallback) {
    _claudeButtonUpdateCallback();
  }
}

export function initClaudeStreamModal(): void {
  const { overlay, stopBtn, closeBtn, modalClose } = getModalElements();

  modalClose?.addEventListener('click', () => {
    closeClaudeStreamModal();
  });

  closeBtn?.addEventListener('click', () => {
    closeClaudeStreamModal();
  });

  stopBtn?.addEventListener('click', () => {
    void handleStop();
  });

  overlay?.addEventListener('click', (e: MouseEvent) => {
    if (e.target === overlay) {
      closeClaudeStreamModal();
    }
  });

  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape' && overlay?.classList.contains('show')) {
      closeClaudeStreamModal();
    }
  });
}
