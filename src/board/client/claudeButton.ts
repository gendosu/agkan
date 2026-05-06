// Client-side Claude button management: SSE /api/running-tasks/stream
// and updating button states on task cards.

import { attachTerminalToTab, detachTerminal, getCurrentTerminalTaskId } from './claudeTerminalModal';

let _runningTaskIds: Set<number> = new Set();
let _planningTaskIds: Set<number> = new Set();
const _inFlightTaskIds: Set<number> = new Set();
let _openTaskDetail: ((taskId: string) => Promise<void>) | null = null;
let _switchTab: ((tabName: string) => void) | null = null;
let _updateTerminalTabUi: (() => void) | null = null;

export function registerClaudeButtonDetailHooks(hooks: {
  openTaskDetail: (taskId: string) => Promise<void>;
  switchTab: (tabName: string) => void;
  updateTerminalTabUi: () => void;
}): void {
  _openTaskDetail = hooks.openTaskDetail;
  _switchTab = hooks.switchTab;
  _updateTerminalTabUi = hooks.updateTerminalTabUi;
}

export function getRunningTaskIds(): Set<number> {
  return _runningTaskIds;
}

export function updateButtonStates(runningTaskIds: Set<number>, planningTaskIds: Set<number> = new Set()): void {
  const previousRunning = _runningTaskIds;
  _runningTaskIds = runningTaskIds;
  const onlyPlanningRunning = runningTaskIds.size > 0 && [...runningTaskIds].every((id) => planningTaskIds.has(id));
  const anyRunning = runningTaskIds.size > 0 && !onlyPlanningRunning;

  const indicator = document.getElementById('header-running-indicator');
  if (indicator) {
    indicator.style.display = runningTaskIds.size > 0 ? '' : 'none';
  }

  // If the task currently attached to the xterm.js terminal just stopped
  // running, disconnect its WebSocket while preserving the displayed output.
  const terminalTaskId = getCurrentTerminalTaskId();
  if (terminalTaskId !== null && previousRunning.has(terminalTaskId) && !runningTaskIds.has(terminalTaskId)) {
    detachTerminal();
  }

  // Update all run split containers
  document.querySelectorAll<HTMLElement>('.claude-run-split').forEach((split) => {
    const taskId = Number(split.dataset.taskId);
    if (runningTaskIds.has(taskId)) {
      replaceWithRunningBtn(split as unknown as HTMLButtonElement, taskId);
    } else {
      split
        .querySelectorAll<HTMLButtonElement>('.claude-run-btn, .claude-run-toggle, .claude-run-menu-item')
        .forEach((btn) => {
          btn.disabled = anyRunning;
        });
    }
  });

  // Update all plan buttons
  document.querySelectorAll<HTMLButtonElement>('.claude-plan-btn').forEach((btn) => {
    const taskId = Number(btn.dataset.taskId);
    if (runningTaskIds.has(taskId)) {
      replaceWithRunningBtn(btn, taskId);
    }
  });

  // Update running buttons back to run/plan if no longer running
  document.querySelectorAll<HTMLButtonElement>('.claude-running-btn').forEach((btn) => {
    const taskId = Number(btn.dataset.taskId);
    if (!runningTaskIds.has(taskId)) {
      // Find the card to determine status
      const card = btn.closest<HTMLElement>('.card');
      const status = card?.dataset.status;
      replaceWithRunOrPlanBtn(btn, taskId, status);
    }
  });

  // Refresh terminal tab UI in case the running set for the displayed task changed
  if (_updateTerminalTabUi) _updateTerminalTabUi();
}

function replaceWithRunningBtn(btn: HTMLButtonElement, taskId: number): void {
  const runningBtn = document.createElement('button');
  runningBtn.className = 'claude-running-btn';
  runningBtn.dataset.taskId = String(taskId);
  runningBtn.textContent = '● Running';
  attachRunningBtnListener(runningBtn);
  btn.replaceWith(runningBtn);
}

function replaceWithRunOrPlanBtn(btn: HTMLButtonElement, taskId: number, status: string | undefined): void {
  _planningTaskIds.delete(taskId);
  if (['review', 'done', 'closed'].includes(status ?? '')) {
    btn.remove();
    return;
  }
  if (['ready', 'in_progress'].includes(status ?? '')) {
    const split = createRunSplitElement(taskId);
    btn.replaceWith(split);
  } else {
    const newBtn = document.createElement('button');
    newBtn.className = 'claude-plan-btn';
    newBtn.dataset.taskId = String(taskId);
    newBtn.innerHTML = '&#128203; Planning';
    attachPlanBtnListener(newBtn);
    btn.replaceWith(newBtn);
  }
}

