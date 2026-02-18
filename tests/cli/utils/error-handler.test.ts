import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleError, validateNumberInput, parseNumericArray } from '../../../src/cli/utils/error-handler';

describe('error-handler', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('handleError', () => {
    it('should output JSON format when json option is true', () => {
      const error = new Error('Test error message');
      handleError(error, { json: true });

      expect(consoleLogSpy).toHaveBeenCalledOnce();
      const output = consoleLogSpy.mock.calls[0][0];

      expect(output).toBeDefined();
      expect(typeof output).toBe('string');

      const parsed = JSON.parse(output);
      expect(parsed.success).toBe(false);
      expect(parsed.error.message).toBe('Test error message');
    });

    it('should output colored text when json option is false', () => {
      const error = new Error('Test error message');
      handleError(error, { json: false });

      expect(consoleLogSpy).toHaveBeenCalledOnce();
      const output = consoleLogSpy.mock.calls[0][0];

      expect(output).toBeDefined();
      expect(typeof output).toBe('string');
      expect(output).toContain('Test error message');
    });

    it('should output colored text when json option is undefined', () => {
      const error = new Error('Test error message');
      handleError(error, {});

      expect(consoleLogSpy).toHaveBeenCalledOnce();
      const output = consoleLogSpy.mock.calls[0][0];

      expect(output).toBeDefined();
      expect(output).toContain('Test error message');
    });
  });

  describe('validateNumberInput', () => {
    it('should return parsed number for valid string input', () => {
      expect(validateNumberInput('123')).toBe(123);
      expect(validateNumberInput('0')).toBe(0);
      expect(validateNumberInput('999')).toBe(999);
    });

    it('should return null for undefined input', () => {
      expect(validateNumberInput(undefined)).toBeNull();
    });

    it('should return null for non-numeric string', () => {
      expect(validateNumberInput('abc')).toBeNull();
      expect(validateNumberInput('12.5')).toBe(12); // parseInt behavior
      expect(validateNumberInput('12a')).toBe(12); // parseInt behavior
      expect(validateNumberInput('')).toBeNull();
    });

    it('should handle negative numbers', () => {
      expect(validateNumberInput('-10')).toBe(-10);
      expect(validateNumberInput('-1')).toBe(-1);
    });

    it('should handle string with spaces', () => {
      expect(validateNumberInput('  123  ')).toBe(123);
    });
  });

  describe('parseNumericArray', () => {
    it('should parse comma-separated numbers', () => {
      expect(parseNumericArray('1,2,3')).toEqual([1, 2, 3]);
      expect(parseNumericArray('10,20,30')).toEqual([10, 20, 30]);
    });

    it('should return empty array for undefined input', () => {
      expect(parseNumericArray(undefined)).toEqual([]);
    });

    it('should return empty array for empty string', () => {
      expect(parseNumericArray('')).toEqual([]);
      expect(parseNumericArray('  ')).toEqual([]);
    });

    it('should return empty array for invalid input', () => {
      expect(parseNumericArray('1,2,abc')).toEqual([]);
      expect(parseNumericArray('abc,def')).toEqual([]);
      expect(parseNumericArray('1,2,')).toEqual([]);
    });

    it('should handle spaces around numbers', () => {
      expect(parseNumericArray(' 1 , 2 , 3 ')).toEqual([1, 2, 3]);
      expect(parseNumericArray('1,  2,  3')).toEqual([1, 2, 3]);
    });

    it('should handle single number', () => {
      expect(parseNumericArray('42')).toEqual([42]);
    });

    it('should handle negative numbers', () => {
      expect(parseNumericArray('-1,-2,-3')).toEqual([-1, -2, -3]);
    });
  });
});
