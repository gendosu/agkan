/**
 * Task list command handler
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { TaskService, TaskBlockService, TagService } from '../../../services';
import { getServiceContainer } from '../../utils/service-container';
import { ALLOWED_SORT_FIELDS, SortField, SortOrder } from '../../../services/TaskService';
import { Task, TaskStatus, PRIORITIES, isPriority } from '../../../models';
import { handleError } from '../../utils/error-handler';
import { validateTaskStatus } from '../../utils/validators';
import { resolveTag } from '../../utils/tag-resolver';
import { getStatusColor, formatDate } from '../../../utils/format';
import { createFormatter } from '../../utils/output-formatter';
import { ValidationError } from '../../../errors';

type TaskTagMap = Map<number, Array<{ id: number; name: string }>>;
type MetadataMap = Map<number, Array<{ key: string; value: string }>>;
type BlockMap = Map<number, number[]>;
type TaskByIdMap = Map<number, Task>;
type ChildrenMap = Map<number, Task[]>;

type TreeNode = {
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
  tags: Array<{ id: number; name: string }>;
  metadata: Array<{ key: string; value: string }>;
  children: Array<TreeNode>;
};

type TaskRecord = {
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
};

/**
 * Map the common set of task fields (shared by tree/list/dep-tree node builders)
 * plus resolved tags and metadata for a task.
 */
function mapTaskFields(
  task: TaskRecord,
  allTaskTags: TaskTagMap,
  allTasksMetadata: MetadataMap
): {
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
  tags: Array<{ id: number; name: string }>;
  metadata: Array<{ key: string; value: string }>;
} {
  const tags = allTaskTags.get(task.id);
  const metadata = allTasksMetadata.get(task.id);
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
    tags: tags ? tags.map((tag) => ({ id: tag.id, name: tag.name })) : [],
    metadata: metadata ? metadata.map((m) => ({ key: m.key, value: m.value })) : [],
  };
}

/**
 * Build a Map of task id -> task (including archived, unfiltered) and a Map of
 * parent id -> non-archived children, both from a single bulk query. This
 * replaces the N+1 getChildTasks()/getTask() calls previously made per node.
 *
 * getChildTasks()/getTask() ignore the list command's status/tag/priority filters
 * and getChildTasks() always excludes archived tasks, so the maps here are built
 * from the full (unfiltered) task set to preserve that exact behavior.
 */
function buildTaskMaps(taskService: TaskService): { taskById: TaskByIdMap; childrenByParentId: ChildrenMap } {
  const allTasks = taskService.listTasks({ includeArchived: true }, 'created_at', 'asc');
  const taskById: TaskByIdMap = new Map();
  const childrenByParentId: ChildrenMap = new Map();

  for (const task of allTasks) {
    taskById.set(task.id, task);
    if (task.is_archived || task.parent_id == null) {
      continue;
    }
    const existing = childrenByParentId.get(task.parent_id);
    if (existing) {
      existing.push(task);
    } else {
      childrenByParentId.set(task.parent_id, [task]);
    }
  }

  return { taskById, childrenByParentId };
}

/**
 * Print a single tree/dep-tree node line (connector, id, title, status),
 * followed by its priority and metadata lines.
 */
function printTreeNode(
  task: { id: number; title: string; status: string; priority?: string | null },
  allTasksMetadata: MetadataMap,
  prefix: string,
  isLast: boolean,
  relationshipLabel?: '[blocks]'
): void {
  const statusColor = getStatusColor(task.status as TaskStatus);
  const connector = isLast ? '└── ' : '├── ';
  const labelStr = relationshipLabel ? `${chalk.gray(relationshipLabel)} ` : '';

  console.log(
    `${prefix}${connector}${labelStr}${chalk.bold.cyan(`[${task.id}]`)} ${chalk.bold(task.title)} ` +
      `${chalk[statusColor](`(${task.status})`)}`
  );

  const childPrefix = prefix + (isLast ? '    ' : '│   ');
  if (task.priority) {
    console.log(`${childPrefix}${formatPriority(task.priority)}`);
  }
  const metadata = allTasksMetadata.get(task.id);
  if (metadata && metadata.length > 0) {
    const metadataStrings = metadata.map(formatMetadataEntry);
    console.log(`${childPrefix}${chalk.bold('Metadata:')} ${metadataStrings.join(', ')}`);
  }
}

