/**
 * Comment delete command handler
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { CommentService } from '../../../services';
import { validateIdInput } from '../../utils/error-handler';
import { createFormatter } from '../../utils/output-formatter';

export function setupCommentDeleteCommand(program: Command): void {
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
    .command('delete')
    .argument('<comment-id>', 'Comment ID')
    .description('Delete a comment by ID')
    .option('--json', 'Output in JSON format')
    .action(async (commentId, options) => {
      const formatter = createFormatter(options);
      try {
        const commentService = new CommentService();

        // Validate comment ID
        const parsedCommentId = validateIdInput(commentId, 'Comment', options);

        // Delete comment
        const deleted = commentService.deleteComment(parsedCommentId);

        if (!deleted) {
          formatter.error(`Comment with ID ${commentId} not found`, () => {
            console.log(chalk.red(`\nError: Comment with ID ${commentId} not found\n`));
          });
          process.exit(1);
        }

        formatter.output(
          () => ({ success: true, message: 'Comment deleted' }),
          () => {
            console.log(chalk.green(`\n✓ Comment deleted successfully\n`));
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
