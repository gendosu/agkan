import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig, resolveDatabasePath } from '../../../db/config';
import { createFormatter } from '../../utils/output-formatter';

export const DEFAULT_BOARD_PORT = 8080;

type ResolvedConfig = {
  path: string;
  board: {
    port: number;
    title: string | undefined;
  };
  models: {
    planning: { model?: string; effort?: string } | undefined;
    run: { model?: string; effort?: string } | undefined;
  };
};

function buildResolvedConfig(): ResolvedConfig {
  const config = loadConfig();
  return {
    path: resolveDatabasePath(),
    board: {
      port: config.board?.port ?? DEFAULT_BOARD_PORT,
      title: config.board?.title,
    },
    models: {
      planning: config.models?.planning,
      run: config.models?.run,
    },
  };
}

function resolveDotNotation(obj: unknown, key: string): unknown {
  const parts = key.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function setupConfigGetCommand(program: Command): void {
  let configCommand = program.commands.find((cmd) => cmd.name() === 'config');
  if (!configCommand) {
    configCommand = program.command('config').description('Config management commands');
  }

  configCommand
    .command('get')
    .argument('[key]', 'Config key in dot notation (e.g. board.port)')
    .description('Get resolved config values from .agkan.yml')
    .option('--json', 'Output in JSON format')
    .action((key, options) => {
      const formatter = createFormatter(options);
      try {
        const resolved = buildResolvedConfig();

        if (key) {
          const value = resolveDotNotation(resolved, key);
          if (value === undefined) {
            formatter.error(`Config key "${key}" not found`, () => {
              console.log(chalk.red(`\nError: Config key "${key}" not found\n`));
            });
            process.exit(1);
          }
          formatter.output(
            () => ({ success: true, key, value }),
            () => {
              console.log(String(value));
            }
          );
        } else {
          formatter.output(
            () => ({ success: true, config: resolved }),
            () => {
              console.log(chalk.green('\n✓ Resolved config\n'));
              console.log(`path: ${resolved.path}`);
              console.log(`board.port: ${resolved.board.port}`);
              if (resolved.board.title !== undefined) {
                console.log(`board.title: ${resolved.board.title}`);
              }
              if (resolved.models.planning) {
                if (resolved.models.planning.model)
                  console.log(`models.planning.model: ${resolved.models.planning.model}`);
                if (resolved.models.planning.effort)
                  console.log(`models.planning.effort: ${resolved.models.planning.effort}`);
              }
              if (resolved.models.run) {
                if (resolved.models.run.model) console.log(`models.run.model: ${resolved.models.run.model}`);
                if (resolved.models.run.effort) console.log(`models.run.effort: ${resolved.models.run.effort}`);
              }
              console.log('');
            }
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        formatter.error(message, () => {
          console.log(chalk.red(`\nError: ${message}\n`));
        });
        process.exit(1);
      }
    });
}
