/**
 * Security utility functions
 * Provides path validation and security checks
 */

/**
 * Check if a file path is safe from path traversal attacks
 * @param filePath - Path to validate
 * @returns True if path is safe, false otherwise
 */
export function isPathSafe(filePath: string): boolean {
  // Check for path traversal by inspecting path segments, not substrings.
  // This must run against the original path (not path.normalize(filePath)),
  // since normalize collapses 'dir/../file.txt' into 'file.txt' and would
  // hide a traversal segment.
  const segments = filePath.split(/[/\\]/);
  if (segments.includes('..')) {
    return false;
  }

  return true;
}
