import path from 'path';

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
  // Check for path traversal (..)
  if (filePath.includes('..')) {
    return false;
  }

  // For additional safety, check the normalized path doesn't contain '..'
  const normalizedPath = path.normalize(filePath);
  if (normalizedPath.includes('..')) {
    return false;
  }

  return true;
}
