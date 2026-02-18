/**
 * Tag add command handler (renamed from "tag create")
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { TagService } from '../../../services';
import { formatDate } from '../../../utils/format';
import { createFormatter } from '../../utils/output-formatter';
import { validateTagInput } from '../../../utils/input-validators';

export function setupTagAddCommand(program: Command): void {
  // Find the tag command group
  const tagCommand = program.commands.find((cmd) => cmd.name() === 'tag');
  if (!tagCommand) {
    throw new Error('Tag command not found');
  }

  tagCommand
    .command('add')
    .argument('<name>', 'Tag name')
    .description('Create a new tag')
    .option('--json', 'Output in JSON format')
    .action(async (name, options) => {
      const formatter = createFormatter(options);

      try {
        const tagService = new TagService();

        // Verify tag name is not empty
        if (!name || name.trim() === '') {
          formatter.error('Tag name cannot be empty', () => {
            console.log(chalk.red('\nError: Tag name cannot be empty\n'));
          });
          process.exit(1);
        }

        // Validate tag input fields
        const validationErrors = validateTagInput({ name });
        if (validationErrors.length > 0) {
          const errorMessage = validationErrors.map((e) => e.message).join(', ');
          formatter.error(errorMessage, () => {
            console.log(chalk.red(`\nError: ${errorMessage}\n`));
          });
          process.exit(1);
          return;
        }

        // Create tag
        try {
          const tag = tagService.createTag({ name: name.trim() });

          formatter.output(
            () => ({
              success: true,
              id: tag.id,
              name: tag.name,
              created_at: tag.created_at,
            }),
            () => {
              console.log(chalk.green('\n✓ Tag created successfully\n'));
              console.log(`${chalk.bold('ID:')} ${chalk.cyan(tag.id)}`);
              console.log(`${chalk.bold('Name:')} ${tag.name}`);
              console.log(`${chalk.bold('Created:')} ${formatDate(tag.created_at)}`);
              console.log();
            }
          );
        } catch (error) {
          if (error instanceof Error) {
            if (error.message.includes('already exists') || error.message.includes('UNIQUE constraint')) {
              formatter.error(`Tag "${name}" already exists`, () => {
                console.log(chalk.red(`\n✗ Error: Tag "${name}" already exists\n`));
              });
            } else {
              formatter.error(error.message, () => {
                console.log(chalk.red(`\n✗ Error: ${error.message}\n`));
              });
            }
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
