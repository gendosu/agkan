/**
 * Task update command handler
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { TaskService } from '../../../services';
import { TaskStatus } from '../../../models';
import { handleError, validateNumberInput } from '../../utils/error-handler';
import { validateTaskStatus } from '../../utils/validators';
import { getStatusColor, formatDate } from '../../../utils/format';
import { createFormatter } from '../../utils/output-formatter';
import { readBodyFromFile } from './add-helpers';

const SUPPORTED_FIELDS = ['status', 'title', 'body', 'author'] as const;
type SupportedField = (typeof SUPPORTED_FIELDS)[number];

export function setupTaskUpdateCommand(program: Command): void {
  const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
  if (!taskCommand) {
    throw new Error('Task command not found');
  }

  taskCommand
    .command('update')
    .argument('<id>', 'Task ID')
    .argument('<field>', 'Field to update (status, title, body, author)')
    .argument('[value]', 'New value')
    .option('--file <path>', 'Read body from file (only valid for body field)')
    .option('--json', 'Output in JSON format')
    .description('Update a task field')
    .action(async (id, field, value, options) => {
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

        if (!SUPPORTED_FIELDS.includes(field as SupportedField)) {
          formatter.error(`Unsupported field: ${field}. Supported fields: ${SUPPORTED_FIELDS.join(', ')}`, () => {
            console.log(chalk.red(`\nUnsupported field: ${field}`));
            console.log(`Supported fields: ${SUPPORTED_FIELDS.join(', ')}\n`);
          });
          process.exit(1);
        }

        // Validate --file option usage
        if (options.file && field !== 'body') {
          formatter.error('--file option is only valid for the body field', () => {
            console.log(chalk.red(`\nError: --file option is only valid for the body field\n`));
          });
          process.exit(1);
        }

        // Resolve the body value from file if --file is specified
        let resolvedValue = value;
        if (options.file) {
          try {
            resolvedValue = readBodyFromFile(options.file);
          } catch (error) {
            const msg = error instanceof Error ? error.message : 'Error reading file';
            formatter.error(msg, () => {
              console.log(chalk.red(`\n✗ Error: ${msg}\n`));
            });
            process.exit(1);
            return;
          }
        }

        // Require a value when not using --file
        if (resolvedValue === undefined) {
          formatter.error(
            `Missing value for field '${field}'. Provide a value argument or use --file for body.`,
            () => {
              console.log(
                chalk.red(
                  `\nError: Missing value for field '${field}'. Provide a value argument or use --file for body.\n`
                )
              );
            }
          );
          process.exit(1);
        }

        const updateInput: Record<string, string> = {};

        if (field === 'status') {
          if (!validateTaskStatus(resolvedValue)) {
            formatter.error(
              `Invalid status: ${resolvedValue}. Valid statuses: icebox, backlog, ready, in_progress, review, done, closed`,
              () => {
                console.log(chalk.red(`\nInvalid status: ${resolvedValue}`));
                console.log('Valid statuses: icebox, backlog, ready, in_progress, review, done, closed\n');
              }
            );
            process.exit(1);
          }
          updateInput.status = resolvedValue;
        } else {
          updateInput[field] = resolvedValue;
        }

        const task = taskService.updateTask(taskId, {
          ...(updateInput.status !== undefined && { status: updateInput.status as TaskStatus }),
          ...(updateInput.title !== undefined && { title: updateInput.title }),
          ...(updateInput.body !== undefined && { body: updateInput.body }),
          ...(updateInput.author !== undefined && { author: updateInput.author }),
        });

        if (!task) {
          formatter.error(`Task with ID ${id} not found`, () => {
            console.log(chalk.red(`\nTask with ID ${id} not found\n`));
          });
          process.exit(1);
        }

        const statusCounts = taskService.getTaskCountByStatus();
        const statusColor = getStatusColor(task.status);

        formatter.output(
          () => ({
            success: true,
            task,
            counts: statusCounts,
          }),
          () => {
            console.log(chalk.green('\n✓ Task updated successfully\n'));
            console.log(`${chalk.bold('ID:')} ${task.id}`);
            console.log(`${chalk.bold('Title:')} ${task.title}`);
            console.log(`${chalk.bold('Status:')} ${chalk[statusColor](task.status)}`);
            console.log(`${chalk.bold('Updated:')} ${formatDate(task.updated_at)}\n`);

            // Get and display task count by status
            console.log(chalk.bold('Task Count by Status:'));

            const statusEntries: Array<{ status: TaskStatus; count: number }> = [
              { status: 'icebox', count: statusCounts.icebox },
              { status: 'backlog', count: statusCounts.backlog },
              { status: 'ready', count: statusCounts.ready },
              { status: 'in_progress', count: statusCounts.in_progress },
              { status: 'review', count: statusCounts.review },
              { status: 'done', count: statusCounts.done },
              { status: 'closed', count: statusCounts.closed },
            ];

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
