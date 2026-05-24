// Detail panel event wiring and state management

import type { TaskDetail } from './types';
import { relativeTime, showToast } from './utils';
import { loadAllTags, renderTagsSection, registerGetDetailTaskId } from './tags';
import { refreshBoardCards, registerDetailPanelCallbacks } from './boardPolling';
import {
  fetchComments,
  patchComment,
  deleteCommentRequest,
  postComment,
  fetchTaskDetail,
  patchTask,
  fetchPanelWidthFromConfig,
  savePanelWidthToConfig,
  fetchRunLogs,
  subscribeRunLogs,
  PANEL_MIN_WIDTH,
  PANEL_MAX_WIDTH,
} from './detailPanelApi';
import { setRunLogsActive } from './connectionStatus';
import {
  renderCommentItemHtml,
  renderAddCommentFormHtml,
  renderDetailPanelHtml,
  renderRunLogsHtml,
  buildDetailPanelHtml,
  autoResizeTextarea,
} from './detailPanelHtml';
import { fitTerminal, stopTerminal, getCurrentTerminalTaskId, attachTerminalToTab } from './claudeTerminalModal';
import { getRunningTaskIds } from './claudeButton';

const BRANCH_AUTO_GENERATE = '<auto-generate>';
const BRANCH_AUTO_GENERATE_DISPLAY = '✨ Auto-generate on run';

// State
let detailTaskId: number | null = null;
let lastTab = 'details';
let runLogEventSource: EventSource | null = null;
let currentFetchController: AbortController | null = null;
let runLogLoadSeq = 0;
let runLogsLoadedTaskId: number | null = null;

// Branch suggestions state
let branchSuggestions: string[] = [];
let branchSuggestionsLoaded = false;

// Branch internal value: '<auto-generate>' or actual branch name
let branchInternalValue: string = BRANCH_AUTO_GENERATE;

function setDetailBranchAutoMode(input: HTMLInputElement): void {
  branchInternalValue = BRANCH_AUTO_GENERATE;
  input.value = BRANCH_AUTO_GENERATE_DISPLAY;
  input.readOnly = true;
  input.classList.add('branch-auto-mode');
}

function setDetailBranchManualMode(input: HTMLInputElement, branch: string): void {
  branchInternalValue = branch;
  input.value = branch;
  input.readOnly = false;
  input.classList.remove('branch-auto-mode');
}

function closeRunLogStream(): void {
  if (runLogEventSource !== null) {
    runLogEventSource.close();
    runLogEventSource = null;
    setRunLogsActive(false);
  }
}

// Exported getter for other modules to access the current task ID
export function getDetailTaskId(): number | null {
  return detailTaskId;
}

export function getDetailActiveTab(): string {
  return lastTab;
}

export function setActiveCard(taskId: number | null): void {
  document.querySelectorAll<HTMLElement>('.card.active').forEach((card) => {
    card.classList.remove('active');
  });
  if (taskId !== null) {
    const card = document.querySelector<HTMLElement>('.card[data-id="' + taskId + '"]');
    if (card) card.classList.add('active');
  }
}

export function closeDetailPanel(): void {
  closeRunLogStream();
  runLogsLoadedTaskId = null;
  const runLogsPane = document.getElementById('detail-tab-content-run-logs');
  if (runLogsPane) {
    delete runLogsPane.dataset.runLogsTaskId;
    delete runLogsPane.dataset.runLogsSignature;
  }
  const detailPanel = document.getElementById('detail-panel') as HTMLElement;
  detailPanel.classList.remove('open');
  detailPanel.style.width = '';
  setActiveCard(null);
  detailTaskId = null;
}

