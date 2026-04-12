/**
 * Helper functions for the task update command
 */

import chalk from 'chalk';
import { isPriority } from '../../../models/Priority';
import { validateTaskStatus } from '../../utils/validators';
import { OutputFormatter } from '../../utils/output-formatter';
import { readBodyFromFile } from './add-helpers';

export interface UpdateOptions {
  title?: string;
  status?: string;
  body?: string;
  author?: string;
  assignees?: string;
  priority?: string;
  file?: string;
  json?: boolean;
}

/**
 * Returns true if the user is using flag-based mode (as opposed to positional syntax).
 */
export function isFlagMode(options: UpdateOptions, field: string | undefined): boolean {
  const flagFields = [options.title, options.status, options.body, options.author, options.assignees, options.priority];
  return flagFields.some((v) => v !== undefined) || (!!options.file && !field);
}

/**
 * Validates a status value and exits on failure.
 */
export function validateStatus(val: string, formatter: OutputFormatter): boolean {
  if (validateTaskStatus(val)) return true;
  formatter.error(
    `Invalid status: ${val}. Valid statuses: icebox, backlog, ready, in_progress, review, done, closed, archive`,
    () => {
      console.log(chalk.red(`\nInvalid status: ${val}`));
      console.log('Valid statuses: icebox, backlog, ready, in_progress, review, done, closed, archive\n');
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
    console.log(chalk.red(`\nInvalid priority: ${val}`));
    console.log('Valid priorities: critical, high, medium, low\n');
  });
  return false;
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
      console.log(chalk.red(`\n✗ Error: ${msg}\n`));
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
  };

  if (options.file) {
    if (flagFields.body !== undefined) {
      formatter.error('Cannot specify both --body and --file', () => {
        console.log(chalk.red(`\nError: Cannot specify both --body and --file\n`));
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

const SUPPORTED_FIELDS = ['status', 'title', 'body', 'author', 'assignees', 'priority'] as const;
type SupportedField = (typeof SUPPORTED_FIELDS)[number];

function validateFieldName(field: string | undefined, formatter: OutputFormatter): field is SupportedField {
  if (!field) {
    formatter.error(
      'No fields specified. Use --title, --status, --body, --author, --assignees flags or positional arguments: <field> <value>',
      () => {
        console.log(
          chalk.red(
            '\nError: No fields specified. Use --title, --status, --body, --author, --assignees flags or positional arguments: <field> <value>\n'
          )
        );
      }
    );
    return false;
  }
  if (!SUPPORTED_FIELDS.includes(field as SupportedField)) {
    formatter.error(`Unsupported field: ${field}. Supported fields: ${SUPPORTED_FIELDS.join(', ')}`, () => {
      console.log(chalk.red(`\nUnsupported field: ${field}`));
      console.log(`Supported fields: ${SUPPORTED_FIELDS.join(', ')}\n`);
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
      console.log(chalk.red(`\nError: --file option is only valid for the body field\n`));
    });
    return null;
  }
  if (options.file) {
    return readBodyOrError(options.file, formatter);
  }
  if (value === undefined) {
    formatter.error(`Missing value for field '${field}'. Provide a value argument or use --file for body.`, () => {
      console.log(
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
