/**
 * `agkan task run-all`: CLI equivalent of Board's bulk "Run all" feature
 * (BulkRunService), mirroring each launched task's live PTY output to this
 * process's stdout instead of a browser UI.
 *
 * Unlike BulkRunService, a per-task failure stops the whole run (non-zero
 * exit) instead of continuing to the next ready task: this command is meant
 * for unattended/scripted use, where silently finishing a run that failed
 * partway through would be worse than stopping and surfacing the failure.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { TaskService } from '../../../services/TaskService';
import { TaskBlockService } from '../../../services/TaskBlockService';
import { getServiceContainer, ServiceContainer } from '../../utils/service-container';
import { handleError } from '../../utils/error-handler';
import { createFormatter } from '../../utils/output-formatter';
import { selectNextTask } from '../../../board/taskSelection';
import {
  buildClaudePrompt,
  resolveLaunchSettings,
  LaunchSettingsError,
  type LaunchSettings,
} from '../../../board/claudePromptBuilder';

interface RunAllOptions {
  withPr?: boolean;
  dryRun?: boolean;
  json?: boolean;
}

export interface RunOrderPreviewItem {
  id: number;
  title: string;
  priority: string | null;
}

/**
 * Previews the full run order by repeatedly applying the same shared
 * selection rule BulkRunService and runLoop use, without launching anything.
 *
 * Each selected task is added to `resolved` (in addition to the `skipped`
 * exclusion set) so a later task blocked only by an earlier one in this same
 * preview is still included — the real run would unblock it once the earlier
 * task actually completes, so the preview must simulate that instead of only
 * checking each blocker's current (still 'ready') DB status.
 */
export function previewRunOrder(ts: TaskService, tbs: TaskBlockService): RunOrderPreviewItem[] {
  const skipped = new Set<number>();
  const resolved = new Set<number>();
  const preview: RunOrderPreviewItem[] = [];
  for (;;) {
    const taskId = selectNextTask(ts, tbs, skipped, resolved);
    if (taskId === null) return preview;
    const task = ts.getTask(taskId);
    if (!task) return preview;
    preview.push({ id: task.id, title: task.title, priority: task.priority ?? null });
    skipped.add(taskId);
    resolved.add(taskId);
  }
}

function printPreview(tasks: RunOrderPreviewItem[]): void {
  if (tasks.length === 0) {
    console.log(chalk.yellow('\nNo ready tasks to run.\n'));
    return;
  }
  console.log(chalk.bold(`\n[Dry Run] ${tasks.length} task(s) would run in this order:\n`));
  tasks.forEach((t, i) => {
    console.log(
      `  ${chalk.gray(`${i + 1}.`)} ${chalk.bold.cyan(`[${t.id}]`)} ${chalk.bold(t.title)} ${chalk.gray(`(${t.priority ?? 'none'})`)}`
    );
  });
  console.log('');
}

type RunOutcome = { kind: 'done'; exitCode: number } | { kind: 'error'; message: string };

/**
 * Mirrors the launched task's live PTY output to this process's stdout (subscribeRawOutput
 * delivers raw chunks as the agent produces them) and resolves once the task's single
 * completion signal (subscribeOutput's done/error) arrives. Both subscriptions are torn
 * down on completion so they don't accumulate across the sequential loop.
 */
function waitForOutcome(pty: ServiceContainer['ptySessionService'], taskId: number): Promise<RunOutcome> {
  return new Promise((resolve) => {
    // Use let so the completion callback can safely reference these even if it fires
    // synchronously before the assignments complete (subscribeOutput's fast-exit /
    // no-session fallback path).
    let unsubscribeRaw: (() => void) | undefined;
    let unsubscribeOutput: (() => void) | undefined;

    unsubscribeRaw = pty.subscribeRawOutput(taskId, (data) => {
      process.stdout.write(data);
    });
    unsubscribeOutput = pty.subscribeOutput(taskId, (evt) => {
      unsubscribeRaw?.();
      unsubscribeOutput?.();
      resolve(evt);
    });
  });
}

/**
 * Sequential launch loop. Returns the process exit code: 0 when the run
 * completes normally (including "nothing left to run"), 1 when a task fails
 * or a config-level launch-settings error stops the run outright.
 */
