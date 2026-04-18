/**
 * Tests for boardRenderer module
 */

import { describe, it, expect, vi } from 'vitest';
import {
  STATUSES,
  STATUS_LABELS,
  STATUS_COLORS,
  renderCard,
  renderColumn,
  sortByPriority,
  buildTasksByStatus,
  buildBoardCardsPayload,
  getBoardUpdatedAt,
} from '../../src/board/boardRenderer';
import { Task, TaskStatus } from '../../src/models';
import { Tag } from '../../src/models/Tag';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    title: 'Test Task',
    body: null,
    author: null,
    assignees: null,
    status: 'backlog' as TaskStatus,
    priority: null,
    parent_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeTag(overrides: Partial<Tag> = {}): Tag {
  return {
    id: 1,
    name: 'bug',
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('STATUSES', () => {
  it('contains all expected statuses in order', () => {
    expect(STATUSES).toEqual(['icebox', 'backlog', 'ready', 'in_progress', 'review', 'done', 'closed']);
  });
});

describe('STATUS_LABELS', () => {
  it('has a label for every status', () => {
    for (const status of STATUSES) {
      expect(STATUS_LABELS[status]).toBeTruthy();
    }
  });

  it('has human-readable labels', () => {
    expect(STATUS_LABELS.in_progress).toBe('In Progress');
    expect(STATUS_LABELS.backlog).toBe('Backlog');
  });
});

describe('STATUS_COLORS', () => {
  it('has a color for every status', () => {
    for (const status of STATUSES) {
      expect(STATUS_COLORS[status]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('renderCard', () => {
  it('renders a card with task id and title', () => {
    const task = makeTask({ id: 42, title: 'My Task' });
    const html = renderCard(task, []);
    expect(html).toContain('#42');
    expect(html).toContain('My Task');
    expect(html).toContain('data-id="42"');
    expect(html).toContain('data-status="backlog"');
  });

  it('renders priority badge when priority is set', () => {
    const task = makeTask({ priority: 'high' });
    const html = renderCard(task, []);
    expect(html).toContain('<span class="priority priority-high">high</span>');
  });

  it('renders critical priority badge', () => {
    const task = makeTask({ priority: 'critical' });
    const html = renderCard(task, []);
    expect(html).toContain('priority-critical');
  });

  it('does not render priority badge when priority is null', () => {
    const task = makeTask({ priority: null });
    const html = renderCard(task, []);
    expect(html).not.toContain('class="priority');
  });

  it('renders tag badges for each tag', () => {
    const task = makeTask();
    const tags = [makeTag({ id: 1, name: 'frontend' }), makeTag({ id: 2, name: 'bug' })];
    const html = renderCard(task, tags);
    expect(html).toContain('<span class="tag">frontend</span>');
    expect(html).toContain('<span class="tag">bug</span>');
    expect(html).toContain('class="card-tags"');
  });

  it('renders data-tag-ids attribute with tag ids when tags are present', () => {
    const task = makeTask();
    const tags = [makeTag({ id: 3, name: 'frontend' }), makeTag({ id: 7, name: 'bug' })];
    const html = renderCard(task, tags);
    expect(html).toContain('data-tag-ids="3,7"');
  });

  it('does not render data-tag-ids attribute when no tags', () => {
    const task = makeTask();
    const html = renderCard(task, []);
    expect(html).not.toContain('data-tag-ids');
  });

  it('does not render card-tags div when no tags', () => {
    const task = makeTask();
    const html = renderCard(task, []);
    expect(html).not.toContain('class="card-tags"');
  });

  it('escapes HTML in task title', () => {
    const task = makeTask({ title: '<script>alert("xss")</script>' });
    const html = renderCard(task, []);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes HTML in tag names', () => {
    const task = makeTask();
    const tags = [makeTag({ name: '<evil>' })];
    const html = renderCard(task, tags);
    expect(html).not.toContain('<evil>');
    expect(html).toContain('&lt;evil&gt;');
  });

  it('escapes HTML in priority value', () => {
    const task = makeTask({ priority: 'high' as Task['priority'] });
    const html = renderCard(task, []);
    // priority value is safe, but escaping should not break it
    expect(html).toContain('high');
  });

  it('renders run button for ready status', () => {
    const task = makeTask({ status: 'ready' });
    const html = renderCard(task, []);
    expect(html).toContain('claude-run-btn');
    expect(html).not.toContain('claude-plan-btn');
  });

  it('renders run button for in_progress status', () => {
    const task = makeTask({ status: 'in_progress' });
    const html = renderCard(task, []);
    expect(html).toContain('claude-run-btn');
    expect(html).not.toContain('claude-plan-btn');
  });

  it('renders planning button for backlog status', () => {
    const task = makeTask({ status: 'backlog' });
    const html = renderCard(task, []);
    expect(html).toContain('claude-plan-btn');
    expect(html).not.toContain('claude-run-btn');
  });

  it('renders no action button for done status', () => {
    const task = makeTask({ status: 'done' });
    const html = renderCard(task, []);
    expect(html).not.toContain('claude-run-btn');
    expect(html).not.toContain('claude-plan-btn');
  });

  it('renders the card as draggable', () => {
    const html = renderCard(makeTask(), []);
    expect(html).toContain('draggable="true"');
  });

  it('renders data-updated-at attribute from task.updated_at', () => {
    const task = makeTask({ id: 1, updated_at: '2026-03-15T10:00:00.000Z' });
    const html = renderCard(task, []);
    expect(html).toContain('data-updated-at="2026-03-15T10:00:00.000Z"');
  });
});

describe('renderColumn', () => {
  it('renders the column with correct status data attribute', () => {
    const html = renderColumn('backlog', [], new Map());
    expect(html).toContain('data-status="backlog"');
    expect(html).toContain('id="col-backlog"');
  });

  it('renders column with correct label', () => {
    const html = renderColumn('in_progress', [], new Map());
    expect(html).toContain('In Progress');
  });

  it('renders the task count', () => {
    const tasks = [makeTask({ id: 1 }), makeTask({ id: 2 })];
    const html = renderColumn('backlog', tasks, new Map());
    expect(html).toContain('class="column-count"');
    expect(html).toContain('2');
  });

  it('renders card HTML inside the column', () => {
    const tasks = [makeTask({ id: 5, title: 'Hello Card' })];
    const tagMap = new Map<number, Tag[]>([[5, [makeTag({ name: 'mytag' })]]]);
    const html = renderColumn('backlog', tasks, tagMap);
    expect(html).toContain('Hello Card');
    expect(html).toContain('mytag');
  });

  it('uses correct color for the status', () => {
    const html = renderColumn('done', [], new Map());
    expect(html).toContain(STATUS_COLORS.done);
  });

  it('renders add-btn with correct data-status', () => {
    const html = renderColumn('ready', [], new Map());
    expect(html).toContain('data-status="ready"');
    expect(html).toContain('class="add-btn"');
  });
});

describe('sortByPriority', () => {
  it('returns a new array without mutating the original', () => {
    const tasks = [makeTask({ id: 1, priority: 'low' }), makeTask({ id: 2, priority: 'high' })];
    const sorted = sortByPriority(tasks);
    expect(sorted).not.toBe(tasks);
  });

  it('sorts tasks with higher priority first', () => {
    const tasks = [
      makeTask({ id: 1, priority: 'low' }),
      makeTask({ id: 2, priority: 'critical' }),
      makeTask({ id: 3, priority: 'high' }),
      makeTask({ id: 4, priority: 'medium' }),
    ];
    const sorted = sortByPriority(tasks);
    expect(sorted[0].priority).toBe('critical');
    expect(sorted[1].priority).toBe('high');
    expect(sorted[2].priority).toBe('medium');
    expect(sorted[3].priority).toBe('low');
  });

  it('places tasks with no priority last', () => {
    const tasks = [makeTask({ id: 1, priority: null }), makeTask({ id: 2, priority: 'low' })];
    const sorted = sortByPriority(tasks);
    expect(sorted[0].priority).toBe('low');
    expect(sorted[1].priority).toBeNull();
  });

  it('returns empty array for empty input', () => {
    expect(sortByPriority([])).toEqual([]);
  });
});

describe('buildTasksByStatus', () => {
  it('creates a map with all statuses initialized to empty arrays', () => {
    const result = buildTasksByStatus([]);
    for (const status of STATUSES) {
      expect(result.get(status)).toEqual([]);
    }
  });

  it('groups tasks by status', () => {
    const tasks = [
      makeTask({ id: 1, status: 'backlog' }),
      makeTask({ id: 2, status: 'done' }),
      makeTask({ id: 3, status: 'backlog' }),
    ];
    const result = buildTasksByStatus(tasks);
    expect(result.get('backlog')).toHaveLength(2);
    expect(result.get('done')).toHaveLength(1);
    expect(result.get('ready')).toHaveLength(0);
  });

  it('sorts tasks within each status by priority', () => {
    const tasks = [
      makeTask({ id: 1, status: 'backlog', priority: 'low' }),
      makeTask({ id: 2, status: 'backlog', priority: 'critical' }),
    ];
    const result = buildTasksByStatus(tasks);
    const backlog = result.get('backlog')!;
    expect(backlog[0].priority).toBe('critical');
    expect(backlog[1].priority).toBe('low');
  });
});

describe('buildBoardCardsPayload', () => {
  it('returns an array with one entry per status', () => {
    const tasksByStatus = buildTasksByStatus([]);
    const result = buildBoardCardsPayload(tasksByStatus, new Map());
    expect(result).toHaveLength(STATUSES.length);
  });

  it('each entry has status, html, and count fields', () => {
    const tasksByStatus = buildTasksByStatus([]);
    const result = buildBoardCardsPayload(tasksByStatus, new Map());
    for (const entry of result) {
      expect(entry).toHaveProperty('status');
      expect(entry).toHaveProperty('html');
      expect(entry).toHaveProperty('count');
    }
  });

  it('count reflects number of tasks in that status', () => {
    const tasks = [makeTask({ id: 1, status: 'backlog' }), makeTask({ id: 2, status: 'backlog' })];
    const tasksByStatus = buildTasksByStatus(tasks);
    const result = buildBoardCardsPayload(tasksByStatus, new Map());
    const backlogEntry = result.find((e) => e.status === 'backlog')!;
    expect(backlogEntry.count).toBe(2);
  });

  it('html contains card markup for tasks', () => {
    const tasks = [makeTask({ id: 1, title: 'My Task', status: 'ready' })];
    const tasksByStatus = buildTasksByStatus(tasks);
    const result = buildBoardCardsPayload(tasksByStatus, new Map());
    const readyEntry = result.find((e) => e.status === 'ready')!;
    expect(readyEntry.html).toContain('My Task');
  });

  it('uses tagMap to render tag badges', () => {
    const tasks = [makeTask({ id: 1, status: 'done' })];
    const tasksByStatus = buildTasksByStatus(tasks);
    const tagMap = new Map([[1, [makeTag({ name: 'frontend' })]]]);
    const result = buildBoardCardsPayload(tasksByStatus, tagMap);
    const doneEntry = result.find((e) => e.status === 'done')!;
    expect(doneEntry.html).toContain('frontend');
  });

  it('statuses appear in the canonical STATUSES order', () => {
    const tasksByStatus = buildTasksByStatus([]);
    const result = buildBoardCardsPayload(tasksByStatus, new Map());
    const resultStatuses = result.map((e) => e.status);
    expect(resultStatuses).toEqual(STATUSES);
  });
});

describe('getBoardUpdatedAt', () => {
  function makeBackend(signature: string | null) {
    return {
      getBoardUpdatedAtSignature: vi.fn(() => signature),
    };
  }

  it('returns null when both base and tags timestamps are null', () => {
    const db = makeBackend(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = getBoardUpdatedAt(db as any);
    expect(result).toBeNull();
  });

  it('returns a composite string when base timestamp is present', () => {
    const db = makeBackend('2026-01-01T00:00:00.000Z|null|0');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = getBoardUpdatedAt(db as any);
    expect(result).toBe('2026-01-01T00:00:00.000Z|null|0');
  });

  it('returns a composite string when tags timestamp is present', () => {
    const db = makeBackend('null|2026-01-02T00:00:00.000Z|5');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = getBoardUpdatedAt(db as any);
    expect(result).toBe('null|2026-01-02T00:00:00.000Z|5');
  });

  it('returns a composite string combining all parts', () => {
    const db = makeBackend('2026-01-01T00:00:00.000Z|2026-01-02T00:00:00.000Z|3');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = getBoardUpdatedAt(db as any);
    expect(result).toBe('2026-01-01T00:00:00.000Z|2026-01-02T00:00:00.000Z|3');
  });
});
