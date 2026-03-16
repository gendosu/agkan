import { Command } from 'commander';
import { startBoardServer } from '../../board/server';
import { handleError } from '../utils/error-handler';
import { loadConfig } from '../../db/config';

export function setupBoardCommand(program: Command): void {
  program
    .command('board')
    .description('Start a local Kanban board viewer at localhost')
    .option('-p, --port <number>', 'Port to listen on')
    .option('-t, --title <text>', 'Board title to display in the header')
    .action((options: { port?: string; title?: string }) => {
      try {
        const config = loadConfig();
        const configPort = config.board?.port;
        const configTitle = config.board?.title;

        const portStr = options.port ?? (configPort !== undefined ? String(configPort) : '8080');
        const port = parseInt(portStr, 10);
        if (isNaN(port) || port < 1 || port > 65535) {
          console.error('Invalid port number');
          process.exit(1);
        } else {
          const title = options.title ?? configTitle;
          startBoardServer(port, title);
        }
      } catch (error) {
        handleError(error as Error, {});
      }
    });
}
