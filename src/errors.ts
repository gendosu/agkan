/**
 * Base error class for all Agkan errors.
 * Extend this class to create domain-specific errors that support instanceof checks.
 */
export class AgkanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgkanError';
    // Restore prototype chain for correct instanceof behavior in transpiled output
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when a requested entity (task, tag, comment, etc.) cannot be found.
 */
export class NotFoundError extends AgkanError {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when input data fails validation (missing required fields, invalid values, etc.).
 */
export class ValidationError extends AgkanError {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when an operation conflicts with existing data
 * (duplicate names, circular references, self-referencing, already-exists relationships).
 */
export class ConflictError extends AgkanError {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
