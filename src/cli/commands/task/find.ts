/**
 * Task find command handler
 * Note: This command is renamed from "search" to "find"
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { TaskService, TaskTagService } from '../../../services';
import { getStatusColor, formatDate } from '../../../utils/format';
import { createFormatter } from '../../utils/output-formatter';

export function setupTaskFindCommand(program: Command): void {
  const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
  if (!taskCommand) {
    throw new Error('Task command not found');
  }

  taskCommand
    .command('find')
    .argument('<keyword>', 'Search keyword for title and body (LIKE search)')
    .option('--all', 'Include done and closed tasks in search results')
    .option('--json', 'Output in JSON format')
    .description('Search tasks by keyword (excludes done/closed by default)')
    .action(async (keyword, options) => {
      const formatter = createFormatter(options);
      try {
        const taskService = new TaskService();
        const taskTagService = new TaskTagService();

        if (!keyword || keyword.trim() === '') {
          formatter.error('Search keyword is required', () => {
            console.log(chalk.red('\nError: Search keyword is required\n'));
          });
          process.exit(1);
        }

        const tasks = taskService.searchTasks(keyword, options.all || false);

        formatter.output(
          () => {
            if (tasks.length === 0) {
              return {
                keyword: keyword,
                excludeDoneClosed: !options.all,
                totalCount: 0,
                tasks: [],
              };
            }

            // Fetch all task tags at once to avoid N+1 problem
            const allTaskTags = taskTagService.getAllTaskTags();

            const tasksWithRelations = tasks.map((task) => {
              const tags = allTaskTags.get(task.id);
              const parent = task.parent_id ? taskService.getTask(task.parent_id) : null;

              return {
                id: task.id,
                title: task.title,
                body: task.body,
                author: task.author,
                status: task.status,
                parent_id: task.parent_id,
                created_at: task.created_at,
                updated_at: task.updated_at,
                parent: parent
                  ? {
                      id: parent.id,
                      title: parent.title,
                      status: parent.status,
                    }
                  : null,
                tags: tags
                  ? tags.map((tag) => ({
                      id: tag.id,
                      name: tag.name,
                    }))
                  : [],
              };
            });

            return {
              keyword: keyword,
              excludeDoneClosed: !options.all,
              totalCount: tasks.length,
              tasks: tasksWithRelations,
            };
          },
          () => {
            if (tasks.length === 0) {
              console.log(chalk.yellow('\nNo tasks found\n'));
              return;
            }

            const excludeMessage = options.all ? '' : chalk.gray(' (excluding done/closed)');
            console.log(chalk.bold(`\nFound ${tasks.length} task(s) matching "${keyword}"${excludeMessage}:\n`));
            console.log(chalk.bold('─'.repeat(80)));

            tasks.forEach((task, index) => {
              const statusColor = getStatusColor(task.status);

              console.log(`\n${chalk.bold.cyan(`[${task.id}]`)} ${chalk.bold(task.title)}`);
              console.log(`  ${chalk.bold('Status:')} ${chalk[statusColor](task.status)}`);
              if (task.author) {
                console.log(`  ${chalk.bold('Author:')} ${task.author}`);
              }
              console.log(`  ${chalk.bold('Created:')} ${formatDate(task.created_at)}`);

              if (index < tasks.length - 1) {
                console.log(chalk.gray('  ' + '─'.repeat(76)));
              }
            });

            console.log('\n');
          }
        );
      } catch (error) {
        if (error instanceof Error) {
          formatter.error(error.message);
        } else {
          formatter.error('An unknown error occurred', () => {
            console.log(chalk.red('\n✗ An unknown error occurred\n'));
          });
        }
        process.exit(1);
      }
    });
}
