/**
 * Task unarchive command handler
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { getServiceContainer } from '../../utils/service-container';
import { Task } from '../../../models';
import { handleError } from '../../utils/error-handler';
import { createFormatter } from '../../utils/output-formatter';
import { formatDate } from '../../../utils/format';

function printUnarchiveResult(task: Task, dryRun: boolean): void {
  if (dryRun) {
    console.log(
      chalk.bold(`\n[Dry Run] Would unarchive task:\n`) +
        `  ${chalk.bold.cyan(`[${task.id}]`)} ${chalk.bold(task.title)} ` +
        `${chalk.gray(`(${task.status})`)} ${chalk.gray('updated:')} ${formatDate(task.updated_at)}\n`
    );
  } else {
    console.log(
      chalk.green(`\n✓ Unarchived task:\n`) +
        `  ${chalk.bold.cyan(`[${task.id}]`)} ${chalk.bold(task.title)} ` +
        `${chalk.gray(`(${task.status})`)} ${chalk.gray('updated:')} ${formatDate(task.updated_at)}\n`
    );
  }
}

export function setupTaskUnarchiveCommand(program: Command): void {
  const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
  if (!taskCommand) {
    throw new Error('Task command not found');
  }

  taskCommand
    .command('unarchive <id>')
    .option('--dry-run', 'Preview the unarchive operation without modifying the task')
    .option('--json', 'Output in JSON format')
    .description('Unarchive a task (clears is_archived flag)')
    .action(async (idStr: string, options) => {
      const formatter = createFormatter(options);
      try {
        const { taskService } = getServiceContainer();

        const id = parseInt(idStr, 10);
        if (isNaN(id)) {
          formatter.error(`Invalid task ID: ${idStr}`, () => {
            console.log(chalk.red(`\nError: Invalid task ID: ${idStr}\n`));
          });
          process.exit(1);
          return;
        }

        const task = taskService.getTask(id);
        if (!task) {
          formatter.error(`Task ${id} not found`, () => {
            console.log(chalk.red(`\nError: Task ${id} not found\n`));
          });
          process.exit(1);
          return;
        }

        const dryRun: boolean = !!options.dryRun;
        if (!dryRun) {
          taskService.unarchiveTask(id);
        }

        const updatedTask = taskService.getTask(id)!;

        formatter.output(
          () => ({
            dryRun,
            task: {
              id: updatedTask.id,
              title: updatedTask.title,
              status: updatedTask.status,
              is_archived: updatedTask.is_archived,
              updated_at: updatedTask.updated_at,
            },
          }),
          () => printUnarchiveResult(updatedTask, dryRun)
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
