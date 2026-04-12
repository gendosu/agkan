/**
 * Task copy command handler
 */

import { Command } from 'commander';
import chalk from 'chalk';

import { TaskStatus } from '../../../models';
import { handleError, validateNumberInput } from '../../utils/error-handler';
import { validateTaskStatus } from '../../utils/validators';
import { createFormatter } from '../../utils/output-formatter';
import { getServiceContainer } from '../../utils/service-container';
import { getStatusColor, formatDate } from '../../../utils/format';

export function setupTaskCopyCommand(program: Command): void {
  const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
  if (!taskCommand) {
    throw new Error('Task command not found');
  }

  taskCommand
    .command('copy')
    .argument('<id>', 'Task ID to copy')
    .option('-s, --status <status>', 'Status for the copied task', 'backlog')
    .option('--no-tags', 'Do not copy tags')
    .option('--json', 'Output in JSON format')
    .description('Copy a task by ID')
    .action(async (id: string, options: { status: string; tags: boolean; json?: boolean }) => {
      const formatter = createFormatter(options);
      try {
        const taskId = validateNumberInput(id);
        if (taskId === null) {
          formatter.error('Task ID must be a number', () => {
            console.log(chalk.red('\nError: Task ID must be a number\n'));
          });
          process.exit(1);
          return;
        }

        if (!validateTaskStatus(options.status)) {
          const message = `Invalid status: ${options.status}. Valid statuses: icebox, backlog, ready, in_progress, review, done, closed, archive`;
          formatter.error(message, () => {
            console.log(chalk.red(`Invalid status: ${options.status}`));
            console.log('Valid statuses: icebox, backlog, ready, in_progress, review, done, closed, archive');
          });
          process.exit(1);
          return;
        }

        const { taskService, taskTagService } = getServiceContainer();
        const original = taskService.getTask(taskId);
        if (!original) {
          formatter.error(`Task with ID ${id} not found`, () => {
            console.log(chalk.red(`\nTask with ID ${id} not found\n`));
          });
          process.exit(1);
          return;
        }

        const copied = taskService.createTask({
          title: original.title,
          body: original.body ?? undefined,
          author: original.author ?? undefined,
          assignees: original.assignees ?? undefined,
          priority: original.priority ?? undefined,
          parent_id: original.parent_id ?? undefined,
          status: options.status as TaskStatus,
        });

        const copiedTags = options.tags ? taskTagService.getTagsForTask(taskId) : [];
        for (const tag of copiedTags) {
          taskTagService.addTagToTask({ task_id: copied.id, tag_id: tag.id });
        }

        formatter.output(
          () => ({
            success: true,
            originalId: taskId,
            task: {
              id: copied.id,
              title: copied.title,
              body: copied.body,
              author: copied.author,
              assignees: copied.assignees,
              status: copied.status,
              priority: copied.priority,
              parent_id: copied.parent_id,
              created_at: copied.created_at,
              updated_at: copied.updated_at,
            },
            tags: copiedTags.map((tag) => ({ id: tag.id, name: tag.name, created_at: tag.created_at })),
          }),
          () => {
            const statusColor = getStatusColor(copied.status);
            console.log(chalk.green('\n✓ Task copied successfully\n'));
            console.log(`${chalk.bold('ID:')} ${copied.id}`);
            console.log(`${chalk.bold('Title:')} ${copied.title}`);
            console.log(`${chalk.bold('Status:')} ${chalk[statusColor](copied.status)}`);
            if (copied.author) {
              console.log(`${chalk.bold('Author:')} ${copied.author}`);
            }
            if (copied.assignees) {
              console.log(`${chalk.bold('Assignees:')} ${copied.assignees}`);
            }
            console.log(`${chalk.bold('Created:')} ${formatDate(copied.created_at)}`);
            if (copiedTags.length > 0) {
              console.log(`${chalk.bold('Tags:')} ${copiedTags.map((t) => t.name).join(', ')}`);
            }
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
