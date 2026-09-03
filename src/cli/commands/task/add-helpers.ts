/**
 * Helper functions for task add command
 * Separated concerns: file reading, block ID parsing, relationship setup, output formatting
 */

import chalk from 'chalk';
import { TaskBlockService, FileService, TaskService, TagService } from '../../../services';
import { Task, Tag } from '../../../models';
import { parseNumericArray } from '../../utils/error-handler';
import { getStatusColor, formatDate } from '../../../utils/format';
import { filterNonNull } from '../../utils/array-utils';
import { resolveTag } from '../../utils/tag-resolver';
import { loadConfig, resolveAgentTool } from '../../../db/config';
import {
  DEFAULT_MODEL_CATALOG,
  resolveModelCatalog,
  effortsForDefaultCli,
  validateOverridePair,
} from '../../../db/modelCatalog';

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

export function resolveTagIds(tagService: TagService, value: string | undefined): number[] {
  if (!value) return [];

  const parts = value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');

  const tagIds = new Set<number>();
  for (const part of parts) {
    const { tag, byId } = resolveTag(tagService, part);
    if (!tag) {
      const message = byId ? `Tag with ID "${part}" not found` : `Tag with name "${part}" not found`;
      throw new Error(message);
    }
    tagIds.add(tag.id);
  }
  return Array.from(tagIds);
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

export interface ModelEffortOptions {
  modelPlanning?: string;
  modelRun?: string;
  effortPlanning?: string;
  effortRun?: string;
}

/**
 * Values used in the --model-* / --effort-* help strings.
 * Falls back to the built-in catalog when .agkan.yml cannot be resolved, so a
 * broken config never stops the whole CLI from registering its commands.
 */
export function modelEffortHelpText(): { models: string; efforts: string } {
  try {
    const config = loadConfig();
    const catalog = resolveModelCatalog(config);
    return {
      models: catalog.map((entry) => entry.model).join(', '),
      efforts: effortsForDefaultCli(catalog, resolveAgentTool(config)).join(', '),
    };
  } catch {
    return {
      models: DEFAULT_MODEL_CATALOG.map((entry) => entry.model).join(', '),
      efforts: effortsForDefaultCli(DEFAULT_MODEL_CATALOG, 'claude').join(', '),
    };
  }
}

/**
 * Validate the four task-level model/effort override flags against the model catalog.
 * planning and run are checked as pairs: the effort must belong to the row the
 * model selects, or to the default cli's union when no model was given.
 * @returns Error message for the first invalid pair, or null when all are valid
 */
export function validateModelEffortOptions(options: ModelEffortOptions): string | null {
  const config = loadConfig();
  const catalog = resolveModelCatalog(config);
  const defaultCli = resolveAgentTool(config);
  return (
    validateOverridePair(catalog, defaultCli, options.modelPlanning, options.effortPlanning) ??
    validateOverridePair(catalog, defaultCli, options.modelRun, options.effortRun) ??
    null
  );
}

function taskToJson(task: Task): object {
  return {
    id: task.id,
    title: task.title,
    body: task.body,
    author: task.author,
    assignees: task.assignees,
    status: task.status,
    priority: task.priority,
    parent_id: task.parent_id,
    branch: task.branch,
    model_planning: task.model_planning,
    model_run: task.model_run,
    effort_planning: task.effort_planning,
    effort_run: task.effort_run,
    created_at: task.created_at,
    updated_at: task.updated_at,
  };
}

export function buildTaskJsonData(
  task: Task,
  parentTask: Task | null,
  blockerTasks: Task[],
  blockedTasks: Task[],
  tags: Tag[] = []
): object {
  return {
    success: true,
    task: taskToJson(task),
    parent: parentTask ? taskToJson(parentTask) : null,
    blockedBy: blockerTasks.map(taskToJson),
    blocking: blockedTasks.map(taskToJson),
    tags: tags.map((tag) => ({ id: tag.id, name: tag.name })),
  };
}

export function printTaskCreated(
  task: Task,
  parentTask: Task | null,
  blockerTasks: Task[],
  blockedTasks: Task[],
  tags: Tag[] = []
): void {
  console.log(chalk.green('\n✓ Task created successfully\n'));
  console.log(`${chalk.bold('ID:')} ${task.id}`);
  console.log(`${chalk.bold('Title:')} ${task.title}`);
  const statusColor = getStatusColor(task.status);
  console.log(`${chalk.bold('Status:')} ${chalk[statusColor](task.status)}`);
  if (task.author) {
    console.log(`${chalk.bold('Author:')} ${task.author}`);
  }
  if (task.assignees) {
    console.log(`${chalk.bold('Assignees:')} ${task.assignees}`);
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

  if (tags.length > 0) {
    console.log(`${chalk.bold('Tags:')}`);
    tags.forEach((tag) => {
      console.log(`  ${chalk.cyan('•')} ${chalk.cyan(`[${tag.id}]`)} ${tag.name}`);
    });
  }

  console.log();
}
