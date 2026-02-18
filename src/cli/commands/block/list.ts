/**
 * Task block list command handler
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { TaskService, TaskBlockService } from '../../../services';
import { validateNumberInput } from '../../utils/error-handler';
import { getStatusColor } from '../../../utils/format';
import { createFormatter } from '../../utils/output-formatter';
import { filterNonNull } from '../../utils/array-utils';

export function setupBlockListCommand(program: Command): void {
  const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
  if (!taskCommand) {
    throw new Error('Task command not found');
  }

  let blockCommand = taskCommand.commands.find((cmd) => cmd.name() === 'block');
  if (!blockCommand) {
    blockCommand = taskCommand.command('block').description('Task blocking relationship commands');
  }

  blockCommand
    .command('list')
    .argument('<id>', 'Task ID')
    .option('--json', 'Output in JSON format')
    .description('List all blocking relationships for a task')
    .action(async (id, options) => {
      const formatter = createFormatter(options);
      try {
        const taskService = new TaskService();
        const taskBlockService = new TaskBlockService();

        // Validate ID
        const taskId = validateNumberInput(id);
        if (taskId === null) {
          formatter.error('Task ID must be a number', () => {
            console.log(chalk.red('\nError: Task ID must be a number\n'));
          });
          process.exit(1);
        }

        // Check if task exists
        const task = taskService.getTask(taskId);
        if (!task) {
          formatter.error(`Task with ID ${id} not found`, () => {
            console.log(chalk.red(`\nError: Task with ID ${id} not found\n`));
          });
          process.exit(1);
        }

        // Blocked By (tasks blocking this task)
        const blockerIds = taskBlockService.getBlockerTaskIds(taskId);
        const blockerTasks = blockerIds.map((id) => taskService.getTask(id)).filter(filterNonNull);

        // Blocking (tasks being blocked by this task)
        const blockedIds = taskBlockService.getBlockedTaskIds(taskId);
        const blockedTasks = blockedIds.map((id) => taskService.getTask(id)).filter(filterNonNull);

        formatter.output(
          () => ({
            task: {
              id: task.id,
              title: task.title,
              status: task.status,
            },
            blockedBy: blockerTasks.map((t) => ({
              id: t.id,
              title: t.title,
              status: t.status,
            })),
            blocking: blockedTasks.map((t) => ({
              id: t.id,
              title: t.title,
              status: t.status,
            })),
          }),
          () => {
            // Standard output
            const statusColor = getStatusColor(task.status);

            console.log(chalk.bold(`\nBlocking Relationships for Task #${task.id}`));
            console.log(chalk.bold('═'.repeat(80)));
            console.log(`${chalk.bold('Title:')} ${task.title}`);
            console.log(`${chalk.bold('Status:')} ${chalk[statusColor](task.status)}`);
            console.log();

            if (blockerTasks.length > 0) {
              console.log(chalk.bold.red(`Blocked By: ${blockerTasks.length} task(s)`));
              blockerTasks.forEach((blocker) => {
                const blockerStatusColor = getStatusColor(blocker.status);
                console.log(
                  `  ${chalk.red('•')} ${chalk.cyan(`[${blocker.id}]`)} ${blocker.title} ` +
                    `${chalk[blockerStatusColor](`(${blocker.status})`)}`
                );
              });
            } else {
              console.log(chalk.bold.red('Blocked By:') + chalk.gray(' (none)'));
            }

            console.log();

            if (blockedTasks.length > 0) {
              console.log(chalk.bold.yellow(`Blocking: ${blockedTasks.length} task(s)`));
              blockedTasks.forEach((blocked) => {
                const blockedStatusColor = getStatusColor(blocked.status);
                console.log(
                  `  ${chalk.yellow('•')} ${chalk.cyan(`[${blocked.id}]`)} ${blocked.title} ` +
                    `${chalk[blockedStatusColor](`(${blocked.status})`)}`
                );
              });
            } else {
              console.log(chalk.bold.yellow('Blocking:') + chalk.gray(' (none)'));
            }

            console.log();
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
