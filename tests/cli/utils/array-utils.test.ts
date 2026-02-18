import { describe, it, expect } from 'vitest';
import { filterNonNull } from '../../../src/cli/utils/array-utils';

describe('array-utils', () => {
  describe('filterNonNull', () => {
    it('should return true for non-null values', () => {
      expect(filterNonNull(1)).toBe(true);
      expect(filterNonNull('string')).toBe(true);
      expect(filterNonNull(0)).toBe(true);
      expect(filterNonNull('')).toBe(true);
      expect(filterNonNull(false)).toBe(true);
      expect(filterNonNull({})).toBe(true);
      expect(filterNonNull([])).toBe(true);
    });

    it('should return false for null', () => {
      expect(filterNonNull(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(filterNonNull(undefined)).toBe(false);
    });

    it('should filter null values from an array', () => {
      const input = [1, null, 2, null, 3];
      const result = input.filter(filterNonNull);
      expect(result).toEqual([1, 2, 3]);
    });

    it('should filter undefined values from an array', () => {
      const input = [1, undefined, 2, undefined, 3];
      const result = input.filter(filterNonNull);
      expect(result).toEqual([1, 2, 3]);
    });

    it('should filter both null and undefined from a mixed array', () => {
      const input = ['a', null, 'b', undefined, 'c'];
      const result = input.filter(filterNonNull);
      expect(result).toEqual(['a', 'b', 'c']);
    });

    it('should return the same array when no nullish values are present', () => {
      const input = [1, 2, 3];
      const result = input.filter(filterNonNull);
      expect(result).toEqual([1, 2, 3]);
    });

    it('should return an empty array when all values are null or undefined', () => {
      const input = [null, undefined, null];
      const result = input.filter(filterNonNull);
      expect(result).toEqual([]);
    });

    it('should preserve type narrowing for object arrays', () => {
      const input: ({ id: number } | null)[] = [{ id: 1 }, null, { id: 2 }];
      const result: { id: number }[] = input.filter(filterNonNull);
      expect(result).toEqual([{ id: 1 }, { id: 2 }]);
    });
  });
});
