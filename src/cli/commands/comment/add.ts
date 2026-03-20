/**
 * Comment add command handler
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { getServiceContainer } from '../../utils/service-container';
import { validateIdInput } from '../../utils/error-handler';
import { createFormatter } from '../../utils/output-formatter';
import { formatDate } from '../../../utils/format';

export function setupCommentAddCommand(program: Command): void {
  // Find or create task command
  let taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
  if (!taskCommand) {
    taskCommand = program.command('task').description('Task management commands');
  }

  // Find or create comment command group
  let commentCommand = taskCommand.commands.find((cmd) => cmd.name() === 'comment');
  if (!commentCommand) {
    commentCommand = taskCommand.command('comment').description('Task comment commands');
  }

  commentCommand
    .command('add')
    .argument('<task-id>', 'Task ID')
    .argument('<content>', 'Comment content')
    .description('Add a comment to a task')
    .option('--author <author>', 'Comment author')
    .option('--json', 'Output in JSON format')
    .action(async (taskId, content, options) => {
      const formatter = createFormatter(options);
      try {
        const { taskService, commentService } = getServiceContainer();

        // Validate task ID
        const parsedTaskId = validateIdInput(taskId, 'Task', options);

        // Check if task exists
        const task = taskService.getTask(parsedTaskId);
        if (!task) {
          formatter.error(`Task with ID ${taskId} not found`, () => {
            console.log(chalk.red(`\nError: Task with ID ${taskId} not found\n`));
          });
          process.exit(1);
        }

        // Add comment (validation is done in CommentService)
        const comment = commentService.addComment({
          task_id: parsedTaskId,
          content,
          author: options.author,
        });

        formatter.output(
          () => ({ success: true, data: comment }),
          () => {
            console.log(chalk.green(`\n✓ Comment added successfully\n`));
            console.log(`ID: ${comment.id}`);
            if (comment.author) {
              console.log(`Author: ${comment.author}`);
            }
            console.log(`Content: ${comment.content}`);
            console.log(`Created: ${formatDate(comment.created_at)}\n`);
          }
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        formatter.error(message, () => {
          console.log(chalk.red(`\nError: ${message}\n`));
        });
        process.exit(1);
      }
    });
}
