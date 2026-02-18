import { describe, it, expect } from 'vitest';
import { validateTaskInput, validateTaskUpdateInput, validateTagInput } from '../../src/utils/input-validators';
import type { CreateTaskInput, UpdateTaskInput } from '../../src/models/Task';
import type { CreateTagInput } from '../../src/models/Tag';

describe('Input Validators', () => {
  describe('validateTaskInput', () => {
    it('should return no errors for valid task input', () => {
      const input: CreateTaskInput = {
        title: 'Valid task title',
        body: 'Valid task body',
        author: 'John Doe',
      };
      const errors = validateTaskInput(input);
      expect(errors).toEqual([]);
    });

    it('should return error for missing title', () => {
      const input: CreateTaskInput = {
        title: '',
      };
      const errors = validateTaskInput(input);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('title');
      expect(errors[0].message).toBe('Title is required');
    });

    it('should return error for whitespace-only title', () => {
      const input: CreateTaskInput = {
        title: '   ',
      };
      const errors = validateTaskInput(input);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('title');
      expect(errors[0].message).toBe('Title is required');
    });

    it('should return error for title exceeding 200 characters', () => {
      const input: CreateTaskInput = {
        title: 'a'.repeat(201),
      };
      const errors = validateTaskInput(input);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('title');
      expect(errors[0].message).toBe('Title must not exceed 200 characters');
    });

    it('should accept title with exactly 200 characters', () => {
      const input: CreateTaskInput = {
        title: 'a'.repeat(200),
      };
      const errors = validateTaskInput(input);
      expect(errors).toEqual([]);
    });

    it('should return error for body exceeding 10000 characters', () => {
      const input: CreateTaskInput = {
        title: 'Valid title',
        body: 'a'.repeat(10001),
      };
      const errors = validateTaskInput(input);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('body');
      expect(errors[0].message).toBe('Body must not exceed 10000 characters');
    });

    it('should accept body with exactly 10000 characters', () => {
      const input: CreateTaskInput = {
        title: 'Valid title',
        body: 'a'.repeat(10000),
      };
      const errors = validateTaskInput(input);
      expect(errors).toEqual([]);
    });

    it('should return error for author exceeding 100 characters', () => {
      const input: CreateTaskInput = {
        title: 'Valid title',
        author: 'a'.repeat(101),
      };
      const errors = validateTaskInput(input);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('author');
      expect(errors[0].message).toBe('Author must not exceed 100 characters');
    });

    it('should accept author with exactly 100 characters', () => {
      const input: CreateTaskInput = {
        title: 'Valid title',
        author: 'a'.repeat(100),
      };
      const errors = validateTaskInput(input);
      expect(errors).toEqual([]);
    });

    it('should return multiple errors for multiple invalid fields', () => {
      const input: CreateTaskInput = {
        title: 'a'.repeat(201),
        body: 'b'.repeat(10001),
        author: 'c'.repeat(101),
      };
      const errors = validateTaskInput(input);
      expect(errors).toHaveLength(3);
      expect(errors.map((e) => e.field)).toEqual(['title', 'body', 'author']);
    });

    it('should accept task input with only title', () => {
      const input: CreateTaskInput = {
        title: 'Valid title',
      };
      const errors = validateTaskInput(input);
      expect(errors).toEqual([]);
    });
  });

  describe('validateTaskUpdateInput', () => {
    it('should return no errors for empty update input', () => {
      const input: UpdateTaskInput = {};
      const errors = validateTaskUpdateInput(input);
      expect(errors).toEqual([]);
    });

    it('should return no errors for valid partial update', () => {
      const input: UpdateTaskInput = { title: 'New title', body: 'New body' };
      const errors = validateTaskUpdateInput(input);
      expect(errors).toEqual([]);
    });

    it('should return error for empty title update', () => {
      const input: UpdateTaskInput = { title: '' };
      const errors = validateTaskUpdateInput(input);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('title');
      expect(errors[0].message).toBe('Title is required');
    });

    it('should return error for title exceeding 200 characters', () => {
      const input: UpdateTaskInput = { title: 'a'.repeat(201) };
      const errors = validateTaskUpdateInput(input);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('title');
      expect(errors[0].message).toBe('Title must not exceed 200 characters');
    });

    it('should return error for body exceeding 10000 characters', () => {
      const input: UpdateTaskInput = { body: 'a'.repeat(10001) };
      const errors = validateTaskUpdateInput(input);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('body');
      expect(errors[0].message).toBe('Body must not exceed 10000 characters');
    });

    it('should return error for author exceeding 100 characters', () => {
      const input: UpdateTaskInput = { author: 'a'.repeat(101) };
      const errors = validateTaskUpdateInput(input);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('author');
      expect(errors[0].message).toBe('Author must not exceed 100 characters');
    });

    it('should skip title validation when title is not provided', () => {
      const input: UpdateTaskInput = { body: 'some body' };
      const errors = validateTaskUpdateInput(input);
      expect(errors).toEqual([]);
    });
  });

  describe('validateTagInput', () => {
    it('should return no errors for valid tag input', () => {
      const input: CreateTagInput = {
        name: 'valid-tag',
      };
      const errors = validateTagInput(input);
      expect(errors).toEqual([]);
    });

    it('should return error for missing name', () => {
      const input: CreateTagInput = {
        name: '',
      };
      const errors = validateTagInput(input);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('name');
      expect(errors[0].message).toBe('Name is required');
    });

    it('should return error for whitespace-only name', () => {
      const input: CreateTagInput = {
        name: '   ',
      };
      const errors = validateTagInput(input);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('name');
      expect(errors[0].message).toBe('Name is required');
    });

    it('should return error for name exceeding 50 characters', () => {
      const input: CreateTagInput = {
        name: 'a'.repeat(51),
      };
      const errors = validateTagInput(input);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('name');
      expect(errors[0].message).toBe('Name must not exceed 50 characters');
    });

    it('should accept name with exactly 50 characters', () => {
      const input: CreateTagInput = {
        name: 'a'.repeat(50),
      };
      const errors = validateTagInput(input);
      expect(errors).toEqual([]);
    });

    it('should return error for purely numeric name', () => {
      const input: CreateTagInput = {
        name: '123',
      };
      const errors = validateTagInput(input);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('name');
      expect(errors[0].message).toBe('Tag name cannot be purely numeric');
    });

    it('should accept name that starts with digits but contains non-digits', () => {
      const input: CreateTagInput = {
        name: '123abc',
      };
      const errors = validateTagInput(input);
      expect(errors).toEqual([]);
    });
  });
});
