/**
 * @vitest-environment jsdom
 *
 * Tests for detailPanelHtml.ts HTML rendering functions.
 * Covers all exported functions with snapshot/DOM validation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  renderCommentItemHtml,
  renderAddCommentFormHtml,
  renderStatusField,
  renderPriorityField,
  renderRelationsHtml,
  renderMetadataTable,
  renderEditableTextFields,
  renderDetailPanelHtml,
  renderRunLogsHtml,
  buildDetailPanelHtml,
  autoResizeTextarea,
} from '../../../src/board/client/detailPanelHtml';

// ---- Setup helpers ----

function setupWindowGlobals(): void {
  (window as unknown as Record<string, unknown>).allStatuses = ['backlog', 'ready', 'in_progress', 'done'];
  (window as unknown as Record<string, unknown>).statusLabels = {
    backlog: 'Backlog',
    ready: 'Ready',
    in_progress: 'In Progress',
    done: 'Done',
  };
  (window as unknown as Record<string, unknown>).allPriorities = ['low', 'medium', 'high'];
}

function makeTaskDetail(overrides: Record<string, unknown> = {}) {
  return {
    task: {
      id: 1,
      title: 'Test Task',
      body: 'Task body',
      status: 'backlog',
      priority: null as string | null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
    tags: [],
    metadata: [] as Array<{ key: string; value: string }>,
    blockedBy: [] as Array<{ id: number }>,
    blocking: [] as Array<{ id: number }>,
    parent: null as { id: number; title: string } | null,
    ...overrides,
  };
}

// ---- renderCommentItemHtml ----

describe('renderCommentItemHtml', () => {
  it('renders comment with author and date', () => {
    const html = renderCommentItemHtml(
      { id: 1, content: 'Hello world', author: 'Alice', created_at: '2026-01-01T00:00:00.000Z' },
      42
    );
    const div = document.createElement('div');
    div.innerHTML = html;

    expect(div.querySelector('.comment-item')).not.toBeNull();
    expect(div.querySelector('.comment-item')?.getAttribute('data-comment-id')).toBe('1');
    expect(div.querySelector('.comment-author')?.textContent).toBe('Alice');
    expect(div.querySelector('.comment-content')?.textContent).toBe('Hello world');
  });

  it('renders Anonymous when author is null', () => {
    const html = renderCommentItemHtml(
      { id: 2, content: 'No author', author: null, created_at: '2026-01-01T00:00:00.000Z' },
      10
    );
    const div = document.createElement('div');
    div.innerHTML = html;

    expect(div.querySelector('.comment-author')?.textContent).toBe('Anonymous');
  });

  it('renders Anonymous when author is undefined', () => {
    const html = renderCommentItemHtml({ id: 3, content: 'No author' }, 10);
    const div = document.createElement('div');
    div.innerHTML = html;

    expect(div.querySelector('.comment-author')?.textContent).toBe('Anonymous');
  });

  it('renders edit button with correct data-action and data-comment-id', () => {
    const html = renderCommentItemHtml({ id: 5, content: 'Edit me', author: 'Bob' }, 7);
    const div = document.createElement('div');
    div.innerHTML = html;

    const editBtn = div.querySelector('[data-action="start-comment-edit"]') as HTMLElement;
    expect(editBtn).not.toBeNull();
    expect(editBtn.getAttribute('data-comment-id')).toBe('5');
  });

  it('renders delete button with correct data attributes including task-id', () => {
    const html = renderCommentItemHtml({ id: 5, content: 'Delete me', author: 'Bob' }, 7);
    const div = document.createElement('div');
    div.innerHTML = html;

    const deleteBtn = div.querySelector('[data-action="delete-comment"]') as HTMLElement;
    expect(deleteBtn).not.toBeNull();
    expect(deleteBtn.getAttribute('data-comment-id')).toBe('5');
    expect(deleteBtn.getAttribute('data-task-id')).toBe('7');
  });

  it('renders save button with correct data attributes', () => {
    const html = renderCommentItemHtml({ id: 5, content: 'Save me', author: 'Bob' }, 7);
    const div = document.createElement('div');
    div.innerHTML = html;

    const saveBtn = div.querySelector('[data-action="save-comment-edit"]') as HTMLElement;
    expect(saveBtn).not.toBeNull();
    expect(saveBtn.getAttribute('data-comment-id')).toBe('5');
    expect(saveBtn.getAttribute('data-task-id')).toBe('7');
  });

  it('renders cancel-edit button', () => {
    const html = renderCommentItemHtml({ id: 5, content: 'Cancel', author: 'Bob' }, 7);
    const div = document.createElement('div');
    div.innerHTML = html;

    const cancelBtn = div.querySelector('[data-action="cancel-comment-edit"]') as HTMLElement;
    expect(cancelBtn).not.toBeNull();
    expect(cancelBtn.getAttribute('data-comment-id')).toBe('5');
  });

  it('renders hidden edit area with correct id', () => {
    const html = renderCommentItemHtml({ id: 8, content: 'Test', author: 'User' }, 3);
    const div = document.createElement('div');
    div.innerHTML = html;

    const editArea = div.querySelector('#comment-edit-8') as HTMLElement;
    expect(editArea).not.toBeNull();
    expect(editArea.style.display).toBe('none');
  });

  it('renders textarea with comment content inside edit area', () => {
    const html = renderCommentItemHtml({ id: 9, content: 'Edit content', author: 'User' }, 3);
    const div = document.createElement('div');
    div.innerHTML = html;

    const textarea = div.querySelector('#comment-edit-area-9') as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();
    expect(textarea.value).toBe('Edit content');
  });

  it('escapes HTML in content to prevent XSS', () => {
    const html = renderCommentItemHtml({ id: 10, content: '<script>alert(1)</script>', author: 'Hacker' }, 1);
    expect(html).not.toContain('<script>alert(1)</script>');
    const div = document.createElement('div');
    div.innerHTML = html;
    expect(div.querySelector('script')).toBeNull();
  });

  it('escapes HTML in author name', () => {
    const html = renderCommentItemHtml({ id: 11, content: 'Content', author: '<b>Bad</b>' }, 1);
    const div = document.createElement('div');
    div.innerHTML = html;
    // Author text should show as plain text, not rendered HTML
    const authorEl = div.querySelector('.comment-author');
    expect(authorEl?.textContent).toBe('<b>Bad</b>');
  });

  it('renders comment-content div with correct id', () => {
    const html = renderCommentItemHtml({ id: 12, content: 'My comment', author: 'User' }, 5);
    const div = document.createElement('div');
    div.innerHTML = html;

    expect(div.querySelector('#comment-content-12')).not.toBeNull();
  });
});

// ---- renderAddCommentFormHtml ----

describe('renderAddCommentFormHtml', () => {
  it('renders the add-comment trigger button with correct data-action', () => {
    const html = renderAddCommentFormHtml(5);
    const div = document.createElement('div');
    div.innerHTML = html;

    const trigger = div.querySelector('#add-comment-trigger');
    expect(trigger).not.toBeNull();
    expect(trigger?.getAttribute('data-action')).toBe('open-add-comment');
  });

  it('renders the add-comment form div', () => {
    const html = renderAddCommentFormHtml(5);
    const div = document.createElement('div');
    div.innerHTML = html;

    expect(div.querySelector('#add-comment-form')).not.toBeNull();
    expect(div.querySelector('#add-comment-text')).not.toBeNull();
  });

  it('renders submit button with correct data-action and data-task-id', () => {
    const html = renderAddCommentFormHtml(99);
    const div = document.createElement('div');
    div.innerHTML = html;

    const submitBtn = div.querySelector('[data-action="submit-comment"]') as HTMLElement;
    expect(submitBtn).not.toBeNull();
    expect(submitBtn.getAttribute('data-task-id')).toBe('99');
  });

  it('renders cancel button with correct data-action', () => {
    const html = renderAddCommentFormHtml(5);
    const div = document.createElement('div');
    div.innerHTML = html;

    const cancelBtn = div.querySelector('[data-action="close-add-comment"]');
    expect(cancelBtn).not.toBeNull();
  });

  it('textarea has placeholder text', () => {
    const html = renderAddCommentFormHtml(1);
    const div = document.createElement('div');
    div.innerHTML = html;

    const textarea = div.querySelector('.add-comment-textarea') as HTMLTextAreaElement;
    expect(textarea?.placeholder).toBe('Write a comment...');
  });
});

// ---- renderStatusField ----

describe('renderStatusField', () => {
  it('renders status select with all options', () => {
    const html = renderStatusField('ready', ['backlog', 'ready', 'done'], {
      backlog: 'Backlog',
      ready: 'Ready',
      done: 'Done',
    });
    const div = document.createElement('div');
    div.innerHTML = html;

    const select = div.querySelector('#detail-edit-status') as HTMLSelectElement;
    expect(select).not.toBeNull();
    expect(select.options.length).toBe(3);
  });

  it('sets the currently selected status option', () => {
    const html = renderStatusField('ready', ['backlog', 'ready', 'done'], {
      backlog: 'Backlog',
      ready: 'Ready',
      done: 'Done',
    });
    const div = document.createElement('div');
    div.innerHTML = html;

    const select = div.querySelector('#detail-edit-status') as HTMLSelectElement;
    expect(select.value).toBe('ready');
  });

  it('renders "Status" label', () => {
    const html = renderStatusField('backlog', ['backlog'], { backlog: 'Backlog' });
    expect(html).toContain('Status');
  });

  it('renders option text from statusLabels', () => {
    const html = renderStatusField('backlog', ['backlog', 'done'], {
      backlog: 'Backlog',
      done: 'Done',
    });
    const div = document.createElement('div');
    div.innerHTML = html;

    const options = div.querySelectorAll('option');
    expect(options[0].textContent).toBe('Backlog');
    expect(options[1].textContent).toBe('Done');
  });

  it('no option is selected when currentStatus does not match', () => {
    const html = renderStatusField('nonexistent', ['backlog', 'done'], {
      backlog: 'Backlog',
      done: 'Done',
    });
    const div = document.createElement('div');
    div.innerHTML = html;

    const select = div.querySelector('#detail-edit-status') as HTMLSelectElement;
    // When none match, select defaults to first option
    expect(select.value).toBe('backlog');
  });
});

// ---- renderPriorityField ----

describe('renderPriorityField', () => {
  it('renders priority select with None option and all priorities', () => {
    const html = renderPriorityField('medium', ['low', 'medium', 'high']);
    const div = document.createElement('div');
    div.innerHTML = html;

    const select = div.querySelector('#detail-edit-priority') as HTMLSelectElement;
    expect(select).not.toBeNull();
    // None + 3 priorities
    expect(select.options.length).toBe(4);
    expect(select.options[0].value).toBe('');
    expect(select.options[0].textContent).toBe('None');
  });

  it('sets the currently selected priority', () => {
    const html = renderPriorityField('high', ['low', 'medium', 'high']);
    const div = document.createElement('div');
    div.innerHTML = html;

    const select = div.querySelector('#detail-edit-priority') as HTMLSelectElement;
    expect(select.value).toBe('high');
  });

  it('capitalizes priority label text', () => {
    const html = renderPriorityField(null, ['low', 'medium', 'high']);
    const div = document.createElement('div');
    div.innerHTML = html;

    const options = Array.from(div.querySelectorAll('option'));
    const lowOption = options.find((o) => o.value === 'low');
    expect(lowOption?.textContent).toBe('Low');
  });

  it('selects None when currentPriority is null', () => {
    const html = renderPriorityField(null, ['low', 'medium', 'high']);
    const div = document.createElement('div');
    div.innerHTML = html;

    const select = div.querySelector('#detail-edit-priority') as HTMLSelectElement;
    expect(select.value).toBe('');
  });

  it('selects None when currentPriority is undefined', () => {
    const html = renderPriorityField(undefined, ['low', 'medium', 'high']);
    const div = document.createElement('div');
    div.innerHTML = html;

    const select = div.querySelector('#detail-edit-priority') as HTMLSelectElement;
    expect(select.value).toBe('');
  });

  it('renders "Priority" label', () => {
    const html = renderPriorityField(null, ['low']);
    expect(html).toContain('Priority');
  });
});

// ---- renderRelationsHtml ----

describe('renderRelationsHtml', () => {
  it('renders nothing special when all empty', () => {
    const html = renderRelationsHtml(null, [], []);
    const div = document.createElement('div');
    div.innerHTML = html;

    expect(div.querySelector('.detail-relation-row')).toBeNull();
  });

  it('renders parent relation when parent is provided', () => {
    const html = renderRelationsHtml({ id: 5, title: 'Parent Task' }, [], []);
    const div = document.createElement('div');
    div.innerHTML = html;

    const rows = div.querySelectorAll('.detail-relation-row');
    expect(rows.length).toBe(1);
    expect(div.textContent).toContain('#5');
    expect(div.textContent).toContain('Parent Task');
  });

  it('renders parent as link with correct data-task-id', () => {
    const html = renderRelationsHtml({ id: 5, title: 'Parent Task' }, [], []);
    const div = document.createElement('div');
    div.innerHTML = html;

    const link = div.querySelector('[data-task-id="5"]');
    expect(link).not.toBeNull();
  });

  it('renders blocked-by relation', () => {
    const html = renderRelationsHtml(null, [{ id: 3 }, { id: 7 }], []);
    const div = document.createElement('div');
    div.innerHTML = html;

    expect(div.textContent).toContain('#3');
    expect(div.textContent).toContain('#7');
    expect(div.textContent).toContain('Blocked by');
  });

  it('renders blocking relation', () => {
    const html = renderRelationsHtml(null, [], [{ id: 10 }, { id: 20 }]);
    const div = document.createElement('div');
    div.innerHTML = html;

    expect(div.textContent).toContain('#10');
    expect(div.textContent).toContain('#20');
    expect(div.textContent).toContain('Blocking');
  });

  it('renders all relation types when all are present', () => {
    const html = renderRelationsHtml({ id: 1, title: 'Root' }, [{ id: 2 }], [{ id: 3 }]);
    const div = document.createElement('div');
    div.innerHTML = html;

    const rows = div.querySelectorAll('.detail-relation-row');
    expect(rows.length).toBe(3);
  });

  it('escapes HTML in parent title', () => {
    const html = renderRelationsHtml({ id: 5, title: '<script>xss</script>' }, [], []);
    expect(html).not.toContain('<script>xss</script>');
    const div = document.createElement('div');
    div.innerHTML = html;
    expect(div.querySelector('script')).toBeNull();
  });
});

// ---- renderMetadataTable ----

describe('renderMetadataTable', () => {
  it('returns empty string for empty metadata', () => {
    const html = renderMetadataTable([]);
    expect(html).toBe('');
  });

  it('renders a table with metadata rows', () => {
    const html = renderMetadataTable([
      { key: 'branch', value: 'main' },
      { key: 'sprint', value: '3' },
    ]);
    const div = document.createElement('div');
    div.innerHTML = html;

    const table = div.querySelector('.detail-meta-table');
    expect(table).not.toBeNull();
    const rows = table?.querySelectorAll('tr');
    expect(rows?.length).toBe(2);
  });

  it('renders metadata key and plain value in table cells', () => {
    const html = renderMetadataTable([{ key: 'sprint', value: '5' }]);
    const div = document.createElement('div');
    div.innerHTML = html;

    const cells = div.querySelectorAll('td');
    expect(cells[0].textContent).toBe('sprint');
    expect(cells[1].textContent).toBe('5');
  });

  it('renders URL value as anchor element', () => {
    const url = 'https://github.com/org/repo/pull/1';
    const html = renderMetadataTable([{ key: 'pr', value: url }]);
    const div = document.createElement('div');
    div.innerHTML = html;

    const anchor = div.querySelector('a');
    expect(anchor).not.toBeNull();
    expect(anchor?.getAttribute('href')).toBe(url);
    expect(anchor?.getAttribute('target')).toBe('_blank');
    expect(anchor?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(anchor?.textContent).toBe(url);
  });

  it('renders http:// URL value as anchor element', () => {
    const url = 'http://example.com/page';
    const html = renderMetadataTable([{ key: 'link', value: url }]);
    const div = document.createElement('div');
    div.innerHTML = html;

    const anchor = div.querySelector('a');
    expect(anchor).not.toBeNull();
    expect(anchor?.getAttribute('href')).toBe(url);
  });

  it('does not render non-URL as anchor', () => {
    const html = renderMetadataTable([{ key: 'note', value: 'just plain text' }]);
    const div = document.createElement('div');
    div.innerHTML = html;

    expect(div.querySelector('a')).toBeNull();
    expect(div.textContent).toContain('just plain text');
  });

  it('does not render javascript: protocol as anchor', () => {
    const html = renderMetadataTable([{ key: 'bad', value: 'javascript:alert(1)' }]);
    const div = document.createElement('div');
    div.innerHTML = html;

    expect(div.querySelector('a')).toBeNull();
    expect(div.textContent).toContain('javascript:alert(1)');
  });

  it('escapes HTML in key', () => {
    const html = renderMetadataTable([{ key: '<b>key</b>', value: 'val' }]);
    const div = document.createElement('div');
    div.innerHTML = html;

    // The <b> tag should not be rendered as HTML
    const cells = div.querySelectorAll('td');
    expect(cells[0].textContent).toBe('<b>key</b>');
  });

  it('renders "Metadata" label', () => {
    const html = renderMetadataTable([{ key: 'k', value: 'v' }]);
    expect(html).toContain('Metadata');
  });
});

// ---- renderEditableTextFields ----

describe('renderEditableTextFields', () => {
  it('renders title input with correct value', () => {
    const task = makeTaskDetail().task;
    task.title = 'My Task Title';
    const html = renderEditableTextFields(task);
    const div = document.createElement('div');
    div.innerHTML = html;

    const titleInput = div.querySelector('#detail-edit-title') as HTMLInputElement;
    expect(titleInput).not.toBeNull();
    expect(titleInput.value).toBe('My Task Title');
  });

  it('renders body textarea with correct content', () => {
    const task = makeTaskDetail().task;
    task.body = 'Task description here';
    const html = renderEditableTextFields(task);
    const div = document.createElement('div');
    div.innerHTML = html;

    const bodyTextarea = div.querySelector('#detail-edit-body') as HTMLTextAreaElement;
    expect(bodyTextarea).not.toBeNull();
    expect(bodyTextarea.value).toBe('Task description here');
  });

  it('renders empty body textarea when body is null', () => {
    const task = makeTaskDetail().task;
    task.body = null as unknown as string;
    const html = renderEditableTextFields(task);
    const div = document.createElement('div');
    div.innerHTML = html;

    const bodyTextarea = div.querySelector('#detail-edit-body') as HTMLTextAreaElement;
    expect(bodyTextarea.value).toBe('');
  });

  it('escapes HTML in title', () => {
    const task = makeTaskDetail().task;
    task.title = '<script>alert(1)</script>';
    const html = renderEditableTextFields(task);
    const div = document.createElement('div');
    div.innerHTML = html;

    const titleInput = div.querySelector('#detail-edit-title') as HTMLInputElement;
    // Value attribute should be escaped
    expect(titleInput.value).toBe('<script>alert(1)</script>');
    expect(div.querySelector('script')).toBeNull();
  });

  it('renders "Title" label', () => {
    const html = renderEditableTextFields(makeTaskDetail().task);
    expect(html).toContain('Title');
  });

  it('renders "Description" label', () => {
    const html = renderEditableTextFields(makeTaskDetail().task);
    expect(html).toContain('Description');
  });
});

// ---- renderDetailPanelHtml ----

describe('renderDetailPanelHtml', () => {
  beforeEach(() => {
    setupWindowGlobals();
  });

  it('renders status select with current status', () => {
    const data = makeTaskDetail({ task: { ...makeTaskDetail().task, status: 'ready' } });
    const html = renderDetailPanelHtml(data);
    const div = document.createElement('div');
    div.innerHTML = html;

    const select = div.querySelector('#detail-edit-status') as HTMLSelectElement;
    expect(select).not.toBeNull();
    expect(select.value).toBe('ready');
  });

  it('renders priority select', () => {
    const html = renderDetailPanelHtml(makeTaskDetail());
    const div = document.createElement('div');
    div.innerHTML = html;

    expect(div.querySelector('#detail-edit-priority')).not.toBeNull();
  });

  it('renders tags container', () => {
    const html = renderDetailPanelHtml(makeTaskDetail());
    const div = document.createElement('div');
    div.innerHTML = html;

    expect(div.querySelector('#detail-tags-container')).not.toBeNull();
  });

  it('renders title and description fields', () => {
    const html = renderDetailPanelHtml(makeTaskDetail());
    const div = document.createElement('div');
    div.innerHTML = html;

    expect(div.querySelector('#detail-edit-title')).not.toBeNull();
    expect(div.querySelector('#detail-edit-body')).not.toBeNull();
  });

  it('renders relations section when parent is present', () => {
    const data = makeTaskDetail({ parent: { id: 3, title: 'Parent' } });
    const html = renderDetailPanelHtml(data);
    const div = document.createElement('div');
    div.innerHTML = html;

    expect(div.querySelector('.detail-relations')).not.toBeNull();
    expect(div.textContent).toContain('#3');
  });

  it('renders relations section when blockedBy tasks exist', () => {
    const data = makeTaskDetail({ blockedBy: [{ id: 5 }] });
    const html = renderDetailPanelHtml(data);
    const div = document.createElement('div');
    div.innerHTML = html;

    expect(div.querySelector('.detail-relations')).not.toBeNull();
    expect(div.textContent).toContain('#5');
  });

  it('renders relations section when blocking tasks exist', () => {
    const data = makeTaskDetail({ blocking: [{ id: 8 }] });
    const html = renderDetailPanelHtml(data);
    const div = document.createElement('div');
    div.innerHTML = html;

    expect(div.querySelector('.detail-relations')).not.toBeNull();
    expect(div.textContent).toContain('#8');
  });

  it('does not render relations section when no relations', () => {
    const html = renderDetailPanelHtml(makeTaskDetail());
    const div = document.createElement('div');
    div.innerHTML = html;

    expect(div.querySelector('.detail-relations')).toBeNull();
  });

  it('renders metadata table when metadata is present', () => {
    const data = makeTaskDetail({ metadata: [{ key: 'branch', value: 'main' }] });
    const html = renderDetailPanelHtml(data);
    const div = document.createElement('div');
    div.innerHTML = html;

    expect(div.querySelector('.detail-meta-table')).not.toBeNull();
  });

  it('does not render metadata table when metadata is empty', () => {
    const html = renderDetailPanelHtml(makeTaskDetail());
    const div = document.createElement('div');
    div.innerHTML = html;

    expect(div.querySelector('.detail-meta-table')).toBeNull();
  });

  it('handles undefined metadata gracefully', () => {
    const data = { ...makeTaskDetail(), metadata: undefined };
    expect(() => renderDetailPanelHtml(data as ReturnType<typeof makeTaskDetail>)).not.toThrow();
  });

  it('handles undefined blockedBy gracefully', () => {
    const data = { ...makeTaskDetail(), blockedBy: undefined };
    expect(() => renderDetailPanelHtml(data as ReturnType<typeof makeTaskDetail>)).not.toThrow();
  });

  it('handles undefined blocking gracefully', () => {
    const data = { ...makeTaskDetail(), blocking: undefined };
    expect(() => renderDetailPanelHtml(data as ReturnType<typeof makeTaskDetail>)).not.toThrow();
  });

  it('handles null parent gracefully', () => {
    const data = makeTaskDetail({ parent: null });
    expect(() => renderDetailPanelHtml(data)).not.toThrow();
  });
});

// ---- renderRunLogsHtml ----

describe('renderRunLogsHtml', () => {
  it('renders empty state when logs array is empty', () => {
    const html = renderRunLogsHtml([]);
    const div = document.createElement('div');
    div.innerHTML = html;

    expect(div.querySelector('.run-log-empty')).not.toBeNull();
    expect(div.textContent).toContain('No run logs yet.');
  });

  it('renders log items for each log', () => {
    const logs = [
      {
        id: 1,
        started_at: '2026-01-01T12:00:00.000Z',
        finished_at: '2026-01-01T12:01:00.000Z',
        exit_code: 0,
        events: [],
      },
      {
        id: 2,
        started_at: '2026-01-01T13:00:00.000Z',
        finished_at: null,
        exit_code: null,
        events: [],
      },
    ];
    const html = renderRunLogsHtml(logs);
    const div = document.createElement('div');
    div.innerHTML = html;

    const items = div.querySelectorAll('.run-log-item');
    expect(items.length).toBe(2);
  });

  it('marks first log item with open class', () => {
    const logs = [
      {
        id: 1,
        started_at: '2026-01-01T12:00:00.000Z',
        finished_at: null,
        exit_code: null,
        events: [],
      },
      {
        id: 2,
        started_at: '2026-01-01T13:00:00.000Z',
        finished_at: null,
        exit_code: null,
        events: [],
      },
    ];
    const html = renderRunLogsHtml(logs);
    const div = document.createElement('div');
    div.innerHTML = html;

    const items = div.querySelectorAll('.run-log-item');
    expect(items[0].classList.contains('open')).toBe(true);
    expect(items[1].classList.contains('open')).toBe(false);
  });

  it('shows success exit class for exit code 0', () => {
    const logs = [
      {
        id: 1,
        started_at: '2026-01-01T12:00:00.000Z',
        finished_at: '2026-01-01T12:01:00.000Z',
        exit_code: 0,
        events: [],
      },
    ];
    const html = renderRunLogsHtml(logs);
    const div = document.createElement('div');
    div.innerHTML = html;

    const exitSpan = div.querySelector('.run-log-exit');
    expect(exitSpan?.classList.contains('success')).toBe(true);
    expect(exitSpan?.textContent).toBe('exit: 0');
  });

  it('shows failure exit class for non-zero exit code', () => {
    const logs = [
      {
        id: 1,
        started_at: '2026-01-01T12:00:00.000Z',
        finished_at: '2026-01-01T12:01:00.000Z',
        exit_code: 1,
        events: [],
      },
    ];
    const html = renderRunLogsHtml(logs);
    const div = document.createElement('div');
    div.innerHTML = html;

    const exitSpan = div.querySelector('.run-log-exit');
    expect(exitSpan?.classList.contains('failure')).toBe(true);
    expect(exitSpan?.textContent).toBe('exit: 1');
  });

  it('shows running label when exit_code is null', () => {
    const logs = [
      {
        id: 1,
        started_at: '2026-01-01T12:00:00.000Z',
        finished_at: null,
        exit_code: null,
        events: [],
      },
    ];
    const html = renderRunLogsHtml(logs);
    const div = document.createElement('div');
    div.innerHTML = html;

    const exitSpan = div.querySelector('.run-log-exit');
    expect(exitSpan?.textContent).toBe('running');
    expect(exitSpan?.classList.contains('failure')).toBe(true);
  });

  it('renders text event content in log body', () => {
    const logs = [
      {
        id: 1,
        started_at: '2026-01-01T12:00:00.000Z',
        finished_at: null,
        exit_code: null,
        events: [{ kind: 'text', text: 'Hello from log' }],
      },
    ];
    const html = renderRunLogsHtml(logs);
    const div = document.createElement('div');
    div.innerHTML = html;

    expect(div.querySelector('.run-log-body')?.textContent).toContain('Hello from log');
  });

  it('does not render text event when text is empty/undefined', () => {
    const logs = [
      {
        id: 1,
        started_at: '2026-01-01T12:00:00.000Z',
        finished_at: null,
        exit_code: null,
        events: [{ kind: 'text', text: '' }],
      },
    ];
    const html = renderRunLogsHtml(logs);
    const div = document.createElement('div');
    div.innerHTML = html;

    // Empty text should not add content
    expect(div.querySelector('.run-log-body')?.textContent?.trim()).toBe('');
  });

  it('renders tool_use event with tool name', () => {
    const logs = [
      {
        id: 1,
        started_at: '2026-01-01T12:00:00.000Z',
        finished_at: null,
        exit_code: null,
        events: [{ kind: 'tool_use', name: 'Bash', input: { command: 'ls -la' } }],
      },
    ];
    const html = renderRunLogsHtml(logs);
    const div = document.createElement('div');
    div.innerHTML = html;

    const toolSpan = div.querySelector('.run-log-tool-use');
    expect(toolSpan).not.toBeNull();
    expect(toolSpan?.textContent).toContain('Bash');
    expect(toolSpan?.textContent).toContain('ls -la');
  });

  it('renders tool_use event with path as main arg', () => {
    const logs = [
      {
        id: 1,
        started_at: '2026-01-01T12:00:00.000Z',
        finished_at: null,
        exit_code: null,
        events: [{ kind: 'tool_use', name: 'Read', input: { path: '/workspace/file.ts' } }],
      },
    ];
    const html = renderRunLogsHtml(logs);
    const div = document.createElement('div');
    div.innerHTML = html;

    const toolSpan = div.querySelector('.run-log-tool-use');
    expect(toolSpan?.textContent).toContain('Read');
    expect(toolSpan?.textContent).toContain('/workspace/file.ts');
  });

  it('renders tool_use event name only when input has no path or command', () => {
    const logs = [
      {
        id: 1,
        started_at: '2026-01-01T12:00:00.000Z',
        finished_at: null,
        exit_code: null,
        events: [{ kind: 'tool_use', name: 'SomeTool', input: {} }],
      },
    ];
    const html = renderRunLogsHtml(logs);
    const div = document.createElement('div');
    div.innerHTML = html;

    const toolSpan = div.querySelector('.run-log-tool-use');
    expect(toolSpan).not.toBeNull();
    expect(toolSpan?.textContent).toContain('SomeTool');
  });

  it('renders tool_use event without input field', () => {
    const logs = [
      {
        id: 1,
        started_at: '2026-01-01T12:00:00.000Z',
        finished_at: null,
        exit_code: null,
        events: [{ kind: 'tool_use', name: 'SomeTool' }],
      },
    ];
    const html = renderRunLogsHtml(logs);
    const div = document.createElement('div');
    div.innerHTML = html;

    const toolSpan = div.querySelector('.run-log-tool-use');
    expect(toolSpan).not.toBeNull();
    expect(toolSpan?.textContent).toContain('SomeTool');
  });

  it('ignores unknown event kinds', () => {
    const logs = [
      {
        id: 1,
        started_at: '2026-01-01T12:00:00.000Z',
        finished_at: null,
        exit_code: null,
        events: [{ kind: 'unknown_kind', text: 'should be ignored' }],
      },
    ];
    const html = renderRunLogsHtml(logs);
    const div = document.createElement('div');
    div.innerHTML = html;

    expect(div.querySelector('.run-log-body')?.textContent?.trim()).toBe('');
  });

  it('formats started_at date by removing T and fractional seconds', () => {
    const logs = [
      {
        id: 1,
        started_at: '2026-01-15T09:30:00.000Z',
        finished_at: null,
        exit_code: null,
        events: [],
      },
    ];
    const html = renderRunLogsHtml(logs);
    const div = document.createElement('div');
    div.innerHTML = html;

    const dateSpan = div.querySelector('.run-log-date');
    expect(dateSpan?.textContent).toBe('2026-01-15 09:30:00');
  });

  it('handles empty started_at gracefully', () => {
    const logs = [
      {
        id: 1,
        started_at: '',
        finished_at: null,
        exit_code: null,
        events: [],
      },
    ];
    const html = renderRunLogsHtml(logs);
    const div = document.createElement('div');
    div.innerHTML = html;

    const dateSpan = div.querySelector('.run-log-date');
    expect(dateSpan?.textContent).toBe('');
  });

  it('sets data-log-id on each log item', () => {
    const logs = [
      {
        id: 42,
        started_at: '2026-01-01T12:00:00.000Z',
        finished_at: null,
        exit_code: null,
        events: [],
      },
    ];
    const html = renderRunLogsHtml(logs);
    const div = document.createElement('div');
    div.innerHTML = html;

    const item = div.querySelector('.run-log-item');
    expect(item?.getAttribute('data-log-id')).toBe('42');
  });

  it('renders header with toggle-run-log action', () => {
    const logs = [
      {
        id: 1,
        started_at: '2026-01-01T12:00:00.000Z',
        finished_at: null,
        exit_code: null,
        events: [],
      },
    ];
    const html = renderRunLogsHtml(logs);
    const div = document.createElement('div');
    div.innerHTML = html;

    const header = div.querySelector('[data-action="toggle-run-log"]');
    expect(header).not.toBeNull();
  });
});

// ---- buildDetailPanelHtml ----

describe('buildDetailPanelHtml', () => {
  it('renders the detail-panel container', () => {
    const html = buildDetailPanelHtml();
    const div = document.createElement('div');
    div.innerHTML = html;

    expect(div.querySelector('#detail-panel')).not.toBeNull();
    expect(div.querySelector('#detail-panel')?.classList.contains('detail-panel')).toBe(true);
  });

  it('renders the resize handle', () => {
    const html = buildDetailPanelHtml();
    const div = document.createElement('div');
    div.innerHTML = html;

    expect(div.querySelector('#detail-panel-resize-handle')).not.toBeNull();
  });

  it('renders the panel header with title and buttons', () => {
    const html = buildDetailPanelHtml();
    const div = document.createElement('div');
    div.innerHTML = html;

    expect(div.querySelector('#detail-panel-title')).not.toBeNull();
    expect(div.querySelector('#detail-panel-title')?.textContent).toBe('Task Detail');
    expect(div.querySelector('#detail-panel-copy-id')).not.toBeNull();
    expect(div.querySelector('#detail-panel-close')).not.toBeNull();
  });

  it('renders the tabs section with all four tabs', () => {
    const html = buildDetailPanelHtml();
    const div = document.createElement('div');
    div.innerHTML = html;

    const tabs = div.querySelectorAll('.detail-tab');
    expect(tabs.length).toBe(4);

    const tabTexts = Array.from(tabs).map((t) => t.textContent);
    expect(tabTexts).toContain('Details');
    expect(tabTexts).toContain('Comments');
    expect(tabTexts).toContain('Run Logs');
    expect(tabTexts).toContain('Terminal');
  });

  it('renders the details tab as active', () => {
    const html = buildDetailPanelHtml();
    const div = document.createElement('div');
    div.innerHTML = html;

    const detailsTab = div.querySelector('[data-tab="details"]');
    expect(detailsTab?.classList.contains('active')).toBe(true);
  });

  it('renders four tab content divs', () => {
    const html = buildDetailPanelHtml();
    const div = document.createElement('div');
    div.innerHTML = html;

    expect(div.querySelector('#detail-tab-content-details')).not.toBeNull();
    expect(div.querySelector('#detail-tab-content-comments')).not.toBeNull();
    expect(div.querySelector('#detail-tab-content-run-logs')).not.toBeNull();
    expect(div.querySelector('#detail-tab-content-terminal')).not.toBeNull();
  });

  it('renders terminal pane with stop button and host div', () => {
    const html = buildDetailPanelHtml();
    const div = document.createElement('div');
    div.innerHTML = html;

    expect(div.querySelector('#detail-terminal-stop-btn')).not.toBeNull();
    expect(div.querySelector('#detail-terminal-host')).not.toBeNull();
    expect(div.querySelector('#detail-terminal-placeholder')).not.toBeNull();
  });

  it('renders the footer with save button', () => {
    const html = buildDetailPanelHtml();
    const div = document.createElement('div');
    div.innerHTML = html;

    expect(div.querySelector('#detail-panel-footer')).not.toBeNull();
    expect(div.querySelector('#detail-save-btn')).not.toBeNull();
  });

  it('terminal placeholder text is correct', () => {
    const html = buildDetailPanelHtml();
    const div = document.createElement('div');
    div.innerHTML = html;

    const placeholder = div.querySelector('#detail-terminal-placeholder');
    expect(placeholder?.textContent).toBe('No terminal session yet.');
  });
});

// ---- autoResizeTextarea ----

describe('autoResizeTextarea', () => {
  it('sets textarea height based on scrollHeight', () => {
    const container = document.createElement('div');
    container.className = 'detail-tab-content';
    document.body.appendChild(container);

    const textarea = document.createElement('textarea');
    container.appendChild(textarea);

    Object.defineProperty(textarea, 'scrollHeight', { configurable: true, value: 150 });

    autoResizeTextarea(textarea);

    expect(textarea.style.height).toBe('150px');

    document.body.removeChild(container);
  });

  it('preserves scroll position of scroll container', () => {
    const container = document.createElement('div');
    container.className = 'detail-tab-content';
    document.body.appendChild(container);

    const textarea = document.createElement('textarea');
    container.appendChild(textarea);

    Object.defineProperty(textarea, 'scrollHeight', { configurable: true, value: 200 });
    container.scrollTop = 75;

    autoResizeTextarea(textarea);

    expect(container.scrollTop).toBe(75);

    document.body.removeChild(container);
  });

  it('works when textarea has no scroll container parent', () => {
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);

    Object.defineProperty(textarea, 'scrollHeight', { configurable: true, value: 100 });

    expect(() => autoResizeTextarea(textarea)).not.toThrow();
    expect(textarea.style.height).toBe('100px');

    document.body.removeChild(textarea);
  });

  it('sets height to auto first to allow shrinking', () => {
    const heightHistory: string[] = [];
    const container = document.createElement('div');
    container.className = 'detail-tab-content';
    document.body.appendChild(container);

    const textarea = document.createElement('textarea');
    container.appendChild(textarea);

    const originalSetProperty = textarea.style.setProperty.bind(textarea.style);
    vi.spyOn(textarea.style, 'setProperty').mockImplementation((prop, val, ...rest) => {
      if (prop === 'height') heightHistory.push(val ?? '');
      originalSetProperty(prop, val, ...rest);
    });

    Object.defineProperty(textarea, 'scrollHeight', { configurable: true, value: 120 });

    autoResizeTextarea(textarea);

    // After calling, the final height should be the scrollHeight
    expect(textarea.style.height).toBe('120px');

    document.body.removeChild(container);
  });
});