/**
 * Recursive function to display tasks in tree structure.
 */
function displayTaskTree(
  task: { id: number; title: string; status: TaskStatus; priority?: string | null },
  childrenByParentId: ChildrenMap,
  prefix: string,
  isLast: boolean,
  allTasksMetadata: MetadataMap
): void {
  printTreeNode(task, allTasksMetadata, prefix, isLast);

  const children = childrenByParentId.get(task.id) || [];
  if (children.length > 0) {
    const newPrefix = prefix + (isLast ? '    ' : '│   ');
    children.forEach((child, index) => {
      const isChildLast = index === children.length - 1;
      displayTaskTree(child, childrenByParentId, newPrefix, isChildLast, allTasksMetadata);
    });
  }
}

/**
 * Build a tree node from a task, including children recursively.
 */
function buildTreeNode(
  task: TaskRecord,
  childrenByParentId: ChildrenMap,
  allTaskTags: TaskTagMap,
  allTasksMetadata: MetadataMap
): TreeNode {
  const children = childrenByParentId.get(task.id) || [];

  return {
    ...mapTaskFields(task, allTaskTags, allTasksMetadata),
    children: children.map((child) => buildTreeNode(child, childrenByParentId, allTaskTags, allTasksMetadata)),
  };
}

/**
 * Determine the root tasks to render for tree view output. A task is a root
 * if none of its ancestors (walked via the full, unfiltered taskById map) are
 * present in the filtered result set (pseudo-root). Without this, a filter
 * (e.g. `-s in_progress`) that only matches child tasks would report a
 * non-zero count while rendering nothing, since the real root would be
 * filtered out.
 *
 * Checking the entire ancestor chain (not just the immediate parent) avoids
 * rendering a task twice: if some ancestor is in the display set, that
 * ancestor will itself become a root (or a pseudo-root) and its full,
 * unfiltered subtree — which already includes this task — gets printed.
 */
function getTreeRootTasks(displayTasks: TaskRecord[], taskById: TaskByIdMap): TaskRecord[] {
  const displayTaskIds = new Set(displayTasks.map((task) => task.id));
  return displayTasks.filter((task) => {
    let current: TaskRecord = task;
    while (current.parent_id != null) {
      if (displayTaskIds.has(current.parent_id)) {
        return false;
      }
      const parent = taskById.get(current.parent_id);
      if (!parent) {
        break;
      }
      current = parent;
    }
    return true;
  });
}

/**
 * Build the JSON output object for the tree view.
 */
function buildTreeJsonOutput(
  displayTasks: TaskRecord[],
  options: {
    status?: string;
    author?: string;
    assignees?: string;
    rootOnly?: boolean;
    all?: boolean;
    sort?: string;
    order?: string;
    priority?: string;
  },
  tagIds: number[] | undefined,
  childrenByParentId: ChildrenMap,
  taskById: TaskByIdMap,
  allTaskTags: TaskTagMap,
  allTasksMetadata: MetadataMap
): object {
  const rootTasks = getTreeRootTasks(displayTasks, taskById);

  return {
    totalCount: displayTasks.length,
    viewMode: 'tree',
    filters: {
      status: options.status || null,
      author: options.author || null,
      assignees: options.assignees || null,
      tagIds: tagIds || [],
      rootOnly: options.rootOnly || false,
      all: options.all || false,
      priority: options.priority || null,
    },
    sort: options.sort || 'created_at',
    order: options.order || 'desc',
    tasks: rootTasks.map((task) => buildTreeNode(task, childrenByParentId, allTaskTags, allTasksMetadata)),
  };
}

/**
 * Build the JSON output object for the normal (flat) list view.
 */
