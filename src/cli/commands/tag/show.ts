/**
 * Tag show command handler (renamed from "task tag list")
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { TaskService, TaskTagService } from '../../../services';
import { getStatusColor } from '../../../utils/format';
import { validateIdInput } from '../../utils/error-handler';
import { createFormatter } from '../../utils/output-formatter';

export function setupTagShowCommand(program: Command): void {
  // Find the tag command group
  const tagCommand = program.commands.find((cmd) => cmd.name() === 'tag');
  if (!tagCommand) {
    throw new Error('Tag command not found');
  }

  tagCommand
    .command('show')
    .argument('<task-id>', 'Task ID')
    .option('--json', 'Output in JSON format')
    .description('Show all tags attached to a task')
    .action(async (taskId, options) => {
      const formatter = createFormatter(options);
      try {
        const taskService = new TaskService();
        const taskTagService = new TaskTagService();

        // Validate ID
        const parsedTaskId = validateIdInput(taskId, 'Task', options);

        // Check if task exists
        const task = taskService.getTask(parsedTaskId);
        if (!task) {
          formatter.error(`Task with ID ${taskId} not found`, () => {
            console.log(chalk.red(`\nError: Task with ID ${taskId} not found\n`));
          });
          process.exit(1);
        }

        // Get task tags
        const tags = taskTagService.getTagsForTask(parsedTaskId);

        formatter.output(
          () => ({
            task: {
              id: task.id,
              title: task.title,
              status: task.status,
            },
            tags: tags.map((tag) => ({
              id: tag.id,
              name: tag.name,
            })),
          }),
          () => {
            // Standard output
            const statusColor = getStatusColor(task.status);

            console.log(chalk.bold(`\nTags for Task #${task.id}`));
            console.log(chalk.bold('═'.repeat(80)));
            console.log(`${chalk.bold('Title:')} ${task.title}`);
            console.log(`${chalk.bold('Status:')} ${chalk[statusColor](task.status)}`);
            console.log();

            if (tags.length > 0) {
              console.log(chalk.bold(`Tags: ${tags.length} tag(s)`));
              tags.forEach((tag) => {
                console.log(`  ${chalk.cyan('•')} ${chalk.cyan(`[${tag.id}]`)} ${tag.name}`);
              });
            } else {
              console.log(chalk.yellow('No tags attached'));
            }

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
    });
}
