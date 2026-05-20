/**
 * @vitest-environment jsdom
 *
 * Tests for claudeButton module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  updateButtonStates,
  getRunningTaskIds,
  attachClaudeButtonListeners,
  initClaudeButton,
} from '../../../src/board/client/claudeButton';

beforeEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  // Reset running task ids
  updateButtonStates(new Set());
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeCardWithRunningBtn(taskId: number, status: string): HTMLElement {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.id = String(taskId);
  card.dataset.status = status;
  const header = document.createElement('div');
  header.className = 'card-header';
  const actions = document.createElement('div');
  actions.className = 'card-actions';
  const btn = document.createElement('button');
  btn.className = 'claude-running-btn';
  btn.dataset.taskId = String(taskId);
  const spinner = document.createElement('span');
  spinner.className = 'running-btn-spinner';
  const label = document.createElement('span');
  label.textContent = 'Running';
  btn.appendChild(spinner);
  btn.appendChild(label);
  actions.appendChild(btn);
  header.appendChild(actions);
  card.appendChild(header);
  document.body.appendChild(card);
  return card;
}

function makeRunSplit(taskId: number): HTMLElement {
  const split = document.createElement('div');
  split.className = 'claude-run-split';
  split.dataset.taskId = String(taskId);
  const mainBtn = document.createElement('button');
  mainBtn.className = 'claude-run-btn';
  mainBtn.dataset.taskId = String(taskId);
  mainBtn.textContent = '▶ Run';
  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'claude-run-toggle';
  toggleBtn.dataset.taskId = String(taskId);
  toggleBtn.textContent = '▼';
  const menu = document.createElement('div');
  menu.className = 'claude-run-menu';
  const directItem = document.createElement('button');
  directItem.className = 'claude-run-menu-item';
  directItem.dataset.taskId = String(taskId);
  directItem.dataset.command = 'direct';
  const prItem = document.createElement('button');
  prItem.className = 'claude-run-menu-item';
  prItem.dataset.taskId = String(taskId);
  prItem.dataset.command = 'pr';
  menu.appendChild(directItem);
  menu.appendChild(prItem);
  split.appendChild(mainBtn);
  split.appendChild(toggleBtn);
  split.appendChild(menu);
  return split;
}

function makeCard(taskId: number, status = 'backlog'): HTMLElement {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.id = String(taskId);
  card.dataset.status = status;
  const header = document.createElement('div');
  header.className = 'card-header';
  const actions = document.createElement('div');
  actions.className = 'card-actions';
  if (['ready', 'in_progress'].includes(status)) {
    actions.appendChild(makeRunSplit(taskId));
  } else {
    const btn = document.createElement('button');
    btn.className = 'claude-plan-btn';
    btn.dataset.taskId = String(taskId);
    btn.textContent = '📋 Planning';
    actions.appendChild(btn);
  }
  header.appendChild(actions);
  card.appendChild(header);
  document.body.appendChild(card);
  return card;
}

describe('updateButtonStates', () => {
  it('converts run button to running button when task is running', () => {
    makeCard(1, 'ready');
    updateButtonStates(new Set([1]));
    const runningBtn = document.querySelector('.claude-running-btn');
    expect(runningBtn).not.toBeNull();
    expect(document.querySelector('.claude-run-btn')).toBeNull();
  });

  it('converts plan button to running button when task is running', () => {
    makeCard(2, 'backlog');
    updateButtonStates(new Set([2]));
    const runningBtn = document.querySelector('.claude-running-btn');
    expect(runningBtn).not.toBeNull();
    expect(document.querySelector('.claude-plan-btn')).toBeNull();
  });

  it('leaves run button unchanged when task is not running', () => {
    makeCard(1, 'ready');
    updateButtonStates(new Set());
    expect(document.querySelector('.claude-run-btn')).not.toBeNull();
    expect(document.querySelector('.claude-detail-btn')).toBeNull();
  });

  it('converts running button back to plan button when task stops running (non-ready status)', () => {
    makeCard(3, 'backlog');
    updateButtonStates(new Set([3]));
    expect(document.querySelector('.claude-running-btn')).not.toBeNull();

    // Now stop running
    updateButtonStates(new Set());
    expect(document.querySelector('.claude-running-btn')).toBeNull();
    expect(document.querySelector('.claude-plan-btn')).not.toBeNull();
  });

  it('converts running button back to run button when task stops running (ready status)', () => {
    makeCard(4, 'ready');
    updateButtonStates(new Set([4]));
    expect(document.querySelector('.claude-running-btn')).not.toBeNull();

    updateButtonStates(new Set());
    expect(document.querySelector('.claude-running-btn')).toBeNull();
    expect(document.querySelector('.claude-run-btn')).not.toBeNull();
  });

  it('converts running button back to run button when task stops running (in_progress status)', () => {
    makeCard(6, 'in_progress');
    updateButtonStates(new Set([6]));
    expect(document.querySelector('.claude-running-btn')).not.toBeNull();

    updateButtonStates(new Set());
    expect(document.querySelector('.claude-running-btn')).toBeNull();
    expect(document.querySelector('.claude-run-btn')).not.toBeNull();
    expect(document.querySelector('.claude-plan-btn')).toBeNull();
  });

  it('updates getRunningTaskIds to reflect current running tasks', () => {
    makeCard(5, 'ready');
    updateButtonStates(new Set([5]));
    expect(getRunningTaskIds().has(5)).toBe(true);

    updateButtonStates(new Set());
    expect(getRunningTaskIds().has(5)).toBe(false);
  });

  it('handles multiple tasks simultaneously', () => {
    makeCard(1, 'ready');
    makeCard(2, 'backlog');
    makeCard(3, 'ready');
    updateButtonStates(new Set([1, 2]));
    const runningBtns = document.querySelectorAll('.claude-running-btn');
    expect(runningBtns).toHaveLength(2);
    // Card 3 should still be a run button
    const runBtns = document.querySelectorAll('.claude-run-btn');
    expect(runBtns).toHaveLength(1);
    expect((runBtns[0] as HTMLButtonElement).dataset.taskId).toBe('3');
  });

  it.each(['review', 'done', 'closed'])(
    'removes running button (no replacement) when task stops running with %s status',
    (status) => {
      const card = makeCardWithRunningBtn(6, status);
      expect(card.querySelector('.claude-running-btn')).not.toBeNull();

      updateButtonStates(new Set());
      expect(card.querySelector('.claude-running-btn')).toBeNull();
      expect(card.querySelector('.claude-plan-btn')).toBeNull();
      expect(card.querySelector('.claude-run-btn')).toBeNull();
    }
  );

  it('does not disable run buttons on other cards when only planning tasks are running', () => {
    makeCard(1, 'ready'); // planning running
    makeCard(2, 'ready'); // not running
    updateButtonStates(new Set([1]), new Set([1]));
    // Card 1 is running (planning) — replaced with running btn
    expect(document.querySelector('.claude-running-btn')).not.toBeNull();
    // Card 2 run button should NOT be disabled
    const runBtn = document.querySelector<HTMLButtonElement>('[data-task-id="2"].claude-run-btn');
    expect(runBtn?.disabled).toBe(false);
  });

  it('disables run buttons on other cards when a non-planning task is running', () => {
    makeCard(1, 'ready'); // running (run command)
    makeCard(2, 'ready'); // not running
    updateButtonStates(new Set([1]), new Set()); // no planning tasks
    // Card 2 run button should be disabled
    const runBtn = document.querySelector<HTMLButtonElement>('[data-task-id="2"] .claude-run-btn');
    expect(runBtn?.disabled).toBe(true);
  });
});

describe('running button click', () => {
  it('clicking running button triggers openTerminalTab via registerClaudeButtonDetailHooks', async () => {
    const { registerClaudeButtonDetailHooks } = await import('../../../src/board/client/claudeButton');
    const openTaskDetail = vi.fn().mockResolvedValue(undefined);
    const switchTab = vi.fn();
    const updateTerminalTabUi = vi.fn();
    registerClaudeButtonDetailHooks({ openTaskDetail, switchTab, updateTerminalTabUi });

    makeCard(10, 'ready');
    updateButtonStates(new Set([10]));

    const runningBtn = document.querySelector<HTMLButtonElement>('.claude-running-btn')!;
    expect(runningBtn).not.toBeNull();
    runningBtn.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(openTaskDetail).toHaveBeenCalledWith('10');
    expect(switchTab).toHaveBeenCalledWith('terminal');
  });
});

describe('attachClaudeButtonListeners', () => {
  it('attaches run button click handler that calls fetch POST', async () => {
    const body = document.createElement('div');
    body.className = 'column-body';

    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = '20';
    card.dataset.status = 'ready';
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    const split = makeRunSplit(20);
    actions.appendChild(split);
    card.appendChild(actions);
    body.appendChild(card);
    document.body.appendChild(body);

    global.fetch = vi.fn().mockResolvedValue({ ok: true });
    attachClaudeButtonListeners(body);
    split.querySelector<HTMLButtonElement>('.claude-run-btn')!.click();
    await new Promise((r) => setTimeout(r, 0));

    expect(global.fetch).toHaveBeenCalledWith('/api/claude/tasks/20/run', expect.objectContaining({ method: 'POST' }));
  });

  it('attaches plan button click handler that sends command: planning', async () => {
    const body = document.createElement('div');
    body.className = 'column-body';

    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = '21';
    card.dataset.status = 'backlog';
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    const btn = document.createElement('button');
    btn.className = 'claude-plan-btn';
    btn.dataset.taskId = '21';
    actions.appendChild(btn);
    card.appendChild(actions);
    body.appendChild(card);
    document.body.appendChild(body);

    global.fetch = vi.fn().mockResolvedValue({ ok: true });
    attachClaudeButtonListeners(body);
    btn.click();
    await new Promise((r) => setTimeout(r, 0));

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/claude/tasks/21/run',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ command: 'planning' }),
      })
    );
  });

  it('stops propagation on run button click to prevent card detail panel opening', () => {
    const body = document.createElement('div');
    body.className = 'column-body';

    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = '22';
    card.dataset.status = 'ready';
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    const split = makeRunSplit(22);
    actions.appendChild(split);
    card.appendChild(actions);
    body.appendChild(card);
    document.body.appendChild(body);

    global.fetch = vi.fn().mockResolvedValue({ ok: true });
    attachClaudeButtonListeners(body);

    const cardClickHandler = vi.fn();
    card.addEventListener('click', cardClickHandler);

    split.querySelector<HTMLButtonElement>('.claude-run-btn')!.click();
    expect(cardClickHandler).not.toHaveBeenCalled();
  });
});

describe('initClaudeButton', () => {
  it('registers listeners without throwing', () => {
    expect(() => initClaudeButton()).not.toThrow();
  });
});
