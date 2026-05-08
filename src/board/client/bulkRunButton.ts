// Bulk run button for the Ready column header.
// Manages SSE /api/claude/bulk-run/stream and button state toggling.

type BulkRunMode = 'idle' | 'running';

let _mode: BulkRunMode = 'idle';

function getSplitEl(): HTMLElement | null {
  return document.getElementById('bulk-run-split');
}

function setRunningState(running: boolean): void {
  _mode = running ? 'running' : 'idle';
  const split = getSplitEl();
  if (!split) return;

  const mainBtn = split.querySelector<HTMLButtonElement>('#bulk-run-main-btn');
  const toggle = split.querySelector<HTMLButtonElement>('#bulk-run-toggle');
  const menuItems = split.querySelectorAll<HTMLButtonElement>('.bulk-run-menu-item');

  if (!mainBtn || !toggle) return;

  if (running) {
    mainBtn.innerHTML = '&#9632; Stop';
    mainBtn.classList.add('bulk-run-btn-stop');
    toggle.style.display = 'none';
    split.classList.remove('open');
  } else {
    mainBtn.innerHTML = '&#9654; Run all';
    mainBtn.classList.remove('bulk-run-btn-stop');
    toggle.style.display = '';
  }

  menuItems.forEach((item) => {
    item.disabled = running;
  });
}

async function startBulkRun(command: 'direct' | 'pr'): Promise<void> {
  try {
    const res = await fetch('/api/claude/bulk-run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command }),
    });
    if (!res.ok) {
      let errorDetail = `HTTP ${res.status}`;
      try {
        const data = (await res.json()) as { error?: string };
        if (data.error) errorDetail += `: ${data.error}`;
      } catch {
        // ignore
      }
      console.error(`[bulkRun] Failed to start: ${errorDetail}`);
      alert(`Bulk run error: ${errorDetail}`);
    }
  } catch (err) {
    console.error('[bulkRun] Network error:', err);
  }
}

async function stopBulkRun(): Promise<void> {
  try {
    await fetch('/api/claude/bulk-run/stop', { method: 'POST' });
  } catch (err) {
    console.error('[bulkRun] Failed to stop:', err);
  }
}

export function initBulkRunButton(): void {
  const split = getSplitEl();
  if (!split) return;

  const mainBtn = split.querySelector<HTMLButtonElement>('#bulk-run-main-btn');
  const toggle = split.querySelector<HTMLButtonElement>('#bulk-run-toggle');
  const menu = split.querySelector<HTMLElement>('#bulk-run-menu');
  const menuItems = split.querySelectorAll<HTMLButtonElement>('.bulk-run-menu-item');

  if (!mainBtn || !toggle || !menu) return;

  mainBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (_mode === 'running') {
      await stopBulkRun();
    } else {
      await startBulkRun('direct');
    }
  });

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    split.classList.toggle('open');
  });

  menuItems.forEach((item) => {
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      split.classList.remove('open');
      const command = (item.dataset.command as 'direct' | 'pr') ?? 'direct';
      await startBulkRun(command);
    });
  });

  document.addEventListener('click', () => {
    split.classList.remove('open');
  });

  const es = new EventSource('/api/claude/bulk-run/stream');
  es.addEventListener('update', (event: MessageEvent) => {
    const data = JSON.parse(event.data) as { mode: string };
    setRunningState(data.mode === 'running');
  });
}
