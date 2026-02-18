/**
 * Meta delete command handler
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { TaskService, MetadataService } from '../../../services';
import { validateIdInput } from '../../utils/error-handler';
import { createFormatter } from '../../utils/output-formatter';

export function setupMetaDeleteCommand(program: Command): void {
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
    .command('delete')
    .argument('<task-id>', 'Task ID')
    .argument('<key>', 'Metadata key')
    .description('Delete metadata for a task')
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

        // Delete metadata
        const deleted = metadataService.deleteMetadata(parsedTaskId, key);

        if (!deleted) {
          formatter.error(`Metadata with key "${key}" not found`, () => {
            console.log(chalk.red(`\nError: Metadata with key "${key}" not found\n`));
          });
          process.exit(1);
        }

        formatter.output(
          () => ({ success: true, message: 'Metadata deleted' }),
          () => {
            console.log(chalk.green(`\n✓ Metadata deleted successfully\n`));
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
