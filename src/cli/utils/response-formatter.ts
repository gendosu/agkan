/**
 * Response formatter utility
 * Provides consistent JSON output formatting for CLI commands
 */

/**
 * Format a successful response in JSON format
 * @param data - The data to include in the response
 * @param metadata - Optional metadata to include
 * @returns Formatted JSON string
 */
export function formatJsonSuccess(data: unknown, metadata?: unknown): string {
  const response: { success: boolean; data: unknown; metadata?: unknown } = {
    success: true,
    data,
  };

  if (metadata !== undefined) {
    response.metadata = metadata;
  }

  return JSON.stringify(response, null, 2);
}

/**
 * Format an error response in JSON format
 * @param message - The error message
 * @param code - Optional error code
 * @returns Formatted JSON string
 */
export function formatJsonError(message: string, code?: string): string {
  const response: { success: boolean; error: { message: string; code?: string } } = {
    success: false,
    error: {
      message,
    },
  };

  if (code !== undefined) {
    response.error.code = code;
  }

  return JSON.stringify(response, null, 2);
}
