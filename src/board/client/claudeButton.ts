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

  // Update all run buttons
  document.querySelectorAll<HTMLButtonElement>('.claude-run-btn').forEach((btn) => {
    const taskId = Number(btn.dataset.taskId);
    if (runningTaskIds.has(taskId)) {
      replaceWithDetailBtn(btn, taskId);
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
  const newBtn = document.createElement('button');
  if (status === 'ready') {
    newBtn.className = 'claude-run-btn';
    newBtn.dataset.taskId = String(taskId);
    newBtn.innerHTML = '&#9654; Run';
    attachRunBtnListener(newBtn);
  } else {
    newBtn.className = 'claude-plan-btn';
    newBtn.dataset.taskId = String(taskId);
    newBtn.innerHTML = '&#128203; Planning';
    attachPlanBtnListener(newBtn);
  }
  btn.replaceWith(newBtn);
}

function attachRunBtnListener(btn: HTMLButtonElement): void {
  btn.addEventListener('click', async (e: MouseEvent) => {
    e.stopPropagation();
    const taskId = Number(btn.dataset.taskId);
    await triggerRunTask(taskId, btn, {});
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
  body.querySelectorAll<HTMLButtonElement>('.claude-run-btn').forEach((btn) => {
    attachRunBtnListener(btn);
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

  // Start polling for running tasks
  setInterval(pollRunningTasks, 2500);
  pollRunningTasks();
}
