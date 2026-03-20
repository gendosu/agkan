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
  } catch {
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

  comments.forEach(function (comment) {
    const authorText = comment.author ? escapeHtmlClient(comment.author) : 'Anonymous';
    const dateRel = relativeTime(comment.created_at);
    const dateAbs = escapeHtmlClient(comment.created_at);
    const contentText = escapeHtmlClient(comment.content);
    html += '<div class="comment-item" data-comment-id="' + comment.id + '">';
    html += '<div class="comment-meta">';
    html += '<span class="comment-author">' + authorText + '</span>';
    html += '<span class="comment-date" title="' + dateAbs + '">' + dateRel + '</span>';
    html += '<span class="comment-actions">';
    html +=
      '<button class="comment-action-btn" title="Edit" onclick="startCommentEdit(' + comment.id + ')">&#9998;</button>';
    html +=
      '<button class="comment-action-btn danger" title="Delete" onclick="deleteComment(' +
      comment.id +
      ',' +
      taskId +
      ')">&#128465;</button>';
    html += '</span>';
    html += '</div>';
    html += '<div class="comment-content" id="comment-content-' + comment.id + '">' + contentText + '</div>';
    html += '<div id="comment-edit-' + comment.id + '" style="display:none;">';
    html +=
      '<textarea class="comment-edit-area" id="comment-edit-area-' + comment.id + '">' + contentText + '</textarea>';
    html += '<div class="comment-edit-actions">';
    html += '<button class="comment-btn" onclick="saveCommentEdit(' + comment.id + ',' + taskId + ')">Save</button>';
    html += '<button class="comment-btn" onclick="cancelCommentEdit(' + comment.id + ')">Cancel</button>';
    html += '</div></div>';
    html += '</div>';
  });

  html +=
    '<button class="add-comment-trigger" id="add-comment-trigger" onclick="openAddCommentForm()">+ Add comment...</button>';
  html += '<div class="add-comment-form" id="add-comment-form">';
  html += '<textarea class="add-comment-textarea" id="add-comment-text" placeholder="Write a comment..."></textarea>';
  html += '<div>';
  html += '<button class="add-comment-submit" onclick="submitComment(' + taskId + ')">Add Comment</button>';
  html += '<button class="add-comment-cancel" onclick="closeAddCommentForm()">Cancel</button>';
  html += '</div></div>';

  pane.innerHTML = html;
}

// Expose comment functions globally for inline onclick handlers
type WindowWithGlobals = Window & typeof globalThis & Record<string, unknown>;

(window as WindowWithGlobals).openAddCommentForm = function (): void {
  const trigger = document.getElementById('add-comment-trigger');
  const form = document.getElementById('add-comment-form');
  if (trigger) trigger.style.display = 'none';
  if (form) {
    form.classList.add('open');
    (form.querySelector('textarea') as HTMLTextAreaElement).focus();
  }
};

(window as WindowWithGlobals).closeAddCommentForm = function (): void {
  const trigger = document.getElementById('add-comment-trigger');
  const form = document.getElementById('add-comment-form');
  if (trigger) trigger.style.display = '';
  if (form) {
    form.classList.remove('open');
    (form.querySelector('textarea') as HTMLTextAreaElement).value = '';
  }
};

(window as WindowWithGlobals).startCommentEdit = function (commentId: number): void {
  const contentEl = document.getElementById('comment-content-' + commentId);
  const editWrapper = document.getElementById('comment-edit-' + commentId);
  if (contentEl) contentEl.style.display = 'none';
  if (editWrapper) editWrapper.style.display = 'block';
  const area = document.getElementById('comment-edit-area-' + commentId) as HTMLTextAreaElement;
  if (area) area.focus();
};

(window as WindowWithGlobals).cancelCommentEdit = function (commentId: number): void {
  const contentEl = document.getElementById('comment-content-' + commentId);
  const editWrapper = document.getElementById('comment-edit-' + commentId);
  if (contentEl) contentEl.style.display = '';
  if (editWrapper) editWrapper.style.display = 'none';
};

(window as WindowWithGlobals).saveCommentEdit = async function (commentId: number, taskId: number): Promise<void> {
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
};