export function switchTab(tabName: string): void {
  const activeTabBtn = document.querySelector<HTMLElement>('.detail-tab.active');
  const currentTab = activeTabBtn?.dataset.tab ?? null;
  const isSameTab = currentTab === tabName;

  if (tabName !== 'run-logs') {
    closeRunLogStream();
  }
  lastTab = tabName;
  if (!isSameTab) {
    document.querySelectorAll('.detail-tab').forEach((btn) => {
      (btn as HTMLElement).classList.toggle('active', (btn as HTMLElement).dataset.tab === tabName);
    });
    document.querySelectorAll('.detail-tab-content').forEach((el) => {
      (el as HTMLElement).classList.toggle('active', (el as HTMLElement).id === 'detail-tab-content-' + tabName);
    });
  }
  const footer = document.getElementById('detail-panel-footer');
  if (footer) footer.style.display = tabName === 'details' ? '' : 'none';
  if (tabName === 'details') {
    const textarea = document.getElementById('detail-edit-body') as HTMLTextAreaElement;
    if (textarea) {
      requestAnimationFrame(() => autoResizeTextarea(textarea));
    }
  }
  if (tabName === 'run-logs' && detailTaskId !== null && (!isSameTab || runLogsLoadedTaskId !== detailTaskId)) {
    loadRunLogs(detailTaskId);
  }
  if (tabName === 'terminal') {
    updateTerminalTabUi();
    // Refit only when the terminal pane currently hosts the active xterm.js
    // instance for this task — otherwise the placeholder is showing.
    if (detailTaskId !== null && getCurrentTerminalTaskId() === detailTaskId) {
      requestAnimationFrame(() => {
        fitTerminal();
      });
    }
  }
}

/**
 * Refresh the Terminal tab UI to reflect whether the current detail task is
 * actively running. Shows/hides the Stop button and placeholder text.
 */
export function updateTerminalTabUi(): void {
  const placeholder = document.getElementById('detail-terminal-placeholder');
  const stopBtn = document.getElementById('detail-terminal-stop-btn') as HTMLButtonElement | null;
  if (!placeholder || !stopBtn) return;

  const taskId = detailTaskId;
  const isRunning = taskId !== null && getRunningTaskIds().has(taskId);
  const hasTerminalForThisTask = taskId !== null && getCurrentTerminalTaskId() === taskId;

  // Auto-reconnect after browser reload: if the terminal tab is visible,
  // the task is running, and no terminal is attached yet, connect automatically.
  if (isRunning && !hasTerminalForThisTask && taskId !== null && lastTab === 'terminal') {
    const host = document.getElementById('detail-terminal-host');
    if (host) {
      attachTerminalToTab(taskId, host);
    }
  }

  // Placeholder visible only when there is no xterm.js attached for this task.
  placeholder.style.display = taskId !== null && getCurrentTerminalTaskId() === taskId ? 'none' : '';

  if (isRunning) {
    stopBtn.style.display = '';
    stopBtn.disabled = false;
    stopBtn.textContent = 'Stop';
  } else {
    stopBtn.style.display = 'none';
  }
}

async function loadComments(taskId: number): Promise<void> {
  const pane = document.getElementById('detail-tab-content-comments');
  if (!pane) return;
  try {
    const comments = await fetchComments(taskId);
    if (detailTaskId !== taskId) return;
    const tabBtn = document.getElementById('detail-tab-comments');
    if (tabBtn) tabBtn.textContent = 'Comments (' + comments.length + ')';
    renderComments(taskId, comments);
  } catch (err) {
    console.error('[agkan] loadComments failed for task', taskId, err);
    if (detailTaskId !== taskId) return;
    if (pane) pane.innerHTML = '<div style="padding:20px;font-size:12px;color:#94a3b8;">Failed to load comments</div>';
  }
}

function renderComments(
  taskId: number,
  comments: Array<{
    id: number;
    content: string;
    author?: string | null;
    created_at?: string;
  }>
): void {
  const pane = document.getElementById('detail-tab-content-comments');
  if (!pane) return;
  pane.style.padding = '16px 20px';

  let html = '';
  comments.forEach((comment) => {
    html += renderCommentItemHtml(comment, taskId);
  });
  html += renderAddCommentFormHtml(taskId);

  pane.innerHTML = html;

  // Attach event delegation listener once per pane instance.
  // Remove any previously attached listener before re-adding to avoid duplicates.
  const paneEl = pane as HTMLElement & { _commentActionHandler?: (e: MouseEvent) => void };
  if (paneEl._commentActionHandler) {
    paneEl.removeEventListener('click', paneEl._commentActionHandler);
  }
  paneEl._commentActionHandler = handleCommentAction;
  paneEl.addEventListener('click', paneEl._commentActionHandler);
}

// Comment action handlers (encapsulated, not exposed globally)

