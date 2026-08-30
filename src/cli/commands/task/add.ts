/**
 * Task add command handler
 */

import { Command } from 'commander';
import chalk from 'chalk';

import { Task, TaskStatus } from '../../../models';
import { Priority, isPriority } from '../../../models/Priority';
import { handleError, validateNumberInput } from '../../utils/error-handler';
import { validateTaskStatus } from '../../utils/validators';
import { validateTaskInput } from '../../../utils/input-validators';
import { createFormatter } from '../../utils/output-formatter';
import { getServiceContainer } from '../../utils/service-container';
import { getStorageBackend } from '../../../db/connection';
import {
  readBodyFromFile,
  parseBlockIds,
  resolveTagIds,
  addBlockRelationships,
  fetchRelatedTasks,
  buildTaskJsonData,
  printTaskCreated,
  validateModelEffortOptions,
} from './add-helpers';
import { MODEL_ALIASES, VALID_EFFORT_LEVELS } from '../../../board/claudePromptBuilder';

/** Marker error used to distinguish block-relationship failures from other errors thrown within the transaction */
class BlockRelationshipError extends Error {}

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
    .option('-p, --priority <priority>', 'Task priority (critical, high, medium, low)', 'medium')
    .option('--parent <id>', 'Parent task ID')
    .option('--file <path>', 'Read body from markdown file')
    .option('--branch <branch>', 'Git branch name for the task')
    .option('--model-planning <alias>', `Claude model for planning runs (${MODEL_ALIASES.join(', ')})`)
    .option('--model-run <alias>', `Claude model for implementation runs (${MODEL_ALIASES.join(', ')})`)
    .option('--effort-planning <level>', `Reasoning effort for planning runs (${VALID_EFFORT_LEVELS.join(', ')})`)
    .option('--effort-run <level>', `Reasoning effort for implementation runs (${VALID_EFFORT_LEVELS.join(', ')})`)
    .option('--blocked-by <ids>', 'Comma-separated task IDs that block this task')
    .option('--blocks <ids>', 'Comma-separated task IDs that this task blocks')
    .option('--tag <names-or-ids>', 'Comma-separated tag names or IDs to attach')
    .option('--json', 'Output in JSON format')
    .description('Add a new task')
    .action(async (title, body, options) => {
      const formatter = createFormatter(options);
      try {
        if (!title) {
          formatter.error('Task title is required', () => {
            console.error(chalk.red('Error: Task title is required'));
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
              console.error(chalk.red(msg));
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
            console.error(chalk.red(`\nError: ${errorMessage}\n`));
          });
          process.exit(1);
          return;
        }

        if (!validateTaskStatus(options.status)) {
          const message = `Invalid status: ${options.status}. Valid statuses: icebox, backlog, ready, in_progress, review, done, closed`;
          formatter.error(message, () => {
            console.error(chalk.red(`Invalid status: ${options.status}`));
            console.error('Valid statuses: icebox, backlog, ready, in_progress, review, done, closed');
          });
          process.exit(1);
        }

        if (options.priority && !isPriority(options.priority)) {
          const message = `Invalid priority: ${options.priority}. Valid priorities: critical, high, medium, low`;
          formatter.error(message, () => {
            console.error(chalk.red(`Invalid priority: ${options.priority}`));
            console.error('Valid priorities: critical, high, medium, low');
          });
          process.exit(1);
        }

        const modelEffortError = validateModelEffortOptions(options);
        if (modelEffortError) {
          formatter.error(modelEffortError, () => {
            console.error(chalk.red(`\nError: ${modelEffortError}\n`));
          });
          process.exit(1);
          return;
        }

        let parentId: number | undefined = undefined;
        if (options.parent) {
          const parsed = validateNumberInput(options.parent);
          if (parsed === null) {
            formatter.error('Parent ID must be a number', () => {
              console.error(chalk.red('\nError: Parent ID must be a number\n'));
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
            console.error(chalk.red(`\nError: ${msg}\n`));
          });
          process.exit(1);
          return;
        }

        const { taskService, taskBlockService, taskTagService, tagService } = getServiceContainer();

        let tagIds: number[] = [];
        try {
          tagIds = resolveTagIds(tagService, options.tag);
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Invalid tag';
          formatter.error(msg, () => {
            console.error(chalk.red(`\nError: ${msg}\n`));
          });
          process.exit(1);
          return;
        }
        const backend = getStorageBackend();

        // Wrap task creation and block relationship setup in a single transaction
        // so a failure in addBlockRelationships rolls back the created task instead
        // of leaving an orphaned task behind.
        let task: Task;
        try {
          task = backend.transaction(() => {
            const created = taskService.createTask({
              title,
              body: taskBody,
              author: options.author,
              assignees: options.assignees,
              status: options.status as TaskStatus,
              priority: options.priority ? (options.priority as Priority) : undefined,
              parent_id: parentId,
              branch: options.branch ?? null,
              model_planning: options.modelPlanning ?? null,
              model_run: options.modelRun ?? null,
              effort_planning: options.effortPlanning ?? null,
              effort_run: options.effortRun ?? null,
              tagIds,
            });

            try {
              addBlockRelationships(taskBlockService, created.id, blockedByIds, blocksIds);
            } catch (error) {
              throw new BlockRelationshipError(
                error instanceof Error ? error.message : 'Error adding block relationships'
              );
            }

            return created;
          });
        } catch (error) {
          if (error instanceof BlockRelationshipError) {
            const msg = error.message;
            formatter.error(msg, () => {
              console.error(chalk.red(`\n✗ ${msg}\n`));
            });
            process.exit(1);
            return;
          }
          throw error;
        }

        const { parentTask, blockerTasks, blockedTasks } = fetchRelatedTasks(
          taskService,
          task,
          blockedByIds,
          blocksIds
        );
        const tags = taskTagService.getTagsForTask(task.id);
        formatter.output(
          () => buildTaskJsonData(task, parentTask, blockerTasks, blockedTasks, tags),
          () => printTaskCreated(task, parentTask, blockerTasks, blockedTasks, tags)
        );
      } catch (error) {
        if (error instanceof Error) {
          handleError(error, options);
        } else {
          formatter.error('An unknown error occurred', () => {
            console.error(chalk.red('\n✗ An unknown error occurred\n'));
          });
        }
        process.exit(1);
      }
    });
}
