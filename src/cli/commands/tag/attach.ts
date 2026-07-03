/**
 * Tag attach command handler (renamed from "task tag add")
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { getServiceContainer } from '../../utils/service-container';
import { createFormatter } from '../../utils/output-formatter';
import { validateIdInput } from '../../utils/error-handler';
import { resolveTag } from '../../utils/tag-resolver';
import { ConflictError } from '../../../errors';
import { notifyBoard } from '../../utils/boardNotify';

export function setupTagAttachCommand(program: Command): void {
  // Find the tag command group
  const tagCommand = program.commands.find((cmd) => cmd.name() === 'tag');
  if (!tagCommand) {
    throw new Error('Tag command not found');
  }

  tagCommand
    .command('attach')
    .argument('<task-id>', 'Task ID')
    .argument('<tag-id-or-name>', 'Tag ID or name')
    .description('Attach a tag to a task')
    .option('--json', 'Output in JSON format')
    .action(async (taskId, tagId, options) => {
      const formatter = createFormatter(options);
      try {
        const { taskService, tagService, taskTagService } = getServiceContainer();

        // Validate task ID
        const parsedTaskId = validateIdInput(taskId, 'Task', options);

        // Check if task exists
        const task = taskService.getTask(parsedTaskId);
        if (!task) {
          formatter.error(`Task with ID ${taskId} not found`, () => {
            console.error(chalk.red(`\nError: Task with ID ${taskId} not found\n`));
          });
          process.exit(1);
        }

        // Resolve tag by ID or name
        const { tag, byId } = resolveTag(tagService, tagId);
        if (!tag) {
          const message = byId ? `Tag with ID ${tagId} not found` : `Tag with name "${tagId}" not found`;
          formatter.error(message, () => {
            console.error(chalk.red(`\nError: ${message}\n`));
          });
          process.exit(1);
        }

        // Add tag to task
        try {
          taskTagService.addTagToTask({ task_id: parsedTaskId, tag_id: tag!.id });
          await notifyBoard();

          formatter.output(
            () => ({
              success: true,
              task: {
                id: task.id,
                title: task.title,
              },
              tag: {
                id: tag.id,
                name: tag.name,
              },
            }),
            () => {
              console.log(chalk.green('\n✓ Tag attached successfully\n'));
              console.log(`${chalk.bold('Task:')} ${chalk.cyan(`[${task.id}]`)} ${task.title}`);
              console.log(`${chalk.bold('Tag:')} ${chalk.cyan(`[${tag.id}]`)} ${tag.name}`);
              console.log();
            }
          );
        } catch (error) {
          if (error instanceof ConflictError) {
            formatter.error('This task already has this tag attached', () => {
              console.error(chalk.red('\n✗ Error: This task already has this tag attached\n'));
            });
          } else if (error instanceof Error) {
            formatter.error(error.message, () => {
              console.error(chalk.red(`\n✗ Error: ${error.message}\n`));
            });
          } else {
            formatter.error('An unknown error occurred', () => {
              console.error(chalk.red('\n✗ An unknown error occurred\n'));
            });
          }
          process.exit(1);
        }
      } catch (error) {
        if (error instanceof Error) {
          formatter.error(error.message, () => {
            console.error(chalk.red(`\n✗ Error: ${error.message}\n`));
          });
        } else {
          formatter.error('An unknown error occurred', () => {
            console.error(chalk.red('\n✗ An unknown error occurred\n'));
          });
        }
        process.exit(1);
      }
    });
}
