/**
 * Import command handler
 * Reads a JSON file and imports all task data
 */

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { ExportImportService } from '../../services/ExportImportService';
import { ExportData } from '../../services/ExportImportService';

export function setupImportCommand(program: Command): void {
  program
    .command('import <file>')
    .description('Import tasks from a JSON export file')
    .action((file: string) => {
      try {
        const content = readFileSync(file, 'utf8');
        let data: ExportData;
        try {
          data = JSON.parse(content) as ExportData;
        } catch {
          process.stderr.write('Error: Invalid JSON file\n');
          process.exit(1);
          return;
        }

        if (!data.tasks || !Array.isArray(data.tasks)) {
          process.stderr.write('Error: Invalid export file format (missing tasks array)\n');
          process.exit(1);
          return;
        }

        const service = new ExportImportService();
        const result = service.importData(data);
        process.stdout.write(`Imported ${result.importedCount} task(s) successfully.\n`);
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