function buildListJsonOutput(
  displayTasks: TaskRecord[],
  options: {
    status?: string;
    author?: string;
    assignees?: string;
    rootOnly?: boolean;
    sort?: string;
    order?: string;
    priority?: string;
  },
  tagIds: number[] | undefined,
  taskById: TaskByIdMap,
  allTaskTags: TaskTagMap,
  allTasksMetadata: MetadataMap
): object {
  const tasksWithRelations = displayTasks.map((task) =>
    buildTaskWithRelations(task, taskById, allTaskTags, allTasksMetadata)
  );

  return {
    totalCount: displayTasks.length,
    filters: {
      status: options.status || null,
      author: options.author || null,
      assignees: options.assignees || null,
      tagIds: tagIds || [],
      rootOnly: options.rootOnly || false,
      priority: options.priority || null,
    },
    sort: options.sort || 'created_at',
    order: options.order || 'desc',
    tasks: tasksWithRelations,
  };
}

/**
 * Build a single task object with parent, tags and metadata relations.
 */
function buildTaskWithRelations(
  task: TaskRecord,
  taskById: TaskByIdMap,
  allTaskTags: TaskTagMap,
  allTasksMetadata: MetadataMap
): object {
  const parent = task.parent_id ? (taskById.get(task.parent_id) ?? null) : null;

  return {
    ...mapTaskFields(task, allTaskTags, allTasksMetadata),
    parent: parent ? { id: parent.id, title: parent.title, status: parent.status } : null,
  };
}

type DepTreeNode = {
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
  tags: Array<{ id: number; name: string }>;
  metadata: Array<{ key: string; value: string }>;
  blocks: Array<DepTreeNode>;
};

/**
 * Build a map from blocker_task_id to its blocked_task_ids.
 */
function buildBlockMap(taskBlockService: TaskBlockService): BlockMap {
  const allBlocks = taskBlockService.getAllBlocks();
  const blockMap: BlockMap = new Map();
  for (const block of allBlocks) {
    const existing = blockMap.get(block.blocker_task_id) || [];
    existing.push(block.blocked_task_id);
    blockMap.set(block.blocker_task_id, existing);
  }
  return blockMap;
}

/**
 * Collect all blocked task IDs from a block map.
 */
function collectAllBlockedIds(blockMap: BlockMap): Set<number> {
  const allBlockedIds = new Set<number>();
  for (const blockedIds of blockMap.values()) {
    for (const id of blockedIds) {
      allBlockedIds.add(id);
    }
  }
  return allBlockedIds;
}

/**
 * Recursively display dependency tree (blocker -> blocked only).
 */
function displayDependencyTree(
  task: { id: number; title: string; status: string },
  taskById: TaskByIdMap,
  blockMap: BlockMap,
  allTasksMetadata: MetadataMap,
  prefix: string,
  isLast: boolean,
  visited: Set<number>,
  relationshipLabel?: '[blocks]'
): void {
  printTreeNode(task, allTasksMetadata, prefix, isLast, relationshipLabel);

  if (visited.has(task.id)) {
    return;
  }
  visited.add(task.id);

  const blockedIds = blockMap.get(task.id) || [];

  const newPrefix = prefix + (isLast ? '    ' : '│   ');
  blockedIds.forEach((blockedId, index) => {
    const childTask = taskById.get(blockedId);
    if (childTask && !visited.has(blockedId)) {
      const isChildLast = index === blockedIds.length - 1;
      displayDependencyTree(
        childTask,
        taskById,
        blockMap,
        allTasksMetadata,
        newPrefix,
        isChildLast,
        new Set(visited),
        '[blocks]'
      );
    }
  });
}

/**
 * Build blocked task nodes recursively.
 */
function buildBlockedNodes(
  blockedIds: number[],
  taskById: TaskByIdMap,
  blockMap: BlockMap,
  allTaskTags: TaskTagMap,
  allTasksMetadata: MetadataMap,
  visited: Set<number>
): DepTreeNode[] {
  const blocks: DepTreeNode[] = [];
  for (const blockedId of blockedIds) {
    if (!visited.has(blockedId)) {
      const blockedTask = taskById.get(blockedId);
      if (blockedTask) {
        blocks.push(buildDepTreeNode(blockedTask, taskById, blockMap, allTaskTags, allTasksMetadata, new Set(visited)));
      }
    }
  }
  return blocks;
}

