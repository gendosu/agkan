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
  syncTimestampAfterSave,
  fetchPanelWidthFromConfig,
  savePanelWidthToConfig,
  fetchRunLogs,
  PANEL_MIN_WIDTH,
  PANEL_MAX_WIDTH,
} from './detailPanelApi';
import {
  renderCommentItemHtml,
  renderAddCommentFormHtml,
  renderDetailPanelHtml,
  renderRunLogsHtml,
  buildDetailPanelHtml,
  autoResizeTextarea,
} from './detailPanelHtml';

// State
let detailTaskId: number | null = null;
let lastTab = 'details';
let runLogPollingInterval: ReturnType<typeof setInterval> | null = null;

function stopRunLogPolling(): void {
  if (runLogPollingInterval !== null) {
    clearInterval(runLogPollingInterval);
    runLogPollingInterval = null;
  }
}

// Exported getter for other modules to access the current task ID
export function getDetailTaskId(): number | null {
  return detailTaskId;
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
  stopRunLogPolling();
  const detailPanel = document.getElementById('detail-panel') as HTMLElement;
  detailPanel.classList.remove('open');
  detailPanel.style.width = '';
  setActiveCard(null);
  detailTaskId = null;
}

function switchTab(tabName: string): void {
  if (tabName !== 'run-logs') {
    stopRunLogPolling();
  }
  lastTab = tabName;
  document.querySelectorAll('.detail-tab').forEach((btn) => {
    (btn as HTMLElement).classList.toggle('active', (btn as HTMLElement).dataset.tab === tabName);
  });
  document.querySelectorAll('.detail-tab-content').forEach((el) => {
    (el as HTMLElement).classList.toggle('active', (el as HTMLElement).id === 'detail-tab-content-' + tabName);
  });
  const footer = document.getElementById('detail-panel-footer');
  if (footer) footer.style.display = tabName === 'details' ? '' : 'none';
  if (tabName === 'run-logs' && detailTaskId !== null) {
    loadRunLogs(detailTaskId).catch((err) => {
      console.error('[agkan] switchTab loadRunLogs failed', err);
    });
  }
}

async function loadComments(taskId: number): Promise<void> {
  const tabBtn = document.getElementById('detail-tab-comments');
  const pane = document.getElementById('detail-tab-content-comments');
  if (!pane) return;
  try {
    const comments = await fetchComments(taskId);
    if (tabBtn) tabBtn.textContent = 'Comments (' + comments.length + ')';
    renderComments(taskId, comments);
  } catch (err) {
    console.error('[agkan] loadComments failed for task', taskId, err);
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

function renderRunLogsInPane(pane: HTMLElement, logs: Awaited<ReturnType<typeof fetchRunLogs>>): void {
  pane.innerHTML = renderRunLogsHtml(logs);
  pane.addEventListener('click', handleRunLogToggle);
}

async function loadRunLogs(taskId: number): Promise<void> {
  stopRunLogPolling();
  const pane = document.getElementById('detail-tab-content-run-logs');
  if (!pane) return;
  try {
    const logs = await fetchRunLogs(taskId);
    renderRunLogsInPane(pane, logs);
    if (logs.some((log) => log.exit_code === null)) {
      runLogPollingInterval = setInterval(() => {
        if (detailTaskId !== taskId) {
          stopRunLogPolling();
          return;
        }
        fetchRunLogs(taskId)
          .then((updated) => {
            const p = document.getElementById('detail-tab-content-run-logs');
            if (p) renderRunLogsInPane(p, updated);
            if (!updated.some((log) => log.exit_code === null)) stopRunLogPolling();
          })
          .catch(() => stopRunLogPolling());
      }, 2000);
    }
  } catch (err) {
    console.error('[agkan] loadRunLogs failed for task', taskId, err);
    pane.innerHTML = '<div style="padding:20px;font-size:12px;color:#94a3b8;">Failed to load run logs</div>';
  }
}

function handleRunLogToggle(e: MouseEvent): void {
  const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action="toggle-run-log"]');
  if (!target) return;
  const item = target.closest<HTMLElement>('.run-log-item');
  if (item) item.classList.toggle('open');
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
    // Delay the initial resize until after the panel has been rendered with its correct width.
    // If autoResizeTextarea is called while the panel width is still 0 (before the .open class
    // is applied), scrollHeight is inflated due to text wrapping, causing an oversized textarea.
    requestAnimationFrame(() => {
      autoResizeTextarea(textarea);
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

  // Load run logs into the run logs tab
  loadRunLogs(task.id).catch((err) => {
    console.error('[agkan] renderDetailPanel loadRunLogs failed', err);
  });

  // Restore last tab
  switchTab(lastTab);
}

export async function openTaskDetail(taskId: string): Promise<void> {
  const detailPanel = document.getElementById('detail-panel') as HTMLElement;
  const PANEL_DEFAULT_WIDTH = 400;
  try {
    const data = await fetchTaskDetail(taskId);
    renderDetailPanel(data);
    setActiveCard(Number(taskId));
    if (!detailPanel.classList.contains('open')) {
      const preferredWidth = detailPanel.dataset.preferredWidth || String(PANEL_DEFAULT_WIDTH);
      detailPanel.style.width = preferredWidth + 'px';
      detailPanel.classList.add('open');
    }
  } catch (err) {
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
    'background: none; border: none; cursor: pointer; font-size: 1.1em; color: red; padding: 0 2px; line-height: 1; flex-shrink: 0;';
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
    await syncTimestampAfterSave();
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
      closeDetailPanel();
    }
  });

  document.getElementById('detail-tabs')?.addEventListener('click', (e: MouseEvent) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('.detail-tab');
    if (!btn) return;
    switchTab(btn.dataset.tab!);
  });

  initPanelResize(detailPanel);

  document.querySelectorAll<HTMLElement>('.card').forEach((card) => {
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
    setActiveCard,
  });

  registerGetDetailTaskId(getDetailTaskId);
}
