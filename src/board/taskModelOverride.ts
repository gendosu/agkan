// Task-level model/effort override helpers.
//
// Allows a task to specify which Claude model (and reasoning effort) to use for
// 'planning' and 'run' commands, overriding the values from the config file
// (.agkan.yml). Overrides are stored directly on the tasks table's
// model_planning/model_run/effort_planning/effort_run columns.

import { TaskService } from '../services/TaskService';
import type { UpdateTaskInput } from '../models/Task';

export type ModelOverrideKind = 'planning' | 'run';
type OverrideCategory = 'model' | 'effort';

/** tasks table column holding the override for a given category/kind pair */
type OverrideColumn = 'model_planning' | 'model_run' | 'effort_planning' | 'effort_run';

function overrideColumn(category: OverrideCategory, kind: ModelOverrideKind): OverrideColumn {
  return `${category}_${kind}` as OverrideColumn;
}

function getTaskOverride(
  taskService: TaskService,
  taskId: number,
  category: OverrideCategory,
  kind: ModelOverrideKind
): string | undefined {
  const task = taskService.getTask(taskId);
  const trimmed = task?.[overrideColumn(category, kind)]?.trim();
  return trimmed || undefined;
}

/**
 * Read the task-level model override for the given kind ('planning' | 'run').
 * Returns undefined if no override is set (falls through to config/default).
 */
export function getTaskModelOverride(
  taskService: TaskService,
  taskId: number,
  kind: ModelOverrideKind
): string | undefined {
  return getTaskOverride(taskService, taskId, 'model', kind);
}

/**
 * Read the task-level reasoning effort override for the given kind ('planning' | 'run').
 * Returns undefined if no override is set (falls through to config/default).
 */
export function getTaskEffortOverride(
  taskService: TaskService,
  taskId: number,
  kind: ModelOverrideKind
): string | undefined {
  return getTaskOverride(taskService, taskId, 'effort', kind);
}

export interface TaskModelOverrides {
  planning?: string;
  run?: string;
}

export interface TaskEffortOverrides {
  planning?: string;
  run?: string;
}

/**
 * Persist task-level overrides (model or effort) from a create/update request body.
 * A non-empty string sets the override; an empty string or null clears it.
 * Unrelated/invalid input is silently ignored.
 */
function persistTaskOverrides(
  taskId: number,
  rawValues: unknown,
  taskService: TaskService,
  category: OverrideCategory
): void {
  if (!rawValues || typeof rawValues !== 'object') return;
  const values = rawValues as Record<string, unknown>;
  const input: UpdateTaskInput = {};
  (['planning', 'run'] as const).forEach((kind) => {
    if (!(kind in values)) return;
    const raw = values[kind];
    input[overrideColumn(category, kind)] = typeof raw === 'string' && raw.trim() ? raw.trim() : null;
  });
  if (Object.keys(input).length === 0) return;
  taskService.updateTask(taskId, input);
}

/**
 * Persist task-level model overrides from a create/update request body.
 * A non-empty string sets the override; an empty string or null clears it.
 * Unrelated/invalid input is silently ignored.
 */
export function persistTaskModelOverrides(taskId: number, rawModels: unknown, taskService: TaskService): void {
  persistTaskOverrides(taskId, rawModels, taskService, 'model');
}

/**
 * Persist task-level reasoning effort overrides from a create/update request body.
 * A non-empty string sets the override; an empty string or null clears it.
 * Unrelated/invalid input is silently ignored.
 */
export function persistTaskEffortOverrides(taskId: number, rawEfforts: unknown, taskService: TaskService): void {
  persistTaskOverrides(taskId, rawEfforts, taskService, 'effort');
}
