/**
 * Task update command handler
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { TaskService } from '../../../services';
import { getServiceContainer } from '../../utils/service-container';
import { TaskStatus } from '../../../models';
import { Priority } from '../../../models/Priority';
import { handleError, validateNumberInput } from '../../utils/error-handler';
import { getStatusColor, formatDate } from '../../../utils/format';
import { createFormatter } from '../../utils/output-formatter';
import { isFlagMode, buildFlagModeInput, buildPositionalModeInput, UpdateOptions } from './update-helpers';

function applyTaskUpdate(
  taskService: TaskService,
  taskId: number,
  updateInput: Record<string, string>
): ReturnType<TaskService['updateTask']> {
  return taskService.updateTask(taskId, {
    ...(updateInput.status !== undefined && { status: updateInput.status as TaskStatus }),
    ...(updateInput.title !== undefined && { title: updateInput.title }),
    ...(updateInput.body !== undefined && { body: updateInput.body }),
    ...(updateInput.author !== undefined && { author: updateInput.author }),
    ...(updateInput.assignees !== undefined && { assignees: updateInput.assignees }),
    ...(updateInput.priority !== undefined && {
      priority: updateInput.priority === '' ? null : (updateInput.priority as Priority),
    }),
  });
}

async function handleUpdateAction(id: string, field: string, value: string, options: UpdateOptions): Promise<void> {
  const formatter = createFormatter(options);
  try {
    const { taskService } = getServiceContainer();
    const taskId = validateNumberInput(id);
    if (taskId === null) {
      formatter.error('Task ID must be a number', () => {
        console.log(chalk.red('\nError: Task ID must be a number\n'));
      });
      process.exit(1);
    }
    const updateInput = isFlagMode(options, field)
      ? buildFlagModeInput(options, formatter)
      : buildPositionalModeInput(field, value, options, formatter);
    if (updateInput === null) {
      process.exit(1);
    }
    const task = applyTaskUpdate(taskService, taskId, updateInput);
    if (!task) {
      formatter.error(`Task with ID ${id} not found`, () => {
        console.log(chalk.red(`\nTask with ID ${id} not found\n`));
      });
      process.exit(1);
    }
    renderSuccess(taskService, task, formatter);
  } catch (error) {
    if (error instanceof Error) {
      handleError(error, options);
    } else {
      formatter.error('An unknown error occurred', () => {
        console.log(chalk.red('\n✗ An unknown error occurred\n'));
      });
    }
    process.exit(1);
  }
}

export function setupTaskUpdateCommand(program: Command): void {
  const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
  if (!taskCommand) {
    throw new Error('Task command not found');
  }
  taskCommand
    .command('update')
    .argument('<id>', 'Task ID')
    .argument('[field]', 'Field to update (status, title, body, author, assignees) - for legacy positional syntax')
    .argument('[value]', 'New value - for legacy positional syntax')
    .option('--title <title>', 'Update title')
    .option('--status <status>', 'Update status')
    .option('--body <body>', 'Update body')
    .option('--author <author>', 'Update author')
    .option('--assignees <assignees>', 'Update assignees')
    .option('--priority <priority>', 'Update priority (critical, high, medium, low, or empty to clear)')
    .option('--file <path>', 'Read body from file (only valid for body field)')
    .option('--json', 'Output in JSON format')
    .description('Update a task field')
    .action(handleUpdateAction);
}

function renderSuccess(
  taskService: TaskService,
  task: ReturnType<TaskService['updateTask']>,
  formatter: ReturnType<typeof createFormatter>
): void {
  const statusCounts = taskService.getTaskCountByStatus();
  const statusColor = getStatusColor(task!.status);

  formatter.output(
    () => ({ success: true, task, counts: statusCounts }),
    () => {
      console.log(chalk.green('\n✓ Task updated successfully\n'));
      console.log(`${chalk.bold('ID:')} ${task!.id}`);
      console.log(`${chalk.bold('Title:')} ${task!.title}`);
      console.log(`${chalk.bold('Status:')} ${chalk[statusColor](task!.status)}`);
      console.log(`${chalk.bold('Updated:')} ${formatDate(task!.updated_at)}\n`);
      console.log(chalk.bold('Task Count by Status:'));
      renderStatusCounts(taskService, statusCounts);
    }
  );
}

function renderStatusCounts(
  _taskService: TaskService,
  statusCounts: ReturnType<TaskService['getTaskCountByStatus']>
): void {
  const statusEntries: Array<{ status: TaskStatus; count: number }> = [
    { status: 'icebox', count: statusCounts.icebox },
    { status: 'backlog', count: statusCounts.backlog },
    { status: 'ready', count: statusCounts.ready },
    { status: 'in_progress', count: statusCounts.in_progress },
    { status: 'review', count: statusCounts.review },
    { status: 'done', count: statusCounts.done },
    { status: 'closed', count: statusCounts.closed },
    { status: 'archive', count: statusCounts.archive },
  ];
  statusEntries.forEach(({ status, count }) => {
    const color = getStatusColor(status);
    console.log(`  ${chalk[color](status)}: ${count}`);
  });
  console.log();
}