function createRunSplitElement(taskId: number): HTMLElement {
  const split = document.createElement('div');
  split.className = 'claude-run-split';
  split.dataset.taskId = String(taskId);

  const mainBtn = document.createElement('button');
  mainBtn.className = 'claude-run-btn';
  mainBtn.dataset.taskId = String(taskId);
  mainBtn.innerHTML = '&#9654; Run';

  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'claude-run-toggle';
  toggleBtn.dataset.taskId = String(taskId);
  toggleBtn.title = 'More options';
  toggleBtn.innerHTML = '&#9660;';

  const menu = document.createElement('div');
  menu.className = 'claude-run-menu';

  const directItem = document.createElement('button');
  directItem.className = 'claude-run-menu-item';
  directItem.dataset.taskId = String(taskId);
  directItem.dataset.command = 'direct';
  directItem.innerHTML = '&#9654; Run (current branch)';

  const prItem = document.createElement('button');
  prItem.className = 'claude-run-menu-item';
  prItem.dataset.taskId = String(taskId);
  prItem.dataset.command = 'pr';
  prItem.innerHTML = '&#9654; Run (create PR)';

  menu.appendChild(directItem);
  menu.appendChild(prItem);
  split.appendChild(mainBtn);
  split.appendChild(toggleBtn);
  split.appendChild(menu);

  attachRunSplitListeners(split, mainBtn, toggleBtn, directItem, prItem, taskId);
  return split;
}

function attachRunSplitListeners(
  split: HTMLElement,
  mainBtn: HTMLButtonElement,
  toggleBtn: HTMLButtonElement,
  directItem: HTMLButtonElement,
  prItem: HTMLButtonElement,
  taskId: number
): void {
  split.dataset.listenersAttached = 'true';
  mainBtn.addEventListener('click', async (e: MouseEvent) => {
    e.stopPropagation();
    await triggerRunTask(taskId, split as unknown as HTMLButtonElement, {});
  });

  toggleBtn.addEventListener('click', (e: MouseEvent) => {
    e.stopPropagation();
    split.classList.toggle('open');
  });

  directItem.addEventListener('click', async (e: MouseEvent) => {
    e.stopPropagation();
    split.classList.remove('open');
    await triggerRunTask(taskId, split as unknown as HTMLButtonElement, {});
  });

  prItem.addEventListener('click', async (e: MouseEvent) => {
    e.stopPropagation();
    split.classList.remove('open');
    await triggerRunTask(taskId, split as unknown as HTMLButtonElement, { command: 'pr' });
  });
}

function attachPlanBtnListener(btn: HTMLButtonElement): void {
  btn.dataset.listenersAttached = 'true';
  btn.addEventListener('click', async (e: MouseEvent) => {
    e.stopPropagation();
    const taskId = Number(btn.dataset.taskId);
    await triggerRunTask(taskId, btn, { command: 'planning' });
  });
}

function attachRunningBtnListener(btn: HTMLButtonElement): void {
  btn.dataset.listenersAttached = 'true';
  btn.addEventListener('click', async (e: MouseEvent) => {
    e.stopPropagation();
    const taskId = Number(btn.dataset.taskId);
    await openTerminalTab(taskId);
  });
}

async function openTerminalTab(taskId: number): Promise<void> {
  if (!_openTaskDetail || !_switchTab) return;
  await _openTaskDetail(String(taskId));
  _switchTab('terminal');
  const host = document.getElementById('detail-terminal-host');
  if (host) {
    const placeholder = document.getElementById('detail-terminal-placeholder');
    if (placeholder) placeholder.style.display = 'none';
    attachTerminalToTab(taskId, host);
  }
  if (_updateTerminalTabUi) _updateTerminalTabUi();
}