/**
 * Build a dependency tree node recursively (blocking relationships only).
 */
function buildDepTreeNode(
  task: TaskRecord,
  taskById: TaskByIdMap,
  blockMap: BlockMap,
  allTaskTags: TaskTagMap,
  allTasksMetadata: MetadataMap,
  visited: Set<number>
): DepTreeNode {
  visited.add(task.id);
  const blockedIds = blockMap.get(task.id) || [];
  const blocks = buildBlockedNodes(blockedIds, taskById, blockMap, allTaskTags, allTasksMetadata, visited);

  return {
    ...mapTaskFields(task, allTaskTags, allTasksMetadata),
    blocks,
  };
}

/**
 * Build the JSON output for dep-tree view.
 */
function buildDepTreeJsonOutput(
  displayTasks: TaskRecord[],
  options: { status?: string; author?: string; rootOnly?: boolean; all?: boolean; priority?: string },
  tagIds: number[] | undefined,
  taskById: TaskByIdMap,
  blockMap: BlockMap,
  allTaskTags: TaskTagMap,
  allTasksMetadata: MetadataMap
): object {
  const allBlockedIds = collectAllBlockedIds(blockMap);
  const rootTasks = displayTasks.filter((task) => !allBlockedIds.has(task.id));

  return {
    totalCount: displayTasks.length,
    viewMode: 'dep-tree',
    filters: {
      status: options.status || null,
      author: options.author || null,
      tagIds: tagIds || [],
      rootOnly: options.rootOnly || false,
      all: options.all || false,
      priority: options.priority || null,
    },
    tasks: rootTasks.map((task) =>
      buildDepTreeNode(task, taskById, blockMap, allTaskTags, allTasksMetadata, new Set())
    ),
  };
}

/**
 * Format a metadata entry for display.
 */
function formatMetadataEntry(m: { key: string; value: string }): string {
  return `${chalk.bold(m.key)}: ${m.value}`;
}

/**
 * Format the priority field for display with color coding.
 */
function formatPriority(priority: string): string {
  const priorityColors: Record<string, 'red' | 'yellow' | 'green' | 'white'> = {
    critical: 'red',
    high: 'red',
    medium: 'yellow',
    low: 'green',
  };
  const color = priorityColors[priority.toLowerCase()] || 'white';
  return `${chalk.bold('Priority:')} ${chalk[color](priority)}`;
}

/**
 * Print task title and status.
 */
function printTaskHeader(task: TaskRecord): void {
  const statusColor = getStatusColor(task.status as TaskStatus);
  console.log(`\n${chalk.bold.cyan(`[${task.id}]`)} ${chalk.bold(task.title)}`);
  console.log(`  ${chalk.bold('Status:')} ${chalk[statusColor](task.status)}`);
}

/**
 * Print task author and assignees.
 */
function printTaskPersonInfo(task: TaskRecord): void {
  if (task.author) {
    console.log(`  ${chalk.bold('Author:')} ${task.author}`);
  }
  if (task.assignees) {
    console.log(`  ${chalk.bold('Assignees:')} ${task.assignees}`);
  }
}

/**
 * Print task parent reference.
 */
function printTaskParent(task: TaskRecord, taskById: TaskByIdMap): void {
  if (!task.parent_id) return;
  const parentTask = taskById.get(task.parent_id);
  if (parentTask) {
    console.log(`  ${chalk.bold('Parent:')} ${chalk.cyan(`[${parentTask.id}]`)} ${parentTask.title}`);
  }
}

/**
 * Print task tags.
 */
function printTaskTags(taskId: number, allTaskTags: TaskTagMap): void {
  const tags = allTaskTags.get(taskId);
  if (!tags || tags.length === 0) return;
  const tagStrings = tags.map((tag) => `${chalk.cyan(`[${tag.id}]`)} ${tag.name}`);
  console.log(`  ${chalk.bold('Tags:')} ${tagStrings.join(', ')}`);
}

/**
 * Print task priority from DB column.
 */
function printTaskPriority(task: TaskRecord): void {
  if (!task.priority) return;
  console.log(`  ${formatPriority(task.priority)}`);
}

