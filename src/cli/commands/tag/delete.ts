/**
 * Tag delete command handler
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { TagService } from '../../../services';
import { Tag } from '../../../models';
import { createFormatter } from '../../utils/output-formatter';
import { validateNumberInput } from '../../utils/error-handler';

export function setupTagDeleteCommand(program: Command): void {
  // Find the tag command group
  const tagCommand = program.commands.find((cmd) => cmd.name() === 'tag');
  if (!tagCommand) {
    throw new Error('Tag command not found');
  }

  tagCommand
    .command('delete')
    .argument('<id-or-name>', 'Tag ID or name')
    .description('Delete a tag')
    .option('--json', 'Output in JSON format')
    .action(async (id, options) => {
      const formatter = createFormatter(options);
      try {
        const tagService = new TagService();

        // Resolve tag by ID or name
        const parsedTagId = validateNumberInput(id);
        let tag: Tag | null = null;
        if (parsedTagId !== null) {
          tag = tagService.getTag(parsedTagId);
          if (!tag) {
            formatter.error(`Tag with ID ${id} not found`, () => {
              console.log(chalk.red(`\nError: Tag with ID ${id} not found\n`));
            });
            process.exit(1);
          }
        } else {
          tag = tagService.getTagByName(id);
          if (!tag) {
            formatter.error(`Tag with name "${id}" not found`, () => {
              console.log(chalk.red(`\nError: Tag with name "${id}" not found\n`));
            });
            process.exit(1);
          }
        }

        // Delete tag
        try {
          tagService.deleteTag(tag!.id);

          formatter.output(
            () => ({
              success: true,
              id: tag.id,
              name: tag.name,
            }),
            () => {
              console.log(chalk.green('\n✓ Tag deleted successfully\n'));
              console.log(`${chalk.bold('ID:')} ${chalk.cyan(tag.id)}`);
              console.log(`${chalk.bold('Name:')} ${tag.name}`);
              console.log();
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