async function triggerRunTask(taskId: number, btn: HTMLButtonElement, body: Record<string, unknown>): Promise<void> {
  if (_inFlightTaskIds.has(taskId)) return;
  _inFlightTaskIds.add(taskId);

  // Disable immediately to prevent double-clicks before response arrives
  btn.disabled = true;
  btn.querySelectorAll<HTMLButtonElement>('button').forEach((b) => (b.disabled = true));

  try {
    const res = await fetch(`/api/claude/tasks/${taskId}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      _runningTaskIds = new Set(_runningTaskIds).add(taskId);
      if (body.command === 'planning') {
        _planningTaskIds = new Set(_planningTaskIds).add(taskId);
      }
      replaceWithRunningBtn(btn, taskId);
      await openTerminalTab(taskId);
    } else {
      btn.disabled = false;
      btn.querySelectorAll<HTMLButtonElement>('button').forEach((b) => (b.disabled = false));
      let errorDetail = `HTTP ${res.status}`;
      try {
        const data = (await res.json()) as { error?: string };
        if (data.error) errorDetail += `: ${data.error}`;
      } catch {
        // ignore JSON parse error
      }
      console.error(`[claude] Failed to start task ${taskId}: ${errorDetail}`);
      if (res.status === 409) {
        alert(`このタスクはすでに実行中です (task ${taskId})`);
      } else {
        alert(`Claude起動エラー (task ${taskId}): ${errorDetail}`);
      }
    }
  } catch (err) {
    btn.disabled = false;
    btn.querySelectorAll<HTMLButtonElement>('button').forEach((b) => (b.disabled = false));
    console.error(`[claude] Network error starting task ${taskId}:`, err);
  } finally {
    _inFlightTaskIds.delete(taskId);
  }
}

function handleRunningTasksUpdate(tasks: { taskId: number; command: string }[]): void {
  const allIds = new Set(tasks.map((t) => t.taskId));
  const planningIds = new Set(tasks.filter((t) => t.command === 'planning').map((t) => t.taskId));
  updateButtonStates(allIds, planningIds);
}

export function updateCardButton(card: HTMLElement, newStatus: string): void {
  const taskId = Number(card.dataset.id);
  if (_runningTaskIds.has(taskId)) return;

  const existingEl = card.querySelector<HTMLElement>('.claude-run-split, .claude-plan-btn, .claude-running-btn');
  if (!existingEl) return;

  if (['review', 'done', 'closed'].includes(newStatus)) {
    existingEl.remove();
  } else if (['ready', 'in_progress'].includes(newStatus)) {
    if (!existingEl.classList.contains('claude-run-split')) {
      const split = createRunSplitElement(taskId);
      existingEl.replaceWith(split);
    }
  } else {
    if (!existingEl.classList.contains('claude-plan-btn')) {
      const newBtn = document.createElement('button');
      newBtn.className = 'claude-plan-btn';
      newBtn.dataset.taskId = String(taskId);
      newBtn.innerHTML = '&#128203; Planning';
      attachPlanBtnListener(newBtn);
      existingEl.replaceWith(newBtn);
    }
  }
}

export function attachClaudeButtonListeners(body: HTMLElement): void {
  body.querySelectorAll<HTMLElement>('.claude-run-split').forEach((split) => {
    if (split.dataset.listenersAttached) return;
    const taskId = Number(split.dataset.taskId);
    const mainBtn = split.querySelector<HTMLButtonElement>('.claude-run-btn');
    const toggleBtn = split.querySelector<HTMLButtonElement>('.claude-run-toggle');
    const directItem = split.querySelector<HTMLButtonElement>('[data-command="direct"]');
    const prItem = split.querySelector<HTMLButtonElement>('[data-command="pr"]');
    if (mainBtn && toggleBtn && directItem && prItem) {
      attachRunSplitListeners(split, mainBtn, toggleBtn, directItem, prItem, taskId);
    }
  });
  body.querySelectorAll<HTMLButtonElement>('.claude-plan-btn').forEach((btn) => {
    if (btn.dataset.listenersAttached) return;
    attachPlanBtnListener(btn);
  });
  body.querySelectorAll<HTMLButtonElement>('.claude-running-btn').forEach((btn) => {
    if (btn.dataset.listenersAttached) return;
    attachRunningBtnListener(btn);
  });
  // Apply current running state to newly rendered buttons
  updateButtonStates(_runningTaskIds, _planningTaskIds);
}

export function initClaudeButton(): void {
  // Attach listeners to all existing cards
  document.querySelectorAll<HTMLElement>('.column-body').forEach((body) => {
    attachClaudeButtonListeners(body);
  });

  // Close open run menus when clicking outside
  document.addEventListener('click', () => {
    document.querySelectorAll<HTMLElement>('.claude-run-split.open').forEach((el) => {
      el.classList.remove('open');
    });
  });

  const es = new EventSource('/api/running-tasks/stream');
  es.addEventListener('update', (event: MessageEvent) => {
    const data = JSON.parse(event.data) as { tasks: { taskId: number; command: string }[] };
    handleRunningTasksUpdate(data.tasks);
  });
}
