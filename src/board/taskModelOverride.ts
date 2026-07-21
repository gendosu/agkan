// Task-level model override helpers.
//
// Allows a task to specify which Claude model to use for 'planning' and 'run'
// commands, overriding the value from the config file (.agkan.yml). Overrides
// are stored as generic task metadata (no schema migration required) under
// well-known keys.

import { MetadataService } from '../services/MetadataService';

export type ModelOverrideKind = 'planning' | 'run';

export function taskModelMetadataKey(kind: ModelOverrideKind): string {
  return `model:${kind}`;
}

/**
 * Read the task-level model override for the given kind ('planning' | 'run').
 * Returns undefined if no override is set (falls through to config/default).
 */
export function getTaskModelOverride(ms: MetadataService, taskId: number, kind: ModelOverrideKind): string | undefined {
  const meta = ms.getMetadataByKey(taskId, taskModelMetadataKey(kind));
  const trimmed = meta?.value?.trim();
  return trimmed || undefined;
}

export interface TaskModelOverrides {
  planning?: string;
  run?: string;
}

/**
 * Persist task-level model overrides from a create/update request body.
 * A non-empty string sets the override; an empty string or null clears it.
 * Unrelated/invalid input is silently ignored.
 */
export function persistTaskModelOverrides(taskId: number, rawModels: unknown, ms: MetadataService): void {
  if (!rawModels || typeof rawModels !== 'object') return;
  const models = rawModels as Record<string, unknown>;
  (['planning', 'run'] as const).forEach((kind) => {
    if (!(kind in models)) return;
    const raw = models[kind];
    const key = taskModelMetadataKey(kind);
    if (typeof raw === 'string' && raw.trim()) {
      ms.setMetadata({ task_id: taskId, key, value: raw.trim() });
    } else {
      ms.deleteMetadata(taskId, key);
    }
  });
}
