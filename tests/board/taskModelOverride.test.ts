/**
 * Tests for task-level model/effort override helpers (src/board/taskModelOverride.ts)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { resetDatabase } from '../../src/db/reset';
import { getStorageBackend } from '../../src/db/connection';
import { TaskService } from '../../src/services/TaskService';
import { MetadataService } from '../../src/services/MetadataService';
import {
  getTaskModelOverride,
  getTaskEffortOverride,
  persistTaskModelOverrides,
  persistTaskEffortOverrides,
  taskModelMetadataKey,
  taskEffortMetadataKey,
} from '../../src/board/taskModelOverride';

beforeEach(() => {
  resetDatabase();
});

function buildServices() {
  const db = getStorageBackend();
  return { ts: new TaskService(db), ms: new MetadataService(db) };
}

describe('taskModelMetadataKey / taskEffortMetadataKey', () => {
  it('builds distinct metadata keys per category and kind', () => {
    expect(taskModelMetadataKey('planning')).toBe('model:planning');
    expect(taskModelMetadataKey('run')).toBe('model:run');
    expect(taskEffortMetadataKey('planning')).toBe('effort:planning');
    expect(taskEffortMetadataKey('run')).toBe('effort:run');
  });
});

describe('getTaskModelOverride / persistTaskModelOverrides', () => {
  it('returns undefined when no override is set', () => {
    const { ts, ms } = buildServices();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    expect(getTaskModelOverride(ms, task.id, 'planning')).toBeUndefined();
    expect(getTaskModelOverride(ms, task.id, 'run')).toBeUndefined();
  });

  it('persists and reads back a model override', () => {
    const { ts, ms } = buildServices();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    persistTaskModelOverrides(task.id, { planning: 'opus', run: 'haiku' }, ms);
    expect(getTaskModelOverride(ms, task.id, 'planning')).toBe('opus');
    expect(getTaskModelOverride(ms, task.id, 'run')).toBe('haiku');
  });

  it('clears an override when given an empty string', () => {
    const { ts, ms } = buildServices();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    persistTaskModelOverrides(task.id, { planning: 'opus' }, ms);
    expect(getTaskModelOverride(ms, task.id, 'planning')).toBe('opus');
    persistTaskModelOverrides(task.id, { planning: '' }, ms);
    expect(getTaskModelOverride(ms, task.id, 'planning')).toBeUndefined();
  });

  it('ignores keys not present in the input and leaves existing overrides untouched', () => {
    const { ts, ms } = buildServices();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    persistTaskModelOverrides(task.id, { planning: 'opus', run: 'haiku' }, ms);
    persistTaskModelOverrides(task.id, { planning: 'sonnet' }, ms);
    expect(getTaskModelOverride(ms, task.id, 'planning')).toBe('sonnet');
    expect(getTaskModelOverride(ms, task.id, 'run')).toBe('haiku');
  });

  it('silently ignores invalid input (non-object)', () => {
    const { ts, ms } = buildServices();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    expect(() => persistTaskModelOverrides(task.id, 'not-an-object', ms)).not.toThrow();
    expect(() => persistTaskModelOverrides(task.id, null, ms)).not.toThrow();
    expect(getTaskModelOverride(ms, task.id, 'planning')).toBeUndefined();
  });
});

describe('getTaskEffortOverride / persistTaskEffortOverrides', () => {
  it('returns undefined when no override is set', () => {
    const { ts, ms } = buildServices();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    expect(getTaskEffortOverride(ms, task.id, 'planning')).toBeUndefined();
    expect(getTaskEffortOverride(ms, task.id, 'run')).toBeUndefined();
  });

  it('persists and reads back an effort override', () => {
    const { ts, ms } = buildServices();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    persistTaskEffortOverrides(task.id, { planning: 'low', run: 'xhigh' }, ms);
    expect(getTaskEffortOverride(ms, task.id, 'planning')).toBe('low');
    expect(getTaskEffortOverride(ms, task.id, 'run')).toBe('xhigh');
  });

  it('clears an override when given an empty string', () => {
    const { ts, ms } = buildServices();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    persistTaskEffortOverrides(task.id, { run: 'max' }, ms);
    expect(getTaskEffortOverride(ms, task.id, 'run')).toBe('max');
    persistTaskEffortOverrides(task.id, { run: '' }, ms);
    expect(getTaskEffortOverride(ms, task.id, 'run')).toBeUndefined();
  });

  it('is independent from model overrides on the same task', () => {
    const { ts, ms } = buildServices();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    persistTaskEffortOverrides(task.id, { run: 'high' }, ms);
    expect(getTaskModelOverride(ms, task.id, 'run')).toBeUndefined();
    expect(getTaskEffortOverride(ms, task.id, 'run')).toBe('high');

    persistTaskModelOverrides(task.id, { run: 'sonnet' }, ms);
    expect(getTaskModelOverride(ms, task.id, 'run')).toBe('sonnet');
    expect(getTaskEffortOverride(ms, task.id, 'run')).toBe('high');
  });

  it('silently ignores invalid input (non-object)', () => {
    const { ts, ms } = buildServices();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    expect(() => persistTaskEffortOverrides(task.id, 'not-an-object', ms)).not.toThrow();
    expect(() => persistTaskEffortOverrides(task.id, undefined, ms)).not.toThrow();
    expect(getTaskEffortOverride(ms, task.id, 'planning')).toBeUndefined();
  });
});
