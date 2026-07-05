/**
 * Task delete command handler
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { getServiceContainer } from '../../utils/service-container';
import { handleError, validateNumberInput } from '../../utils/error-handler';
import { createFormatter } from '../../utils/output-formatter';
import { TaskDeleteImpact } from '../../../services';

/** Human-readable summary of the records a task delete will affect */
function formatImpact(impact: TaskDeleteImpact): string {
  const parts: string[] = [];
  if (impact.childCount > 0) parts.push(`${impact.childCount} child task(s) will be orphaned (parent_id cleared)`);
  if (impact.commentCount > 0) parts.push(`${impact.commentCount} comment(s) will be deleted`);
  if (impact.tagCount > 0) parts.push(`${impact.tagCount} tag association(s) will be removed`);
  if (impact.metadataCount > 0) parts.push(`${impact.metadataCount} metadata entry(ies) will be deleted`);
  if (impact.blockCount > 0) parts.push(`${impact.blockCount} block relationship(s) will be removed`);
  return parts.length > 0 ? parts.join(', ') : 'no related data';
}

function printResult(taskId: number, impact: TaskDeleteImpact, dryRun: boolean): void {
  if (dryRun) {
    console.log(chalk.bold(`\n[Dry Run] Task #${taskId} would be deleted\n`));
  } else {
    console.log(chalk.green(`\n✓ Task #${taskId} deleted successfully\n`));
  }
  console.log(`${chalk.bold('Impact:')} ${formatImpact(impact)}`);
  console.log('');
}

export function setupTaskDeleteCommand(program: Command): void {
  const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
  if (!taskCommand) {
    throw new Error('Task command not found');
  }

  taskCommand
    .command('delete')
    .argument('<id>', 'Task ID')
    .option('--dry-run', 'Preview the impact of deletion without deleting the task')
    .option('--json', 'Output in JSON format')
    .description('Delete a task')
    .action(async (id, options) => {
      const formatter = createFormatter(options);
      try {
        const { taskService } = getServiceContainer();

        const taskId = validateNumberInput(id);
        if (taskId === null) {
          formatter.error('Task ID must be a number', () => {
            console.error(chalk.red('\nError: Task ID must be a number\n'));
          });
          process.exit(1);
        }

        const impact = taskService.getTaskDeleteImpact(taskId);
        if (!impact) {
          formatter.error(`Task with ID ${id} not found`, () => {
            console.error(chalk.red(`\nTask with ID ${id} not found\n`));
          });
          process.exit(1);
          return;
        }

        const dryRun: boolean = !!options.dryRun;

        if (!dryRun) {
          const deleted = taskService.deleteTask(taskId);
          if (!deleted) {
            formatter.error(`Task with ID ${id} not found`, () => {
              console.error(chalk.red(`\nTask with ID ${id} not found\n`));
            });
            process.exit(1);
            return;
          }
        }

        formatter.output(
          () => ({ success: !dryRun, dryRun, id: taskId, impact }),
          () => printResult(taskId, impact, dryRun)
        );
      } catch (error) {
        if (error instanceof Error) {
          handleError(error, options);
        } else {
          formatter.error('An unknown error occurred', () => {
            console.error(chalk.red('\n✗ An unknown error occurred\n'));
          });
        }
        process.exit(1);
      }
    });
}
