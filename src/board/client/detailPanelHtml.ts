// Detail panel HTML builder functions

import type { TaskDetail } from './types';
import { escapeHtmlClient, relativeTime } from './utils';

// Type for accessing window globals set by the server-rendered page
type WindowWithGlobals = Window & typeof globalThis & Record<string, unknown>;

export function renderCommentItemHtml(
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

export function renderAddCommentFormHtml(taskId: number): string {
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

export function renderStatusField(
  currentStatus: string,
  allStatuses: string[],
  statusLabels: Record<string, string>
): string {
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

export function renderPriorityField(currentPriority: string | null | undefined, allPriorities: string[]): string {
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

export function renderRelationsHtml(
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

export function renderMetadataTable(metadata: Array<{ key: string; value: string }>): string {
  if (metadata.length === 0) return '';
  let html = '<div class="detail-field"><div class="detail-field-label">Metadata</div>';
  html += '<table class="detail-meta-table">';
  metadata.forEach((m) => {
    html += '<tr><td>' + escapeHtmlClient(m.key) + '</td><td>' + escapeHtmlClient(m.value) + '</td></tr>';
  });
  html += '</table></div>';
  return html;
}

export function renderEditableTextFields(task: TaskDetail['task']): string {
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

export function renderDetailPanelHtml(data: TaskDetail): string {
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

export function renderRunLogsHtml(
  logs: Array<{
    id: number;
    started_at: string;
    finished_at: string | null;
    exit_code: number | null;
    events: Array<{ kind: string; text?: string; name?: string; input?: Record<string, unknown> }>;
  }>
): string {
  if (logs.length === 0) {
    return '<div class="run-log-empty">No run logs yet.</div>';
  }
  let html = '<div class="run-log-list">';
  logs.forEach((log, index) => {
    const date = log.started_at ? log.started_at.replace('T', ' ').replace(/\.\d+Z$/, '') : '';
    const exitOk = log.exit_code === 0;
    const exitLabel = log.exit_code !== null ? 'exit: ' + String(log.exit_code) : 'running';
    const exitClass = exitOk ? 'success' : 'failure';
    const isFirst = index === 0;
    html +=
      '<div class="run-log-item' +
      (isFirst ? ' open' : '') +
      '" data-log-id="' +
      log.id +
      '">' +
      '<div class="run-log-header" data-action="toggle-run-log">' +
      '<span class="run-log-toggle">&#9654;</span>' +
      '<span class="run-log-date">' +
      escapeHtmlClient(date) +
      '</span>' +
      '<span class="run-log-exit ' +
      exitClass +
      '">' +
      escapeHtmlClient(exitLabel) +
      '</span>' +
      '</div>' +
      '<div class="run-log-body">';
    log.events.forEach((evt) => {
      if (evt.kind === 'text' && evt.text) {
        html += escapeHtmlClient(evt.text);
      } else if (evt.kind === 'tool_use' && evt.name) {
        const mainArg =
          evt.input && typeof evt.input === 'object'
            ? String(
                (evt.input as Record<string, unknown>).path ?? (evt.input as Record<string, unknown>).command ?? ''
              )
            : '';
        const display = mainArg ? '\uD83D\uDD27 ' + evt.name + ': ' + mainArg : '\uD83D\uDD27 ' + evt.name;
        html += '<span class="run-log-tool-use">' + escapeHtmlClient(display) + '\n</span>';
      }
    });
    html += '</div></div>';
  });
  html += '</div>';
  return html;
}

export function buildDetailPanelHtml(): string {
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
    '<button class="detail-tab" data-tab="run-logs" id="detail-tab-run-logs">Run Logs</button>' +
    '</div>' +
    '<div class="detail-panel-body" id="detail-panel-body">' +
    '<div class="detail-tab-content active" id="detail-tab-content-details"></div>' +
    '<div class="detail-tab-content" id="detail-tab-content-comments"></div>' +
    '<div class="detail-tab-content" id="detail-tab-content-run-logs"></div>' +
    '</div>' +
    '<div class="detail-panel-footer" id="detail-panel-footer"><button id="detail-save-btn">Save</button></div>' +
    '</div>'
  );
}

export function autoResizeTextarea(el: HTMLTextAreaElement): void {
  const scrollContainer = el.closest('.detail-tab-content') as HTMLElement;
  const scrollTop = scrollContainer?.scrollTop ?? 0;
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
  if (scrollContainer) scrollContainer.scrollTop = scrollTop;
}
