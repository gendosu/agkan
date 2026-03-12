/**
 * Comment list command handler
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { TaskService, CommentService } from '../../../services';
import { validateIdInput } from '../../utils/error-handler';
import { createFormatter } from '../../utils/output-formatter';
import { formatDate } from '../../../utils/format';

export function setupCommentListCommand(program: Command): void {
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
    .command('list')
    .argument('<task-id>', 'Task ID')
    .description('List all comments for a task')
    .option('--json', 'Output in JSON format')
    .action(async (taskId, options) => {
      const formatter = createFormatter(options);
      try {
        const taskService = new TaskService();
        const commentService = new CommentService();

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

        // List comments
        const comments = commentService.listComments(parsedTaskId);

        formatter.output(
          () => ({ success: true, data: comments }),
          () => {
            if (comments.length === 0) {
              console.log(chalk.yellow(`\nNo comments found for task #${parsedTaskId}\n`));
            } else {
              console.log(chalk.green(`\n✓ Comments for task #${parsedTaskId}\n`));
              comments.forEach((comment) => {
                const author = comment.author ? `[${comment.author}]` : '[anonymous]';
                console.log(`#${comment.id} ${author} ${formatDate(comment.created_at)}`);
                console.log(`  ${comment.content}`);
                console.log();
              });
            }
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