(window as WindowWithGlobals).deleteComment = async function (commentId: number, taskId: number): Promise<void> {
  if (!confirm('Delete this comment?')) return;
  try {
    const res = await fetch('/api/comments/' + commentId, { method: 'DELETE' });
    if (!res.ok) throw new Error('Server error');
    await loadComments(taskId);
  } catch {
    showToast('Failed to delete comment');
  }
};

(window as WindowWithGlobals).submitComment = async function (taskId: number): Promise<void> {
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
};

export function renderDetailPanel(data: TaskDetail): void {
  const detailPanelTitle = document.getElementById('detail-panel-title') as HTMLElement;

  const task = data.task;
  const tags = data.tags || [];
  const metadata = data.metadata || [];
  const blockedBy = data.blockedBy || [];
  const blocking = data.blocking || [];
  const parent = data.parent || null;

  detailTaskId = task.id;
  detailPanelTitle.textContent = '#' + task.id;

  // Globals from server-side renderer
  const win = window as WindowWithGlobals;
  const _allStatuses: string[] = win.allStatuses as string[];
  const _statusLabels: Record<string, string> = win.statusLabels as Record<string, string>;
  const _allPriorities: string[] = win.allPriorities as string[];

  let html = '';

  // Status (editable)
  html += '<div class="detail-field">';
  html += '<div class="detail-field-label">Status</div>';
  html += '<select id="detail-edit-status" class="detail-edit-select">';
  _allStatuses.forEach((s) => {
    const selected = s === task.status ? ' selected' : '';
    html += '<option value="' + s + '"' + selected + '>' + _statusLabels[s] + '</option>';
  });
  html += '</select>';
  html += '</div>';

  // Priority (editable)
  html += '<div class="detail-field">';
  html += '<div class="detail-field-label">Priority</div>';
  html += '<select id="detail-edit-priority" class="detail-edit-select">';
  html += '<option value="">None</option>';
  _allPriorities.forEach((p) => {
    const selected = task.priority === p ? ' selected' : '';
    html += '<option value="' + p + '"' + selected + '>' + p.charAt(0).toUpperCase() + p.slice(1) + '</option>';
  });
  html += '</select>';
  html += '</div>';

  // Tags (editable)
  html += '<div class="detail-field">';
  html += '<div class="detail-field-label">Tags</div>';
  html += '<div id="detail-tags-container"></div>';
  html += '</div>';

  // Relations: parent, blockedBy, blocking
  const hasRelations = parent || blockedBy.length > 0 || blocking.length > 0;
  if (hasRelations) {
    html += '<div class="detail-relations">';
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
      html += '<div class="detail-relation-row">';
      html += '<span class="detail-relation-label">Blocked by</span>';
      html += '<div class="detail-relation-ids">';
      blockedBy.forEach((t) => {
        html += '<span class="detail-relation-id">#' + t.id + '</span>';
      });
      html += '</div></div>';
    }
    if (blocking.length > 0) {
      html += '<div class="detail-relation-row">';
      html += '<span class="detail-relation-label">Blocking</span>';
      html += '<div class="detail-relation-ids">';
      blocking.forEach((t) => {
        html += '<span class="detail-relation-id">#' + t.id + '</span>';
      });
      html += '</div></div>';
    }
    html += '</div>';
  }

  // Title (editable)
  html += '<div class="detail-field">';
  html += '<div class="detail-field-label">Title</div>';
  html +=
    '<input id="detail-edit-title" class="detail-edit-input" type="text" value="' + escapeHtmlClient(task.title) + '">';
  html += '</div>';

  // Body (editable)
  html += '<div class="detail-field description-field-wrapper">';
  html += '<div class="detail-field-label">Description</div>';
  html +=
    '<textarea id="detail-edit-body" class="detail-edit-textarea">' + escapeHtmlClient(task.body || '') + '</textarea>';
  html += '</div>';

  // Metadata table (read-only, non-priority)
  const otherMeta = metadata.filter((m) => m.key !== 'priority');
  if (otherMeta.length > 0) {
    html += '<div class="detail-field">';
    html += '<div class="detail-field-label">Metadata</div>';
    html += '<table class="detail-meta-table">';
    otherMeta.forEach((m) => {
      html += '<tr><td>' + escapeHtmlClient(m.key) + '</td><td>' + escapeHtmlClient(m.value) + '</td></tr>';
    });
    html += '</table></div>';
  }

  // Timestamps compressed to one line
  html +=
    '<div class="detail-timestamp">created ' +
    relativeTime(task.created_at) +
    ' &middot; updated ' +
    relativeTime(task.updated_at) +
    '</div>';

  const detailsPane = document.getElementById('detail-tab-content-details');
  if (detailsPane) {
    detailsPane.innerHTML = html;
    detailsPane.style.padding = '20px';
  }

  // Render tags section after DOM update
  loadAllTags().then(() => renderTagsSection([...tags]));

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
  } catch {
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
    warningEl.appendChild(msgSpan);
    warningEl.appendChild(reloadBtn);
    detailPanelBody.insertBefore(warningEl, detailPanelBody.firstChild);
  }
}

