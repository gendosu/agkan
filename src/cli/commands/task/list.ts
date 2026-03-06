/**
 * Task list command handler
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { TaskService, TagService, TaskTagService, MetadataService, TaskBlockService } from '../../../services';
import { ALLOWED_SORT_FIELDS, SortField, SortOrder } from '../../../services/TaskService';
import { TaskStatus } from '../../../models';
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
  options: { status?: string; author?: string; assignees?: string; rootOnly?: boolean; sort?: string; order?: string },
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
 * Display a single task node line with optional metadata.
 */
function printTreeNodeLine(
  task: { id: number; title: string; status: string },
  allTasksMetadata: MetadataMap,
  prefix: string,
  isLast: boolean
): void {
  const statusColor = getStatusColor(task.status as TaskStatus);
  const connector = isLast ? '\u2514\u2500\u2500 ' : '\u251c\u2500\u2500 ';

  console.log(
    `${prefix}${connector}${chalk.bold.cyan(`[${task.id}]`)} ${chalk.bold(task.title)} ` +
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
 * Recursively display dependency tree (blocker -> blocked).
 */
function displayDependencyTree(
  task: { id: number; title: string; status: string },
  taskService: TaskService,
  blockMap: BlockMap,
  allTasksMetadata: MetadataMap,
  prefix: string,
  isLast: boolean,
  visited: Set<number>
): void {
  printTreeNodeLine(task, allTasksMetadata, prefix, isLast);

  if (visited.has(task.id)) {
    return;
  }
  visited.add(task.id);

  const blockedIds = blockMap.get(task.id) || [];
  const newPrefix = prefix + (isLast ? '    ' : '\u2502   ');
  blockedIds.forEach((blockedId, index) => {
    const blockedTask = taskService.getTask(blockedId);
    if (blockedTask) {
      const isChildLast = index === blockedIds.length - 1;
      displayDependencyTree(
        blockedTask,
        taskService,
        blockMap,
        allTasksMetadata,
        newPrefix,
        isChildLast,
        new Set(visited)
      );
    }
  });
}

/**
 * Build a dependency tree node recursively.
 */
function buildDepTreeNode(
  task: TaskRecord,
  taskService: TaskService,
  blockMap: BlockMap,
  allTaskTags: TaskTagMap,
  allTasksMetadata: MetadataMap,
  visited: Set<number>
): DepTreeNode {
  const tags = allTaskTags.get(task.id);
  const metadata = allTasksMetadata.get(task.id);
  const blockedIds = blockMap.get(task.id) || [];

  visited.add(task.id);

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
    blocks,
  };
}

/**
 * Build the JSON output for dep-tree view.
 */
function buildDepTreeJsonOutput(
  displayTasks: TaskRecord[],
  options: { status?: string; author?: string; rootOnly?: boolean; all?: boolean },
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
 * Print a single task row in the human-readable list view.
 */
function printTaskRow(
  task: TaskRecord,
  taskService: TaskService,
  allTaskTags: TaskTagMap,
  allTasksMetadata: MetadataMap,
  isLast: boolean
): void {
  const statusColor = getStatusColor(task.status as TaskStatus);

  console.log(`\n${chalk.bold.cyan(`[${task.id}]`)} ${chalk.bold(task.title)}`);
  console.log(`  ${chalk.bold('Status:')} ${chalk[statusColor](task.status)}`);

  if (task.author) {
    console.log(`  ${chalk.bold('Author:')} ${task.author}`);
  }

  if (task.assignees) {
    console.log(`  ${chalk.bold('Assignees:')} ${task.assignees}`);
  }

  if (task.parent_id) {
    const parentTask = taskService.getTask(task.parent_id);
    if (parentTask) {
      console.log(`  ${chalk.bold('Parent:')} ${chalk.cyan(`[${parentTask.id}]`)} ${parentTask.title}`);
    }
  }

  const tags = allTaskTags.get(task.id);
  if (tags && tags.length > 0) {
    const tagStrings = tags.map((tag) => `${chalk.cyan(`[${tag.id}]`)} ${tag.name}`);
    console.log(`  ${chalk.bold('Tags:')} ${tagStrings.join(', ')}`);
  }

  const metadata = allTasksMetadata.get(task.id);
  if (metadata && metadata.length > 0) {
    const metadataStrings = metadata.map(formatMetadataEntry);
    console.log(`  ${chalk.bold('Metadata:')} ${metadataStrings.join(', ')}`);
  }

  console.log(`  ${chalk.bold('Created:')} ${formatDate(task.created_at)}`);

  if (!isLast) {
    console.log(chalk.gray('  ' + '─'.repeat(76)));
  }
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
        const taskService = new TaskService();
        const tagService = new TagService();
        const taskTagService = new TaskTagService();
        const metadataService = new MetadataService();

        // Validate status filter (supports comma-separated multiple statuses)
        let statusFilter: TaskStatus | TaskStatus[] | undefined;
        if (options.status) {
          const statusParts = options.status
            .split(',')
            .map((s: string) => s.trim())
            .filter((s: string) => s !== '');

          for (const s of statusParts) {
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

          statusFilter = statusParts.length === 1 ? (statusParts[0] as TaskStatus) : (statusParts as TaskStatus[]);
        }

        // Validate sort field
        if (options.sort && !ALLOWED_SORT_FIELDS.includes(options.sort as SortField)) {
          formatter.error(
            `Invalid sort field: ${options.sort}. Valid fields: ${ALLOWED_SORT_FIELDS.join(', ')}`,
            () => {
              console.log(chalk.red(`Invalid sort field: ${options.sort}`));
              console.log(`Valid fields: ${ALLOWED_SORT_FIELDS.join(', ')}`);
            }
          );
          process.exit(1);
        }

        // Validate sort order
        if (options.order && !['asc', 'desc'].includes(options.order)) {
          formatter.error(`Invalid sort order: ${options.order}. Valid orders: asc, desc`, () => {
            console.log(chalk.red(`Invalid sort order: ${options.order}`));
            console.log('Valid orders: asc, desc');
          });
          process.exit(1);
        }

        // Parse and resolve tag filter (supports IDs and names)
        const tagIds = resolveTagIds(options.tag, tagService, formatter);

        let tasks = taskService.listTasks(
          {
            status: statusFilter,
            author: options.author,
            assignees: options.assignees,
            tagIds,
          },
          options.sort as SortField,
          options.order as SortOrder
        );

        // Default: exclude icebox, done, and closed unless --all or --status is explicitly specified
        if (!options.status && !options.all) {
          tasks = tasks.filter((t) => t.status !== 'icebox' && t.status !== 'done' && t.status !== 'closed');
        }

        // If --root-only option is specified, filter to only tasks without parent
        let displayTasks = tasks;
        if (options.rootOnly) {
          displayTasks = tasks.filter((task) => !task.parent_id);
        }

        if (displayTasks.length === 0) {
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
              },
              tasks: [],
            }),
            () => {
              console.log(chalk.yellow(emptyText));
            }
          );
          return;
        }

        // Fetch all task tags and metadata at once to avoid N+1 problem
        const allTaskTags = taskTagService.getAllTaskTags();
        const allTasksMetadata = metadataService.getAllTasksMetadata();
        const taskBlockService = new TaskBlockService();

        // If --tree option is specified, display in tree structure
        if (options.tree) {
          const rootTasks = displayTasks.filter((task) => !task.parent_id);

          formatter.output(
            () => buildTreeJsonOutput(displayTasks, options, tagIds, taskService, allTaskTags, allTasksMetadata),
            () => {
              console.log(chalk.bold(`\nFound ${displayTasks.length} task(s) in tree view:\n`));
              console.log(chalk.bold('─'.repeat(80)));

              rootTasks.forEach((task, index) => {
                const isLast = index === rootTasks.length - 1;
                displayTaskTree(taskService, task, '', isLast, allTasksMetadata);
              });

              console.log('\n');
            }
          );
          return;
        }

        // If --dep-tree option is specified, display dependency (blocking) tree
        if (options.depTree) {
          const blockMap = buildBlockMap(taskBlockService);
          const allBlockedIds = collectAllBlockedIds(blockMap);
          const rootTasks = displayTasks.filter((task) => !allBlockedIds.has(task.id));

          formatter.output(
            () =>
              buildDepTreeJsonOutput(
                displayTasks,
                options,
                tagIds,
                taskService,
                blockMap,
                allTaskTags,
                allTasksMetadata
              ),
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
          return;
        }

        // Normal display (with parent task information)
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
