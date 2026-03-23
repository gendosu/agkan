// Detail panel functionality

import type { TaskDetail } from './types';
import { escapeHtmlClient, relativeTime, showToast } from './utils';
import { loadAllTags, renderTagsSection, registerGetDetailTaskId } from './tags';
import { refreshBoardCards, setLastUpdatedAt, registerDetailPanelCallbacks } from './boardPolling';

// State
let detailTaskId: number | null = null;
let lastTab = 'details';

// Exported getter for other modules to access the current task ID
export function getDetailTaskId(): number | null {
  return detailTaskId;
}

export function closeDetailPanel(): void {
  const detailPanel = document.getElementById('detail-panel') as HTMLElement;
  detailPanel.classList.remove('open');
  detailPanel.style.width = '';
  detailTaskId = null;
}

function switchTab(tabName: string): void {
  lastTab = tabName;
  document.querySelectorAll('.detail-tab').forEach((btn) => {
    (btn as HTMLElement).classList.toggle('active', (btn as HTMLElement).dataset.tab === tabName);
  });
  document.querySelectorAll('.detail-tab-content').forEach((el) => {
    (el as HTMLElement).classList.toggle('active', (el as HTMLElement).id === 'detail-tab-content-' + tabName);
  });
  const footer = document.getElementById('detail-panel-footer');
  if (footer) footer.style.display = tabName === 'details' ? '' : 'none';
}

async function loadComments(taskId: number): Promise<void> {
  const tabBtn = document.getElementById('detail-tab-comments');
  const pane = document.getElementById('detail-tab-content-comments');
  if (!pane) return;
  try {
    const res = await fetch('/api/tasks/' + taskId + '/comments');
    if (!res.ok) throw new Error('Server error');
    const data = await res.json();
    const comments = data.comments || [];
    if (tabBtn) tabBtn.textContent = 'Comments (' + comments.length + ')';
    renderComments(taskId, comments);
  } catch (err) {
    console.error('[agkan] loadComments failed for task', taskId, err);
    if (pane) pane.innerHTML = '<div style="padding:20px;font-size:12px;color:#94a3b8;">Failed to load comments</div>';
  }
}

function renderCommentItemHtml(
  comment: { id: number; content: string; author?: string | null; created_at?: string },
  taskId: number
): string {
  const authorText = comment.author ? escapeHtmlClient(comment.author) : 'Anonymous';
  const dateRel = relativeTime(comment.created_at);
  const dateAbs = escapeHtmlClient(comment.created_at);
  const contentText = escapeHtmlClient(comment.content);
  let html = '<div class="comment-item" data-comment-id="' + comment.id + '">';
  html += '<div class="comment-meta">';
  html += '<span class="comment-author">' + authorText + '</span>';
  html += '<span class="comment-date" title="' + dateAbs + '">' + dateRel + '</span>';
  html += '<span class="comment-actions">';
  html +=
    '<button class="comment-action-btn" title="Edit" data-action="start-comment-edit" data-comment-id="' +
    comment.id +
    '">&#9998;</button>';
  html +=
    '<button class="comment-action-btn danger" title="Delete" data-action="delete-comment" data-comment-id="' +
    comment.id +
    '" data-task-id="' +
    taskId +
    '">&#128465;</button>';
  html += '</span></div>';
  html += '<div class="comment-content" id="comment-content-' + comment.id + '">' + contentText + '</div>';
  html += '<div id="comment-edit-' + comment.id + '" style="display:none;">';
  html +=
    '<textarea class="comment-edit-area" id="comment-edit-area-' + comment.id + '">' + contentText + '</textarea>';
  html += '<div class="comment-edit-actions">';
  html +=
    '<button class="comment-btn" data-action="save-comment-edit" data-comment-id="' +
    comment.id +
    '" data-task-id="' +
    taskId +
    '">Save</button>';
  html +=
    '<button class="comment-btn" data-action="cancel-comment-edit" data-comment-id="' +
    comment.id +
    '">Cancel</button>';
  html += '</div></div></div>';
  return html;
}

function renderAddCommentFormHtml(taskId: number): string {
  let html =
    '<button class="add-comment-trigger" id="add-comment-trigger" data-action="open-add-comment">+ Add comment...</button>';
  html += '<div class="add-comment-form" id="add-comment-form">';
  html += '<textarea class="add-comment-textarea" id="add-comment-text" placeholder="Write a comment..."></textarea>';
  html += '<div>';
  html +=
    '<button class="add-comment-submit" data-action="submit-comment" data-task-id="' +
    taskId +
    '">Add Comment</button>';
  html += '<button class="add-comment-cancel" data-action="close-add-comment">Cancel</button>';
  html += '</div></div>';
  return html;
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

// Type for accessing window globals set by the server-rendered page
type WindowWithGlobals = Window & typeof globalThis & Record<string, unknown>;

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
    const res = await fetch('/api/comments/' + commentId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) throw new Error('Server error');
    await loadComments(taskId);
  } catch {
    showToast('Failed to update comment');
  }
}

