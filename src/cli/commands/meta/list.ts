/**
 * Meta list command handler
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { TaskService, MetadataService } from '../../../services';
import { validateIdInput } from '../../utils/error-handler';
import { createFormatter } from '../../utils/output-formatter';

export function setupMetaListCommand(program: Command): void {
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
    .command('list')
    .argument('<task-id>', 'Task ID')
    .description('List all metadata for a task')
    .option('--json', 'Output in JSON format')
    .action(async (taskId, options) => {
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

        // List metadata
        const metadataList = metadataService.listMetadata(parsedTaskId);

        formatter.output(
          () => ({ success: true, data: metadataList }),
          () => {
            if (metadataList.length === 0) {
              console.log(chalk.yellow(`\nNo metadata found for task #${parsedTaskId}\n`));
            } else {
              console.log(chalk.green(`\n✓ Metadata for task #${parsedTaskId}\n`));
              metadataList.forEach((meta) => {
                console.log(`[${meta.key}] ${meta.value}`);
              });
              console.log();
            }
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
