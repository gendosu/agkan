import type { CreateTaskInput, UpdateTaskInput, TaskStatus } from '../models/Task';
import type { CreateTagInput } from '../models/Tag';
import type { CreateTaskCommentInput } from '../models/TaskComment';

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
 * Maximum allowed length for the title field
 */
export const MAX_TITLE_LENGTH = 200;

/**
 * Maximum allowed length for the body field
 */
export const MAX_BODY_LENGTH = 100000;

/**
 * Maximum allowed length for the author field
 */
export const MAX_AUTHOR_LENGTH = 100;

/**
 * Maximum allowed length for the assignees field (CSV format)
 */
export const MAX_ASSIGNEES_LENGTH = 500;

/**
 * Validate the title field (required, max MAX_TITLE_LENGTH chars)
 */
function validateTitleField(title: string): ValidationError | null {
  if (!title || title.trim().length === 0) {
    return { field: 'title', message: 'Title is required' };
  }
  if (title.length > MAX_TITLE_LENGTH) {
    return { field: 'title', message: `Title must not exceed ${MAX_TITLE_LENGTH} characters` };
  }
  return null;
}

/**
 * Validate the body field (optional, max MAX_BODY_LENGTH chars)
 */
function validateBodyField(body: string | null | undefined): ValidationError | null {
  if (body && body.length > MAX_BODY_LENGTH) {
    return { field: 'body', message: `Body must not exceed ${MAX_BODY_LENGTH} characters` };
  }
  return null;
}

/**
 * Validate the author field (optional, max MAX_AUTHOR_LENGTH chars)
 */
function validateAuthorField(author: string | null | undefined): ValidationError | null {
  if (author && author.length > MAX_AUTHOR_LENGTH) {
    return { field: 'author', message: `Author must not exceed ${MAX_AUTHOR_LENGTH} characters` };
  }
  return null;
}

/**
 * Validate the assignees field (optional, max MAX_ASSIGNEES_LENGTH chars)
 */
function validateAssigneesField(assignees: string | null | undefined): ValidationError | null {
  if (assignees && assignees.length > MAX_ASSIGNEES_LENGTH) {
    return { field: 'assignees', message: `Assignees must not exceed ${MAX_ASSIGNEES_LENGTH} characters` };
  }
  return null;
}

/**
 * Validate task input for security and length constraints
 * @param input - Task creation input to validate
 * @returns Array of validation errors (empty if valid)
 */
export function validateTaskInput(input: CreateTaskInput): ValidationError[] {
  const errors: ValidationError[] = [];
  const titleError = validateTitleField(input.title);
  if (titleError) errors.push(titleError);
  const bodyError = validateBodyField(input.body);
  if (bodyError) errors.push(bodyError);
  const authorError = validateAuthorField(input.author);
  if (authorError) errors.push(authorError);
  const assigneesError = validateAssigneesField(input.assignees);
  if (assigneesError) errors.push(assigneesError);
  return errors;
}

/**
 * Validate task update input for security and length constraints
 * @param input - Task update input to validate (all fields optional)
 * @returns Array of validation errors (empty if valid)
 */
export function validateTaskUpdateInput(input: UpdateTaskInput): ValidationError[] {
  const errors: ValidationError[] = [];
  if (input.title !== undefined) {
    const titleError = validateTitleField(input.title);
    if (titleError) errors.push(titleError);
  }
  const bodyError = validateBodyField(input.body);
  if (bodyError) errors.push(bodyError);
  const authorError = validateAuthorField(input.author);
  if (authorError) errors.push(authorError);
  const assigneesError = validateAssigneesField(input.assignees);
  if (assigneesError) errors.push(assigneesError);
  return errors;
}

/**
 * Validate tag input for security and length constraints
 * @param input - Tag creation input to validate
 * @returns Array of validation errors (empty if valid)
 */
/**
 * Valid task statuses
 */
const VALID_STATUSES: TaskStatus[] = ['icebox', 'backlog', 'ready', 'in_progress', 'review', 'done', 'closed'];

/**
 * Validate multiple status values
 * @param statuses - Array of status strings to validate
 * @returns Array of validation errors (empty if all valid)
 */
export function validateMultipleStatuses(statuses: string[]): ValidationError[] {
  const errors: ValidationError[] = [];

  if (statuses.length === 0) {
    errors.push({
      field: 'status',
      message: 'At least one status must be specified',
    });
    return errors;
  }

  for (const status of statuses) {
    if (!VALID_STATUSES.includes(status as TaskStatus)) {
      errors.push({
        field: 'status',
        message: `Invalid status: ${status}. Valid statuses: ${VALID_STATUSES.join(', ')}`,
      });
    }
  }

  return errors;
}

/**
 * Validate comment input for security and length constraints
 * @param input - Comment creation input to validate
 * @returns Array of validation errors (empty if valid)
 */
export function validateCommentInput(input: CreateTaskCommentInput): ValidationError[] {
  const errors: ValidationError[] = [];

  // Validate content (required, max 5000 chars)
  if (!input.content || input.content.trim().length === 0) {
    errors.push({
      field: 'content',
      message: 'Content is required',
    });
  } else if (input.content.length > 5000) {
    errors.push({
      field: 'content',
      message: 'Content must not exceed 5000 characters',
    });
  }

  // Validate author (optional, max 100 chars)
  if (input.author !== undefined && input.author !== null && input.author.length > 100) {
    errors.push({
      field: 'author',
      message: 'Author must not exceed 100 characters',
    });
  }

  return errors;
}

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
