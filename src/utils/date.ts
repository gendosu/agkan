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

/**
 * Resolve a beforeDate request parameter to an ISO 8601 string.
 * Falls back to `daysAgoIso(fallbackDays)` when beforeDate is omitted.
 * @param beforeDate - Optional ISO 8601 date string from the request
 * @param fallbackDays - Number of days ago to use when beforeDate is omitted (default: 3)
 * @returns `{ date }` on success, or `{ error }` if beforeDate is not a valid date
 */
export function resolveBeforeDate(
  beforeDate: string | undefined,
  fallbackDays = 3
): { date: string } | { error: string } {
  if (beforeDate === undefined) {
    return { date: daysAgoIso(fallbackDays) };
  }
  const parsed = new Date(beforeDate);
  if (isNaN(parsed.getTime())) {
    return { error: 'Invalid beforeDate. Use ISO 8601 format.' };
  }
  return { date: parsed.toISOString() };
}
