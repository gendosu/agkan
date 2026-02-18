/**
 * Task block remove command handler
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { TaskService, TaskBlockService } from '../../../services';
import { validateNumberInput } from '../../utils/error-handler';
import { createFormatter } from '../../utils/output-formatter';

export function setupBlockRemoveCommand(program: Command): void {
  const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
  if (!taskCommand) {
    throw new Error('Task command not found');
  }

  let blockCommand = taskCommand.commands.find((cmd) => cmd.name() === 'block');
  if (!blockCommand) {
    blockCommand = taskCommand.command('block').description('Task blocking relationship commands');
  }

  blockCommand
    .command('remove')
    .argument('<blocker-id>', 'Blocker task ID')
    .argument('<blocked-id>', 'Blocked task ID')
    .option('--json', 'Output in JSON format')
    .description('Remove a blocking relationship between tasks')
    .action(async (blockerId, blockedId, options) => {
      const formatter = createFormatter(options);
      try {
        const taskService = new TaskService();
        const taskBlockService = new TaskBlockService();

        // Validate IDs
        const blockerTaskId = validateNumberInput(blockerId);
        const blockedTaskId = validateNumberInput(blockedId);

        if (blockerTaskId === null) {
          formatter.error('Blocker task ID must be a number', () => {
            console.log(chalk.red('\nError: Blocker task ID must be a number\n'));
          });
          process.exit(1);
        }

        if (blockedTaskId === null) {
          formatter.error('Blocked task ID must be a number', () => {
            console.log(chalk.red('\nError: Blocked task ID must be a number\n'));
          });
          process.exit(1);
        }

        // Check if tasks exist
        const blockerTask = taskService.getTask(blockerTaskId);
        if (!blockerTask) {
          formatter.error(`Blocker task with ID ${blockerId} not found`, () => {
            console.log(chalk.red(`\nError: Blocker task with ID ${blockerId} not found\n`));
          });
          process.exit(1);
        }

        const blockedTask = taskService.getTask(blockedTaskId);
        if (!blockedTask) {
          formatter.error(`Blocked task with ID ${blockedId} not found`, () => {
            console.log(chalk.red(`\nError: Blocked task with ID ${blockedId} not found\n`));
          });
          process.exit(1);
        }

        // Remove blocking relationship
        try {
          const result = taskBlockService.removeBlock(blockerTaskId, blockedTaskId);
          if (!result) {
            formatter.error('Blocking relationship does not exist', () => {
              console.log(chalk.red('\n✗ Error: Blocking relationship does not exist\n'));
            });
            process.exit(1);
          }
        } catch (error) {
          formatter.error(error instanceof Error ? error.message : 'An unknown error occurred', () => {
            if (error instanceof Error) {
              console.log(chalk.red(`\n✗ Error: ${error.message}\n`));
            } else {
              console.log(chalk.red('\n✗ An unknown error occurred\n'));
            }
          });
          process.exit(1);
        }

        formatter.output(
          () => ({
            success: true,
            blocker: {
              id: blockerTask.id,
              title: blockerTask.title,
              status: blockerTask.status,
            },
            blocked: {
              id: blockedTask.id,
              title: blockedTask.title,
              status: blockedTask.status,
            },
          }),
          () => {
            console.log(chalk.green('\n✓ Blocking relationship removed successfully\n'));
            console.log(`${chalk.bold('Blocker:')} ${chalk.cyan(`[${blockerTask.id}]`)} ${blockerTask.title}`);
            console.log(`${chalk.bold('Blocked:')} ${chalk.cyan(`[${blockedTask.id}]`)} ${blockedTask.title}`);
            console.log();
          }
        );
      } catch (error) {
        formatter.error(error instanceof Error ? error.message : 'An unknown error occurred', () => {
          if (error instanceof Error) {
            console.log(chalk.red(`\n✗ Error: ${error.message}\n`));
          } else {
            console.log(chalk.red('\n✗ An unknown error occurred\n'));
          }
        });
        process.exit(1);
      }
    });
}
