// Tmux panel: prototype UI for managing tmux sessions and streaming output

interface TmuxSession {
  name: string;
  created: string;
  windows: string;
  attached: string;
}

let panelEl: HTMLElement | null = null;
let logEl: HTMLElement | null = null;
let currentStream: EventSource | null = null;

function buildPanelHtml(): string {
  return `
<div id="tmux-panel" style="
  position:fixed;
  bottom:0;
  right:0;
  width:480px;
  max-height:400px;
  background:var(--bg-card,#1e1e1e);
  border:1px solid var(--border,#333);
  border-radius:8px 0 0 0;
  font-family:monospace;
  font-size:12px;
  z-index:1000;
  display:flex;
  flex-direction:column;
  box-shadow:0 -2px 12px rgba(0,0,0,0.3);
">
  <div id="tmux-panel-header" style="
    display:flex;
    align-items:center;
    gap:8px;
    padding:6px 10px;
    background:var(--bg-header,#2a2a2a);
    border-bottom:1px solid var(--border,#333);
    border-radius:8px 0 0 0;
    cursor:pointer;
    user-select:none;
  ">
    <span style="font-weight:bold;color:var(--text-primary,#e0e0e0);flex:1;">tmux sessions</span>
    <button id="tmux-panel-toggle" style="
      background:none;border:none;color:var(--text-secondary,#888);cursor:pointer;font-size:14px;padding:0 4px;
    ">▲</button>
    <button id="tmux-panel-close" style="
      background:none;border:none;color:var(--text-secondary,#888);cursor:pointer;font-size:16px;padding:0 4px;
    ">✕</button>
  </div>
  <div id="tmux-panel-body" style="display:flex;flex-direction:column;flex:1;overflow:hidden;">
    <div id="tmux-session-controls" style="padding:8px;border-bottom:1px solid var(--border,#333);display:flex;gap:6px;flex-wrap:wrap;">
      <input id="tmux-session-name" placeholder="session name" style="
        flex:1;min-width:100px;padding:4px 6px;border:1px solid var(--border,#444);
        border-radius:4px;background:var(--bg-input,#111);color:var(--text-primary,#e0e0e0);font-size:12px;
      ">
      <input id="tmux-session-cmd" placeholder="command" style="
        flex:2;min-width:140px;padding:4px 6px;border:1px solid var(--border,#444);
        border-radius:4px;background:var(--bg-input,#111);color:var(--text-primary,#e0e0e0);font-size:12px;
      " value="echo hello">
      <button id="tmux-start-btn" style="
        padding:4px 10px;background:#2563eb;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;
      ">Start</button>
      <button id="tmux-refresh-btn" style="
        padding:4px 10px;background:var(--bg-btn,#374151);color:var(--text-primary,#e0e0e0);
        border:none;border-radius:4px;cursor:pointer;font-size:12px;
      ">Refresh</button>
    </div>
    <div id="tmux-sessions-list" style="
      padding:6px 8px;border-bottom:1px solid var(--border,#333);
      min-height:32px;max-height:80px;overflow-y:auto;
    ">
      <span style="color:var(--text-secondary,#888)">No sessions</span>
    </div>
    <div id="tmux-log" style="
      flex:1;overflow-y:auto;padding:8px;
      background:var(--bg-log,#0d0d0d);color:#22c55e;
      white-space:pre-wrap;word-break:break-all;min-height:120px;
    "></div>
    <div id="tmux-stream-controls" style="
      padding:6px 8px;border-top:1px solid var(--border,#333);
      display:flex;align-items:center;gap:6px;
    ">
      <span id="tmux-stream-status" style="color:var(--text-secondary,#888);font-size:11px;flex:1;">Not streaming</span>
      <button id="tmux-stop-stream-btn" style="
        padding:3px 8px;background:#dc2626;color:#fff;border:none;border-radius:4px;
        cursor:pointer;font-size:12px;display:none;
      ">Stop</button>
    </div>
  </div>
</div>`;
}

async function fetchSessions(): Promise<TmuxSession[]> {
  const res = await fetch('/api/tmux/sessions');
  if (!res.ok) return [];
  const data = (await res.json()) as { sessions: TmuxSession[] };
  return data.sessions;
}

