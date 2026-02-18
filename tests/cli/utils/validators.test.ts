import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateTaskStatus, validateTaskId, validateFileExists } from '../../../src/cli/utils/validators';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';

describe('validators', () => {
  describe('validateTaskStatus', () => {
    it('should return true for valid task statuses', () => {
      expect(validateTaskStatus('backlog')).toBe(true);
      expect(validateTaskStatus('ready')).toBe(true);
      expect(validateTaskStatus('in_progress')).toBe(true);
      expect(validateTaskStatus('review')).toBe(true);
      expect(validateTaskStatus('done')).toBe(true);
      expect(validateTaskStatus('closed')).toBe(true);
    });

    it('should return false for invalid task statuses', () => {
      expect(validateTaskStatus('invalid')).toBe(false);
      expect(validateTaskStatus('pending')).toBe(false);
      expect(validateTaskStatus('completed')).toBe(false);
      expect(validateTaskStatus('')).toBe(false);
      expect(validateTaskStatus('BACKLOG')).toBe(false); // Case sensitive
    });
  });

  describe('validateTaskId', () => {
    it('should return number for valid number input', () => {
      expect(validateTaskId(1)).toBe(1);
      expect(validateTaskId(100)).toBe(100);
      expect(validateTaskId(0)).toBe(0);
    });

    it('should return number for valid string input', () => {
      expect(validateTaskId('1')).toBe(1);
      expect(validateTaskId('100')).toBe(100);
      expect(validateTaskId('0')).toBe(0);
    });

    it('should return null for invalid number', () => {
      expect(validateTaskId(NaN)).toBeNull();
    });

    it('should return null for invalid string', () => {
      expect(validateTaskId('abc')).toBeNull();
      expect(validateTaskId('')).toBeNull();
      expect(validateTaskId('12.5')).toBe(12); // parseInt behavior
    });

    it('should return null for other types', () => {
      expect(validateTaskId(null)).toBeNull();
      expect(validateTaskId(undefined)).toBeNull();
      expect(validateTaskId({})).toBeNull();
      expect(validateTaskId([])).toBeNull();
    });

    it('should handle negative numbers', () => {
      expect(validateTaskId(-1)).toBe(-1);
      expect(validateTaskId('-10')).toBe(-10);
    });
  });

  describe('validateFileExists', () => {
    const testFilePath = join(process.cwd(), 'test-file-validator.txt');

    beforeEach(() => {
      // Create test file if it doesn't exist
      if (!existsSync(testFilePath)) {
        writeFileSync(testFilePath, 'test content');
      }
    });

    afterEach(() => {
      // Clean up test file
      if (existsSync(testFilePath)) {
        unlinkSync(testFilePath);
      }
    });

    it('should return true for existing file', () => {
      expect(validateFileExists(testFilePath)).toBe(true);
    });

    it('should return false for non-existing file', () => {
      expect(validateFileExists('/path/to/nonexistent/file.txt')).toBe(false);
    });

    it('should return false for path with .. (path traversal)', () => {
      expect(validateFileExists('../../../etc/passwd')).toBe(false);
      expect(validateFileExists('../../test.txt')).toBe(false);
      expect(validateFileExists('./test/../../../file.txt')).toBe(false);
    });

    it('should return true for relative path without .. to existing file', () => {
      expect(validateFileExists(testFilePath)).toBe(true);
    });

    it('should return false for empty path', () => {
      expect(validateFileExists('')).toBe(false);
    });
  });
});