function openAddCommentForm(): void {
  const trigger = document.getElementById('add-comment-trigger');
  const form = document.getElementById('add-comment-form');
  if (trigger) trigger.style.display = 'none';
  if (form) {
    form.classList.add('open');
    (form.querySelector('textarea') as HTMLTextAreaElement).focus();
  }
}

function closeAddCommentForm(): void {
  const trigger = document.getElementById('add-comment-trigger');
  const form = document.getElementById('add-comment-form');
  if (trigger) trigger.style.display = '';
  if (form) {
    form.classList.remove('open');
    (form.querySelector('textarea') as HTMLTextAreaElement).value = '';
  }
}

function startCommentEdit(commentId: number): void {
  const contentEl = document.getElementById('comment-content-' + commentId);
  const editWrapper = document.getElementById('comment-edit-' + commentId);
  if (contentEl) contentEl.style.display = 'none';
  if (editWrapper) editWrapper.style.display = 'block';
  const area = document.getElementById('comment-edit-area-' + commentId) as HTMLTextAreaElement;
  if (area) area.focus();
}

function cancelCommentEdit(commentId: number): void {
  const contentEl = document.getElementById('comment-content-' + commentId);
  const editWrapper = document.getElementById('comment-edit-' + commentId);
  if (contentEl) contentEl.style.display = '';
  if (editWrapper) editWrapper.style.display = 'none';
}

async function saveCommentEdit(commentId: number, taskId: number): Promise<void> {
  const area = document.getElementById('comment-edit-area-' + commentId) as HTMLTextAreaElement;
  if (!area) return;
  const content = area.value.trim();
  if (!content) {
    area.focus();
    return;
  }
  try {
    await patchComment(commentId, content);
    await loadComments(taskId);
  } catch {
    showToast('Failed to update comment');
  }
}

async function deleteComment(commentId: number, taskId: number): Promise<void> {
  if (!confirm('Delete this comment?')) return;
  try {
    await deleteCommentRequest(commentId);
    await loadComments(taskId);
  } catch {
    showToast('Failed to delete comment');
  }
}

async function submitComment(taskId: number): Promise<void> {
  const textarea = document.getElementById('add-comment-text') as HTMLTextAreaElement;
  if (!textarea) return;
  const content = textarea.value.trim();
  if (!content) {
    textarea.focus();
    return;
  }
  try {
    await postComment(taskId, content);
    await loadComments(taskId);
  } catch {
    showToast('Failed to add comment');
  }
}

function dispatchCommentAction(action: string, commentId: number, taskId: number): void {
  switch (action) {
    case 'open-add-comment':
      openAddCommentForm();
      break;
    case 'close-add-comment':
      closeAddCommentForm();
      break;
    case 'start-comment-edit':
      startCommentEdit(commentId);
      break;
    case 'cancel-comment-edit':
      cancelCommentEdit(commentId);
      break;
    case 'save-comment-edit':
      void saveCommentEdit(commentId, taskId);
      break;
    case 'delete-comment':
      void deleteComment(commentId, taskId);
      break;
    case 'submit-comment':
      void submitComment(taskId);
      break;
  }
}

function handleCommentAction(e: MouseEvent): void {
  const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!target) return;
  const action = target.dataset.action ?? '';
  const commentId = target.dataset.commentId ? Number(target.dataset.commentId) : NaN;
  const taskId = target.dataset.taskId ? Number(target.dataset.taskId) : NaN;
  dispatchCommentAction(action, commentId, taskId);
}

function buildRunLogsSignature(logs: Awaited<ReturnType<typeof fetchRunLogs>>): string {
  return JSON.stringify(logs);
}

