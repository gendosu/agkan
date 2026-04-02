import { Command } from 'commander';
import { startBoardServer } from '../../board/server';
import { handleError } from '../utils/error-handler';
import { loadConfig } from '../../db/config';
import { isBoardRunning, spawnBoardDaemon, killBoardProcess } from '../utils/board-daemon';

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

export function setupBoardCommand(program: Command): void {
  program
    .command('board')
    .description('Start a local Kanban board viewer at localhost')
    .argument('[subcommand]', 'Daemon command: start, stop, or restart')
    .option('-p, --port <number>', 'Port to listen on')
    .option('-t, --title <text>', 'Board title to display in the header')
    .option('--verbose', 'Enable verbose logging')
    .action((subcommand: string | undefined, options: BoardOptions) => {
      try {
        if (subcommand === 'start') {
          handleStart(options);
        } else if (subcommand === 'stop') {
          handleStop();
        } else if (subcommand === 'restart') {
          handleRestart(options);
        } else if (!subcommand) {
          handleForeground(options);
        } else {
          console.error(`Unknown subcommand: ${subcommand}. Use start, stop, or restart.`);
          process.exit(1);
        }
      } catch (error) {
        handleError(error as Error, {});
      }
    });
}
