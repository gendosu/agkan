/**
 * Helper functions for the task update command
 */

import chalk from 'chalk';
import { isPriority } from '../../../models/Priority';
import { validateTaskStatus } from '../../utils/validators';
import { OutputFormatter } from '../../utils/output-formatter';
import { readBodyFromFile } from './add-helpers';
import type { Task } from '../../../models';
import { loadConfig, resolveAgentTool } from '../../../db/config';
import { resolveModelCatalog, validateOverridePair } from '../../../db/modelCatalog';

export interface UpdateOptions {
  title?: string;
  status?: string;
  body?: string;
  author?: string;
  assignees?: string;
  priority?: string;
  branch?: string;
  modelPlanning?: string;
  modelRun?: string;
  effortPlanning?: string;
  effortRun?: string;
  file?: string;
  json?: boolean;
}

/**
 * Returns true if the user is using flag-based mode (as opposed to positional syntax).
 */
export function isFlagMode(options: UpdateOptions, field: string | undefined): boolean {
  const flagFields = [
    options.title,
    options.status,
    options.body,
    options.author,
    options.assignees,
    options.priority,
    options.branch,
    options.modelPlanning,
    options.modelRun,
    options.effortPlanning,
    options.effortRun,
  ];
  return flagFields.some((v) => v !== undefined) || (!!options.file && !field);
}

/**
 * Validates a status value and exits on failure.
 */
export function validateStatus(val: string, formatter: OutputFormatter): boolean {
  if (validateTaskStatus(val)) return true;
  formatter.error(
    `Invalid status: ${val}. Valid statuses: icebox, backlog, ready, in_progress, review, done, closed`,
    () => {
      console.error(chalk.red(`\nInvalid status: ${val}`));
      console.error('Valid statuses: icebox, backlog, ready, in_progress, review, done, closed\n');
    }
  );
  return false;
}

/**
 * Validates a priority value and exits on failure.
 */
export function validatePriority(val: string, formatter: OutputFormatter): boolean {
  if (val === '' || isPriority(val)) return true;
  formatter.error(`Invalid priority: ${val}. Valid priorities: critical, high, medium, low`, () => {
    console.error(chalk.red(`\nInvalid priority: ${val}`));
    console.error('Valid priorities: critical, high, medium, low\n');
  });
  return false;
}

/**
 * Validate the effective model/effort pairs after this update is applied.
 * Each kind (planning/run) is checked only when the update touches at least one
 * of its two fields; the untouched side falls back to what is already stored on
 * the task. A kind neither field of which is touched is left unvalidated, so a
 * previously stored override that a later config/catalog change made invalid
 * never blocks an update that doesn't touch it (e.g. `--status done`).
 * Config/catalog resolution is likewise deferred until a touched pair exists,
 * so an update that never touches model/effort fields succeeds even when
 * `.agkan.yml` itself is unparseable (e.g. a malformed `modelCatalog`).
 * @returns Error message for the first invalid pair, or null when all are valid
 */
export function validateModelEffortUpdate(updateInput: Record<string, string>, stored: Task): string | null {
  const kinds = [
    {
      model: 'model_planning',
      effort: 'effort_planning',
      storedModel: stored.model_planning,
      storedEffort: stored.effort_planning,
    },
    { model: 'model_run', effort: 'effort_run', storedModel: stored.model_run, storedEffort: stored.effort_run },
  ] as const;

  const touchedPairs = kinds
    .map((kind) => {
      const modelTouched = kind.model in updateInput;
      const effortTouched = kind.effort in updateInput;
      if (!modelTouched && !effortTouched) return undefined;
      return {
        model: modelTouched ? updateInput[kind.model] : kind.storedModel,
        effort: effortTouched ? updateInput[kind.effort] : kind.storedEffort,
      };
    })
    .filter((pair): pair is { model: string | null; effort: string | null } => pair !== undefined);

  if (touchedPairs.length === 0) return null;

  const config = loadConfig();
  const catalog = resolveModelCatalog(config);
  const defaultCli = resolveAgentTool(config);
  for (const pair of touchedPairs) {
    const error = validateOverridePair(catalog, defaultCli, pair.model, pair.effort);
    if (error) return error;
  }
  return null;
}

/**
 * Reads the body from a file, returning the content or null on error.
 * Reports the error via formatter on failure.
 */
