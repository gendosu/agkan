import { describe, it, expect } from 'vitest';
import { isPriority, PRIORITIES, PRIORITY_ORDER } from '../../src/models/Priority';

describe('Priority model', () => {
  describe('isPriority', () => {
    it('should return true for valid priorities', () => {
      expect(isPriority('critical')).toBe(true);
      expect(isPriority('high')).toBe(true);
      expect(isPriority('medium')).toBe(true);
      expect(isPriority('low')).toBe(true);
    });

    it('should return false for invalid values', () => {
      expect(isPriority('urgent')).toBe(false);
      expect(isPriority('none')).toBe(false);
      expect(isPriority('')).toBe(false);
      expect(isPriority('HIGH')).toBe(false);
      expect(isPriority('Critical')).toBe(false);
      expect(isPriority('normal')).toBe(false);
    });
  });

  describe('PRIORITIES', () => {
    it('should contain all four priority values', () => {
      expect(PRIORITIES).toHaveLength(4);
    });

    it('should contain critical, high, medium, and low', () => {
      expect(PRIORITIES).toContain('critical');
      expect(PRIORITIES).toContain('high');
      expect(PRIORITIES).toContain('medium');
      expect(PRIORITIES).toContain('low');
    });

    it('should be ordered from highest to lowest priority', () => {
      expect(PRIORITIES).toEqual(['critical', 'high', 'medium', 'low']);
    });
  });

  describe('PRIORITY_ORDER', () => {
    it('should map critical to 0 (highest priority)', () => {
      expect(PRIORITY_ORDER['critical']).toBe(0);
    });

    it('should map high to 1', () => {
      expect(PRIORITY_ORDER['high']).toBe(1);
    });

    it('should map medium to 2', () => {
      expect(PRIORITY_ORDER['medium']).toBe(2);
    });

    it('should map low to 3 (lowest priority)', () => {
      expect(PRIORITY_ORDER['low']).toBe(3);
    });

    it('should have entries for all priorities', () => {
      const keys = Object.keys(PRIORITY_ORDER);
      expect(keys).toHaveLength(4);
      for (const priority of PRIORITIES) {
        expect(PRIORITY_ORDER).toHaveProperty(priority);
      }
    });

    it('should maintain ascending order from critical to low', () => {
      expect(PRIORITY_ORDER['critical']).toBeLessThan(PRIORITY_ORDER['high']);
      expect(PRIORITY_ORDER['high']).toBeLessThan(PRIORITY_ORDER['medium']);
      expect(PRIORITY_ORDER['medium']).toBeLessThan(PRIORITY_ORDER['low']);
    });
  });
});
