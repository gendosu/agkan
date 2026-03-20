/**
 * Task list command handler
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { TaskService, TagService, TaskTagService, MetadataService, TaskBlockService } from '../../../services';
import { ALLOWED_SORT_FIELDS, SortField, SortOrder } from '../../../services/TaskService';
import { TaskStatus, PRIORITIES, isPriority } from '../../../models';
import { handleError } from '../../utils/error-handler';
import { validateTaskStatus } from '../../utils/validators';
import { getStatusColor, formatDate } from '../../../utils/format';
import { createFormatter } from '../../utils/output-formatter';

type TaskTagMap = Map<number, Array<{ id: number; name: string }>>;
type MetadataMap = Map<number, Array<{ key: string; value: string }>>;
type BlockMap = Map<number, number[]>;

type TreeNode = {
  id: number;
  title: string;
  body: string | null;
  author: string | null;
  assignees: string | null;
  status: string;
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
  parent_id: number | null;
  created_at: string;
  updated_at: string;
};

/**
 * Recursive function to display tasks in tree structure.
 */
function displayTaskTree(
  taskService: TaskService,
  task: { id: number; title: string; status: TaskStatus },
  prefix: string,
  isLast: boolean,
  allTasksMetadata: MetadataMap
): void {
  const statusColor = getStatusColor(task.status);

  // Tree structure symbols
  const connector = isLast ? '└── ' : '├── ';

  // Display task information
  console.log(
    `${prefix}${connector}${chalk.bold.cyan(`[${task.id}]`)} ${chalk.bold(task.title)} ` +
      `${chalk[statusColor](`(${task.status})`)}`
  );

  // Display metadata if present
  const metadata = allTasksMetadata.get(task.id);
  if (metadata && metadata.length > 0) {
    const childPrefix = prefix + (isLast ? '    ' : '│   ');
    const metadataStrings = metadata.map(formatMetadataEntry);
    console.log(`${childPrefix}${chalk.bold('Metadata:')} ${metadataStrings.join(', ')}`);
  }

  // Get child tasks
  const children = taskService.getChildTasks(task.id);

  // If there are child tasks, recursively display them
  if (children.length > 0) {
    const newPrefix = prefix + (isLast ? '    ' : '│   ');

    children.forEach((child, index) => {
      const isChildLast = index === children.length - 1;
      displayTaskTree(taskService, child, newPrefix, isChildLast, allTasksMetadata);
    });
  }
}

/**
 * Build a tree node from a task, including children recursively.
 */
