/**
 * Array utility functions
 * Provides common array operations used across CLI commands
 */

/**
 * Filter out null and undefined values from an array, narrowing the type to NonNullable<T>.
 *
 * Usage:
 *   someIds.map((id) => service.getItem(id)).filter(filterNonNull)
 *
 * @param t - The value to test
 * @returns true if the value is not null or undefined
 */
export function filterNonNull<T>(t: T): t is NonNullable<T> {
  return t !== null && t !== undefined;
}