function renderRunLogsInPane(pane: HTMLElement, logs: Awaited<ReturnType<typeof fetchRunLogs>>): void {
  const nextSignature = buildRunLogsSignature(logs);
  if (pane.dataset.runLogsSignature === nextSignature) return;
  pane.dataset.runLogsSignature = nextSignature;
  // Save open state and scroll positions keyed by log ID
  const bodyScrollState = new Map<number, { scrollTop: number; isNearBottom: boolean }>();
  const openLogIds = new Set<number>();
  const hadPreviousItems = pane.querySelector('.run-log-item') !== null;
  const paneScrollTop = pane.scrollTop;
  const paneIsNearBottom = pane.scrollHeight - pane.scrollTop - pane.clientHeight <= 50;

  pane.querySelectorAll<HTMLElement>('.run-log-item.open').forEach((item) => {
    const logId = Number(item.dataset.logId);
    if (!logId) return;
    openLogIds.add(logId);
    const body = item.querySelector<HTMLElement>('.run-log-body');
    if (body) {
      const isNearBottom = body.scrollHeight - body.scrollTop - body.clientHeight <= 50;
      bodyScrollState.set(logId, { scrollTop: body.scrollTop, isNearBottom });
    }
  });

  pane.innerHTML = renderRunLogsHtml(logs);

  requestAnimationFrame(() => {
    if (hadPreviousItems) {
      pane.scrollTop = paneIsNearBottom ? pane.scrollHeight : paneScrollTop;
    }

    pane.querySelectorAll<HTMLElement>('.run-log-item').forEach((item) => {
      const logId = Number(item.dataset.logId);
      if (!logId) return;
      const body = item.querySelector<HTMLElement>('.run-log-body');
      if (!body) return;

      if (hadPreviousItems) {
        // Restore open/closed state from before the re-render
        if (openLogIds.has(logId)) {
          item.classList.add('open');
          const state = bodyScrollState.get(logId);
          if (state) {
            body.scrollTop = state.isNearBottom ? body.scrollHeight : state.scrollTop;
          } else {
            body.scrollTop = body.scrollHeight;
          }
        } else {
          item.classList.remove('open');
        }
      } else {
        // First render: keep default open state and scroll to bottom
        if (item.classList.contains('open')) {
          body.scrollTop = body.scrollHeight;
        }
      }
    });
  });
}

function loadRunLogs(taskId: number): void {
  closeRunLogStream();
  const seq = ++runLogLoadSeq;
  const pane = document.getElementById('detail-tab-content-run-logs');
  if (!pane) return;
  runLogsLoadedTaskId = taskId;
  if (pane.dataset.runLogsTaskId !== String(taskId)) {
    pane.dataset.runLogsTaskId = String(taskId);
    delete pane.dataset.runLogsSignature;
  }
  pane.removeEventListener('click', handleRunLogToggle);
  pane.addEventListener('click', handleRunLogToggle);
  setRunLogsActive(true);
  runLogEventSource = subscribeRunLogs(
    taskId,
    (logs) => {
      if (seq !== runLogLoadSeq) return;
      if (detailTaskId !== taskId) {
        closeRunLogStream();
        return;
      }
      const p = document.getElementById('detail-tab-content-run-logs');
      if (p) renderRunLogsInPane(p, logs);
    },
    () => {
      if (seq !== runLogLoadSeq) return;
      closeRunLogStream();
    }
  );
}

function handleRunLogToggle(e: MouseEvent): void {
  const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action="toggle-run-log"]');
  if (!target) return;
  const item = target.closest<HTMLElement>('.run-log-item');
  if (item) item.classList.toggle('open');
}

async function loadDetailBranchSuggestions(): Promise<void> {
  if (branchSuggestionsLoaded) return;
  try {
    const res = await fetch('/api/git/branches');
    if (!res.ok) throw new Error('Server error');
    const data = (await res.json()) as { branches: string[] };
    branchSuggestions = data.branches;
  } catch {
    branchSuggestions = [];
  }
  branchSuggestionsLoaded = true;
}

function renderDetailBranchDropdown(dropdown: HTMLElement, inputValue: string): void {
  const input = document.getElementById('detail-edit-branch') as HTMLInputElement;
  // When in auto-generate mode, show all suggestions unfiltered
  const isAutoMode = branchInternalValue === BRANCH_AUTO_GENERATE;
  const q = isAutoMode ? '' : inputValue.trim().toLowerCase();
  const filtered = q ? branchSuggestions.filter((b) => b.toLowerCase().includes(q)) : branchSuggestions;

  dropdown.innerHTML = '';

  // Fixed top item: auto-generate
  const autoOpt = document.createElement('div');
  autoOpt.className = 'branch-select-option branch-select-option-auto';
  autoOpt.textContent = BRANCH_AUTO_GENERATE_DISPLAY;
  if (branchInternalValue === BRANCH_AUTO_GENERATE) {
    autoOpt.classList.add('selected');
  }
  autoOpt.addEventListener('mousedown', (e: MouseEvent) => {
    e.preventDefault();
    if (input) setDetailBranchAutoMode(input);
    dropdown.style.display = 'none';
  });
  dropdown.appendChild(autoOpt);

  // Separator
  const separator = document.createElement('div');
  separator.className = 'branch-select-separator';
  dropdown.appendChild(separator);

  // Git branch list
  filtered.forEach((branch) => {
    const opt = document.createElement('div');
    opt.className = 'branch-select-option';
    opt.textContent = branch;
    opt.addEventListener('mousedown', (e: MouseEvent) => {
      e.preventDefault();
      if (input) setDetailBranchManualMode(input, branch);
      dropdown.style.display = 'none';
    });
    dropdown.appendChild(opt);
  });

  dropdown.style.display = 'block';
}

