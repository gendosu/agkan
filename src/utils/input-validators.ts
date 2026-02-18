import type { CreateTaskInput, UpdateTaskInput } from '../models/Task';
import type { CreateTagInput } from '../models/Tag';

/**
 * Input validation utility functions
 * Provides validation for user input with length limits
 */

/**
 * Validation error interface
 */
export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validate task input for security and length constraints
 * @param input - Task creation input to validate
 * @returns Array of validation errors (empty if valid)
 */
export function validateTaskInput(input: CreateTaskInput): ValidationError[] {
  const errors: ValidationError[] = [];

  // Validate title (required, max 200 chars)
  if (!input.title || input.title.trim().length === 0) {
    errors.push({
      field: 'title',
      message: 'Title is required',
    });
  } else if (input.title.length > 200) {
    errors.push({
      field: 'title',
      message: 'Title must not exceed 200 characters',
    });
  }

  // Validate body (optional, max 10000 chars)
  if (input.body && input.body.length > 10000) {
    errors.push({
      field: 'body',
      message: 'Body must not exceed 10000 characters',
    });
  }

  // Validate author (optional, max 100 chars)
  if (input.author && input.author.length > 100) {
    errors.push({
      field: 'author',
      message: 'Author must not exceed 100 characters',
    });
  }

  return errors;
}

/**
 * Validate task update input for security and length constraints
 * @param input - Task update input to validate (all fields optional)
 * @returns Array of validation errors (empty if valid)
 */
export function validateTaskUpdateInput(input: UpdateTaskInput): ValidationError[] {
  const errors: ValidationError[] = [];

  // Validate title if being updated (required when provided, max 200 chars)
  if (input.title !== undefined) {
    if (!input.title || input.title.trim().length === 0) {
      errors.push({
        field: 'title',
        message: 'Title is required',
      });
    } else if (input.title.length > 200) {
      errors.push({
        field: 'title',
        message: 'Title must not exceed 200 characters',
      });
    }
  }

  // Validate body if being updated (optional, max 10000 chars)
  if (input.body !== undefined && input.body !== null && input.body.length > 10000) {
    errors.push({
      field: 'body',
      message: 'Body must not exceed 10000 characters',
    });
  }

  // Validate author if being updated (optional, max 100 chars)
  if (input.author !== undefined && input.author !== null && input.author.length > 100) {
    errors.push({
      field: 'author',
      message: 'Author must not exceed 100 characters',
    });
  }

  return errors;
}

/**
 * Validate tag input for security and length constraints
 * @param input - Tag creation input to validate
 * @returns Array of validation errors (empty if valid)
 */
export function validateTagInput(input: CreateTagInput): ValidationError[] {
  const errors: ValidationError[] = [];

  // Validate name (required, max 50 chars)
  if (!input.name || input.name.trim().length === 0) {
    errors.push({
      field: 'name',
      message: 'Name is required',
    });
  } else if (input.name.length > 50) {
    errors.push({
      field: 'name',
      message: 'Name must not exceed 50 characters',
    });
  } else if (/^\d+$/.test(input.name.trim())) {
    errors.push({
      field: 'name',
      message: 'Tag name cannot be purely numeric',
    });
  }

  return errors;
}
