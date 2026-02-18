/**
 * Task get command handler
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { TaskService, TaskBlockService, TaskTagService } from '../../../services';
import { handleError, validateNumberInput } from '../../utils/error-handler';
import { getStatusColor, formatDate } from '../../../utils/format';
import { createFormatter } from '../../utils/output-formatter';
import { filterNonNull } from '../../utils/array-utils';

export function setupTaskGetCommand(program: Command): void {
  const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
  if (!taskCommand) {
    throw new Error('Task command not found');
  }

  taskCommand
    .command('get')
    .argument('<id>', 'Task ID')
    .option('--json', 'Output in JSON format')
    .description('Get a task by ID')
    .action(async (id, options) => {
      const formatter = createFormatter(options);
      try {
        const taskService = new TaskService();
        const taskBlockService = new TaskBlockService();
        const taskTagService = new TaskTagService();

        const taskId = validateNumberInput(id);
        if (taskId === null) {
          formatter.error('Task ID must be a number', () => {
            console.log(chalk.red('\nError: Task ID must be a number\n'));
          });
          process.exit(1);
        }

        const task = taskService.getTask(taskId);

        if (!task) {
          formatter.error(`Task with ID ${id} not found`, () => {
            console.log(chalk.red(`\nTask with ID ${id} not found\n`));
          });
          process.exit(1);
        }

        formatter.output(
          () => {
            // Fetch related data
            const parentTask = task.parent_id ? taskService.getParentTask(task.id) : null;
            const childTasks = taskService.getChildTasks(task.id);
            const blockerIds = taskBlockService.getBlockerTaskIds(task.id);
            const blockerTasks = blockerIds.map((id) => taskService.getTask(id)).filter(filterNonNull);
            const blockedIds = taskBlockService.getBlockedTaskIds(task.id);
            const blockedTasks = blockedIds.map((id) => taskService.getTask(id)).filter(filterNonNull);
            const tags = taskTagService.getTagsForTask(task.id);

            return {
              success: true,
              task: {
                id: task.id,
                title: task.title,
                body: task.body,
                author: task.author,
                status: task.status,
                parent_id: task.parent_id,
                created_at: task.created_at,
                updated_at: task.updated_at,
              },
              parent: parentTask
                ? {
                    id: parentTask.id,
                    title: parentTask.title,
                    body: parentTask.body,
                    author: parentTask.author,
                    status: parentTask.status,
                    parent_id: parentTask.parent_id,
                    created_at: parentTask.created_at,
                    updated_at: parentTask.updated_at,
                  }
                : null,
              children: childTasks.map((child) => ({
                id: child.id,
                title: child.title,
                body: child.body,
                author: child.author,
                status: child.status,
                parent_id: child.parent_id,
                created_at: child.created_at,
                updated_at: child.updated_at,
              })),
              blockedBy: blockerTasks.map((blocker) => ({
                id: blocker.id,
                title: blocker.title,
                body: blocker.body,
                author: blocker.author,
                status: blocker.status,
                parent_id: blocker.parent_id,
                created_at: blocker.created_at,
                updated_at: blocker.updated_at,
              })),
              blocking: blockedTasks.map((blocked) => ({
                id: blocked.id,
                title: blocked.title,
                body: blocked.body,
                author: blocked.author,
                status: blocked.status,
                parent_id: blocked.parent_id,
                created_at: blocked.created_at,
                updated_at: blocked.updated_at,
              })),
              tags: tags.map((tag) => ({
                id: tag.id,
                name: tag.name,
                created_at: tag.created_at,
              })),
            };
          },
          () => {
            const statusColor = getStatusColor(task.status);

            console.log(chalk.bold(`\nTask #${task.id}`));
            console.log(chalk.bold('═'.repeat(80)));
            console.log(`${chalk.bold('Title:')} ${task.title}`);
            console.log(`${chalk.bold('Status:')} ${chalk[statusColor](task.status)}`);
            if (task.author) {
              console.log(`${chalk.bold('Author:')} ${task.author}`);
            }
            console.log(`${chalk.bold('Created:')} ${formatDate(task.created_at)}`);
            console.log(`${chalk.bold('Updated:')} ${formatDate(task.updated_at)}`);

            // Display parent task information
            if (task.parent_id) {
              const parentTask = taskService.getParentTask(task.id);
              if (parentTask) {
                const parentStatusColor = getStatusColor(parentTask.status);
                console.log(
                  `${chalk.bold('Parent:')} ${chalk.cyan(`[${parentTask.id}]`)} ${parentTask.title} ` +
                    `${chalk[parentStatusColor](`(${parentTask.status})`)}`
                );
              }
            }

            // Display child tasks list
            const childTasks = taskService.getChildTasks(task.id);
            if (childTasks.length > 0) {
              console.log(`${chalk.bold('Children:')} ${childTasks.length} task(s)`);
              childTasks.forEach((child) => {
                const childStatusColor = getStatusColor(child.status);
                console.log(
                  `  ${chalk.cyan('•')} ${chalk.cyan(`[${child.id}]`)} ${child.title} ` +
                    `${chalk[childStatusColor](`(${child.status})`)}`
                );
              });
            }

            // Display blocking relationships
            const blockerIds = taskBlockService.getBlockerTaskIds(task.id);
            if (blockerIds.length > 0) {
              const blockerTasks = blockerIds.map((id) => taskService.getTask(id)).filter(filterNonNull);

              console.log(`${chalk.bold('Blocked By:')} ${blockerTasks.length} task(s)`);
              blockerTasks.forEach((blocker) => {
                const blockerStatusColor = getStatusColor(blocker.status);
                console.log(
                  `  ${chalk.red('•')} ${chalk.cyan(`[${blocker.id}]`)} ${blocker.title} ` +
                    `${chalk[blockerStatusColor](`(${blocker.status})`)}`
                );
              });
            }

            const blockedIds = taskBlockService.getBlockedTaskIds(task.id);
            if (blockedIds.length > 0) {
              const blockedTasks = blockedIds.map((id) => taskService.getTask(id)).filter(filterNonNull);

              console.log(`${chalk.bold('Blocking:')} ${blockedTasks.length} task(s)`);
              blockedTasks.forEach((blocked) => {
                const blockedStatusColor = getStatusColor(blocked.status);
                console.log(
                  `  ${chalk.yellow('•')} ${chalk.cyan(`[${blocked.id}]`)} ${blocked.title} ` +
                    `${chalk[blockedStatusColor](`(${blocked.status})`)}`
                );
              });
            }

            // Display tag list
            const tags = taskTagService.getTagsForTask(task.id);
            if (tags.length > 0) {
              console.log(`${chalk.bold('Tags:')}`);
              tags.forEach((tag) => {
                console.log(`  ${chalk.cyan('•')} ${chalk.cyan(`[${tag.id}]`)} ${tag.name}`);
              });
            }

            if (task.body) {
              console.log(chalk.bold('\nBody:'));
              console.log(chalk.gray('─'.repeat(80)));
              console.log(task.body);
              console.log(chalk.gray('─'.repeat(80)));
            }

            console.log('\n');
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