function renderSessionsList(sessions: TmuxSession[]): void {
  const listEl = document.getElementById('tmux-sessions-list');
  if (!listEl) return;
  if (sessions.length === 0) {
    listEl.innerHTML = '<span style="color:var(--text-secondary,#888)">No sessions</span>';
    return;
  }
  listEl.innerHTML = sessions
    .map(
      (s) => `
    <div style="display:flex;align-items:center;gap:6px;padding:2px 0;">
      <span style="color:#60a5fa;font-weight:bold;">${escapeHtml(s.name)}</span>
      <span style="color:var(--text-secondary,#666);font-size:11px;">${escapeHtml(s.created)}</span>
      <button class="tmux-stream-btn" data-name="${escapeHtml(s.name)}" style="
        padding:2px 6px;background:#16a34a;color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:11px;
      ">Stream</button>
      <button class="tmux-kill-btn" data-name="${escapeHtml(s.name)}" style="
        padding:2px 6px;background:#dc2626;color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:11px;
      ">Kill</button>
    </div>`
    )
    .join('');

  listEl.querySelectorAll<HTMLButtonElement>('.tmux-stream-btn').forEach((btn) => {
    btn.addEventListener('click', () => startStream(btn.dataset.name!));
  });

  listEl.querySelectorAll<HTMLButtonElement>('.tmux-kill-btn').forEach((btn) => {
    btn.addEventListener('click', () => killSession(btn.dataset.name!));
  });
}

function setStreamStatus(text: string, streaming: boolean): void {
  const statusEl = document.getElementById('tmux-stream-status');
  const stopBtn = document.getElementById('tmux-stop-stream-btn') as HTMLButtonElement | null;
  if (statusEl) statusEl.textContent = text;
  if (stopBtn) stopBtn.style.display = streaming ? '' : 'none';
}

function stopCurrentStream(): void {
  if (currentStream) {
    currentStream.close();
    currentStream = null;
    setStreamStatus('Not streaming', false);
  }
}

function startStream(sessionName: string): void {
  stopCurrentStream();
  if (logEl) logEl.textContent = '';
  setStreamStatus(`Streaming: ${sessionName}`, true);

  const es = new EventSource(`/api/tmux/sessions/${encodeURIComponent(sessionName)}/stream`);
  currentStream = es;

  es.addEventListener('pane', (e: MessageEvent) => {
    if (logEl) {
      const content = JSON.parse(e.data as string) as string;
      logEl.textContent = content;
      logEl.scrollTop = logEl.scrollHeight;
    }
  });

  es.addEventListener('end', () => {
    setStreamStatus('Session ended', false);
    es.close();
    currentStream = null;
    refreshSessions();
  });

  es.onerror = () => {
    setStreamStatus('Stream error', false);
    es.close();
    currentStream = null;
  };
}

async function killSession(name: string): Promise<void> {
  stopCurrentStream();
  await fetch(`/api/tmux/sessions/${encodeURIComponent(name)}`, { method: 'DELETE' });
  await refreshSessions();
}

async function startSession(): Promise<void> {
  const nameEl = document.getElementById('tmux-session-name') as HTMLInputElement | null;
  const cmdEl = document.getElementById('tmux-session-cmd') as HTMLInputElement | null;
  if (!nameEl || !cmdEl) return;
  const name = nameEl.value.trim();
  const command = cmdEl.value.trim();
  if (!name || !command) {
    alert('Session name and command are required');
    return;
  }
  const res = await fetch('/api/tmux/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, command }),
  });
  if (!res.ok) {
    const err = (await res.json()) as { error: string };
    alert(`Failed to start session: ${err.error}`);
    return;
  }
  nameEl.value = '';
  await refreshSessions();
}

async function refreshSessions(): Promise<void> {
  const sessions = await fetchSessions();
  renderSessionsList(sessions);
}

function collapseToggle(): void {
  const body = document.getElementById('tmux-panel-body');
  const toggleBtn = document.getElementById('tmux-panel-toggle');
  if (!body || !toggleBtn) return;
  const collapsed = body.style.display === 'none';
  body.style.display = collapsed ? 'flex' : 'none';
  toggleBtn.textContent = collapsed ? '▲' : '▼';
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function initTmuxPanel(): void {
  const container = document.createElement('div');
  container.innerHTML = buildPanelHtml();
  document.body.appendChild(container);

  panelEl = document.getElementById('tmux-panel');
  logEl = document.getElementById('tmux-log');

  document.getElementById('tmux-start-btn')?.addEventListener('click', () => void startSession());
  document.getElementById('tmux-refresh-btn')?.addEventListener('click', () => void refreshSessions());
  document.getElementById('tmux-stop-stream-btn')?.addEventListener('click', stopCurrentStream);
  document.getElementById('tmux-panel-toggle')?.addEventListener('click', collapseToggle);
  document.getElementById('tmux-panel-close')?.addEventListener('click', () => {
    stopCurrentStream();
    if (panelEl) panelEl.style.display = 'none';
  });

  void refreshSessions();
}
