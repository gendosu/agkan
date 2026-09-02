/**
 * Tests for task-level model/effort override helpers (src/board/taskModelOverride.ts)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { resetDatabase } from '../../src/db/reset';
import { getStorageBackend } from '../../src/db/connection';
import { TaskService } from '../../src/services/TaskService';
import {
  getTaskModelOverride,
  getTaskEffortOverride,
  persistTaskModelOverrides,
  persistTaskEffortOverrides,
} from '../../src/board/taskModelOverride';

beforeEach(() => {
  resetDatabase();
});

function buildTaskService(): TaskService {
  return new TaskService(getStorageBackend());
}

describe('getTaskModelOverride / persistTaskModelOverrides', () => {
  it('returns undefined when no override is set', () => {
    const ts = buildTaskService();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    expect(getTaskModelOverride(ts, task.id, 'planning')).toBeUndefined();
    expect(getTaskModelOverride(ts, task.id, 'run')).toBeUndefined();
  });

  it('returns undefined for a task that does not exist', () => {
    const ts = buildTaskService();
    expect(getTaskModelOverride(ts, 9999, 'run')).toBeUndefined();
  });

  it('persists and reads back a model override', () => {
    const ts = buildTaskService();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    persistTaskModelOverrides(task.id, { planning: 'opus', run: 'haiku' }, ts);
    expect(getTaskModelOverride(ts, task.id, 'planning')).toBe('opus');
    expect(getTaskModelOverride(ts, task.id, 'run')).toBe('haiku');
  });

  it('writes the values into the tasks columns, not task_metadata', () => {
    const ts = buildTaskService();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    persistTaskModelOverrides(task.id, { run: 'sonnet' }, ts);
    expect(ts.getTask(task.id)!.model_run).toBe('sonnet');
    expect(getStorageBackend().metadata.findByTaskId(task.id)).toHaveLength(0);
  });

  it('clears an override when given an empty string', () => {
    const ts = buildTaskService();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    persistTaskModelOverrides(task.id, { planning: 'opus' }, ts);
    expect(getTaskModelOverride(ts, task.id, 'planning')).toBe('opus');
    persistTaskModelOverrides(task.id, { planning: '' }, ts);
    expect(getTaskModelOverride(ts, task.id, 'planning')).toBeUndefined();
    expect(ts.getTask(task.id)!.model_planning).toBeNull();
  });

  it('trims surrounding whitespace before storing', () => {
    const ts = buildTaskService();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    persistTaskModelOverrides(task.id, { run: '  sonnet  ' }, ts);
    expect(getTaskModelOverride(ts, task.id, 'run')).toBe('sonnet');
  });

  it('ignores keys not present in the input and leaves existing overrides untouched', () => {
    const ts = buildTaskService();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    persistTaskModelOverrides(task.id, { planning: 'opus', run: 'haiku' }, ts);
    persistTaskModelOverrides(task.id, { planning: 'sonnet' }, ts);
    expect(getTaskModelOverride(ts, task.id, 'planning')).toBe('sonnet');
    expect(getTaskModelOverride(ts, task.id, 'run')).toBe('haiku');
  });

  it('silently ignores invalid input (non-object)', () => {
    const ts = buildTaskService();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    expect(() => persistTaskModelOverrides(task.id, 'not-an-object', ts)).not.toThrow();
    expect(() => persistTaskModelOverrides(task.id, null, ts)).not.toThrow();
    expect(getTaskModelOverride(ts, task.id, 'planning')).toBeUndefined();
  });
});

describe('getTaskEffortOverride / persistTaskEffortOverrides', () => {
  it('returns undefined when no override is set', () => {
    const ts = buildTaskService();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    expect(getTaskEffortOverride(ts, task.id, 'planning')).toBeUndefined();
    expect(getTaskEffortOverride(ts, task.id, 'run')).toBeUndefined();
  });

  it('persists and reads back an effort override', () => {
    const ts = buildTaskService();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    persistTaskEffortOverrides(task.id, { planning: 'low', run: 'xhigh' }, ts);
    expect(getTaskEffortOverride(ts, task.id, 'planning')).toBe('low');
    expect(getTaskEffortOverride(ts, task.id, 'run')).toBe('xhigh');
  });

  it('clears an override when given an empty string', () => {
    const ts = buildTaskService();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    persistTaskEffortOverrides(task.id, { run: 'max' }, ts);
    expect(getTaskEffortOverride(ts, task.id, 'run')).toBe('max');
    persistTaskEffortOverrides(task.id, { run: '' }, ts);
    expect(getTaskEffortOverride(ts, task.id, 'run')).toBeUndefined();
  });

  it('is independent from model overrides on the same task', () => {
    const ts = buildTaskService();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    persistTaskEffortOverrides(task.id, { run: 'high' }, ts);
    expect(getTaskModelOverride(ts, task.id, 'run')).toBeUndefined();
    expect(getTaskEffortOverride(ts, task.id, 'run')).toBe('high');

    persistTaskModelOverrides(task.id, { run: 'sonnet' }, ts);
    expect(getTaskModelOverride(ts, task.id, 'run')).toBe('sonnet');
    expect(getTaskEffortOverride(ts, task.id, 'run')).toBe('high');
  });

  it('silently ignores invalid input (non-object)', () => {
    const ts = buildTaskService();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    expect(() => persistTaskEffortOverrides(task.id, 'not-an-object', ts)).not.toThrow();
    expect(() => persistTaskEffortOverrides(task.id, undefined, ts)).not.toThrow();
    expect(getTaskEffortOverride(ts, task.id, 'planning')).toBeUndefined();
  });
});
