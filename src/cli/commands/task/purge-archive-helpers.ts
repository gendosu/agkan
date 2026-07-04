/**
 * Shared setup logic for the task purge and task archive commands.
 * The two commands are identical apart from the verb used in messages
 * and which TaskService method they call.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { getServiceContainer } from '../../utils/service-container';
import { Task, TaskStatus } from '../../../models';
import { handleError } from '../../utils/error-handler';
import { validateTaskStatus } from '../../utils/validators';
import { createFormatter } from '../../utils/output-formatter';
import { formatDate } from '../../../utils/format';
import { daysAgoIso } from '../../../utils/date';

/** Default number of days before which tasks are eligible for purge/archive */
const DEFAULT_DAYS_BEFORE = 3;

/**
 * Resolve and validate the --before option value.
 * Returns an ISO date string, or null on validation failure.
 */
function resolveBeforeDate(before: string | undefined): { date: string } | { error: string } {
  if (!before) {
    return { date: daysAgoIso(DEFAULT_DAYS_BEFORE) };
  }
  const parsed = new Date(before);
  if (isNaN(parsed.getTime())) {
    return { error: `Invalid date: ${before}. Use ISO 8601 format, e.g. 2026-01-01` };
  }
  return { date: parsed.toISOString() };
}

/**
 * Resolve and validate the --status option value.
 * Returns an array of TaskStatus values, or an error string.
 */
function resolveStatuses(statusOption: string): { statuses: TaskStatus[] } | { error: string } {
  const parts = statusOption
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');

  if (parts.length === 0) {
    return { error: 'No statuses specified. Provide at least one status.' };
  }

  for (const s of parts) {
    if (!validateTaskStatus(s)) {
      return {
        error: `Invalid status: ${s}. Valid statuses: icebox, backlog, ready, in_progress, review, done, closed`,
      };
    }
  }

  return { statuses: parts as TaskStatus[] };
}

export interface PurgeArchiveCommandConfig {
  /** Subcommand name, e.g. 'purge' or 'archive' */
  commandName: string;
  /** Present-tense verb used in messages, e.g. 'purge' or 'archive' */
  verb: string;
  /** Past-tense verb used in messages, e.g. 'Purged' or 'Archived' */
  pastVerb: string;
  /** Command description shown in --help */
  description: string;
  /** Help text for the --before option */
  beforeHelp: string;
  /** TaskService method to invoke */
  serviceMethod: (
    taskService: ReturnType<typeof getServiceContainer>['taskService'],
    beforeDate: string,
    statuses: TaskStatus[],
    dryRun: boolean
  ) => Task[];
}

/**
 * Print human-readable purge/archive result.
 */
function printResult(config: PurgeArchiveCommandConfig, tasks: Task[], beforeDate: string, dryRun: boolean): void {
  if (tasks.length === 0) {
    console.log(chalk.yellow(`\nNo tasks matched the ${config.verb} criteria.\n`));
    return;
  }

  if (dryRun) {
    console.log(
      chalk.bold(`\n[Dry Run] ${tasks.length} task(s) would be ${config.verb}d (updated before ${beforeDate}):\n`)
    );
  } else {
    console.log(chalk.green(`\n✓ ${config.pastVerb} ${tasks.length} task(s) (updated before ${beforeDate}):\n`));
  }

  for (const t of tasks) {
    console.log(
      `  ${chalk.bold.cyan(`[${t.id}]`)} ${chalk.bold(t.title)} ` +
        `${chalk.gray(`(${t.status})`)} ${chalk.gray('updated:')} ${formatDate(t.updated_at)}`
    );
  }
  console.log('');
}

export function setupPurgeArchiveCommand(program: Command, config: PurgeArchiveCommandConfig): void {
  const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
  if (!taskCommand) {
    throw new Error('Task command not found');
  }

  taskCommand
    .command(config.commandName)
    .option('--before <date>', config.beforeHelp)
    .option('--status <statuses>', 'Comma-separated list of statuses to target (default: done,closed)', 'done,closed')
    .option('--dry-run', `Preview tasks that would be ${config.verb}d without modifying them`)
    .option('--json', 'Output in JSON format')
    .description(config.description)
    .action(async (options) => {
      const formatter = createFormatter(options);
      try {
        const { taskService } = getServiceContainer();

        const beforeResult = resolveBeforeDate(options.before);
        if ('error' in beforeResult) {
          formatter.error(beforeResult.error, () => {
            console.error(chalk.red(`\nError: ${beforeResult.error}\n`));
          });
          process.exit(1);
          return;
        }
        const beforeDate = beforeResult.date;

        const statusResult = resolveStatuses(options.status as string);
        if ('error' in statusResult) {
          formatter.error(statusResult.error, () => {
            console.error(chalk.red(`\nError: ${statusResult.error}\n`));
          });
          process.exit(1);
          return;
        }
        const statuses = statusResult.statuses;

        const dryRun: boolean = !!options.dryRun;
        const tasks = config.serviceMethod(taskService, beforeDate, statuses, dryRun);

        formatter.output(
          () => ({
            dryRun,
            beforeDate,
            statuses,
            count: tasks.length,
            tasks: tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, updated_at: t.updated_at })),
          }),
          () => printResult(config, tasks, beforeDate, dryRun)
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