export function readBodyOrError(filePath: string, formatter: OutputFormatter): string | null {
  try {
    return readBodyFromFile(filePath);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error reading file';
    formatter.error(msg, () => {
      console.error(chalk.red(`\n✗ Error: ${msg}\n`));
    });
    return null;
  }
}

/**
 * Builds the updateInput map from flag-based options.
 * Returns null if validation fails.
 */
export function buildFlagModeInput(options: UpdateOptions, formatter: OutputFormatter): Record<string, string> | null {
  const flagFields: Record<string, string | undefined> = {
    title: options.title,
    status: options.status,
    body: options.body,
    author: options.author,
    assignees: options.assignees,
    priority: options.priority,
    branch: options.branch,
    model_planning: options.modelPlanning,
    model_run: options.modelRun,
    effort_planning: options.effortPlanning,
    effort_run: options.effortRun,
  };

  if (options.file) {
    if (flagFields.body !== undefined) {
      formatter.error('Cannot specify both --body and --file', () => {
        console.error(chalk.red(`\nError: Cannot specify both --body and --file\n`));
      });
      return null;
    }
    const body = readBodyOrError(options.file, formatter);
    if (body === null) return null;
    flagFields.body = body;
  }

  const updateInput: Record<string, string> = {};
  for (const [key, val] of Object.entries(flagFields)) {
    if (val === undefined) continue;
    if (key === 'status' && !validateStatus(val, formatter)) return null;
    if (key === 'priority' && !validatePriority(val, formatter)) return null;
    updateInput[key] = val;
  }
  return updateInput;
}

export const SUPPORTED_FIELDS = [
  'status',
  'title',
  'body',
  'author',
  'assignees',
  'priority',
  'branch',
  'model_planning',
  'model_run',
  'effort_planning',
  'effort_run',
] as const;
type SupportedField = (typeof SUPPORTED_FIELDS)[number];

// Field names use snake_case but the flags they map to are kebab-case (--model-planning).
const SUPPORTED_FLAGS = SUPPORTED_FIELDS.map((field) => `--${field.replace(/_/g, '-')}`).join(', ');

function validateFieldName(field: string | undefined, formatter: OutputFormatter): field is SupportedField {
  if (!field) {
    formatter.error(
      `No fields specified. Use ${SUPPORTED_FLAGS} flags or positional arguments: <field> <value>`,
      () => {
        console.error(
          chalk.red(
            `\nError: No fields specified. Use ${SUPPORTED_FLAGS} flags or positional arguments: <field> <value>\n`
          )
        );
      }
    );
    return false;
  }
  if (!SUPPORTED_FIELDS.includes(field as SupportedField)) {
    formatter.error(`Unsupported field: ${field}. Supported fields: ${SUPPORTED_FIELDS.join(', ')}`, () => {
      console.error(chalk.red(`\nUnsupported field: ${field}`));
      console.error(`Supported fields: ${SUPPORTED_FIELDS.join(', ')}\n`);
    });
    return false;
  }
  return true;
}

function resolvePositionalValue(
  field: string,
  value: string | undefined,
  options: UpdateOptions,
  formatter: OutputFormatter
): string | null {
  if (options.file && field !== 'body') {
    formatter.error('--file option is only valid for the body field', () => {
      console.error(chalk.red(`\nError: --file option is only valid for the body field\n`));
    });
    return null;
  }
  if (options.file) {
    return readBodyOrError(options.file, formatter);
  }
  if (value === undefined) {
    formatter.error(`Missing value for field '${field}'. Provide a value argument or use --file for body.`, () => {
      console.error(
        chalk.red(`\nError: Missing value for field '${field}'. Provide a value argument or use --file for body.\n`)
      );
    });
    return null;
  }
  return value;
}

/**
 * Builds the updateInput map from positional (legacy) arguments.
 * Returns null if validation fails.
 */
export function buildPositionalModeInput(
  field: string | undefined,
  value: string | undefined,
  options: UpdateOptions,
  formatter: OutputFormatter
): Record<string, string> | null {
  if (!validateFieldName(field, formatter)) return null;
  const resolvedValue = resolvePositionalValue(field, value, options, formatter);
  if (resolvedValue === null) return null;
  if (field === 'status' && !validateStatus(resolvedValue, formatter)) return null;
  if (field === 'priority' && !validatePriority(resolvedValue, formatter)) return null;
  return { [field]: resolvedValue };
}
