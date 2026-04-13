/**
 * Task add command handler
 */

import { Command } from 'commander';
import chalk from 'chalk';

import { TaskStatus } from '../../../models';
import { Priority, isPriority } from '../../../models/Priority';
import { handleError, validateNumberInput } from '../../utils/error-handler';
import { validateTaskStatus } from '../../utils/validators';
import { validateTaskInput } from '../../../utils/input-validators';
import { createFormatter } from '../../utils/output-formatter';
import { getServiceContainer } from '../../utils/service-container';
import {
  readBodyFromFile,
  parseBlockIds,
  addBlockRelationships,
  fetchRelatedTasks,
  buildTaskJsonData,
  printTaskCreated,
} from './add-helpers';

export function setupTaskAddCommand(program: Command): void {
  const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
  if (!taskCommand) {
    throw new Error('Task command not found');
  }

  taskCommand
    .command('add')
    .argument('[title]', 'Task title')
    .argument('[body]', 'Task body')
    .option('-a, --author <author>', 'Task author')
    .option('--assignees <assignees>', 'Task assignees (comma-separated)')
    .option(
      '-s, --status <status>',
      'Task status (icebox, backlog, ready, in_progress, review, done, closed)',
      'backlog'
    )
    .option('--priority <priority>', 'Task priority (critical, high, medium, low)', 'medium')
    .option('-p, --parent <id>', 'Parent task ID')
    .option('--file <path>', 'Read body from markdown file')
    .option('--blocked-by <ids>', 'Comma-separated task IDs that block this task')
    .option('--blocks <ids>', 'Comma-separated task IDs that this task blocks')
    .option('--json', 'Output in JSON format')
    .description('Add a new task')
    .action(async (title, body, options) => {
      const formatter = createFormatter(options);
      try {
        if (!title) {
          formatter.error('Task title is required', () => {
            console.log(chalk.red('Error: Task title is required'));
          });
          process.exit(1);
        }

        let taskBody = body;
        if (options.file) {
          try {
            taskBody = readBodyFromFile(options.file);
          } catch (error) {
            const msg = error instanceof Error ? error.message : 'Error reading file';
            formatter.error(msg, () => {
              console.log(chalk.red(msg));
            });
            process.exit(1);
            return;
          }
        }

        const validationErrors = validateTaskInput({
          title,
          body: taskBody,
          author: options.author,
          assignees: options.assignees,
          status: options.status,
        });
        if (validationErrors.length > 0) {
          const errorMessage = validationErrors.map((e) => e.message).join(', ');
          formatter.error(errorMessage, () => {
            console.log(chalk.red(`\nError: ${errorMessage}\n`));
          });
          process.exit(1);
          return;
        }

        if (!validateTaskStatus(options.status)) {
          const message = `Invalid status: ${options.status}. Valid statuses: icebox, backlog, ready, in_progress, review, done, closed`;
          formatter.error(message, () => {
            console.log(chalk.red(`Invalid status: ${options.status}`));
            console.log('Valid statuses: icebox, backlog, ready, in_progress, review, done, closed');
          });
          process.exit(1);
        }

        if (options.priority && !isPriority(options.priority)) {
          const message = `Invalid priority: ${options.priority}. Valid priorities: critical, high, medium, low`;
          formatter.error(message, () => {
            console.log(chalk.red(`Invalid priority: ${options.priority}`));
            console.log('Valid priorities: critical, high, medium, low');
          });
          process.exit(1);
        }

        let parentId: number | undefined = undefined;
        if (options.parent) {
          const parsed = validateNumberInput(options.parent);
          if (parsed === null) {
            formatter.error('Parent ID must be a number', () => {
              console.log(chalk.red('\nError: Parent ID must be a number\n'));
            });
            process.exit(1);
            return;
          }
          parentId = parsed;
        }

        let blockedByIds: number[] = [];
        let blocksIds: number[] = [];
        try {
          blockedByIds = parseBlockIds(options.blockedBy, 'blocked-by');
          blocksIds = parseBlockIds(options.blocks, 'blocks');
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Invalid block IDs';
          formatter.error(msg, () => {
            console.log(chalk.red(`\nError: ${msg}\n`));
          });
          process.exit(1);
          return;
        }

        const { taskService, taskBlockService } = getServiceContainer();
        const task = taskService.createTask({
          title,
          body: taskBody,
          author: options.author,
          assignees: options.assignees,
          status: options.status as TaskStatus,
          priority: options.priority ? (options.priority as Priority) : undefined,
          parent_id: parentId,
        });

        try {
          addBlockRelationships(taskBlockService, task.id, blockedByIds, blocksIds);
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Error adding block relationships';
          formatter.error(msg, () => {
            console.log(chalk.red(`\n✗ ${msg}\n`));
          });
          process.exit(1);
          return;
        }

        const { parentTask, blockerTasks, blockedTasks } = fetchRelatedTasks(
          taskService,
          task,
          blockedByIds,
          blocksIds
        );
        formatter.output(
          () => buildTaskJsonData(task, parentTask, blockerTasks, blockedTasks),
          () => printTaskCreated(task, parentTask, blockerTasks, blockedTasks)
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
