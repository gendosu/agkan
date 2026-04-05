/**
 * Verbose logging utility.
 * Set VERBOSE=true (or VERBOSE=1) environment variable to enable output.
 */

export function isVerbose(): boolean {
  return process.env.VERBOSE === 'true' || process.env.VERBOSE === '1';
}

export function verboseLog(message: string, ...args: unknown[]): void {
  if (isVerbose()) {
    const ts = new Date().toISOString();
    console.log(`[${ts}] ${message}`, ...args);
  }
}
