// Task-level model/effort override helpers.
//
// Allows a task to specify which Claude model (and reasoning effort) to use for
// 'planning' and 'run' commands, overriding the values from the config file
// (.agkan.yml). Overrides are stored as generic task metadata (no schema
// migration required) under well-known keys.

import { MetadataService } from '../services/MetadataService';

export type ModelOverrideKind = 'planning' | 'run';
type OverrideCategory = 'model' | 'effort';

function taskOverrideMetadataKey(category: OverrideCategory, kind: ModelOverrideKind): string {
  return `${category}:${kind}`;
}

export function taskModelMetadataKey(kind: ModelOverrideKind): string {
  return taskOverrideMetadataKey('model', kind);
}

export function taskEffortMetadataKey(kind: ModelOverrideKind): string {
  return taskOverrideMetadataKey('effort', kind);
}

/**
 * Read the task-level override for the given category ('model' | 'effort') and
 * kind ('planning' | 'run'). Returns undefined if no override is set (falls
 * through to config/default).
 */
function getTaskOverride(
  ms: MetadataService,
  taskId: number,
  category: OverrideCategory,
  kind: ModelOverrideKind
): string | undefined {
  const meta = ms.getMetadataByKey(taskId, taskOverrideMetadataKey(category, kind));
  const trimmed = meta?.value?.trim();
  return trimmed || undefined;
}

/**
 * Read the task-level model override for the given kind ('planning' | 'run').
 * Returns undefined if no override is set (falls through to config/default).
 */
export function getTaskModelOverride(ms: MetadataService, taskId: number, kind: ModelOverrideKind): string | undefined {
  return getTaskOverride(ms, taskId, 'model', kind);
}

/**
 * Read the task-level reasoning effort override for the given kind ('planning' | 'run').
 * Returns undefined if no override is set (falls through to config/default).
 */
export function getTaskEffortOverride(
  ms: MetadataService,
  taskId: number,
  kind: ModelOverrideKind
): string | undefined {
  return getTaskOverride(ms, taskId, 'effort', kind);
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
  ms: MetadataService,
  category: OverrideCategory
): void {
  if (!rawValues || typeof rawValues !== 'object') return;
  const values = rawValues as Record<string, unknown>;
  (['planning', 'run'] as const).forEach((kind) => {
    if (!(kind in values)) return;
    const raw = values[kind];
    const key = taskOverrideMetadataKey(category, kind);
    if (typeof raw === 'string' && raw.trim()) {
      ms.setMetadata({ task_id: taskId, key, value: raw.trim() });
    } else {
      ms.deleteMetadata(taskId, key);
    }
  });
}

/**
 * Persist task-level model overrides from a create/update request body.
 * A non-empty string sets the override; an empty string or null clears it.
 * Unrelated/invalid input is silently ignored.
 */
export function persistTaskModelOverrides(taskId: number, rawModels: unknown, ms: MetadataService): void {
  persistTaskOverrides(taskId, rawModels, ms, 'model');
}

/**
 * Persist task-level reasoning effort overrides from a create/update request body.
 * A non-empty string sets the override; an empty string or null clears it.
 * Unrelated/invalid input is silently ignored.
 */
export function persistTaskEffortOverrides(taskId: number, rawEfforts: unknown, ms: MetadataService): void {
  persistTaskOverrides(taskId, rawEfforts, ms, 'effort');
}
