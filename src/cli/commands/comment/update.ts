/**
 * Comment update command handler
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { getServiceContainer } from '../../utils/service-container';
import { validateIdInput } from '../../utils/error-handler';
import { createFormatter } from '../../utils/output-formatter';
import { formatDate } from '../../../utils/format';

export function setupCommentUpdateCommand(program: Command): void {
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
    .command('update')
    .argument('<comment-id>', 'Comment ID')
    .argument('<content>', 'New comment content')
    .description('Update a comment by ID')
    .option('--json', 'Output in JSON format')
    .action(async (commentId, content, options) => {
      const formatter = createFormatter(options);
      try {
        const { commentService } = getServiceContainer();

        // Validate comment ID
        const parsedCommentId = validateIdInput(commentId, 'Comment', options);

        // Update comment (validation is done in CommentService)
        const comment = commentService.updateComment(parsedCommentId, content);

        if (!comment) {
          formatter.error(`Comment with ID ${commentId} not found`, () => {
            console.error(chalk.red(`\nError: Comment with ID ${commentId} not found\n`));
          });
          process.exit(1);
        }

        formatter.output(
          () => ({ success: true, data: comment }),
          () => {
            console.log(chalk.green(`\n✓ Comment updated successfully\n`));
            console.log(`ID: ${comment.id}`);
            if (comment.author) {
              console.log(`Author: ${comment.author}`);
            }
            console.log(`Content: ${comment.content}`);
            console.log(`Updated: ${formatDate(comment.updated_at)}\n`);
          }
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        formatter.error(message, () => {
          console.error(chalk.red(`\nError: ${message}\n`));
        });
        process.exit(1);
      }
    });
}
