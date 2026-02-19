/**
 * Task count command handler
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { TaskService } from '../../../services';
import { TaskStatus } from '../../../models';
import { handleError } from '../../utils/error-handler';
import { validateTaskStatus } from '../../utils/validators';
import { getStatusColor } from '../../../utils/format';
import { createFormatter } from '../../utils/output-formatter';

export function setupTaskCountCommand(program: Command): void {
  const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
  if (!taskCommand) {
    throw new Error('Task command not found');
  }

  taskCommand
    .command('count')
    .option('-s, --status <status>', 'Filter by status')
    .option('-q, --quiet', 'Output only the count value')
    .option('--json', 'Output in JSON format')
    .description('Show task count by status')
    .action(async (options) => {
      const formatter = createFormatter(options);
      try {
        const taskService = new TaskService();

        // Get task count by status
        const statusCounts = taskService.getTaskCountByStatus();

        // -q option must be used in combination with -s option
        if (options.quiet && !options.status) {
          formatter.error('-q, --quiet option requires -s, --status option', () => {
            console.log(chalk.red('\n✗ Error: -q, --quiet option requires -s, --status option\n'));
          });
          process.exit(1);
        }

        // If -s option is specified, display only that status
        if (options.status) {
          const status = options.status as TaskStatus;

          if (!validateTaskStatus(status)) {
            formatter.error(
              `Invalid status: ${status}. Valid statuses: icebox, backlog, ready, in_progress, review, done, closed`,
              () => {
                console.log(chalk.red(`\nInvalid status: ${status}`));
                console.log('Valid statuses: icebox, backlog, ready, in_progress, review, done, closed\n');
              }
            );
            process.exit(1);
          }

          const count = statusCounts[status];

          // --json option takes priority over --quiet option
          formatter.output(
            () => ({ status, count }),
            () => {
              // If -q option is specified, output only the number
              if (options.quiet) {
                console.log(count);
                return;
              }

              const color = getStatusColor(status);
              console.log(chalk.bold(`\n${chalk[color](status)}: ${count}\n`));
            }
          );
          return;
        }

        // If no options are specified, display all statuses
        const statusEntries: Array<{ status: TaskStatus; count: number }> = [
          { status: 'icebox', count: statusCounts.icebox },
          { status: 'backlog', count: statusCounts.backlog },
          { status: 'ready', count: statusCounts.ready },
          { status: 'in_progress', count: statusCounts.in_progress },
          { status: 'review', count: statusCounts.review },
          { status: 'done', count: statusCounts.done },
          { status: 'closed', count: statusCounts.closed },
        ];

        formatter.output(
          () => {
            const total = statusEntries.reduce((sum, entry) => sum + entry.count, 0);
            return { counts: statusCounts, total };
          },
          () => {
            console.log(chalk.bold('\nTask Count by Status:\n'));

            statusEntries.forEach(({ status, count }) => {
              const color = getStatusColor(status);
              console.log(`  ${chalk[color](status)}: ${count}`);
            });
            console.log();
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