function buildTreeNode(
  task: TaskRecord,
  taskService: TaskService,
  allTaskTags: TaskTagMap,
  allTasksMetadata: MetadataMap
): TreeNode {
  const tags = allTaskTags.get(task.id);
  const metadata = allTasksMetadata.get(task.id);
  const children = taskService.getChildTasks(task.id);

  return {
    id: task.id,
    title: task.title,
    body: task.body,
    author: task.author,
    assignees: task.assignees,
    status: task.status,
    parent_id: task.parent_id,
    created_at: task.created_at,
    updated_at: task.updated_at,
    tags: tags ? tags.map((tag) => ({ id: tag.id, name: tag.name })) : [],
    metadata: metadata ? metadata.map((m) => ({ key: m.key, value: m.value })) : [],
    children: children.map((child) => buildTreeNode(child, taskService, allTaskTags, allTasksMetadata)),
  };
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
  taskService: TaskService,
  allTaskTags: TaskTagMap,
  allTasksMetadata: MetadataMap
): object {
  const rootTasks = displayTasks.filter((task) => !task.parent_id);

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
    tasks: rootTasks.map((task) => buildTreeNode(task, taskService, allTaskTags, allTasksMetadata)),
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
  taskService: TaskService,
  allTaskTags: TaskTagMap,
  allTasksMetadata: MetadataMap
): object {
  const tasksWithRelations = displayTasks.map((task) =>
    buildTaskWithRelations(task, taskService, allTaskTags, allTasksMetadata)
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
  taskService: TaskService,
  allTaskTags: TaskTagMap,
  allTasksMetadata: MetadataMap
): object {
  const tags = allTaskTags.get(task.id);
  const metadata = allTasksMetadata.get(task.id);
  const parent = task.parent_id ? taskService.getTask(task.parent_id) : null;

  return {
    id: task.id,
    title: task.title,
    body: task.body,
    author: task.author,
    assignees: task.assignees,
    status: task.status,
    parent_id: task.parent_id,
    created_at: task.created_at,
    updated_at: task.updated_at,
    parent: parent ? { id: parent.id, title: parent.title, status: parent.status } : null,
    tags: tags ? tags.map((tag) => ({ id: tag.id, name: tag.name })) : [],
    metadata: metadata ? metadata.map((m) => ({ key: m.key, value: m.value })) : [],
  };
}

type DepTreeNode = {
  id: number;
  title: string;
  body: string | null;
  author: string | null;
  assignees: string | null;
  status: string;
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
 * Display a single task node line with optional metadata and relationship label.
 */
function printTreeNodeLine(
  task: { id: number; title: string; status: string },
  allTasksMetadata: MetadataMap,
  prefix: string,
  isLast: boolean,
  relationshipLabel?: '[blocks]'
): void {
  const statusColor = getStatusColor(task.status as TaskStatus);
  const connector = isLast ? '\u2514\u2500\u2500 ' : '\u251c\u2500\u2500 ';

  const labelStr = relationshipLabel ? `${chalk.gray(relationshipLabel)} ` : '';
  console.log(
    `${prefix}${connector}${labelStr}${chalk.bold.cyan(`[${task.id}]`)} ${chalk.bold(task.title)} ` +
      `${chalk[statusColor](`(${task.status})`)}`
  );

  const metadata = allTasksMetadata.get(task.id);
  if (metadata && metadata.length > 0) {
    const childPrefix = prefix + (isLast ? '    ' : '\u2502   ');
    const metadataStrings = metadata.map(formatMetadataEntry);
    console.log(`${childPrefix}${chalk.bold('Metadata:')} ${metadataStrings.join(', ')}`);
  }
}

/**
 * Recursively display dependency tree (blocker -> blocked only).
 */
function displayDependencyTree(
  task: { id: number; title: string; status: string },
  taskService: TaskService,
  blockMap: BlockMap,
  allTasksMetadata: MetadataMap,
  prefix: string,
  isLast: boolean,
  visited: Set<number>,
  relationshipLabel?: '[blocks]'
): void {
  printTreeNodeLine(task, allTasksMetadata, prefix, isLast, relationshipLabel);

  if (visited.has(task.id)) {
    return;
  }
  visited.add(task.id);

  const blockedIds = blockMap.get(task.id) || [];

  const newPrefix = prefix + (isLast ? '    ' : '\u2502   ');
  blockedIds.forEach((blockedId, index) => {
    const childTask = taskService.getTask(blockedId);
    if (childTask && !visited.has(blockedId)) {
      const isChildLast = index === blockedIds.length - 1;
      displayDependencyTree(
        childTask,
        taskService,
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
 * Extract tags and metadata for a task.
 */
function extractTaskRelations(
  task: TaskRecord,
  allTaskTags: TaskTagMap,
  allTasksMetadata: MetadataMap
): { tags: Array<{ id: number; name: string }>; metadata: Array<{ key: string; value: string }> } {
  const tags = allTaskTags.get(task.id);
  const metadata = allTasksMetadata.get(task.id);
  return {
    tags: tags ? tags.map((tag) => ({ id: tag.id, name: tag.name })) : [],
    metadata: metadata ? metadata.map((m) => ({ key: m.key, value: m.value })) : [],
  };
}

/**
 * Build blocked task nodes recursively.
 */
function buildBlockedNodes(
  blockedIds: number[],
  taskService: TaskService,
  blockMap: BlockMap,
  allTaskTags: TaskTagMap,
  allTasksMetadata: MetadataMap,
  visited: Set<number>
): DepTreeNode[] {
  const blocks: DepTreeNode[] = [];
  for (const blockedId of blockedIds) {
    if (!visited.has(blockedId)) {
      const blockedTask = taskService.getTask(blockedId);
      if (blockedTask) {
        blocks.push(
          buildDepTreeNode(blockedTask, taskService, blockMap, allTaskTags, allTasksMetadata, new Set(visited))
        );
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
  taskService: TaskService,
  blockMap: BlockMap,
  allTaskTags: TaskTagMap,
  allTasksMetadata: MetadataMap,
  visited: Set<number>
): DepTreeNode {
  visited.add(task.id);
  const blockedIds = blockMap.get(task.id) || [];
  const { tags, metadata } = extractTaskRelations(task, allTaskTags, allTasksMetadata);
  const blocks = buildBlockedNodes(blockedIds, taskService, blockMap, allTaskTags, allTasksMetadata, visited);

  return {
    id: task.id,
    title: task.title,
    body: task.body,
    author: task.author,
    assignees: task.assignees,
    status: task.status,
    parent_id: task.parent_id,
    created_at: task.created_at,
    updated_at: task.updated_at,
    tags,
    metadata,
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
  taskService: TaskService,
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
      buildDepTreeNode(task, taskService, blockMap, allTaskTags, allTasksMetadata, new Set())
    ),
  };
}

/**
 * Format a metadata entry for display.
 */
function formatMetadataEntry(m: { key: string; value: string }): string {
  if (m.key !== 'priority') {
    return `${chalk.bold(m.key)}: ${m.value}`;
  }

  const priorityColors: Record<string, 'red' | 'yellow' | 'green' | 'white'> = {
    high: 'red',
    medium: 'yellow',
    low: 'green',
  };
  const color = priorityColors[m.value.toLowerCase()] || 'white';
  return `${chalk.bold('priority')}: ${chalk[color](m.value)}`;
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
function printTaskParent(task: TaskRecord, taskService: TaskService): void {
  if (!task.parent_id) return;
  const parentTask = taskService.getTask(task.parent_id);
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
  taskService: TaskService,
  allTaskTags: TaskTagMap,
  allTasksMetadata: MetadataMap,
  isLast: boolean
): void {
  printTaskHeader(task);
  printTaskPersonInfo(task);
  printTaskParent(task, taskService);
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
 * Validate status values.
 */
function validateStatuses(statuses: TaskStatus[], formatter: ReturnType<typeof createFormatter>): void {
  for (const s of statuses) {
    if (!validateTaskStatus(s)) {
      formatter.error(
        `Invalid status: ${s}. Valid statuses: icebox, backlog, ready, in_progress, review, done, closed`,
        () => {
          console.log(chalk.red(`Invalid status: ${s}`));
          console.log('Valid statuses: icebox, backlog, ready, in_progress, review, done, closed');
        }
      );
      process.exit(1);
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
function validateSortField(sortField: string, formatter: ReturnType<typeof createFormatter>): void {
  if (!ALLOWED_SORT_FIELDS.includes(sortField as SortField)) {
    formatter.error(`Invalid sort field: ${sortField}. Valid fields: ${ALLOWED_SORT_FIELDS.join(', ')}`, () => {
      console.log(chalk.red(`Invalid sort field: ${sortField}`));
      console.log(`Valid fields: ${ALLOWED_SORT_FIELDS.join(', ')}`);
    });
    process.exit(1);
  }
}

/**
 * Validate sort order.
 */
function validateSortOrder(sortOrder: string, formatter: ReturnType<typeof createFormatter>): void {
  if (!['asc', 'desc'].includes(sortOrder)) {
    formatter.error(`Invalid sort order: ${sortOrder}. Valid orders: asc, desc`, () => {
      console.log(chalk.red(`Invalid sort order: ${sortOrder}`));
      console.log('Valid orders: asc, desc');
    });
    process.exit(1);
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
function validatePriorities(priorities: string[], formatter: ReturnType<typeof createFormatter>): void {
  for (const p of priorities) {
    if (!isPriority(p)) {
      formatter.error(`Invalid priority: ${p}. Valid priorities: ${PRIORITIES.join(', ')}`, () => {
        console.log(chalk.red(`Invalid priority: ${p}`));
        console.log(`Valid priorities: ${PRIORITIES.join(', ')}`);
      });
      process.exit(1);
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
 * Exits with error if tag filter is invalid.
 */
function resolveTagIds(
  tagOption: string | undefined,
  tagService: TagService,
  formatter: ReturnType<typeof createFormatter>
): number[] | undefined {
  if (!tagOption) {
    return undefined;
  }

  const parts = tagOption
    .split(',')
    .map((s: string) => s.trim())
    .filter((s: string) => s !== '');

  if (parts.length === 0) {
    formatter.error('Invalid tag filter. Provide tag IDs or names.', () => {
      console.log(chalk.red('\nError: Invalid tag filter. Provide tag IDs or names.\n'));
    });
    process.exit(1);
  }

  const tagIds: number[] = [];
  for (const part of parts) {
    const numericId = parseInt(part, 10);
    if (!isNaN(numericId)) {
      tagIds.push(numericId);
    } else {
      const tag = tagService.getTagByName(part);
      if (!tag) {
        formatter.error(`Tag with name "${part}" not found`, () => {
          console.log(chalk.red(`\nError: Tag with name "${part}" not found\n`));
        });
        process.exit(1);
      }
      tagIds.push(tag.id);
    }
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
  taskService: TaskService,
  allTaskTags: TaskTagMap,
  allTasksMetadata: MetadataMap,
  formatter: ReturnType<typeof createFormatter>
): void {
  const rootTasks = displayTasks.filter((task) => !task.parent_id);
  formatter.output(
    () => buildTreeJsonOutput(displayTasks, options, tagIds, taskService, allTaskTags, allTasksMetadata),
    () => {
      console.log(chalk.bold(`\nFound ${displayTasks.length} task(s) in tree view:\n`));
      console.log(chalk.bold('─'.repeat(80)));
      rootTasks.forEach((task, index) => {
        const isLast = index === rootTasks.length - 1;
        displayTaskTree(
          taskService,
          task as { id: number; title: string; status: TaskStatus },
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
  taskService: TaskService,
  allTaskTags: TaskTagMap,
  allTasksMetadata: MetadataMap,
  taskBlockService: TaskBlockService,
  formatter: ReturnType<typeof createFormatter>
): void {
  const blockMap = buildBlockMap(taskBlockService);
  const allBlockedIds = collectAllBlockedIds(blockMap);
  const rootTasks = displayTasks.filter((task) => !allBlockedIds.has(task.id));

  formatter.output(
    () => buildDepTreeJsonOutput(displayTasks, options, tagIds, taskService, blockMap, allTaskTags, allTasksMetadata),
    () => {
      console.log(chalk.bold(`\nFound ${displayTasks.length} task(s) in dependency tree view:\n`));
      console.log(chalk.bold('\u2500'.repeat(80)));
      rootTasks.forEach((task, index) => {
        const isLast = index === rootTasks.length - 1;
        displayDependencyTree(task, taskService, blockMap, allTasksMetadata, '', isLast, new Set());
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
  taskService: TaskService,
  allTaskTags: TaskTagMap,
  allTasksMetadata: MetadataMap,
  formatter: ReturnType<typeof createFormatter>
): void {
  formatter.output(
    () => buildListJsonOutput(displayTasks, options, tagIds, taskService, allTaskTags, allTasksMetadata),
    () => {
      console.log(chalk.bold(`\nFound ${displayTasks.length} task(s):\n`));
      console.log(chalk.bold('─'.repeat(80)));
      displayTasks.forEach((task, index) => {
        const isLast = index === displayTasks.length - 1;
        printTaskRow(task, taskService, allTaskTags, allTasksMetadata, isLast);
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
  options: { status?: string; rootOnly?: boolean; all?: boolean }
): TaskRecord[] {
  let displayTasks = tasks;

  // Default: exclude icebox, done, and closed unless --all or --status is explicitly specified
  if (!options.status && !options.all) {
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
  tagService: TagService,
  formatter: ReturnType<typeof createFormatter>
): {
  statusFilter: TaskStatus | TaskStatus[] | undefined;
  tagIds: number[] | undefined;
  priorityFilter: string | string[] | undefined;
} {
  // Validate and normalize status filter
  let statusFilter: TaskStatus | TaskStatus[] | undefined;
  if (options.status) {
    const statusParts = parseStatusFilter(options.status as string) as TaskStatus[];
    validateStatuses(statusParts, formatter);
    statusFilter = normalizeStatusFilter(statusParts);
  }

  // Validate sort field and order
  if (options.sort) {
    validateSortField(options.sort as string, formatter);
  }
  if (options.order) {
    validateSortOrder(options.order as string, formatter);
  }

  // Parse and resolve tag filter
  const tagIds = resolveTagIds(options.tag as string | undefined, tagService, formatter);

  // Validate and normalize priority filter
  let priorityFilter: string | string[] | undefined;
  if (options.priority) {
    const priorityParts = parsePriorityFilter(options.priority as string);
    validatePriorities(priorityParts, formatter);
    priorityFilter = normalizePriorityFilter(priorityParts);
  }

  return { statusFilter, tagIds, priorityFilter };
}

/**
 * Fetch task data and relations (tags, metadata, blocks).
 */
function fetchTaskRelations(): {
  allTaskTags: TaskTagMap;
  allTasksMetadata: MetadataMap;
  taskBlockService: TaskBlockService;
} {
  const taskTagService = new TaskTagService();
  const metadataService = new MetadataService();
  return {
    allTaskTags: taskTagService.getAllTaskTags(),
    allTasksMetadata: metadataService.getAllTasksMetadata(),
    taskBlockService: new TaskBlockService(),
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
  const taskService = new TaskService();
  const tagService = new TagService();

  const { statusFilter, tagIds, priorityFilter } = resolveFilters(options, tagService, formatter);
  const { displayTasks, allTasks } = queryAndFilterTasks(taskService, options, statusFilter, tagIds, priorityFilter);

  if (displayTasks.length === 0) {
    handleEmptyResults(options, tagIds, allTasks, formatter);
    return;
  }

  const { allTaskTags, allTasksMetadata, taskBlockService } = fetchTaskRelations();

  if (options.tree) {
    handleTreeView(displayTasks, options, tagIds, taskService, allTaskTags, allTasksMetadata, formatter);
  } else if (options.depTree) {
    handleDepTreeView(
      displayTasks,
      options,
      tagIds,
      taskService,
      allTaskTags,
      allTasksMetadata,
      taskBlockService,
      formatter
    );
  } else {
    handleListView(displayTasks, options, tagIds, taskService, allTaskTags, allTasksMetadata, formatter);
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
        if (error instanceof Error) {
          handleError(error, options);
        } else {
          formatter.error('An unknown error occurred', () => {
            console.log(chalk.red('\n✗ An unknown error occurred\n'));
          });
        }
        process.exit(1);
      }
    });
}
