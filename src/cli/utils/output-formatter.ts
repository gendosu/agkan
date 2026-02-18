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
