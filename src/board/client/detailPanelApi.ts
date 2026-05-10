// Detail panel API fetch functions

import type { TaskDetail } from './types';
import { showToast } from './utils';
import { refreshBoardCards } from './boardPolling';
import { setStreamState, setRunLogsActive } from './connectionStatus';

const PANEL_MIN_WIDTH = 280;
const PANEL_MAX_WIDTH = 800;
const PANEL_DEFAULT_WIDTH = 400;

export { PANEL_MIN_WIDTH, PANEL_MAX_WIDTH, PANEL_DEFAULT_WIDTH };

export async function fetchComments(
  taskId: number
): Promise<Array<{ id: number; content: string; author?: string | null; created_at?: string }>> {
  const res = await fetch('/api/tasks/' + taskId + '/comments');
  if (!res.ok) throw new Error('Server error');
  const data = await res.json();
  return data.comments || [];
}

export async function patchComment(commentId: number, content: string): Promise<void> {
  const res = await fetch('/api/comments/' + commentId, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error('Server error');
}

export async function deleteCommentRequest(commentId: number): Promise<void> {
  const res = await fetch('/api/comments/' + commentId, { method: 'DELETE' });
  if (!res.ok) throw new Error('Server error');
}

export async function postComment(taskId: number, content: string): Promise<void> {
  const res = await fetch('/api/tasks/' + taskId + '/comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error('Server error');
}

export async function fetchTaskDetail(taskId: number | string, signal?: AbortSignal): Promise<TaskDetail> {
  const res = await fetch('/api/tasks/' + taskId, signal ? { signal } : undefined);
  if (!res.ok) throw new Error('Server error');
  return res.json();
}

export async function patchTask(
  taskId: number,
  fields: { title: string; body: string | null; status: string | undefined; priority: string | null }
): Promise<TaskDetail> {
  const res = await fetch('/api/tasks/' + taskId, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error('Server error');
  return fetchTaskDetail(taskId);
}

export async function fetchPanelWidthFromConfig(): Promise<number> {
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
  return targetWidth;
}

export function savePanelWidthToConfig(width: number): void {
  fetch('/api/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ board: { detailPaneWidth: width } }),
  }).catch(function () {});
}

export async function fetchRunLogs(taskId: number): Promise<
  Array<{
    id: number;
    started_at: string;
    finished_at: string | null;
    exit_code: number | null;
    events: Array<{ kind: string; text?: string; name?: string; input?: Record<string, unknown> }>;
  }>
> {
  const res = await fetch('/api/claude/tasks/' + taskId + '/run-logs');
  if (!res.ok) throw new Error('Server error');
  const data = await res.json();
  return data.logs || [];
}

export function subscribeRunLogs(
  taskId: number,
  onUpdate: (logs: Awaited<ReturnType<typeof fetchRunLogs>>) => void,
  onError: () => void
): EventSource {
  setRunLogsActive(true);
  const es = new EventSource('/api/claude/tasks/' + taskId + '/run-logs/stream');

  es.addEventListener('open', () => {
    setStreamState('run-logs', 'connected');
  });

  es.addEventListener('update', (event: Event) => {
    const msgEvent = event as MessageEvent;
    try {
      const data = JSON.parse(msgEvent.data) as { logs: Awaited<ReturnType<typeof fetchRunLogs>> };
      onUpdate(data.logs || []);
    } catch {
      // ignore parse errors
    }
  });

  es.onerror = () => {
    setStreamState('run-logs', 'disconnected');
    onError();
  };

  const origClose = es.close.bind(es);
  es.close = () => {
    setRunLogsActive(false);
    origClose();
  };

  return es;
}

export { showToast, refreshBoardCards };