export async function runLoop(container: ServiceContainer, withPr: boolean): Promise<number> {
  const { taskService, taskBlockService, ptySessionService } = container;
  const skippedTaskIds = new Set<number>();
  const ptyCommand: 'pr' | 'run' = withPr ? 'pr' : 'run';

  for (;;) {
    const taskId = selectNextTask(taskService, taskBlockService, skippedTaskIds);
    if (taskId === null) {
      console.log(chalk.green('\nNo more ready tasks to run.\n'));
      return 0;
    }

    let settings: LaunchSettings;
    try {
      settings = resolveLaunchSettings(taskService, taskId, 'run');
    } catch (e) {
      if (e instanceof LaunchSettingsError && e.source === 'task') {
        // Per-task catalog miss (e.g. a stale model_run/effort_run override): skip just
        // this task and let the loop move on, mirroring BulkRunService's skippedTaskIds.
        console.log(chalk.yellow(`\nSkipping task ${taskId}: ${e.message}\n`));
        skippedTaskIds.add(taskId);
        continue;
      }
      // Anything else means .agkan.yml itself is broken; skipping would just repeat for
      // every remaining ready task, so stop the run instead.
      const message = e instanceof Error ? e.message : String(e);
      console.error(chalk.red(`\n✗ Stopping run-all: ${message}\n`));
      return 1;
    }

    const { agent, model, effort } = settings;
    const prompt = buildClaudePrompt(taskId, ptyCommand, undefined, { includeBranchInstruction: false });

    console.log(chalk.bold(`\n▶ Running task ${taskId} (${ptyCommand})...\n`));
    await ptySessionService.startProcess(taskId, prompt, ptyCommand, model, effort, agent);
    // PtySessionService always spawns at a fixed 220x50 (sized for Board's browser terminal);
    // resize to the real terminal so TUI escape sequences render correctly here. Guard for
    // non-TTY stdout (piped/redirected), where columns/rows are undefined.
    if (typeof process.stdout.columns === 'number' && typeof process.stdout.rows === 'number') {
      ptySessionService.resize(taskId, process.stdout.columns, process.stdout.rows);
    }
    const outcome = await waitForOutcome(ptySessionService, taskId);

    if (outcome.kind === 'error') {
      console.error(chalk.red(`\n✗ Task ${taskId} errored: ${outcome.message}\n`));
      return 1;
    }
    if (outcome.exitCode !== 0) {
      console.error(chalk.red(`\n✗ Task ${taskId} exited with code ${outcome.exitCode}\n`));
      return 1;
    }

    console.log(chalk.green(`\n✓ Task ${taskId} completed\n`));
    if (!ptySessionService.isExplicitUserStop(taskId)) {
      taskService.updateTask(taskId, { status: 'done' });
    }
  }
}

export function setupTaskRunAllCommand(program: Command): void {
  const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
  if (!taskCommand) {
    throw new Error('Task command not found');
  }

  taskCommand
    .command('run-all')
    .option('--with-pr', 'Create a PR for each task instead of running directly', false)
    .option('--dry-run', 'Preview the run order without launching anything', false)
    .option('--json', 'Output in JSON format (applies to --dry-run only)')
    .description("Sequentially run all ready tasks, mirroring Board's bulk Run all feature")
    .action(async (options: RunAllOptions) => {
      const formatter = createFormatter(options);
      try {
        const container = getServiceContainer();

        if (options.dryRun) {
          const preview = previewRunOrder(container.taskService, container.taskBlockService);
          formatter.output(
            () => ({ dryRun: true, count: preview.length, tasks: preview }),
            () => printPreview(preview)
          );
          return;
        }

        const exitCode = await runLoop(container, !!options.withPr);
        if (exitCode !== 0) {
          // Not process.exit(): this command has just written a large volume of live PTY
          // output to stdout, and process.exit() does not wait for a piped stdout to drain —
          // forcing it here could silently truncate the very output a failure needs to show.
          // Setting exitCode and returning lets Node exit naturally once the pipe drains.
          process.exitCode = exitCode;
        }
        return;
      } catch (error) {
        if (error instanceof Error) {
          handleError(error, options);
        } else {
          formatter.error('An unknown error occurred', () => {
            console.error(chalk.red('\n✗ An unknown error occurred\n'));
          });
        }
        process.exitCode = 1;
        return;
      }
    });
}
