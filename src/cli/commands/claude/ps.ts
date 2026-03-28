/**
 * claude ps command handler
 * Lists currently executing Claude processes via the board server API.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from '../../../db/config';
import { getServiceContainer } from '../../utils/service-container';
import { handleError } from '../../utils/error-handler';
import { createFormatter } from '../../utils/output-formatter';

interface RunningTask {
  taskId: number;
  command: string;
}

interface RunningTasksResponse {
  tasks: RunningTask[];
}

async function fetchRunningTasks(port: number): Promise<RunningTask[]> {
  const url = `http://localhost:${port}/api/claude/running-tasks`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Board server returned status ${response.status}`);
  }
  const data = (await response.json()) as RunningTasksResponse;
  return data.tasks;
}

export function setupClaudePsCommand(program: Command): void {
  const claudeCommand = program.commands.find((cmd) => cmd.name() === 'claude');
  if (!claudeCommand) {
    throw new Error('Claude command group not found');
  }

  claudeCommand
    .command('ps')
    .description('List currently executing Claude processes')
    .option('-p, --port <number>', 'Board server port to connect to')
    .option('--json', 'Output in JSON format')
    .action(async (options: { port?: string; json?: boolean }) => {
      const formatter = createFormatter(options);
      try {
        const config = loadConfig();
        const portStr = options.port ?? (config.board?.port !== undefined ? String(config.board.port) : '8080');
        const port = parseInt(portStr, 10);
        if (isNaN(port) || port < 1 || port > 65535) {
          formatter.error('Invalid port number', () => {
            console.error(chalk.red('Invalid port number'));
          });
          process.exit(1);
        }

        let tasks: RunningTask[];
        try {
          tasks = await fetchRunningTasks(port);
        } catch {
          formatter.error(`Could not connect to board server on port ${port}. Is it running?`, () => {
            console.error(chalk.red(`\n✗ Could not connect to board server on port ${port}. Is it running?\n`));
          });
          return void process.exit(1);
        }

        if (tasks.length === 0) {
          formatter.output(
            () => ({ processes: [] }),
            () => {
              console.log(chalk.yellow('\nNo Claude processes currently running\n'));
            }
          );
          return;
        }

        const { taskService } = getServiceContainer();

        const processes = tasks.map((t) => {
          const task = taskService.getTask(t.taskId);
          return {
            taskId: t.taskId,
            title: task?.title ?? '(unknown)',
            command: t.command,
          };
        });

        formatter.output(
          () => ({ processes }),
          () => {
            console.log(chalk.bold(`\nRunning Claude processes (${processes.length}):\n`));
            console.log(chalk.bold('─'.repeat(60)));
            for (const p of processes) {
              console.log(
                `  ${chalk.bold.cyan(`[${p.taskId}]`)} ${chalk.bold(p.title)} ${chalk.gray(`(${p.command})`)}`
              );
            }
            console.log();
          }
        );
      } catch (error) {
        handleError(error as Error, options);
        process.exit(1);
      }
    });
}
