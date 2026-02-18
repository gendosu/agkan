/**
 * Meta set command handler
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { TaskService, MetadataService } from '../../../services';
import { validateIdInput } from '../../utils/error-handler';
import { createFormatter } from '../../utils/output-formatter';

export function setupMetaSetCommand(program: Command): void {
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
    .command('set')
    .argument('<task-id>', 'Task ID')
    .argument('<key>', 'Metadata key')
    .argument('<value>', 'Metadata value')
    .description('Set metadata for a task')
    .option('--json', 'Output in JSON format')
    .action(async (taskId, key, value, options) => {
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

        // Validate key length (max 50 characters)
        if (key.length > 50) {
          const error = 'Metadata key must not exceed 50 characters';
          formatter.error(error, () => {
            console.log(chalk.red(`\nError: ${error}\n`));
          });
          process.exit(1);
        }

        // Validate value length (max 500 characters)
        if (value.length > 500) {
          const error = 'Metadata value must not exceed 500 characters';
          formatter.error(error, () => {
            console.log(chalk.red(`\nError: ${error}\n`));
          });
          process.exit(1);
        }

        // Set metadata
        const metadata = metadataService.setMetadata({
          task_id: parsedTaskId,
          key,
          value,
        });

        formatter.output(
          () => ({ success: true, data: metadata }),
          () => {
            console.log(chalk.green(`\n✓ Metadata set successfully\n`));
            console.log(`Key: ${metadata.key}`);
            console.log(`Value: ${metadata.value}`);
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
