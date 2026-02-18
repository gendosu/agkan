import { describe, it, expect } from 'vitest';
import { formatJsonSuccess, formatJsonError } from '../../../src/cli/utils/response-formatter';

describe('response-formatter', () => {
  describe('formatJsonSuccess', () => {
    it('should format success response with data only', () => {
      const data = { id: 1, title: 'Test Task' };
      const result = formatJsonSuccess(data);

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.data).toEqual(data);
      expect(parsed.metadata).toBeUndefined();
    });

    it('should format success response with data and metadata', () => {
      const data = { id: 1, title: 'Test Task' };
      const metadata = { count: 5, page: 1 };
      const result = formatJsonSuccess(data, metadata);

      expect(result).toBeDefined();
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.data).toEqual(data);
      expect(parsed.metadata).toEqual(metadata);
    });

    it('should format success response with empty data', () => {
      const data = {};
      const result = formatJsonSuccess(data);

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.data).toEqual({});
    });

    it('should format success response with array data', () => {
      const data = [
        { id: 1, title: 'Task 1' },
        { id: 2, title: 'Task 2' },
      ];
      const result = formatJsonSuccess(data);

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.data).toEqual(data);
      expect(Array.isArray(parsed.data)).toBe(true);
    });

    it('should use 2-space indentation', () => {
      const data = { id: 1 };
      const result = formatJsonSuccess(data);

      expect(result).toContain('  "success"');
      expect(result).toContain('  "data"');
    });
  });

  describe('formatJsonError', () => {
    it('should format error response with message only', () => {
      const message = 'Task not found';
      const result = formatJsonError(message);

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBeDefined();
      expect(parsed.error.message).toBe(message);
      expect(parsed.error.code).toBeUndefined();
    });

    it('should format error response with message and code', () => {
      const message = 'Task not found';
      const code = 'NOT_FOUND';
      const result = formatJsonError(message, code);

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(false);
      expect(parsed.error.message).toBe(message);
      expect(parsed.error.code).toBe(code);
    });

    it('should format error response with empty message', () => {
      const message = '';
      const result = formatJsonError(message);

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(false);
      expect(parsed.error.message).toBe('');
    });

    it('should use 2-space indentation', () => {
      const message = 'Error occurred';
      const result = formatJsonError(message);

      expect(result).toContain('  "success"');
      expect(result).toContain('  "error"');
    });
  });
});
