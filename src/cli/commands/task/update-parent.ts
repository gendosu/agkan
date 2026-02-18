/**
 * Task update-parent command handler
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { TaskService } from '../../../services';
import { validateNumberInput } from '../../utils/error-handler';
import { getStatusColor, formatDate } from '../../../utils/format';
import { createFormatter } from '../../utils/output-formatter';

export function setupTaskUpdateParentCommand(program: Command): void {
  const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
  if (!taskCommand) {
    throw new Error('Task command not found');
  }

  taskCommand
    .command('update-parent')
    .argument('<id>', 'Task ID')
    .argument('<parent_id>', 'Parent task ID (use "null" or "none" to remove parent)')
    .option('--json', 'Output in JSON format')
    .description('Update task parent')
    .action(async (id, parentId, options) => {
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

        // Remove parent task by using "null" or "none"
        let parsedParentId: number | null;
        if (['null', 'none'].includes(parentId.toLowerCase())) {
          parsedParentId = null;
        } else {
          const parsed = validateNumberInput(parentId);
          if (parsed === null) {
            formatter.error('Parent ID must be a number or "null"/"none"', () => {
              console.log(chalk.red('\nError: Parent ID must be a number or "null"/"none"\n'));
            });
            process.exit(1);
          }
          parsedParentId = parsed;
        }

        // Handle circular reference errors
        let task;
        try {
          task = taskService.updateTask(taskId, { parent_id: parsedParentId });
        } catch (error) {
          if (error instanceof Error) {
            if (error.message.includes('cycle') || error.message.includes('circular')) {
              formatter.error('This would create a circular parent-child relationship', () => {
                console.log(chalk.red('\n✗ Error: This would create a circular parent-child relationship\n'));
              });
            } else {
              formatter.error(error.message, () => {
                console.log(chalk.red(`\n✗ Error: ${error.message}\n`));
              });
            }
          } else {
            formatter.error('An unknown error occurred', () => {
              console.log(chalk.red('\n✗ An unknown error occurred\n'));
            });
          }
          process.exit(1);
        }

        if (!task) {
          formatter.error(`Task with ID ${id} not found`, () => {
            console.log(chalk.red(`\nTask with ID ${id} not found\n`));
          });
          process.exit(1);
        }

        // Output result
        formatter.output(
          () => {
            // Get parent task if exists
            const parentTask = task.parent_id ? taskService.getTask(task.parent_id) : null;
            return {
              success: true,
              task: task,
              parent: parentTask,
            };
          },
          () => {
            const statusColor = getStatusColor(task.status);

            console.log(chalk.green('\n✓ Task parent updated successfully\n'));
            console.log(`${chalk.bold('ID:')} ${task.id}`);
            console.log(`${chalk.bold('Title:')} ${task.title}`);
            console.log(`${chalk.bold('Status:')} ${chalk[statusColor](task.status)}`);

            if (task.parent_id) {
              const parentTask = taskService.getTask(task.parent_id);
              if (parentTask) {
                console.log(`${chalk.bold('Parent:')} #${parentTask.id} - ${parentTask.title}`);
              }
            } else {
              console.log(`${chalk.bold('Parent:')} ${chalk.gray('(none)')}`);
            }

            console.log(`${chalk.bold('Updated:')} ${formatDate(task.updated_at)}\n`);
          }
        );
      } catch (error) {
        formatter.error(error instanceof Error ? error.message : 'An unknown error occurred', () => {
          if (error instanceof Error) {
            console.log(chalk.red(`\n✗ Error: ${error.message}\n`));
          } else {
            console.log(chalk.red('\n✗ An unknown error occurred\n'));
          }
        });
        process.exit(1);
      }
    });
}
