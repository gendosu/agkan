/**
 * Task block add command handler
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { TaskService, TaskBlockService } from '../../../services';
import { validateNumberInput } from '../../utils/error-handler';
import { createFormatter } from '../../utils/output-formatter';
import type { Task } from '../../../models/Task';

/**
 * Validate blocker and blocked task IDs
 */
function validateTaskIds(
  blockerId: string,
  blockedId: string,
  formatter: ReturnType<typeof createFormatter>
): { blockerTaskId: number; blockedTaskId: number } | null {
  const blockerTaskId = validateNumberInput(blockerId);
  const blockedTaskId = validateNumberInput(blockedId);

  if (blockerTaskId === null) {
    formatter.error('Blocker task ID must be a number', () => {
      console.log(chalk.red('\nError: Blocker task ID must be a number\n'));
    });
    return null;
  }

  if (blockedTaskId === null) {
    formatter.error('Blocked task ID must be a number', () => {
      console.log(chalk.red('\nError: Blocked task ID must be a number\n'));
    });
    return null;
  }

  return { blockerTaskId, blockedTaskId };
}

/**
 * Validate that tasks are different and exist
 */
function validateTasks(
  blockerTaskId: number,
  blockedTaskId: number,
  blockerId: string,
  blockedId: string,
  taskService: TaskService,
  formatter: ReturnType<typeof createFormatter>
): { blockerTask: Task; blockedTask: Task } | null {
  if (blockerTaskId === blockedTaskId) {
    formatter.error('A task cannot block itself', () => {
      console.log(chalk.red('\nError: A task cannot block itself\n'));
    });
    return null;
  }

  const blockerTask = taskService.getTask(blockerTaskId);
  if (!blockerTask) {
    formatter.error(`Blocker task with ID ${blockerId} not found`, () => {
      console.log(chalk.red(`\nError: Blocker task with ID ${blockerId} not found\n`));
    });
    return null;
  }

  const blockedTask = taskService.getTask(blockedTaskId);
  if (!blockedTask) {
    formatter.error(`Blocked task with ID ${blockedId} not found`, () => {
      console.log(chalk.red(`\nError: Blocked task with ID ${blockedId} not found\n`));
    });
    return null;
  }

  return { blockerTask, blockedTask };
}

/**
 * Handle error when adding block relationship
 */
function handleBlockingError(error: unknown, formatter: ReturnType<typeof createFormatter>): void {
  if (error instanceof Error) {
    const msg = error.message;
    if (msg.includes('cycle') || msg.includes('circular')) {
      formatter.error('This would create a circular blocking relationship', () => {
        console.log(chalk.red('\n✗ Error: This would create a circular blocking relationship\n'));
      });
    } else if (msg.includes('already exists') || msg.includes('UNIQUE constraint')) {
      formatter.error('This blocking relationship already exists', () => {
        console.log(chalk.red('\n✗ Error: This blocking relationship already exists\n'));
      });
    } else {
      formatter.error(msg, () => {
        console.log(chalk.red(`\n✗ Error: ${msg}\n`));
      });
    }
  } else {
    formatter.error('An unknown error occurred', () => {
      console.log(chalk.red('\n✗ An unknown error occurred\n'));
    });
  }
}

/**
 * Output success message for blocking relationship
 */
function outputBlockSuccess(formatter: ReturnType<typeof createFormatter>, blockerTask: Task, blockedTask: Task): void {
  formatter.output(
    () => ({
      success: true,
      blocker: {
        id: blockerTask.id,
        title: blockerTask.title,
        status: blockerTask.status,
      },
      blocked: {
        id: blockedTask.id,
        title: blockedTask.title,
        status: blockedTask.status,
      },
    }),
    () => {
      console.log(chalk.green('\n✓ Blocking relationship added successfully\n'));
      console.log(`${chalk.bold('Blocker:')} ${chalk.cyan(`[${blockerTask.id}]`)} ${blockerTask.title}`);
      console.log(`${chalk.bold('Blocked:')} ${chalk.cyan(`[${blockedTask.id}]`)} ${blockedTask.title}`);
      console.log();
    }
  );
}

/**
 * Add the block relationship and handle errors
 */
function addBlockRelationship(
  taskBlockService: TaskBlockService,
  blockerTaskId: number,
  blockedTaskId: number,
  formatter: ReturnType<typeof createFormatter>
): void {
  try {
    taskBlockService.addBlock({
      blocker_task_id: blockerTaskId,
      blocked_task_id: blockedTaskId,
    });
  } catch (error) {
    handleBlockingError(error, formatter);
    process.exit(1);
  }
}

/**
 * Find or create block command under task command
 */
function getOrCreateBlockCommand(taskCommand: Command): Command {
  let blockCommand = taskCommand.commands.find((cmd) => cmd.name() === 'block');
  if (!blockCommand) {
    blockCommand = taskCommand.command('block').description('Task blocking relationship commands');
  }
  return blockCommand;
}

/**
 * Main handler for block add action
 */
async function handleBlockAdd(blockerId: string, blockedId: string, options: { json?: boolean }): Promise<void> {
  const formatter = createFormatter(options);
  try {
    const taskService = new TaskService();
    const taskBlockService = new TaskBlockService();

    // Validate IDs
    const ids = validateTaskIds(blockerId, blockedId, formatter);
    if (!ids) {
      process.exit(1);
    }
    const { blockerTaskId, blockedTaskId } = ids;

    // Validate tasks exist and are different
    const tasks = validateTasks(blockerTaskId, blockedTaskId, blockerId, blockedId, taskService, formatter);
    if (!tasks) {
      process.exit(1);
    }
    const { blockerTask, blockedTask } = tasks;

    // Add blocking relationship
    addBlockRelationship(taskBlockService, blockerTaskId, blockedTaskId, formatter);
    outputBlockSuccess(formatter, blockerTask, blockedTask);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'An unknown error occurred';
    formatter.error(msg, () => {
      console.log(chalk.red(`\n✗ Error: ${msg}\n`));
    });
    process.exit(1);
  }
}

export function setupBlockAddCommand(program: Command): void {
  const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
  if (!taskCommand) {
    throw new Error('Task command not found');
  }

  const blockCommand = getOrCreateBlockCommand(taskCommand);

  blockCommand
    .command('add')
    .argument('<blocker-id>', 'Blocker task ID (this task blocks the other)')
    .argument('<blocked-id>', 'Blocked task ID (this task is blocked)')
    .option('--json', 'Output in JSON format')
    .description('Add a blocking relationship between tasks')
    .action(handleBlockAdd);
}
