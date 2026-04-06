import { describe, it, expect } from 'vitest';
import { AgkanError, NotFoundError, ValidationError, ConflictError } from '../src/errors';

describe('AgkanError', () => {
  it('should be an instance of Error', () => {
    const error = new AgkanError('base error');
    expect(error).toBeInstanceOf(Error);
  });

  it('should be an instance of AgkanError', () => {
    const error = new AgkanError('base error');
    expect(error).toBeInstanceOf(AgkanError);
  });

  it('should have the correct message', () => {
    const error = new AgkanError('base error');
    expect(error.message).toBe('base error');
  });

  it('should have name set to AgkanError', () => {
    const error = new AgkanError('base error');
    expect(error.name).toBe('AgkanError');
  });
});

describe('NotFoundError', () => {
  it('should be an instance of Error', () => {
    const error = new NotFoundError('Task not found');
    expect(error).toBeInstanceOf(Error);
  });

  it('should be an instance of AgkanError', () => {
    const error = new NotFoundError('Task not found');
    expect(error).toBeInstanceOf(AgkanError);
  });

  it('should be an instance of NotFoundError', () => {
    const error = new NotFoundError('Task not found');
    expect(error).toBeInstanceOf(NotFoundError);
  });

  it('should have the correct message', () => {
    const error = new NotFoundError('Task not found');
    expect(error.message).toBe('Task not found');
  });

  it('should have name set to NotFoundError', () => {
    const error = new NotFoundError('Task not found');
    expect(error.name).toBe('NotFoundError');
  });
});

describe('ValidationError', () => {
  it('should be an instance of Error', () => {
    const error = new ValidationError('Invalid input');
    expect(error).toBeInstanceOf(Error);
  });

  it('should be an instance of AgkanError', () => {
    const error = new ValidationError('Invalid input');
    expect(error).toBeInstanceOf(AgkanError);
  });

  it('should be an instance of ValidationError', () => {
    const error = new ValidationError('Invalid input');
    expect(error).toBeInstanceOf(ValidationError);
  });

  it('should have the correct message', () => {
    const error = new ValidationError('Invalid input');
    expect(error.message).toBe('Invalid input');
  });

  it('should have name set to ValidationError', () => {
    const error = new ValidationError('Invalid input');
    expect(error.name).toBe('ValidationError');
  });
});

describe('ConflictError', () => {
  it('should be an instance of Error', () => {
    const error = new ConflictError('Duplicate name');
    expect(error).toBeInstanceOf(Error);
  });

  it('should be an instance of AgkanError', () => {
    const error = new ConflictError('Duplicate name');
    expect(error).toBeInstanceOf(AgkanError);
  });

  it('should be an instance of ConflictError', () => {
    const error = new ConflictError('Duplicate name');
    expect(error).toBeInstanceOf(ConflictError);
  });

  it('should have the correct message', () => {
    const error = new ConflictError('Duplicate name');
    expect(error.message).toBe('Duplicate name');
  });

  it('should have name set to ConflictError', () => {
    const error = new ConflictError('Duplicate name');
    expect(error.name).toBe('ConflictError');
  });
});

describe('instanceof checks across error types', () => {
  it('NotFoundError should not be an instance of ValidationError', () => {
    const error = new NotFoundError('not found');
    expect(error).not.toBeInstanceOf(ValidationError);
  });

  it('ValidationError should not be an instance of ConflictError', () => {
    const error = new ValidationError('invalid');
    expect(error).not.toBeInstanceOf(ConflictError);
  });

  it('ConflictError should not be an instance of NotFoundError', () => {
    const error = new ConflictError('conflict');
    expect(error).not.toBeInstanceOf(NotFoundError);
  });
});
