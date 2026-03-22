/**
 * Export command handler
 * Outputs all task data as JSON to stdout
 */

import { Command } from 'commander';
import { ExportImportService } from '../../services/ExportImportService';

export function setupExportCommand(program: Command): void {
  program
    .command('export')
    .description('Export all tasks to JSON format (pipe to file: agkan export > backup.json)')
    .action(() => {
      try {
        const service = new ExportImportService();
        const data = service.exportData();
        process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      } catch (error) {
        if (error instanceof Error) {
          process.stderr.write(`Error: ${error.message}\n`);
        } else {
          process.stderr.write('An unknown error occurred\n');
        }
        process.exit(1);
      }
    });
}
