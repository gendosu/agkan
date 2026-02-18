import { describe, it, expect } from 'vitest';
import { isPathSafe } from '../../src/utils/security';

describe('Security Utils', () => {
  describe('isPathSafe', () => {
    it('should return true for safe relative paths', () => {
      expect(isPathSafe('file.txt')).toBe(true);
      expect(isPathSafe('dir/file.txt')).toBe(true);
      expect(isPathSafe('dir/subdir/file.txt')).toBe(true);
    });

    it('should return true for safe absolute paths', () => {
      expect(isPathSafe('/home/user/file.txt')).toBe(true);
      expect(isPathSafe('/tmp/file.txt')).toBe(true);
    });

    it('should return false for paths with .. (path traversal)', () => {
      expect(isPathSafe('../file.txt')).toBe(false);
      expect(isPathSafe('dir/../file.txt')).toBe(false);
      expect(isPathSafe('../../etc/passwd')).toBe(false);
    });

    it('should return false for paths with .. in the middle', () => {
      expect(isPathSafe('some/path/../../../etc/passwd')).toBe(false);
    });

    it('should return false for normalized paths containing ..', () => {
      expect(isPathSafe('./dir/../file.txt')).toBe(false);
    });

    it('should handle empty strings', () => {
      expect(isPathSafe('')).toBe(true);
    });

    it('should handle paths with dots in filenames', () => {
      expect(isPathSafe('file.test.txt')).toBe(true);
      expect(isPathSafe('.hidden')).toBe(true);
      expect(isPathSafe('dir/.hidden')).toBe(true);
    });
  });
});