async function deleteComment(commentId: number, taskId: number): Promise<void> {
  if (!confirm('Delete this comment?')) return;
  try {
    const res = await fetch('/api/comments/' + commentId, { method: 'DELETE' });
    if (!res.ok) throw new Error('Server error');
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
    const res = await fetch('/api/tasks/' + taskId + '/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) throw new Error('Server error');
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

function renderStatusField(currentStatus: string, allStatuses: string[], statusLabels: Record<string, string>): string {
  let html = '<div class="detail-field">';
  html += '<div class="detail-field-label">Status</div>';
  html += '<select id="detail-edit-status" class="detail-edit-select">';
  allStatuses.forEach((s) => {
    const selected = s === currentStatus ? ' selected' : '';
    html += '<option value="' + s + '"' + selected + '>' + statusLabels[s] + '</option>';
  });
  html += '</select></div>';
  return html;
}

function renderPriorityField(currentPriority: string | null | undefined, allPriorities: string[]): string {
  let html = '<div class="detail-field">';
  html += '<div class="detail-field-label">Priority</div>';
  html += '<select id="detail-edit-priority" class="detail-edit-select">';
  html += '<option value="">None</option>';
  allPriorities.forEach((p) => {
    const selected = currentPriority === p ? ' selected' : '';
    html += '<option value="' + p + '"' + selected + '>' + p.charAt(0).toUpperCase() + p.slice(1) + '</option>';
  });
  html += '</select></div>';
  return html;
}

function renderRelationsHtml(
  parent: { id: number; title: string } | null,
  blockedBy: Array<{ id: number }>,
  blocking: Array<{ id: number }>
): string {
  let html = '<div class="detail-relations">';
  if (parent) {
    html += '<div class="detail-relation-row">';
    html += '<span class="detail-relation-label">Parent</span>';
    html +=
      '<div class="detail-relation-ids"><span class="detail-relation-id">#' +
      parent.id +
      ' ' +
      escapeHtmlClient(parent.title) +
      '</span></div>';
    html += '</div>';
  }
  if (blockedBy.length > 0) {
    html += '<div class="detail-relation-row"><span class="detail-relation-label">Blocked by</span>';
    html += '<div class="detail-relation-ids">';
    blockedBy.forEach((t) => {
      html += '<span class="detail-relation-id">#' + t.id + '</span>';
    });
    html += '</div></div>';
  }
  if (blocking.length > 0) {
    html += '<div class="detail-relation-row"><span class="detail-relation-label">Blocking</span>';
    html += '<div class="detail-relation-ids">';
    blocking.forEach((t) => {
      html += '<span class="detail-relation-id">#' + t.id + '</span>';
    });
    html += '</div></div>';
  }
  html += '</div>';
  return html;
}

function autoResizeTextarea(el: HTMLTextAreaElement): void {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

function renderMetadataTable(metadata: Array<{ key: string; value: string }>): string {
  const otherMeta = metadata.filter((m) => m.key !== 'priority');
  if (otherMeta.length === 0) return '';
  let html = '<div class="detail-field"><div class="detail-field-label">Metadata</div>';
  html += '<table class="detail-meta-table">';
  otherMeta.forEach((m) => {
    html += '<tr><td>' + escapeHtmlClient(m.key) + '</td><td>' + escapeHtmlClient(m.value) + '</td></tr>';
  });
  html += '</table></div>';
  return html;
}

function renderEditableTextFields(task: TaskDetail['task']): string {
  let html = '<div class="detail-field"><div class="detail-field-label">Title</div>';
  html +=
    '<input id="detail-edit-title" class="detail-edit-input" type="text" value="' + escapeHtmlClient(task.title) + '">';
  html += '</div>';
  html += '<div class="detail-field description-field-wrapper"><div class="detail-field-label">Description</div>';
  html +=
    '<textarea id="detail-edit-body" class="detail-edit-textarea">' + escapeHtmlClient(task.body || '') + '</textarea>';
  html += '</div>';
  return html;
}

function renderDetailPanelHtml(data: TaskDetail): string {
  const task = data.task;
  const metadata = data.metadata || [];
  const blockedBy = data.blockedBy || [];
  const blocking = data.blocking || [];
  const parent = data.parent || null;

  const win = window as WindowWithGlobals;
  const allStatuses: string[] = win.allStatuses as string[];
  const statusLabels: Record<string, string> = win.statusLabels as Record<string, string>;
  const allPriorities: string[] = win.allPriorities as string[];

  let html = '';
  html += renderStatusField(task.status, allStatuses, statusLabels);
  html += renderPriorityField(task.priority, allPriorities);
  html += '<div class="detail-field"><div class="detail-field-label">Tags</div>';
  html += '<div id="detail-tags-container"></div></div>';

  const hasRelations = parent || blockedBy.length > 0 || blocking.length > 0;
  if (hasRelations) {
    html += renderRelationsHtml(parent, blockedBy, blocking);
  }

  html += renderMetadataTable(metadata);
  html += renderEditableTextFields(task);

  return html;
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
    autoResizeTextarea(textarea);
    textarea.addEventListener('input', () => {
      autoResizeTextarea(textarea);
    });
  }

  // Render tags section after DOM update
  loadAllTags()
    .then(() => renderTagsSection([...tags]))
    .catch((err) => {
      console.error('[agkan] renderDetailPanel tags failed', err);
    });

  // Load comments into the comments tab
  loadComments(task.id);

  // Restore last tab
  switchTab(lastTab);
}

export async function openTaskDetail(taskId: string): Promise<void> {
  const detailPanel = document.getElementById('detail-panel') as HTMLElement;
  const PANEL_DEFAULT_WIDTH = 400;
  try {
    const res = await fetch('/api/tasks/' + taskId);
    if (!res.ok) throw new Error('Server error');
    const data = await res.json();
    renderDetailPanel(data);
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
      const taskRes = await fetch('/api/tasks/' + detailTaskId);
      if (taskRes.ok) {
        const taskData = await taskRes.json();
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

async function patchAndReloadDetail(taskId: number, fields: ReturnType<typeof collectEditedTaskFields>): Promise<void> {
  const res = await fetch('/api/tasks/' + taskId, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error('Server error');
  const getRes = await fetch('/api/tasks/' + taskId);
  if (!getRes.ok) throw new Error('Failed to fetch updated task');
  const data = await getRes.json();
  renderDetailPanel(data);
}

async function saveDetailTask(): Promise<void> {
  if (detailTaskId === null) return;
  const fields = collectEditedTaskFields();
  if (!fields) return;

  try {
    await patchAndReloadDetail(detailTaskId, fields);
    showToast('Task saved successfully');
    await syncTimestampAfterSave();
    refreshBoardCards();
  } catch {
    showToast('Failed to update task');
  }
}

async function syncTimestampAfterSave(): Promise<void> {
  try {
    const tsRes = await fetch('/api/board/updated-at');
    if (tsRes.ok) {
      const tsData = await tsRes.json();
      setLastUpdatedAt(tsData.updatedAt);
    }
  } catch {
    // Ignore errors when syncing timestamp
  }
}

const PANEL_MIN_WIDTH = 280;
const PANEL_MAX_WIDTH = 800;
const PANEL_DEFAULT_WIDTH = 400;

async function initPanelWidthFromConfig(detailPanel: HTMLElement): Promise<void> {
  let targetWidth = PANEL_DEFAULT_WIDTH;
  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      const data = await res.json();
      const savedWidth = data && data.board && data.board.detailPaneWidth;
      if (typeof savedWidth === 'number' && savedWidth >= PANEL_MIN_WIDTH && savedWidth <= PANEL_MAX_WIDTH) {
        targetWidth = savedWidth;
      }
    }
  } catch {
    // Ignore errors, use default width
  }
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
      fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ board: { detailPaneWidth: currentWidth } }),
      }).catch(function () {});
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

function buildDetailPanelHtml(): string {
  return (
    '<div class="detail-panel" id="detail-panel">' +
    '<div class="detail-panel-resize-handle" id="detail-panel-resize-handle"></div>' +
    '<div class="detail-panel-header">' +
    '<h2 id="detail-panel-title">Task Detail</h2>' +
    '<button class="detail-panel-close" id="detail-panel-close" title="Close">&times;</button>' +
    '</div>' +
    '<div class="detail-tabs" id="detail-tabs">' +
    '<button class="detail-tab active" data-tab="details">Details</button>' +
    '<button class="detail-tab" data-tab="comments" id="detail-tab-comments">Comments</button>' +
    '</div>' +
    '<div class="detail-panel-body" id="detail-panel-body">' +
    '<div class="detail-tab-content active" id="detail-tab-content-details"></div>' +
    '<div class="detail-tab-content" id="detail-tab-content-comments"></div>' +
    '</div>' +
    '<div class="detail-panel-footer" id="detail-panel-footer"><button id="detail-save-btn">Save</button></div>' +
    '</div>'
  );
}

export function initDetailPanel(): void {
  const boardContainer = document.querySelector<HTMLElement>('.board-container')!;
  boardContainer.insertAdjacentHTML('beforeend', buildDetailPanelHtml());

  const detailPanel = document.getElementById('detail-panel') as HTMLElement;

  document.getElementById('detail-panel-close')?.addEventListener('click', closeDetailPanel);

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
  });

  registerGetDetailTaskId(getDetailTaskId);
}