/**
 * Print task metadata.
 */
function printTaskMetadata(taskId: number, allTasksMetadata: MetadataMap): void {
  const metadata = allTasksMetadata.get(taskId);
  if (!metadata || metadata.length === 0) return;
  const metadataStrings = metadata.map(formatMetadataEntry);
  console.log(`  ${chalk.bold('Metadata:')} ${metadataStrings.join(', ')}`);
}

/**
 * Print task creation date.
 */
function printTaskCreationDate(task: TaskRecord): void {
  console.log(`  ${chalk.bold('Created:')} ${formatDate(task.created_at)}`);
}

/**
 * Print separator line if not last task.
 */
function printTaskSeparator(isLast: boolean): void {
  if (!isLast) {
    console.log(chalk.gray('  ' + '─'.repeat(76)));
  }
}

/**
 * Print a single task row in the human-readable list view.
 */
function printTaskRow(
  task: TaskRecord,
  taskById: TaskByIdMap,
  allTaskTags: TaskTagMap,
  allTasksMetadata: MetadataMap,
  isLast: boolean
): void {
  printTaskHeader(task);
  printTaskPersonInfo(task);
  printTaskParent(task, taskById);
  printTaskPriority(task);
  printTaskTags(task.id, allTaskTags);
  printTaskMetadata(task.id, allTasksMetadata);
  printTaskCreationDate(task);
  printTaskSeparator(isLast);
}

/**
 * Parse status filter from comma-separated string.
 */
function parseStatusFilter(statusStr: string): string[] {
  return statusStr
    .split(',')
    .map((s: string) => s.trim())
    .filter((s: string) => s !== '');
}

/**
 * Validation error for task list command options.
 * Carries the exact text-mode rendering previously passed to formatter.error,
 * so the action's catch (setupTaskListCommand) can reproduce identical output
 * while owning the single process.exit(1) call site.
 */
