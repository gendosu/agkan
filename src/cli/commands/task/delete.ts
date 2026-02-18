/**
 * Task delete command handler
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { TaskService } from '../../../services';
import { handleError, validateNumberInput } from '../../utils/error-handler';
import { createFormatter } from '../../utils/output-formatter';

export function setupTaskDeleteCommand(program: Command): void {
  const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
  if (!taskCommand) {
    throw new Error('Task command not found');
  }

  taskCommand
    .command('delete')
    .argument('<id>', 'Task ID')
    .option('--json', 'Output in JSON format')
    .description('Delete a task')
    .action(async (id, options) => {
      const formatter = createFormatter(options);
      try {
        const taskService = new TaskService();

        const taskId = validateNumberInput(id);
        if (taskId === null) {
          formatter.error('Task ID must be a number', () => {
            console.log(chalk.red('\nError: Task ID must be a number\n'));
          });
          process.exit(1);
        }

        const deleted = taskService.deleteTask(taskId);

        if (!deleted) {
          formatter.error(`Task with ID ${id} not found`, () => {
            console.log(chalk.red(`\nTask with ID ${id} not found\n`));
          });
          process.exit(1);
        }

        formatter.output(
          () => ({ success: true, id: taskId }),
          () => {
            console.log(chalk.green(`\n✓ Task #${taskId} deleted successfully\n`));
          }
        );
      } catch (error) {
        if (error instanceof Error) {
          handleError(error, options);
        } else {
          formatter.error('An unknown error occurred', () => {
            console.log(chalk.red('\n✗ An unknown error occurred\n'));
          });
        }
        process.exit(1);
      }
    });
}
