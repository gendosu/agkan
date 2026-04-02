import { Command } from 'commander';
import { startBoardServer } from '../../board/server';
import { handleError } from '../utils/error-handler';
import { loadConfig } from '../../db/config';
import { isBoardRunning, spawnBoardDaemon, killBoardProcess, readBoardPid } from '../utils/board-daemon';
import { TaskService } from '../../services/TaskService';
import chalk from 'chalk';

type BoardOptions = { port?: string; title?: string; verbose?: boolean };

function resolvePort(portOption: string | undefined, configPort: number | undefined): number | null {
  const portStr = portOption ?? (configPort !== undefined ? String(configPort) : '8080');
  const port = parseInt(portStr, 10);
  if (isNaN(port) || port < 1 || port > 65535) return null;
  return port;
}

function buildDaemonArgs(port: number, title: string | undefined): string[] {
  const args = ['--port', String(port)];
  if (title) args.push('--title', title);
  return args;
}

function handleStart(options: BoardOptions): void {
  if (isBoardRunning()) {
    console.log('Board server is already running');
    return;
  }
  const config = loadConfig();
  const port = resolvePort(options.port, config.board?.port);
  if (port === null) {
    console.error('Invalid port number');
    process.exit(1);
    return;
  }
  const pid = spawnBoardDaemon(buildDaemonArgs(port, options.title ?? config.board?.title));
  console.log(`Board server started (PID: ${pid}) on http://localhost:${port}`);
}

function handleStop(): void {
  if (!isBoardRunning()) {
    console.log('Board server is not running');
    return;
  }
  if (killBoardProcess()) {
    console.log('Board server stopped');
  } else {
    console.error('Failed to stop board server');
    process.exit(1);
  }
}

function handleRestart(options: BoardOptions): void {
  killBoardProcess();
  const config = loadConfig();
  const port = resolvePort(options.port, config.board?.port);
  if (port === null) {
    console.error('Invalid port number');
    process.exit(1);
    return;
  }
  const pid = spawnBoardDaemon(buildDaemonArgs(port, options.title ?? config.board?.title));
  console.log(`Board server restarted (PID: ${pid}) on http://localhost:${port}`);
}

function printTaskSummary(): void {
  const taskService = new TaskService();
  const counts = taskService.getTaskCountByStatus();

  console.log(chalk.bold('Task Summary:'));
  const statuses: Array<[string, string]> = [
    ['Icebox', 'icebox'],
    ['Backlog', 'backlog'],
    ['Ready', 'ready'],
    ['In Progress', 'in_progress'],
    ['Review', 'review'],
    ['Done', 'done'],
    ['Closed', 'closed'],
  ];

  for (let i = 0; i < statuses.length; i++) {
    const [label, status] = statuses[i];
    const count = counts[status as keyof typeof counts] ?? 0;
    const isLast = i === statuses.length - 1;
    const prefix = isLast ? '└─' : '├─';
    console.log(`${prefix} ${label.padEnd(14)}: ${count}`);
  }
}

async function handleStatus(options: BoardOptions): Promise<void> {
  const config = loadConfig();
  const port = resolvePort(options.port, config.board?.port);
  if (port === null) {
    console.error('Invalid port number');
    process.exit(1);
    return;
  }

  console.log(chalk.bold('Board Status'));
  console.log(chalk.bold('============'));

  // Check server status
  const isRunning = isBoardRunning();
  const pid = readBoardPid();

  if (isRunning && pid) {
    console.log(chalk.green(`✓ Server: RUNNING (PID: ${pid})`));
    console.log(`  Port: ${port}`);
  } else {
    console.log(chalk.red('✗ Server: STOPPED'));
  }

  console.log();

  // Get task summary
  printTaskSummary();
}

function handleForeground(options: BoardOptions): void {
  if (options.verbose) {
    process.env.VERBOSE = 'true';
  }
  const config = loadConfig();
  const port = resolvePort(options.port, config.board?.port);
  if (port === null) {
    console.error('Invalid port number');
    process.exit(1);
    return;
  }
  startBoardServer(port, options.title ?? config.board?.title);
}

// Helper to merge parent and subcommand options
function mergeOptions(subOptions: BoardOptions, parent: Command): BoardOptions {
  const parentOpts: BoardOptions = {};
  const parentCmd = parent.parent;
  if (parentCmd) {
    const opts = (parentCmd.opts && parentCmd.opts()) || {};
    if (opts.port) parentOpts.port = opts.port;
    if (opts.title) parentOpts.title = opts.title;
    if (opts.verbose) parentOpts.verbose = opts.verbose;
  }
  return { ...parentOpts, ...subOptions };
}

function registerStartSubcommand(boardCommand: Command): void {
  boardCommand
    .command('start')
    .description('Start board server as a daemon')
    .option('-p, --port <number>', 'Port to listen on')
    .option('-t, --title <text>', 'Board title to display in the header')
    .action((options: BoardOptions, command: Command) => {
      try {
        const mergedOptions = mergeOptions(options, command);
        handleStart(mergedOptions);
      } catch (error) {
        handleError(error as Error, {});
      }
    });
}

function registerStopSubcommand(boardCommand: Command): void {
  boardCommand
    .command('stop')
    .description('Stop the running board server daemon')
    .action(() => {
      try {
        handleStop();
      } catch (error) {
        handleError(error as Error, {});
      }
    });
}

function registerRestartSubcommand(boardCommand: Command): void {
  boardCommand
    .command('restart')
    .description('Restart the board server daemon')
    .option('-p, --port <number>', 'Port to listen on')
    .option('-t, --title <text>', 'Board title to display in the header')
    .action((options: BoardOptions, command: Command) => {
      try {
        const mergedOptions = mergeOptions(options, command);
        handleRestart(mergedOptions);
      } catch (error) {
        handleError(error as Error, {});
      }
    });
}

function registerStatusSubcommand(boardCommand: Command): void {
  boardCommand
    .command('status')
    .description('Show board server status and task summary')
    .option('-p, --port <number>', 'Port to listen on')
    .action((options: BoardOptions, command: Command) => {
      try {
        const mergedOptions = mergeOptions(options, command);
        void handleStatus(mergedOptions);
      } catch (error) {
        handleError(error as Error, {});
      }
    });
}

export function setupBoardCommand(program: Command): void {
  const boardCommand = program
    .command('board')
    .description('Start a local Kanban board viewer at localhost')
    .option('-p, --port <number>', 'Port to listen on')
    .option('-t, --title <text>', 'Board title to display in the header')
    .option('--verbose', 'Enable verbose logging');

  // Main board command (foreground mode) - no subcommand
  boardCommand.action((options: BoardOptions) => {
    try {
      handleForeground(options);
    } catch (error) {
      handleError(error as Error, {});
    }
  });

  // Register subcommands
  registerStartSubcommand(boardCommand);
  registerStopSubcommand(boardCommand);
  registerRestartSubcommand(boardCommand);
  registerStatusSubcommand(boardCommand);
}
