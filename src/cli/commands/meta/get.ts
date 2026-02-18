/**
 * Meta get command handler
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { TaskService, MetadataService } from '../../../services';
import { validateIdInput } from '../../utils/error-handler';
import { createFormatter } from '../../utils/output-formatter';

export function setupMetaGetCommand(program: Command): void {
  // Find or create task command
  let taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
  if (!taskCommand) {
    taskCommand = program.command('task').description('Task management commands');
  }

  // Find or create meta command group
  let metaCommand = taskCommand.commands.find((cmd) => cmd.name() === 'meta');
  if (!metaCommand) {
    metaCommand = taskCommand.command('meta').description('Task metadata commands');
  }

  metaCommand
    .command('get')
    .argument('<task-id>', 'Task ID')
    .argument('<key>', 'Metadata key')
    .description('Get metadata for a task')
    .option('--json', 'Output in JSON format')
    .action(async (taskId, key, options) => {
      const formatter = createFormatter(options);
      try {
        const taskService = new TaskService();
        const metadataService = new MetadataService();

        // Validate task ID
        const parsedTaskId = validateIdInput(taskId, 'Task', options);

        // Check if task exists
        const task = taskService.getTask(parsedTaskId);
        if (!task) {
          formatter.error(`Task with ID ${taskId} not found`, () => {
            console.log(chalk.red(`\nError: Task with ID ${taskId} not found\n`));
          });
          process.exit(1);
        }

        // Get metadata
        const metadata = metadataService.getMetadataByKey(parsedTaskId, key);

        if (!metadata) {
          formatter.error(`Metadata with key "${key}" not found`, () => {
            console.log(chalk.red(`\nError: Metadata with key "${key}" not found\n`));
          });
          process.exit(1);
        }

        formatter.output(
          () => ({ success: true, data: metadata }),
          () => {
            console.log(chalk.green(`\n✓ Metadata retrieved\n`));
            console.log(`Key: ${metadata.key}`);
            console.log(`Value: ${metadata.value}`);
            console.log(`Created: ${metadata.created_at}`);
            console.log(`Updated: ${metadata.updated_at}\n`);
          }
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        formatter.error(message, () => {
          console.log(chalk.red(`\nError: ${message}\n`));
        });
        process.exit(1);
      }
    });
}
