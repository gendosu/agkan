import { Command } from 'commander';
import { startBoardServer } from '../../board/server';
import { handleError } from '../utils/error-handler';

export function setupBoardCommand(program: Command): void {
  program
    .command('board')
    .description('Start a local Kanban board viewer at localhost')
    .option('-p, --port <number>', 'Port to listen on', '8080')
    .option('-t, --title <text>', 'Board title to display in the header')
    .action((options: { port: string; title?: string }) => {
      try {
        const port = parseInt(options.port, 10);
        if (isNaN(port) || port < 1 || port > 65535) {
          console.error('Invalid port number');
          process.exit(1);
          return;
        }
        startBoardServer(port, options.title);
      } catch (error) {
        handleError(error as Error, {});
      }
    });
}
