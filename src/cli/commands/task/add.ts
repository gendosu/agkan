/**
 * Task add command handler
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { TaskService, TaskBlockService } from '../../../services';
import { TaskStatus } from '../../../models';
import { handleError, validateNumberInput } from '../../utils/error-handler';
import { validateTaskStatus } from '../../utils/validators';
import { validateTaskInput } from '../../../utils/input-validators';
import { createFormatter } from '../../utils/output-formatter';
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
    .option('-s, --status <status>', 'Task status (backlog, ready, in_progress, review, done, closed)', 'backlog')
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
          const message = `Invalid status: ${options.status}. Valid statuses: backlog, ready, in_progress, review, done, closed`;
          formatter.error(message, () => {
            console.log(chalk.red(`Invalid status: ${options.status}`));
            console.log('Valid statuses: backlog, ready, in_progress, review, done, closed');
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

        const taskService = new TaskService();
        const task = taskService.createTask({
          title,
          body: taskBody,
          author: options.author,
          status: options.status as TaskStatus,
          parent_id: parentId,
        });

        try {
          addBlockRelationships(new TaskBlockService(), task.id, blockedByIds, blocksIds);
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
