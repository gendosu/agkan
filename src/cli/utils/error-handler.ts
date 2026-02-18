/**
 * Error handler utility
 * Provides consistent error handling and validation for CLI commands
 */

import chalk from 'chalk';
import { formatJsonError } from './response-formatter';

/**
 * Handle and display errors in CLI
 * @param error - The error to handle
 * @param options - Options for error handling
 */
export function handleError(error: Error, options: { json?: boolean }): void {
  if (options.json) {
    console.log(formatJsonError(error.message));
  } else {
    console.log(chalk.red(`\n✗ Error: ${error.message}\n`));
  }
}

/**
 * Validate and parse numeric input
 * @param input - The input string to validate
 * @returns The parsed number, or null if invalid
 */
export function validateNumberInput(input: string | undefined): number | null {
  if (input === undefined) {
    return null;
  }

  const parsed = parseInt(input, 10);
  if (isNaN(parsed)) {
    return null;
  }

  return parsed;
}

/**
 * Validate and parse ID input, exiting with error on invalid input
 * @param input - The input string to validate
 * @param entityName - The entity name for error messages (e.g., "Task", "Tag")
 * @param options - Options for error handling
 * @returns The parsed number
 */
export function validateIdInput(input: string, entityName: string, options: { json?: boolean }): number {
  const parsed = parseInt(input, 10);
  if (isNaN(parsed)) {
    if (options.json) {
      console.log(formatJsonError(`${entityName} ID must be a number`));
    } else {
      console.log(chalk.red(`\nError: ${entityName} ID must be a number\n`));
    }
    process.exit(1);
  }
  return parsed;
}

/**
 * Parse comma-separated numeric array
 * @param input - The input string to parse (e.g., "1,2,3")
 * @returns Array of numbers, or empty array if invalid
 */
export function parseNumericArray(input: string | undefined): number[] {
  if (input === undefined || input.trim() === '') {
    return [];
  }

  const parts = input.split(',').map((s) => s.trim());
  const result: number[] = [];

  for (const part of parts) {
    const num = parseInt(part, 10);
    if (isNaN(num)) {
      return [];
    }
    result.push(num);
  }

  return result;
}
