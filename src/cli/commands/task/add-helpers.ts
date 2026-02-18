/**
 * Helper functions for task add command
 * Separated concerns: file reading, block ID parsing, relationship setup, output formatting
 */

import chalk from 'chalk';
import { TaskBlockService, FileService, TaskService } from '../../../services';
import { Task } from '../../../models';
import { parseNumericArray } from '../../utils/error-handler';
import { getStatusColor, formatDate } from '../../../utils/format';
import { filterNonNull } from '../../utils/array-utils';

export function readBodyFromFile(filePath: string): string {
  const fileService = new FileService();
  try {
    return fileService.readMarkdownFile(filePath);
  } catch (error) {
    const msg = error instanceof Error ? `Error reading file: ${error.message}` : 'Error reading file';
    throw new Error(msg);
  }
}

export function parseBlockIds(value: string | undefined, label: string): number[] {
  if (!value) return [];
  const ids = parseNumericArray(value);
  if (ids.length === 0 && value.trim() !== '') {
    throw new Error(`Invalid ${label} IDs. IDs must be numbers.`);
  }
  return ids;
}

export function addBlockRelationships(
  taskBlockService: TaskBlockService,
  taskId: number,
  blockedByIds: number[],
  blocksIds: number[]
): void {
  for (const blockerId of blockedByIds) {
    try {
      taskBlockService.addBlock({ blocker_task_id: blockerId, blocked_task_id: taskId });
    } catch (error) {
      const msg =
        error instanceof Error
          ? `Error adding blocked-by relationship with task #${blockerId}: ${error.message}`
          : `Error adding blocked-by relationship with task #${blockerId}`;
      throw new Error(msg);
    }
  }
  for (const blockedId of blocksIds) {
    try {
      taskBlockService.addBlock({ blocker_task_id: taskId, blocked_task_id: blockedId });
    } catch (error) {
      const msg =
        error instanceof Error
          ? `Error adding blocks relationship with task #${blockedId}: ${error.message}`
          : `Error adding blocks relationship with task #${blockedId}`;
      throw new Error(msg);
    }
  }
}

export function fetchRelatedTasks(
  taskService: TaskService,
  task: Task,
  blockedByIds: number[],
  blocksIds: number[]
): { parentTask: Task | null; blockerTasks: Task[]; blockedTasks: Task[] } {
  const parentTask = task.parent_id ? taskService.getTask(task.parent_id) : null;
  const blockerTasks = blockedByIds.map((id) => taskService.getTask(id)).filter(filterNonNull);
  const blockedTasks = blocksIds.map((id) => taskService.getTask(id)).filter(filterNonNull);
  return { parentTask, blockerTasks, blockedTasks };
}

function taskToJson(task: Task): object {
  return {
    id: task.id,
    title: task.title,
    body: task.body,
    author: task.author,
    status: task.status,
    parent_id: task.parent_id,
    created_at: task.created_at,
    updated_at: task.updated_at,
  };
}

export function buildTaskJsonData(
  task: Task,
  parentTask: Task | null,
  blockerTasks: Task[],
  blockedTasks: Task[]
): object {
  return {
    success: true,
    task: taskToJson(task),
    parent: parentTask ? taskToJson(parentTask) : null,
    blockedBy: blockerTasks.map(taskToJson),
    blocking: blockedTasks.map(taskToJson),
  };
}

export function printTaskCreated(
  task: Task,
  parentTask: Task | null,
  blockerTasks: Task[],
  blockedTasks: Task[]
): void {
  console.log(chalk.green('\n✓ Task created successfully\n'));
  console.log(`${chalk.bold('ID:')} ${task.id}`);
  console.log(`${chalk.bold('Title:')} ${task.title}`);
  const statusColor = getStatusColor(task.status);
  console.log(`${chalk.bold('Status:')} ${chalk[statusColor](task.status)}`);
  if (task.author) {
    console.log(`${chalk.bold('Author:')} ${task.author}`);
  }
  if (task.parent_id && parentTask) {
    console.log(`${chalk.bold('Parent:')} #${parentTask.id} - ${parentTask.title}`);
  }
  console.log(`${chalk.bold('Created:')} ${formatDate(task.created_at)}`);

  if (blockerTasks.length > 0) {
    console.log(`${chalk.bold('Blocked By:')} ${blockerTasks.length} task(s)`);
    blockerTasks.forEach((blocker) => {
      const blockerStatusColor = getStatusColor(blocker.status);
      console.log(
        `  ${chalk.red('•')} ${chalk.cyan(`[${blocker.id}]`)} ${blocker.title} ` +
          `${chalk[blockerStatusColor](`(${blocker.status})`)}`
      );
    });
  }

  if (blockedTasks.length > 0) {
    console.log(`${chalk.bold('Blocking:')} ${blockedTasks.length} task(s)`);
    blockedTasks.forEach((blocked) => {
      const blockedStatusColor = getStatusColor(blocked.status);
      console.log(
        `  ${chalk.yellow('•')} ${chalk.cyan(`[${blocked.id}]`)} ${blocked.title} ` +
          `${chalk[blockedStatusColor](`(${blocked.status})`)}`
      );
    });
  }

  console.log();
}
