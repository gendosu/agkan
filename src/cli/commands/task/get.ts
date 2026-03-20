/**
 * Task get command handler
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { Task, Tag, Comment } from '../../../models';
import { TaskService, TaskBlockService, TaskTagService, CommentService } from '../../../services';
import { handleError, validateNumberInput } from '../../utils/error-handler';
import { getStatusColor, formatDate } from '../../../utils/format';
import { createFormatter } from '../../utils/output-formatter';
import { filterNonNull } from '../../utils/array-utils';

/**
 * Task data for JSON output
 */
interface TaskOutputData {
  id: number;
  title: string;
  body: string | null;
  author: string | null;
  assignees: string | null;
  status: string;
  priority: string | null;
  parent_id: number | null;
  created_at: string;
  updated_at: string;
}

/**
 * Related task data
 */
interface RelatedTaskData {
  parentTask: Task | null;
  childTasks: Task[];
  blockerTasks: Task[];
  blockedTasks: Task[];
  tags: Tag[];
  comments: Comment[];
}

/**
 * Convert task to output format
 */
function formatTaskOutput(task: Task): TaskOutputData {
  return {
    id: task.id,
    title: task.title,
    body: task.body,
    author: task.author,
    assignees: task.assignees,
    status: task.status,
    priority: task.priority,
    parent_id: task.parent_id,
    created_at: task.created_at,
    updated_at: task.updated_at,
  };
}

/**
 * Fetch all related task data
 */
function fetchRelatedData(taskId: number): RelatedTaskData {
  const taskService = new TaskService();
  const taskBlockService = new TaskBlockService();
  const taskTagService = new TaskTagService();
  const commentService = new CommentService();

  const task = taskService.getTask(taskId)!;
  const parentTask = task.parent_id ? taskService.getParentTask(taskId) : null;
  const childTasks = taskService.getChildTasks(taskId);
  const blockerIds = taskBlockService.getBlockerTaskIds(taskId);
  const blockerTasks = blockerIds.map((id) => taskService.getTask(id)).filter(filterNonNull);
  const blockedIds = taskBlockService.getBlockedTaskIds(taskId);
  const blockedTasks = blockedIds.map((id) => taskService.getTask(id)).filter(filterNonNull);
  const tags = taskTagService.getTagsForTask(taskId);
  const comments = commentService.listComments(taskId);

  return { parentTask, childTasks, blockerTasks, blockedTasks, tags, comments };
}

/**
 * Render parent task information
 */
function renderParentTask(parentTask: Task | null): void {
  if (!parentTask) return;
  const parentStatusColor = getStatusColor(parentTask.status);
  console.log(
    `${chalk.bold('Parent:')} ${chalk.cyan(`[${parentTask.id}]`)} ${parentTask.title} ` +
      `${chalk[parentStatusColor](`(${parentTask.status})`)}`
  );
}

/**
 * Render child tasks list
 */
function renderChildTasks(childTasks: Task[]): void {
  if (childTasks.length === 0) return;
  console.log(`${chalk.bold('Children:')} ${childTasks.length} task(s)`);
  childTasks.forEach((child) => {
    const childStatusColor = getStatusColor(child.status);
    console.log(
      `  ${chalk.cyan('•')} ${chalk.cyan(`[${child.id}]`)} ${child.title} ` +
        `${chalk[childStatusColor](`(${child.status})`)}`
    );
  });
}

/**
 * Render blocking relationships
 */
function renderBlockingRelationships(blockerTasks: Task[], blockedTasks: Task[]): void {
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
}

/**
 * Render tags list
 */
function renderTags(tags: Tag[]): void {
  if (tags.length === 0) return;
  console.log(`${chalk.bold('Tags:')}`);
  tags.forEach((tag) => {
    console.log(`  ${chalk.cyan('•')} ${chalk.cyan(`[${tag.id}]`)} ${tag.name}`);
  });
}

/**
 * Render comments section
 */
