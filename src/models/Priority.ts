/**
 * Priority model
 * Type definitions and constants for task priority
 */

export type Priority = 'critical' | 'high' | 'medium' | 'low';

export const PRIORITIES: Priority[] = ['critical', 'high', 'medium', 'low'];

export const PRIORITY_ORDER: Record<Priority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function isPriority(value: string): value is Priority {
  return PRIORITIES.includes(value as Priority);
}