function wireBranchField(currentBranch: string | null | undefined): void {
  const branchInput = document.getElementById('detail-edit-branch') as HTMLInputElement;
  const branchDropdown = document.getElementById('detail-branch-dropdown') as HTMLElement;

  // Initialize internal value from current task branch
  const isAuto = currentBranch === null || currentBranch === undefined || currentBranch === BRANCH_AUTO_GENERATE;
  branchInternalValue = isAuto ? BRANCH_AUTO_GENERATE : currentBranch;

  if (!branchInput || !branchDropdown) return;

  branchInput.addEventListener('focus', async () => {
    await loadDetailBranchSuggestions();
    renderDetailBranchDropdown(branchDropdown, branchInput.value);
  });

  branchInput.addEventListener('keydown', (e: KeyboardEvent) => {
    if (branchInput.readOnly && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      branchInput.readOnly = false;
      branchInput.classList.remove('branch-auto-mode');
      branchInternalValue = '';
      branchInput.value = '';
    }
  });

  branchInput.addEventListener('input', () => {
    if (branchInternalValue === BRANCH_AUTO_GENERATE) {
      branchInput.readOnly = false;
      branchInput.classList.remove('branch-auto-mode');
    }
    branchInternalValue = branchInput.value;
    renderDetailBranchDropdown(branchDropdown, branchInput.value);
  });

  branchInput.addEventListener('blur', () => {
    setTimeout(() => {
      branchDropdown.style.display = 'none';
    }, 150);
  });
}

export function renderDetailPanel(data: TaskDetail): void {
  // Remove stale update-warning bar so it does not persist after reload
  document.getElementById('detail-panel-update-warning')?.remove();

  const detailPanelTitle = document.getElementById('detail-panel-title') as HTMLElement;
  const task = data.task;
  const tags = data.tags || [];

  detailTaskId = task.id;
  detailPanelTitle.textContent = '#' + task.id;

  const detailsPane = document.getElementById('detail-tab-content-details');
  if (detailsPane) {
    detailsPane.innerHTML = renderDetailPanelHtml(data);
    detailsPane.style.padding = '20px';

    detailsPane.querySelectorAll<HTMLElement>('.detail-relation-link[data-task-id]').forEach((el) => {
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => {
        const tid = el.dataset.taskId;
        if (tid) void openTaskDetail(tid);
      });
    });
  }

  // Wire branch field interactions
  wireBranchField(data.task.branch);

  // Update footer with timestamp and save button
  const footer = document.getElementById('detail-panel-footer');
  if (footer) {
    footer.innerHTML =
      '<span class="detail-footer-timestamp">created ' +
      relativeTime(task.created_at) +
      ' &middot; updated ' +
      relativeTime(task.updated_at) +
      '</span>' +
      '<button id="detail-save-btn">Save</button>';
    document.getElementById('detail-save-btn')?.addEventListener('click', saveDetailTask);
  }

  // Set up textarea auto-resize
  const textarea = document.getElementById('detail-edit-body') as HTMLTextAreaElement;
  if (textarea) {
    // ResizeObserver fires whenever the textarea's content-box width changes —
    // including during the panel's CSS width transition — so autoResizeTextarea
    // always measures scrollHeight at the actual current width.
    const ro = new ResizeObserver(() => {
      autoResizeTextarea(textarea);
    });
    ro.observe(textarea);
    // Disconnect after the panel transition (250ms) plus a generous buffer.
    // After that point the panel is stable and the `input` listener handles edits.
    setTimeout(() => ro.disconnect(), 400);
    // Double rAF guarantees at least one resize after layout settles, covering
    // the task-switch case where the panel is already open and textarea width
    // does not change (ResizeObserver may not fire without a size change).
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        autoResizeTextarea(textarea);
      });
    });

    textarea.addEventListener('input', () => {
      autoResizeTextarea(textarea);
    });
  }

  // Render tags section immediately to avoid content shift and blinking
  renderTagsSection([...tags]);

  // Load all available tags for dropdown in parallel (only needed on user interaction)
  loadAllTags().catch((err) => {
    console.error('[agkan] renderDetailPanel tags failed', err);
  });

  // Load comments into the comments tab
  loadComments(task.id);

  // Update Terminal tab UI based on this task's running state
  updateTerminalTabUi();

  // Restore last tab (switchTab handles loadRunLogs when run-logs tab is active)
  switchTab(lastTab);
}

