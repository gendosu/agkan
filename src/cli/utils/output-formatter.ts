/**
 * Output formatter
 * OCP-compliant abstraction for CLI output format
 *
 * New output formats (YAML, CSV, etc.) can be added by implementing OutputFormatter
 * without modifying any command files.
 */

import chalk from 'chalk';

/**
 * Interface for output formatting
 * Implementations determine how data is presented (JSON, text, or future formats)
 */
export interface OutputFormatter {
  /**
   * Output data in the appropriate format
   * @param jsonDataProvider - Function that returns JSON-serializable data (lazy, only called in JSON mode)
   * @param textRender - Function that renders text output (only called in text mode)
   */
  output(jsonDataProvider: () => object, textRender: () => void): void;

  /**
   * Output an error in the appropriate format
   * @param message - Error message
   * @param textRender - Optional custom text renderer; defaults to red error message
   */
  error(message: string, textRender?: () => void): void;
}

class JsonFormatter implements OutputFormatter {
  output(jsonDataProvider: () => object): void {
    console.log(JSON.stringify(jsonDataProvider(), null, 2));
  }

  error(message: string): void {
    console.log(JSON.stringify({ success: false, error: { message } }, null, 2));
  }
}

class TextFormatter implements OutputFormatter {
  output(_jsonDataProvider: () => object, textRender: () => void): void {
    textRender();
  }

  error(message: string, textRender?: () => void): void {
    if (textRender) {
      textRender();
    } else {
      console.log(chalk.red(`\n✗ Error: ${message}\n`));
    }
  }
}

/**
 * Factory function to create an OutputFormatter based on the output mode options
 * @param options - Command options object (checks for json property)
 * @returns An OutputFormatter instance appropriate for the requested format
 */
export function createFormatter(options: { json?: boolean }): OutputFormatter {
  return options.json ? new JsonFormatter() : new TextFormatter();
}

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