function renderComments(comments: Comment[]): void {
  if (comments.length === 0) return;
  console.log(`${chalk.bold('\nComments:')} ${comments.length} comment(s)`);
  console.log(chalk.gray('─'.repeat(80)));
  comments.forEach((comment) => {
    const author = comment.author ? `[${comment.author}]` : '[anonymous]';
    console.log(`${chalk.cyan(`#${comment.id}`)} ${author} ${formatDate(comment.created_at)}`);
    console.log(comment.content);
    console.log();
  });
  console.log(chalk.gray('─'.repeat(80)));
}

/**
 * Render task body section
 */
function renderTaskBody(body: string | null): void {
  if (!body) return;
  console.log(chalk.bold('\nBody:'));
  console.log(chalk.gray('─'.repeat(80)));
  console.log(body);
  console.log(chalk.gray('─'.repeat(80)));
}

/**
 * Render task header with basic information
 */
function renderTaskHeader(task: Task): void {
  const statusColor = getStatusColor(task.status);
  console.log(chalk.bold(`\nTask #${task.id}`));
  console.log(chalk.bold('═'.repeat(80)));
  console.log(`${chalk.bold('Title:')} ${task.title}`);
  console.log(`${chalk.bold('Status:')} ${chalk[statusColor](task.status)}`);
  if (task.author) {
    console.log(`${chalk.bold('Author:')} ${task.author}`);
  }
  if (task.assignees) {
    console.log(`${chalk.bold('Assignees:')} ${task.assignees}`);
  }
  if (task.priority) {
    console.log(`${chalk.bold('Priority:')} ${task.priority}`);
  }
  console.log(`${chalk.bold('Created:')} ${formatDate(task.created_at)}`);
  console.log(`${chalk.bold('Updated:')} ${formatDate(task.updated_at)}`);
}

/**
 * Handle the task get command action
 */
async function handleTaskGetAction(id: string, options: { json?: boolean }): Promise<void> {
  const formatter = createFormatter(options);
  try {
    const taskId = validateNumberInput(id);
    if (taskId === null) {
      formatter.error('Task ID must be a number', () => {
        console.log(chalk.red('\nError: Task ID must be a number\n'));
      });
      process.exit(1);
    }

    const taskService = new TaskService();
    const task = taskService.getTask(taskId);

    if (!task) {
      formatter.error(`Task with ID ${id} not found`, () => {
        console.log(chalk.red(`\nTask with ID ${id} not found\n`));
      });
      process.exit(1);
    }

    const relatedData = fetchRelatedData(taskId);

    formatter.output(
      () => ({
        success: true,
        task: formatTaskOutput(task),
        parent: relatedData.parentTask ? formatTaskOutput(relatedData.parentTask) : null,
        children: relatedData.childTasks.map(formatTaskOutput),
        blockedBy: relatedData.blockerTasks.map(formatTaskOutput),
        blocking: relatedData.blockedTasks.map(formatTaskOutput),
        tags: relatedData.tags.map((tag) => ({
          id: tag.id,
          name: tag.name,
          created_at: tag.created_at,
        })),
        comments: relatedData.comments.map((comment) => ({
          id: comment.id,
          task_id: comment.task_id,
          author: comment.author,
          content: comment.content,
          created_at: comment.created_at,
          updated_at: comment.updated_at,
        })),
      }),
      () => {
        renderTaskHeader(task);
        renderParentTask(relatedData.parentTask);
        renderChildTasks(relatedData.childTasks);
        renderBlockingRelationships(relatedData.blockerTasks, relatedData.blockedTasks);
        renderTags(relatedData.tags);
        renderComments(relatedData.comments);
        renderTaskBody(task.body);
        console.log('\n');
      }
    );
  } catch (error) {
    if (error instanceof Error) {
      handleError(error, options);
    } else {
      const formatter = createFormatter(options);
      formatter.error('An unknown error occurred', () => {
        console.log(chalk.red('\n✗ An unknown error occurred\n'));
      });
    }
    process.exit(1);
  }
}

export function setupTaskGetCommand(program: Command): void {
  const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
  if (!taskCommand) {
    throw new Error('Task command not found');
  }

  taskCommand
    .command('get')
    .alias('show')
    .argument('<id>', 'Task ID')
    .option('--json', 'Output in JSON format')
    .description('Get a task by ID')
    .action(handleTaskGetAction);
}