export function initDetailPanel(): void {
  const boardContainer = document.querySelector<HTMLElement>('.board-container')!;
  const detailPanelHtml =
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
    '</div>';
  boardContainer.insertAdjacentHTML('beforeend', detailPanelHtml);

  const detailPanel = document.getElementById('detail-panel') as HTMLElement;

  document.getElementById('detail-panel-close')?.addEventListener('click', closeDetailPanel);

  // Tab switching
  document.getElementById('detail-tabs')?.addEventListener('click', (e: MouseEvent) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('.detail-tab');
    if (!btn) return;
    switchTab(btn.dataset.tab!);
  });

  // Panel resize
  const resizeHandle = document.getElementById('detail-panel-resize-handle') as HTMLElement;
  const PANEL_MIN_WIDTH = 280;
  const PANEL_MAX_WIDTH = 800;
  const PANEL_DEFAULT_WIDTH = 400;

  // Initialize panel width from server config (async)
  (async function initPanelWidth() {
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
  })();

  resizeHandle.addEventListener('mousedown', function (e: MouseEvent) {
    e.preventDefault();
    if (!detailPanel.classList.contains('open')) return;
    const startX = e.clientX;
    const startWidth = detailPanel.offsetWidth;
    resizeHandle.classList.add('dragging');
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    detailPanel.style.transition = 'none';

    function onMouseMove(e: MouseEvent): void {
      const delta = startX - e.clientX;
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
      }).catch(function () {
        // Ignore errors when saving panel width
      });
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  // Save button
  document.getElementById('detail-save-btn')?.addEventListener('click', async () => {
    if (detailTaskId === null) return;
    const titleInput = document.getElementById('detail-edit-title') as HTMLInputElement;
    const title = titleInput ? titleInput.value.trim() : '';
    if (!title) {
      if (titleInput) titleInput.focus();
      return;
    }
    const bodyEl = document.getElementById('detail-edit-body') as HTMLTextAreaElement;
    const statusEl = document.getElementById('detail-edit-status') as HTMLSelectElement;
    const priorityEl = document.getElementById('detail-edit-priority') as HTMLSelectElement;

    try {
      const res = await fetch('/api/tasks/' + detailTaskId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          body: bodyEl ? bodyEl.value.trim() || null : null,
          status: statusEl ? statusEl.value : undefined,
          priority: priorityEl ? priorityEl.value || null : null,
        }),
      });
      if (!res.ok) throw new Error('Server error');
      // Fetch updated task data and refresh detail panel instead of reloading
      const getRes = await fetch('/api/tasks/' + detailTaskId);
      if (!getRes.ok) throw new Error('Failed to fetch updated task');
      const data = await getRes.json();
      renderDetailPanel(data);
      showToast('Task saved successfully');
      // Update lastUpdatedAt so polling doesn't treat our own save as an external update
      try {
        const tsRes = await fetch('/api/board/updated-at');
        if (tsRes.ok) {
          const tsData = await tsRes.json();
          setLastUpdatedAt(tsData.updatedAt);
        }
      } catch {
        // Ignore errors when syncing timestamp
      }
      // Refresh board cards in the background
      refreshBoardCards();
    } catch {
      showToast('Failed to update task');
    }
  });

  // Card click handler
  document.querySelectorAll<HTMLElement>('.card').forEach((card) => {
    card.addEventListener('click', async (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      await openTaskDetail(card.dataset.id!);
    });
  });

  // Register callbacks to break circular dependencies
  registerDetailPanelCallbacks({
    openTaskDetail,
    renderDetailPanel,
    showUpdateWarning,
    getDetailTaskId,
  });

  // Register getDetailTaskId with the tags module
  registerGetDetailTaskId(getDetailTaskId);
}
