/**
 * Date utility functions
 */

/**
 * Calculate a date N days ago and return it as an ISO 8601 string
 * @param days Number of days to subtract from today
 * @returns ISO 8601 formatted date string
 */
export function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}
