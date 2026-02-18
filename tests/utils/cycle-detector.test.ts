import { describe, it, expect } from 'vitest';
import { wouldCreateCycle } from '../../src/utils/cycle-detector';

describe('wouldCreateCycle', () => {
  // Helper: build a getParentId callback from a parent map
  function makeGetParentId(parents: Record<number, number | null>): (id: number) => number | null {
    return (id: number) => parents[id] ?? null;
  }

  it('should return false when proposedParentId is null', () => {
    const getParentId = makeGetParentId({});
    expect(wouldCreateCycle(1, null, getParentId)).toBe(false);
  });

  it('should return true when a task is set as its own parent', () => {
    const getParentId = makeGetParentId({});
    expect(wouldCreateCycle(1, 1, getParentId)).toBe(true);
  });

  it('should return false when there is no existing parent chain', () => {
    // task 2 has no parent → no cycle when setting task 1 parent = task 2
    const getParentId = makeGetParentId({ 2: null });
    expect(wouldCreateCycle(1, 2, getParentId)).toBe(false);
  });

  it('should detect a direct cycle (A -> B -> A)', () => {
    // Task 1 is currently the parent of task 2.
    // Setting task 1's parent to task 2 would create: 1 -> 2 -> 1
    const getParentId = makeGetParentId({ 2: 1 });
    expect(wouldCreateCycle(1, 2, getParentId)).toBe(true);
  });

  it('should detect an indirect cycle (A -> B -> C -> A)', () => {
    // Chain: 3 -> 2 -> 1. Setting 1's parent to 3 creates cycle.
    const getParentId = makeGetParentId({ 3: 2, 2: 1, 1: null });
    expect(wouldCreateCycle(1, 3, getParentId)).toBe(true);
  });

  it('should return false for a valid parent chain without cycle', () => {
    // Chain: 3 -> 2. Setting 1's parent to 3 is fine.
    const getParentId = makeGetParentId({ 3: 2, 2: null });
    expect(wouldCreateCycle(1, 3, getParentId)).toBe(false);
  });

  it('should handle a long chain without cycle', () => {
    // Chain: 5 -> 4 -> 3 -> 2 -> null. Setting 1's parent to 5 is fine.
    const getParentId = makeGetParentId({ 5: 4, 4: 3, 3: 2, 2: null });
    expect(wouldCreateCycle(1, 5, getParentId)).toBe(false);
  });

  it('should detect a cycle in a long chain', () => {
    // Chain: 5 -> 4 -> 3 -> 2 -> 1. Setting 1's parent to 5 creates cycle.
    const getParentId = makeGetParentId({ 5: 4, 4: 3, 3: 2, 2: 1, 1: null });
    expect(wouldCreateCycle(1, 5, getParentId)).toBe(true);
  });

  it('should handle a pre-existing cycle in the parent chain gracefully', () => {
    // Corrupt data: 3 -> 2 -> 3 (already a cycle). Task 1 wants to use 3 as parent.
    // Should detect the cycle and return true rather than looping forever.
    const getParentId = makeGetParentId({ 3: 2, 2: 3 });
    expect(wouldCreateCycle(1, 3, getParentId)).toBe(true);
  });
});