export async function openTaskDetail(taskId: string): Promise<void> {
  const detailPanel = document.getElementById('detail-panel') as HTMLElement;
  const PANEL_DEFAULT_WIDTH = 400;

  // Set active card immediately to prevent flickering during concurrent clicks
  setActiveCard(Number(taskId));

  // Cancel any in-flight fetch from a previous click
  if (currentFetchController) {
    currentFetchController.abort();
  }
  currentFetchController = new AbortController();
  const { signal } = currentFetchController;

  try {
    const data = await fetchTaskDetail(taskId, signal);
    currentFetchController = null;
    renderDetailPanel(data);
    if (!detailPanel.classList.contains('open')) {
      const preferredWidth = detailPanel.dataset.preferredWidth || String(PANEL_DEFAULT_WIDTH);
      detailPanel.style.width = preferredWidth + 'px';
      detailPanel.classList.add('open');
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
    console.error('[agkan] openTaskDetail failed for task', taskId, err);
    showToast('Failed to load task details');
  }
}

export function showUpdateWarning(): void {
  const detailPanelBody = document.getElementById('detail-panel-body') as HTMLElement;
  const warning = document.getElementById('detail-panel-update-warning');
  if (!warning) {
    const warningEl = document.createElement('div');
    warningEl.id = 'detail-panel-update-warning';
    warningEl.style.cssText =
      'display: flex; align-items: center; gap: 8px; color: red; font-size: 0.85em; padding: 4px 8px; background: #fff0f0; border: 1px solid #ffcccc; border-radius: 4px; margin-bottom: 8px;';
    const msgSpan = document.createElement('span');
    msgSpan.style.cssText = 'flex: 1;';
    msgSpan.textContent =
      'This task has been updated in the database. Save or discard your changes to see the latest version.';
    const reloadBtn = buildUpdateWarningReloadBtn();
    warningEl.appendChild(msgSpan);
    warningEl.appendChild(reloadBtn);
    detailPanelBody.insertBefore(warningEl, detailPanelBody.firstChild);
  }
}

function buildUpdateWarningReloadBtn(): HTMLButtonElement {
  const reloadBtn = document.createElement('button');
  reloadBtn.title = 'Reload latest data';
  reloadBtn.textContent = '↺';
  reloadBtn.style.cssText =
    'background: none; border: none; cursor: pointer; font-size: 1.5em; color: red; padding: 0 4px; line-height: 1; flex-shrink: 0;';
  reloadBtn.addEventListener('click', async () => {
    try {
      if (detailTaskId !== null) {
        const taskData = await fetchTaskDetail(detailTaskId);
        renderDetailPanel(taskData);
      }
    } catch {
      // Ignore network errors
    }
  });
  return reloadBtn;
}

function collectEditedTaskFields(): {
  title: string;
  body: string | null;
  status: string | undefined;
  priority: string | null;
  branch: string | null;
} | null {
  const titleInput = document.getElementById('detail-edit-title') as HTMLInputElement;
  const title = titleInput ? titleInput.value.trim() : '';
  if (!title) {
    if (titleInput) titleInput.focus();
    return null;
  }
  const bodyEl = document.getElementById('detail-edit-body') as HTMLTextAreaElement;
  const statusEl = document.getElementById('detail-edit-status') as HTMLSelectElement;
  const priorityEl = document.getElementById('detail-edit-priority') as HTMLSelectElement;
  return {
    title,
    body: bodyEl ? bodyEl.value.trim() || null : null,
    status: statusEl ? statusEl.value : undefined,
    priority: priorityEl ? priorityEl.value || null : null,
    branch: branchInternalValue || null,
  };
}

async function saveDetailTask(): Promise<void> {
  if (detailTaskId === null) return;
  const fields = collectEditedTaskFields();
  if (!fields) return;

  try {
    const data = await patchTask(detailTaskId, fields);
    renderDetailPanel(data);
    showToast('Task saved successfully');
    refreshBoardCards();
  } catch {
    showToast('Failed to update task');
  }
}

async function initPanelWidthFromConfig(detailPanel: HTMLElement): Promise<void> {
  const targetWidth = await fetchPanelWidthFromConfig();
  detailPanel.dataset.preferredWidth = String(targetWidth);
}

function attachResizeMousedown(resizeHandle: HTMLElement, detailPanel: HTMLElement): void {
  resizeHandle.addEventListener('mousedown', function (e: MouseEvent) {
    e.preventDefault();
    if (!detailPanel.classList.contains('open')) return;
    const startX = e.clientX;
    const startWidth = detailPanel.offsetWidth;
    resizeHandle.classList.add('dragging');
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    detailPanel.style.transition = 'none';

    function onMouseMove(ev: MouseEvent): void {
      const delta = startX - ev.clientX;
      const newWidth = Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, startWidth + delta));
      detailPanel.style.width = newWidth + 'px';
    }

    function onMouseUp(): void {
      resizeHandle.classList.remove('dragging');
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      detailPanel.style.transition = '';
      const currentWidth = detailPanel.offsetWidth;
      detailPanel.dataset.preferredWidth = String(currentWidth);
      savePanelWidthToConfig(currentWidth);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (lastTab === 'terminal' && detailTaskId !== null && getCurrentTerminalTaskId() === detailTaskId) {
        requestAnimationFrame(() => fitTerminal());
      }
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}

function initPanelResize(detailPanel: HTMLElement): void {
  const resizeHandle = document.getElementById('detail-panel-resize-handle') as HTMLElement;
  initPanelWidthFromConfig(detailPanel);
  attachResizeMousedown(resizeHandle, detailPanel);
}

export function initDetailPanel(): void {
  const boardContainer = document.querySelector<HTMLElement>('.board-container')!;
  boardContainer.insertAdjacentHTML('beforeend', buildDetailPanelHtml());

  const detailPanel = document.getElementById('detail-panel') as HTMLElement;

  document.getElementById('detail-panel-close')?.addEventListener('click', closeDetailPanel);

  document.getElementById('detail-panel-copy-id')?.addEventListener('click', () => {
    if (detailTaskId === null) return;
    navigator.clipboard.writeText(String(detailTaskId)).then(() => {
      showToast('Copied task ID: ' + detailTaskId);
    });
  });

  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape' && detailPanel.classList.contains('open')) {
      const addModal = document.getElementById('add-modal');
      if (addModal?.classList.contains('show')) {
        document.getElementById('add-cancel')?.click();
      } else {
        closeDetailPanel();
      }
    }
  });

  document.getElementById('detail-tabs')?.addEventListener('click', (e: MouseEvent) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('.detail-tab');
    if (!btn) return;
    switchTab(btn.dataset.tab!);
  });

  document.getElementById('detail-terminal-stop-btn')?.addEventListener('click', () => {
    if (detailTaskId === null) return;
    const stopBtn = document.getElementById('detail-terminal-stop-btn') as HTMLButtonElement | null;
    if (stopBtn) {
      stopBtn.disabled = true;
      stopBtn.textContent = 'Stopping...';
    }
    void stopTerminal(detailTaskId).then((ok) => {
      if (!ok && stopBtn) {
        stopBtn.disabled = false;
        stopBtn.textContent = 'Stop';
      }
    });
  });

  initPanelResize(detailPanel);

  document.querySelectorAll<HTMLElement>('.card').forEach((card) => {
    if (card.dataset.listenersAttached) return;
    card.dataset.listenersAttached = '1';
    card.addEventListener('click', async (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      await openTaskDetail(card.dataset.id!);
    });
  });

  registerDetailPanelCallbacks({
    openTaskDetail,
    renderDetailPanel,
    showUpdateWarning,
    getDetailTaskId,
    getDetailActiveTab,
    setActiveCard,
  });

  registerGetDetailTaskId(getDetailTaskId);
}