class TaskListValidationError extends ValidationError {
  constructor(
    message: string,
    public readonly render?: () => void
  ) {
    super(message);
    this.name = 'TaskListValidationError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Validate status values.
 */
function validateStatuses(statuses: TaskStatus[]): void {
  for (const s of statuses) {
    if (!validateTaskStatus(s)) {
      throw new TaskListValidationError(
        `Invalid status: ${s}. Valid statuses: icebox, backlog, ready, in_progress, review, done, closed`,
        () => {
          console.error(chalk.red(`Invalid status: ${s}`));
          console.error('Valid statuses: icebox, backlog, ready, in_progress, review, done, closed');
        }
      );
    }
  }
}

/**
 * Convert status strings to filter format (single or array).
 */
function normalizeStatusFilter(statusParts: TaskStatus[]): TaskStatus | TaskStatus[] | undefined {
  return statusParts.length === 1 ? statusParts[0] : statusParts;
}

/**
 * Validate sort field.
 */
function validateSortField(sortField: string): void {
  if (!ALLOWED_SORT_FIELDS.includes(sortField as SortField)) {
    throw new TaskListValidationError(
      `Invalid sort field: ${sortField}. Valid fields: ${ALLOWED_SORT_FIELDS.join(', ')}`,
      () => {
        console.error(chalk.red(`Invalid sort field: ${sortField}`));
        console.error(`Valid fields: ${ALLOWED_SORT_FIELDS.join(', ')}`);
      }
    );
  }
}

/**
 * Validate sort order.
 */
function validateSortOrder(sortOrder: string): void {
  if (!['asc', 'desc'].includes(sortOrder)) {
    throw new TaskListValidationError(`Invalid sort order: ${sortOrder}. Valid orders: asc, desc`, () => {
      console.error(chalk.red(`Invalid sort order: ${sortOrder}`));
      console.error('Valid orders: asc, desc');
    });
  }
}

/**
 * Parse priority filter from comma-separated string.
 */
function parsePriorityFilter(priorityStr: string): string[] {
  return priorityStr
    .split(',')
    .map((s: string) => s.trim())
    .filter((s: string) => s !== '');
}

/**
 * Validate priority values.
 */
function validatePriorities(priorities: string[]): void {
  for (const p of priorities) {
    if (!isPriority(p)) {
      throw new TaskListValidationError(`Invalid priority: ${p}. Valid priorities: ${PRIORITIES.join(', ')}`, () => {
        console.error(chalk.red(`Invalid priority: ${p}`));
        console.error(`Valid priorities: ${PRIORITIES.join(', ')}`);
      });
    }
  }
}

/**
 * Convert priority strings to filter format (single or array).
 */
function normalizePriorityFilter(priorityParts: string[]): string | string[] | undefined {
  return priorityParts.length === 1 ? priorityParts[0] : priorityParts;
}

/**
 * Resolve tag filter from options to an array of tag IDs.
 * Returns undefined if no tag filter is specified.
 * Throws TaskListValidationError if the tag filter is invalid.
 */
function resolveTagIds(tagOption: string | undefined, tagService: TagService): number[] | undefined {
  if (!tagOption) {
    return undefined;
  }

  const parts = tagOption
    .split(',')
    .map((s: string) => s.trim())
    .filter((s: string) => s !== '');

  if (parts.length === 0) {
    throw new TaskListValidationError('Invalid tag filter. Provide tag IDs or names.', () => {
      console.error(chalk.red('\nError: Invalid tag filter. Provide tag IDs or names.\n'));
    });
  }

  const tagIds: number[] = [];
  for (const part of parts) {
    const { tag, byId } = resolveTag(tagService, part);
    if (!tag) {
      const message = byId ? `Tag with ID "${part}" not found` : `Tag with name "${part}" not found`;
      throw new TaskListValidationError(message, () => {
        console.error(chalk.red(`\nError: ${message}\n`));
      });
    }
    tagIds.push(tag.id);
  }

  return tagIds;
}

/**
 * Handle tree view output.
 */
function handleTreeView(
  displayTasks: TaskRecord[],
  options: Record<string, unknown>,
  tagIds: number[] | undefined,
  childrenByParentId: ChildrenMap,
  taskById: TaskByIdMap,
  allTaskTags: TaskTagMap,
  allTasksMetadata: MetadataMap,
  formatter: ReturnType<typeof createFormatter>
): void {
  const rootTasks = getTreeRootTasks(displayTasks, taskById);
  formatter.output(
    () =>
      buildTreeJsonOutput(displayTasks, options, tagIds, childrenByParentId, taskById, allTaskTags, allTasksMetadata),
    () => {
      console.log(chalk.bold(`\nFound ${displayTasks.length} task(s) in tree view:\n`));
      console.log(chalk.bold('─'.repeat(80)));
      rootTasks.forEach((task, index) => {
        const isLast = index === rootTasks.length - 1;
        displayTaskTree(
          task as { id: number; title: string; status: TaskStatus },
          childrenByParentId,
          '',
          isLast,
          allTasksMetadata
        );
      });
      console.log('\n');
    }
  );
}

/**
 * Handle dependency tree view output.
 */
function handleDepTreeView(
  displayTasks: TaskRecord[],
  options: Record<string, unknown>,
  tagIds: number[] | undefined,
  taskById: TaskByIdMap,
  allTaskTags: TaskTagMap,
  allTasksMetadata: MetadataMap,
  taskBlockService: TaskBlockService,
  formatter: ReturnType<typeof createFormatter>
): void {
  const blockMap = buildBlockMap(taskBlockService);
  const allBlockedIds = collectAllBlockedIds(blockMap);
  const rootTasks = displayTasks.filter((task) => !allBlockedIds.has(task.id));

  formatter.output(
    () => buildDepTreeJsonOutput(displayTasks, options, tagIds, taskById, blockMap, allTaskTags, allTasksMetadata),
    () => {
      console.log(chalk.bold(`\nFound ${displayTasks.length} task(s) in dependency tree view:\n`));
      console.log(chalk.bold('─'.repeat(80)));
      rootTasks.forEach((task, index) => {
        const isLast = index === rootTasks.length - 1;
        displayDependencyTree(task, taskById, blockMap, allTasksMetadata, '', isLast, new Set());
      });
      console.log('\n');
    }
  );
}

/**
 * Handle normal list view output.
 */
function handleListView(
  displayTasks: TaskRecord[],
  options: Record<string, unknown>,
  tagIds: number[] | undefined,
  taskById: TaskByIdMap,
  allTaskTags: TaskTagMap,
  allTasksMetadata: MetadataMap,
  formatter: ReturnType<typeof createFormatter>
): void {
  formatter.output(
    () => buildListJsonOutput(displayTasks, options, tagIds, taskById, allTaskTags, allTasksMetadata),
    () => {
      console.log(chalk.bold(`\nFound ${displayTasks.length} task(s):\n`));
      console.log(chalk.bold('─'.repeat(80)));
      displayTasks.forEach((task, index) => {
        const isLast = index === displayTasks.length - 1;
        printTaskRow(task, taskById, allTaskTags, allTasksMetadata, isLast);
      });
      console.log('\n');
    }
  );
}

/**
 * Filter tasks based on options and return filtered list.
 */
function filterTasks(
  tasks: TaskRecord[],
  options: { status?: string; rootOnly?: boolean; all?: boolean; archived?: boolean }
): TaskRecord[] {
  let displayTasks = tasks;

  // Default: exclude icebox, done, and closed unless --all, --archived, or --status is explicitly specified
  if (!options.status && !options.all && !options.archived) {
    displayTasks = displayTasks.filter((t) => t.status !== 'icebox' && t.status !== 'done' && t.status !== 'closed');
  }

  // If --root-only option is specified, filter to only tasks without parent
  if (options.rootOnly) {
    displayTasks = displayTasks.filter((task) => !task.parent_id);
  }

  return displayTasks;
}

/**
 * Handle empty results case.
 */
function handleEmptyResults(
  options: Record<string, unknown>,
  tagIds: number[] | undefined,
  tasks: TaskRecord[],
  formatter: ReturnType<typeof createFormatter>
): void {
  const emptyText = options.rootOnly && tasks.length > 0 ? '\nNo root tasks found\n' : '\nNo tasks found\n';
  formatter.output(
    () => ({
      totalCount: 0,
      filters: {
        status: options.status || null,
        author: options.author || null,
        assignees: options.assignees || null,
        tagIds: tagIds || [],
        rootOnly: options.rootOnly || false,
        all: options.all || false,
        priority: options.priority || null,
      },
      tasks: [],
    }),
    () => {
      console.log(chalk.yellow(emptyText));
    }
  );
}

/**
 * Resolve all filter parameters from command options.
 */
function resolveFilters(
  options: Record<string, unknown>,
  tagService: TagService
): {
  statusFilter: TaskStatus | TaskStatus[] | undefined;
  tagIds: number[] | undefined;
  priorityFilter: string | string[] | undefined;
} {
  // Validate and normalize status filter
  let statusFilter: TaskStatus | TaskStatus[] | undefined;
  if (options.status) {
    const statusParts = parseStatusFilter(options.status as string) as TaskStatus[];
    validateStatuses(statusParts);
    statusFilter = normalizeStatusFilter(statusParts);
  }

  // Validate sort field and order
  if (options.sort) {
    validateSortField(options.sort as string);
  }
  if (options.order) {
    validateSortOrder(options.order as string);
  }

  // Parse and resolve tag filter
  const tagIds = resolveTagIds(options.tag as string | undefined, tagService);

  // Validate and normalize priority filter
  let priorityFilter: string | string[] | undefined;
  if (options.priority) {
    const priorityParts = parsePriorityFilter(options.priority as string);
    validatePriorities(priorityParts);
    priorityFilter = normalizePriorityFilter(priorityParts);
  }

  return { statusFilter, tagIds, priorityFilter };
}

/**
 * Fetch task data and relations (tags, metadata, blocks, parent/children maps).
 */
function fetchTaskRelations(taskService: TaskService): {
  allTaskTags: TaskTagMap;
  allTasksMetadata: MetadataMap;
  taskBlockService: TaskBlockService;
  taskById: TaskByIdMap;
  childrenByParentId: ChildrenMap;
} {
  const { taskTagService, metadataService, taskBlockService } = getServiceContainer();
  const { taskById, childrenByParentId } = buildTaskMaps(taskService);
  return {
    allTaskTags: taskTagService.getAllTaskTags(),
    allTasksMetadata: metadataService.getAllTasksMetadata(),
    taskBlockService,
    taskById,
    childrenByParentId,
  };
}

/**
 * Query and filter tasks.
 */
function queryAndFilterTasks(
  taskService: TaskService,
  options: Record<string, unknown>,
  statusFilter: TaskStatus | TaskStatus[] | undefined,
  tagIds: number[] | undefined,
  priorityFilter: string | string[] | undefined
): { displayTasks: TaskRecord[]; allTasks: TaskRecord[] } {
  let allTasks = taskService.listTasks(
    {
      status: statusFilter,
      author: options.author as string | undefined,
      assignees: options.assignees as string | undefined,
      tagIds,
      priority: priorityFilter,
      includeArchived: options.archived as boolean | undefined,
    },
    options.sort as SortField,
    options.order as SortOrder
  );

  const displayTasks = filterTasks(allTasks, options);
  return { displayTasks, allTasks };
}

/**
 * Execute the list command action.
 */
async function executeListAction(
  options: Record<string, unknown>,
  formatter: ReturnType<typeof createFormatter>
): Promise<void> {
  const { taskService, tagService } = getServiceContainer();

  const { statusFilter, tagIds, priorityFilter } = resolveFilters(options, tagService);
  const { displayTasks, allTasks } = queryAndFilterTasks(taskService, options, statusFilter, tagIds, priorityFilter);

  if (displayTasks.length === 0) {
    handleEmptyResults(options, tagIds, allTasks, formatter);
    return;
  }

  const { allTaskTags, allTasksMetadata, taskBlockService, taskById, childrenByParentId } =
    fetchTaskRelations(taskService);

  if (options.tree) {
    handleTreeView(
      displayTasks,
      options,
      tagIds,
      childrenByParentId,
      taskById,
      allTaskTags,
      allTasksMetadata,
      formatter
    );
  } else if (options.depTree) {
    handleDepTreeView(
      displayTasks,
      options,
      tagIds,
      taskById,
      allTaskTags,
      allTasksMetadata,
      taskBlockService,
      formatter
    );
  } else {
    handleListView(displayTasks, options, tagIds, taskById, allTaskTags, allTasksMetadata, formatter);
  }
}

export function setupTaskListCommand(program: Command): void {
  const taskCommand = program.commands.find((cmd) => cmd.name() === 'task');
  if (!taskCommand) {
    throw new Error('Task command not found');
  }

  taskCommand
    .command('list')
    .option('-s, --status <status>', 'Filter by status')
    .option('-a, --author <author>', 'Filter by author')
    .option('--assignees <assignees>', 'Filter by assignee (LIKE match on CSV assignees field)')
    .option('-t, --tag <tags>', 'Filter by tag IDs or names (comma-separated, e.g., "1,2,3" or "bug,feature")')
    .option(
      '-p, --priority <priorities>',
      `Filter by priority (comma-separated, e.g., "high" or "critical,high"). Valid values: ${PRIORITIES.join(', ')}`
    )
    .option('--all', 'Include all statuses (including done and closed)')
    .option('--archived', 'Include archived tasks (is_archived=1)')
    .option('--tree', 'Display tasks in tree structure')
    .option('--dep-tree', 'Display tasks in dependency (blocking) tree structure')
    .option('--root-only', 'Show only root tasks (tasks without parent)')
    .option('--sort <field>', `Sort by field (${ALLOWED_SORT_FIELDS.join(', ')})`, 'created_at')
    .option('--order <order>', 'Sort order (asc, desc)', 'desc')
    .option('--json', 'Output in JSON format')
    .description('List all tasks')
    .action(async (options) => {
      const formatter = createFormatter(options);
      try {
        await executeListAction(options, formatter);
      } catch (error) {
        if (error instanceof TaskListValidationError) {
          formatter.error(error.message, error.render);
        } else if (error instanceof Error) {
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
