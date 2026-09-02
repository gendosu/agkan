/**
 * Helper functions for the task update command
 */

import chalk from 'chalk';
import { isPriority } from '../../../models/Priority';
import { validateTaskStatus } from '../../utils/validators';
import { OutputFormatter } from '../../utils/output-formatter';
import { readBodyFromFile } from './add-helpers';
import {
  MODEL_ALIASES,
  isValidModelAlias,
  VALID_EFFORT_LEVELS,
  isValidEffortLevel,
} from '../../../board/claudePromptBuilder';

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
 * Validates a Claude model alias and exits on failure.
 * An empty string is accepted: it is the "clear this override" value.
 */
export function validateModelAlias(val: string, formatter: OutputFormatter): boolean {
  if (val === '' || isValidModelAlias(val)) return true;
  formatter.error(`Invalid model: ${val}. Valid models: ${MODEL_ALIASES.join(', ')}`, () => {
    console.error(chalk.red(`\nInvalid model: ${val}`));
    console.error(`Valid models: ${MODEL_ALIASES.join(', ')}\n`);
  });
  return false;
}

/**
 * Validates a reasoning effort level and exits on failure.
 * An empty string is accepted: it is the "clear this override" value.
 */
export function validateEffortLevel(val: string, formatter: OutputFormatter): boolean {
  if (val === '' || isValidEffortLevel(val)) return true;
  formatter.error(`Invalid effort: ${val}. Valid efforts: ${VALID_EFFORT_LEVELS.join(', ')}`, () => {
    console.error(chalk.red(`\nInvalid effort: ${val}`));
    console.error(`Valid efforts: ${VALID_EFFORT_LEVELS.join(', ')}\n`);
  });
  return false;
}

const MODEL_FIELDS = ['model_planning', 'model_run'];
const EFFORT_FIELDS = ['effort_planning', 'effort_run'];

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
    if (MODEL_FIELDS.includes(key) && !validateModelAlias(val, formatter)) return null;
    if (EFFORT_FIELDS.includes(key) && !validateEffortLevel(val, formatter)) return null;
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
  if (MODEL_FIELDS.includes(field) && !validateModelAlias(resolvedValue, formatter)) return null;
  if (EFFORT_FIELDS.includes(field) && !validateEffortLevel(resolvedValue, formatter)) return null;
  return { [field]: resolvedValue };
}
