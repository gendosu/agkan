// Model catalog: the single source of truth for which (cli, model, effort)
// combinations a task-level override may select. The built-in default can be
// replaced wholesale by the `modelCatalog` key in .agkan.yml.

import type { AgentTool, Config } from './config';

export interface ModelCatalogEntry {
  /** CLI that runs this model. A task that selects the model runs on this cli. */
  cli: AgentTool;
  /** Value passed through to the CLI's --model flag */
  model: string;
  /** Effort values selectable for this model. An empty list means "no effort override". */
  efforts: string[];
}

const CLAUDE_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
// Reasoning efforts the Codex CLI accepts for each model (its models list as of codex-cli 0.147).
const CODEX_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
const CODEX_EFFORTS_NO_ULTRA = ['low', 'medium', 'high', 'xhigh', 'max'];

export const DEFAULT_MODEL_CATALOG: readonly ModelCatalogEntry[] = [
  { cli: 'claude', model: 'fable', efforts: CLAUDE_EFFORTS },
  { cli: 'claude', model: 'opus', efforts: CLAUDE_EFFORTS },
  { cli: 'claude', model: 'sonnet', efforts: CLAUDE_EFFORTS },
  { cli: 'claude', model: 'haiku', efforts: CLAUDE_EFFORTS },
  { cli: 'codex', model: 'gpt-6-astra', efforts: CODEX_EFFORTS },
  { cli: 'codex', model: 'gpt-5.6-sol', efforts: CODEX_EFFORTS },
  { cli: 'codex', model: 'gpt-5.6-terra', efforts: CODEX_EFFORTS },
  { cli: 'codex', model: 'gpt-5.6-luna', efforts: CODEX_EFFORTS_NO_ULTRA },
];

function cloneCatalog(catalog: readonly ModelCatalogEntry[]): ModelCatalogEntry[] {
  return catalog.map((entry) => ({ ...entry, efforts: [...entry.efforts] }));
}

function parseEntry(raw: unknown, index: number): ModelCatalogEntry {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`Invalid modelCatalog[${index}]: each entry must be an object with cli, model, and efforts`);
  }
  const entry = raw as Record<string, unknown>;

  const cli = entry.cli;
  if (cli !== 'claude' && cli !== 'codex') {
    throw new Error(`Invalid modelCatalog[${index}].cli "${String(cli)}". Must be one of: claude, codex`);
  }

  const model = entry.model;
  if (typeof model !== 'string' || !model.trim()) {
    throw new Error(`Invalid modelCatalog[${index}].model: must be a non-empty string`);
  }

  const efforts = entry.efforts;
  if (!Array.isArray(efforts)) {
    throw new Error(`Invalid modelCatalog[${index}].efforts: must be an array of non-empty strings`);
  }
  const parsedEfforts = efforts.map((effort, effortIndex) => {
    if (typeof effort !== 'string' || !effort.trim()) {
      throw new Error(`Invalid modelCatalog[${index}].efforts[${effortIndex}]: must be a non-empty string`);
    }
    return effort.trim();
  });

  return { cli, model: model.trim(), efforts: parsedEfforts };
}

/**
 * Resolve the model catalog for the given config.
 * Returns a fresh copy of the built-in default when `modelCatalog` is absent;
 * otherwise validates and returns the configured catalog (whole replacement).
 */
export function resolveModelCatalog(config: Config): ModelCatalogEntry[] {
  const raw = config.modelCatalog;
  if (raw === undefined) return cloneCatalog(DEFAULT_MODEL_CATALOG);
  if (!Array.isArray(raw)) {
    throw new Error('Invalid modelCatalog: must be an array of { cli, model, efforts } entries');
  }

  const entries = raw.map((entry, index) => parseEntry(entry, index));
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.model)) {
      throw new Error(
        `Duplicate modelCatalog model "${entry.model}". Each model may appear only once, even across cli values`
      );
    }
    seen.add(entry.model);
  }
  return entries;
}

/** Find the catalog row for a model name. When `cli` is given, the row's cli must match too. */
export function findCatalogEntry(
  catalog: readonly ModelCatalogEntry[],
  model: string,
  cli?: AgentTool
): ModelCatalogEntry | undefined {
  return catalog.find((entry) => entry.model === model && (cli === undefined || entry.cli === cli));
}

/** Union (first-seen order, deduplicated) of the efforts of every row belonging to `cli`. */
export function effortsForDefaultCli(catalog: readonly ModelCatalogEntry[], cli: AgentTool): string[] {
  const result: string[] = [];
  for (const entry of catalog) {
    if (entry.cli !== cli) continue;
    for (const effort of entry.efforts) {
      if (!result.includes(effort)) result.push(effort);
    }
  }
  return result;
}

function effortErrorMessage(target: string, trimmedEffort: string, allowed: string[]): string {
  if (allowed.length === 0) {
    return `Invalid effort "${trimmedEffort}" for ${target}. This model does not accept an effort override`;
  }
  return `Invalid effort "${trimmedEffort}" for ${target}. Must be one of: ${allowed.join(', ')}`;
}

/**
 * Validate a model/effort pair that is about to be written to a task.
 * Returns an error message, or undefined when the pair is acceptable.
 * Empty / null values are the "clear this override" instruction and always pass.
 */
export function validateOverridePair(
  catalog: readonly ModelCatalogEntry[],
  defaultCli: AgentTool,
  model: string | null | undefined,
  effort: string | null | undefined
): string | undefined {
  const trimmedModel = typeof model === 'string' ? model.trim() : '';
  const trimmedEffort = typeof effort === 'string' ? effort.trim() : '';

  const entry = trimmedModel ? findCatalogEntry(catalog, trimmedModel) : undefined;
  if (trimmedModel && !entry) {
    return `Invalid model "${trimmedModel}". Must be one of: ${catalog.map((e) => e.model).join(', ')}`;
  }

  if (!trimmedEffort) return undefined;

  const allowed = entry ? entry.efforts : effortsForDefaultCli(catalog, defaultCli);
  if (allowed.includes(trimmedEffort)) return undefined;

  const target = entry ? `model "${entry.model}"` : `default cli "${defaultCli}"`;
  return effortErrorMessage(target, trimmedEffort, allowed);
}
