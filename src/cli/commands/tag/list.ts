/**
 * Tag list command handler
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { TagService, TaskTagService } from '../../../services';
import { formatDate } from '../../../utils/format';
import { createFormatter } from '../../utils/output-formatter';

export function setupTagListCommand(program: Command): void {
  // Find the tag command group
  const tagCommand = program.commands.find((cmd) => cmd.name() === 'tag');
  if (!tagCommand) {
    throw new Error('Tag command not found');
  }

  tagCommand
    .command('list')
    .description('List all tags')
    .option('--json', 'Output in JSON format')
    .action(async (options) => {
      const formatter = createFormatter(options);
      try {
        const tagService = new TagService();
        const taskTagService = new TaskTagService();

        const tags = tagService.listTags();

        formatter.output(
          () => {
            const tagsWithCount = tags.map((tag) => {
              const taskIds = taskTagService.getTaskIdsForTag(tag.id);
              return {
                id: tag.id,
                name: tag.name,
                created_at: tag.created_at,
                taskCount: taskIds.length,
              };
            });

            return {
              totalCount: tags.length,
              tags: tagsWithCount,
            };
          },
          () => {
            // Normal output
            if (tags.length === 0) {
              console.log(chalk.yellow('\nNo tags found\n'));
              return;
            }

            console.log(chalk.bold(`\nFound ${tags.length} tag(s):\n`));
            console.log(chalk.bold('═'.repeat(80)));

            tags.forEach((tag, index) => {
              const taskIds = taskTagService.getTaskIdsForTag(tag.id);
              const taskCount = taskIds.length;

              console.log(`\n${chalk.cyan(`[${tag.id}]`)} ${chalk.bold(tag.name)}`);
              console.log(`  ${chalk.bold('Tasks:')} ${taskCount}`);
              console.log(`  ${chalk.bold('Created:')} ${formatDate(tag.created_at)}`);

              if (index < tags.length - 1) {
                console.log(chalk.gray('  ' + '─'.repeat(76)));
              }
            });

            console.log('\n');
          }
        );
      } catch (error) {
        if (error instanceof Error) {
          formatter.error(error.message, () => {
            console.log(chalk.red(`\n✗ Error: ${error.message}\n`));
          });
        } else {
          formatter.error('An unknown error occurred', () => {
            console.log(chalk.red('\n✗ An unknown error occurred\n'));
          });
        }
        process.exit(1);
      }
    });
}
