/**
 * Tag delete command handler
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { getServiceContainer } from '../../utils/service-container';
import { createFormatter } from '../../utils/output-formatter';
import { resolveTag } from '../../utils/tag-resolver';
import { Tag } from '../../../models';
import { TagDeleteImpact } from '../../../services';

function printResult(tag: Tag, impact: TagDeleteImpact, dryRun: boolean): void {
  if (dryRun) {
    console.log(chalk.bold('\n[Dry Run] Tag would be deleted\n'));
  } else {
    console.log(chalk.green('\n✓ Tag deleted successfully\n'));
  }
  console.log(`${chalk.bold('ID:')} ${chalk.cyan(tag.id)}`);
  console.log(`${chalk.bold('Name:')} ${tag.name}`);
  console.log(`${chalk.bold('Impact:')} ${impact.taskCount} task(s) will lose this tag association`);
  console.log();
}

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
    .option('--dry-run', 'Preview the impact of deletion without deleting the tag')
    .option('--json', 'Output in JSON format')
    .action(async (id, options) => {
      const formatter = createFormatter(options);
      try {
        const { tagService } = getServiceContainer();

        // Resolve tag by ID or name
        const { tag, byId } = resolveTag(tagService, id);
        if (!tag) {
          const message = byId ? `Tag with ID ${id} not found` : `Tag with name "${id}" not found`;
          formatter.error(message, () => {
            console.error(chalk.red(`\nError: ${message}\n`));
          });
          process.exit(1);
          return;
        }

        const impact = tagService.getTagDeleteImpact(tag.id)!;
        const dryRun: boolean = !!options.dryRun;

        // Delete tag
        try {
          tagService.deleteTag(tag.id, dryRun);

          formatter.output(
            () => ({
              success: !dryRun,
              dryRun,
              id: tag.id,
              name: tag.name,
              impact,
            }),
            () => printResult(tag, impact, dryRun)
          );
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
