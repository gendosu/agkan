import { TaskStatus } from '../models';

/**
 * Get the color corresponding to a status
 * Returns the color name to be used by chalk
 */
export function getStatusColor(
  status: TaskStatus
): 'white' | 'gray' | 'blue' | 'yellow' | 'cyan' | 'green' | 'magenta' {
  const colorMap: Record<TaskStatus, 'white' | 'gray' | 'blue' | 'yellow' | 'cyan' | 'green' | 'magenta'> = {
    icebox: 'white',
    backlog: 'gray',
    ready: 'blue',
    in_progress: 'yellow',
    review: 'cyan',
    done: 'green',
    closed: 'magenta',
  };
  return colorMap[status];
}

/**
 * Format a date from ISO 8601 format to Japanese locale format
 * @param isoDate - ISO 8601 format date string
 * @returns Formatted date string
 */
export function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleString('ja-JP');
}
