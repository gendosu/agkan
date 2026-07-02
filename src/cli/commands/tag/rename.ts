/**
 * Tag rename command handler
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { getServiceContainer } from '../../utils/service-container';
import { createFormatter } from '../../utils/output-formatter';
import { resolveTag } from '../../utils/tag-resolver';
import { validateTagInput } from '../../../utils/input-validators';
import { ConflictError } from '../../../errors';

export function setupTagRenameCommand(program: Command): void {
  // Find the tag command group
  const tagCommand = program.commands.find((cmd) => cmd.name() === 'tag');
  if (!tagCommand) {
    throw new Error('Tag command not found');
  }

  tagCommand
    .command('rename')
    .argument('<id-or-name>', 'Tag ID or name')
    .argument('<new-name>', 'New tag name')
    .description('Rename a tag')
    .option('--json', 'Output in JSON format')
    .action(async (id, newName, options) => {
      const formatter = createFormatter(options);
      try {
        const { tagService } = getServiceContainer();

        // Validate new tag name
        const validationErrors = validateTagInput({ name: newName });
        if (validationErrors.length > 0) {
          const errorMessage = validationErrors.map((e) => e.message).join(', ');
          formatter.error(errorMessage, () => {
            console.log(chalk.red(`\nError: ${errorMessage}\n`));
          });
          process.exit(1);
          return;
        }

        // Resolve tag by ID or name
        const { tag, byId } = resolveTag(tagService, id);
        if (!tag) {
          const message = byId ? `Tag with ID ${id} not found` : `Tag with name "${id}" not found`;
          formatter.error(message, () => {
            console.log(chalk.red(`\nError: ${message}\n`));
          });
          process.exit(1);
        }

        // Rename tag
        try {
          const updatedTag = tagService.updateTag(tag!.id, { name: newName.trim() });

          if (!updatedTag) {
            formatter.error('Failed to rename tag', () => {
              console.log(chalk.red('\n✗ Error: Failed to rename tag\n'));
            });
            process.exit(1);
            return;
          }

          formatter.output(
            () => ({
              success: true,
              id: updatedTag.id,
              old_name: tag!.name,
              new_name: updatedTag.name,
            }),
            () => {
              console.log(chalk.green('\n✓ Tag renamed successfully\n'));
              console.log(`${chalk.bold('ID:')} ${chalk.cyan(updatedTag.id)}`);
              console.log(`${chalk.bold('Old Name:')} ${tag!.name}`);
              console.log(`${chalk.bold('New Name:')} ${updatedTag.name}`);
              console.log();
            }
          );
        } catch (error) {
          if (error instanceof ConflictError) {
            formatter.error(`Tag "${newName}" already exists`, () => {
              console.log(chalk.red(`\n✗ Error: Tag "${newName}" already exists\n`));
            });
          } else if (error instanceof Error) {
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
