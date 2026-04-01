// Client-side Claude button management: polling /api/claude/running-tasks
// and updating button states on task cards.

let _claudeModalCallback: ((taskId: number) => void) | null = null;
let _runningTaskIds: Set<number> = new Set();

export function registerClaudeModalCallback(callback: (taskId: number) => void): void {
  _claudeModalCallback = callback;
}

export function getRunningTaskIds(): Set<number> {
  return _runningTaskIds;
}

export function updateButtonStates(runningTaskIds: Set<number>): void {
  _runningTaskIds = runningTaskIds;

  // Update all run split containers
  document.querySelectorAll<HTMLElement>('.claude-run-split').forEach((split) => {
    const taskId = Number(split.dataset.taskId);
    if (runningTaskIds.has(taskId)) {
      replaceWithDetailBtn(split as unknown as HTMLButtonElement, taskId);
    }
  });

  // Update all plan buttons
  document.querySelectorAll<HTMLButtonElement>('.claude-plan-btn').forEach((btn) => {
    const taskId = Number(btn.dataset.taskId);
    if (runningTaskIds.has(taskId)) {
      replaceWithDetailBtn(btn, taskId);
    }
  });

  // Update detail buttons back to run/plan if no longer running
  document.querySelectorAll<HTMLButtonElement>('.claude-detail-btn').forEach((btn) => {
    const taskId = Number(btn.dataset.taskId);
    if (!runningTaskIds.has(taskId)) {
      // Find the card to determine status
      const card = btn.closest<HTMLElement>('.card');
      const status = card?.dataset.status;
      replaceWithRunOrPlanBtn(btn, taskId, status);
    }
  });
}

function replaceWithDetailBtn(btn: HTMLButtonElement, taskId: number): void {
  const detailBtn = document.createElement('button');
  detailBtn.className = 'claude-detail-btn';
  detailBtn.dataset.taskId = String(taskId);
  detailBtn.textContent = '● Details';
  attachDetailBtnListener(detailBtn);
  btn.replaceWith(detailBtn);
}

function replaceWithRunOrPlanBtn(btn: HTMLButtonElement, taskId: number, status: string | undefined): void {
  if (['review', 'done', 'closed'].includes(status ?? '')) {
    btn.remove();
    return;
  }
  if (status === 'ready') {
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
  btn.addEventListener('click', async (e: MouseEvent) => {
    e.stopPropagation();
    const taskId = Number(btn.dataset.taskId);
    await triggerRunTask(taskId, btn, { command: 'planning' });
  });
}

function attachDetailBtnListener(btn: HTMLButtonElement): void {
  btn.addEventListener('click', (e: MouseEvent) => {
    e.stopPropagation();
    const taskId = Number(btn.dataset.taskId);
    if (_claudeModalCallback) {
      _claudeModalCallback(taskId);
    }
  });
}

async function triggerRunTask(taskId: number, btn: HTMLButtonElement, body: Record<string, unknown>): Promise<void> {
  try {
    const res = await fetch(`/api/claude/tasks/${taskId}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      _runningTaskIds = new Set(_runningTaskIds).add(taskId);
      replaceWithDetailBtn(btn, taskId);
    }
  } catch {
    // Ignore network errors
  }
}

async function pollRunningTasks(): Promise<void> {
  try {
    const res = await fetch('/api/claude/running-tasks');
    if (!res.ok) return;
    const data = (await res.json()) as { taskIds: number[] };
    updateButtonStates(new Set(data.taskIds));
  } catch {
    // Ignore network errors during polling
  }
}

export function attachClaudeButtonListeners(body: HTMLElement): void {
  body.querySelectorAll<HTMLElement>('.claude-run-split').forEach((split) => {
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
    attachPlanBtnListener(btn);
  });
  body.querySelectorAll<HTMLButtonElement>('.claude-detail-btn').forEach((btn) => {
    attachDetailBtnListener(btn);
  });
  // Apply current running state to newly rendered buttons
  updateButtonStates(_runningTaskIds);
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

  // Start polling for running tasks
  setInterval(pollRunningTasks, 2500);
  pollRunningTasks();
}
