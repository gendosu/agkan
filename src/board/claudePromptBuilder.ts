// Claude prompt assembly and model/effort resolution for the board's
// /api/claude/tasks/:taskId/run route. Kept separate from PtySessionService,
// which only receives an already-built prompt/model/effort and does not
// concern itself with how they were derived.

import { TaskService } from '../services/TaskService';
import { loadConfig, resolveAgentTool, resolveModelSettings, type AgentTool } from '../db/config';
import { resolveModelCatalog, findCatalogEntry, type ModelCatalogEntry } from '../db/modelCatalog';
import { BRANCH_AUTO_GENERATE } from '../models/Task';
import { getTaskModelOverride, getTaskEffortOverride, ModelOverrideKind } from './taskModelOverride';

export type ClaudeCommand = 'planning' | 'pr' | 'run';

export function parseClaudeCommand(rawCommand: unknown): ClaudeCommand {
  return rawCommand === 'planning' ? 'planning' : rawCommand === 'pr' ? 'pr' : 'run';
}

export function buildClaudePrompt(taskId: number, command: ClaudeCommand, branch: string | null | undefined): string {
  const branchInstruction =
    command === 'planning'
      ? ''
      : !branch || branch === BRANCH_AUTO_GENERATE
        ? `\n\nNo branch specified: Read this task's title and body, and generate an appropriate git branch name for the work. Format: task/${taskId}-<kebab-case> (alphanumeric characters and hyphens only, maximum 60 characters). Run git checkout -b with the generated branch name before starting work, then save the branch field via PATCH /api/tasks/${taskId} (body: { "branch": "<generated-branch-name>" }) after starting work.`
        : '';

  const exitInstruction =
    "\n\nWhen you have completed this task, send 'exit' as a prompt (not as a bash command) to end this session.";

  return command === 'planning'
    ? `Task ID: ${taskId}\n/agkan-planning-subtask${branchInstruction}${exitInstruction}`
    : command === 'pr'
      ? `Task ID: ${taskId}\n/agkan-subtask${branchInstruction}${exitInstruction}`
      : `Task ID: ${taskId}\n/agkan-subtask-direct${branchInstruction}${exitInstruction}`;
}

export const VALID_EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;

export function isValidEffortLevel(effort: string): effort is (typeof VALID_EFFORT_LEVELS)[number] {
  return (VALID_EFFORT_LEVELS as readonly string[]).includes(effort);
}

/**
 * Claude model aliases accepted for task-level overrides.
 * Single source of truth: the board client dropdown and the CLI flags both
 * validate against this list.
 */
export const MODEL_ALIASES = ['fable', 'opus', 'sonnet', 'haiku'] as const;

export function isValidModelAlias(model: string): model is (typeof MODEL_ALIASES)[number] {
  return (MODEL_ALIASES as readonly string[]).includes(model);
}

/** Thrown when a task's model/effort cannot be resolved against the model catalog. */
export class LaunchSettingsError extends Error {}

export interface LaunchSettings {
  agent: AgentTool;
  model?: string;
  effort?: string;
}

/**
 * Resolve which cli, model and effort a run of this task should use.
 * A task-level model override picks its catalog row's cli; without one the
 * configured `agent:` is the default cli and its `models.<agent>` block applies.
 * Effort is validated only when a catalog row can be identified.
 */
export function resolveLaunchSettings(
  taskService: TaskService | undefined,
  taskId: number,
  command: ClaudeCommand
): LaunchSettings {
  const config = loadConfig();
  const catalog = resolveModelCatalog(config);
  const defaultCli = resolveAgentTool(config);
  const kind: ModelOverrideKind = command === 'planning' ? 'planning' : 'run';

  const taskModel = taskService ? getTaskModelOverride(taskService, taskId, kind) : undefined;
  const taskEffort = taskService ? getTaskEffortOverride(taskService, taskId, kind) : undefined;

  let agent: AgentTool;
  let model: string | undefined;
  let entry: ModelCatalogEntry | undefined;

  if (taskModel) {
    entry = findCatalogEntry(catalog, taskModel);
    if (!entry) {
      throw new LaunchSettingsError(
        `Task model "${taskModel}" is not in modelCatalog. Must be one of: ${catalog.map((e) => e.model).join(', ')}`
      );
    }
    agent = entry.cli;
    model = entry.model;
  } else {
    agent = defaultCli;
    model = resolveModelSettings(config, kind, agent)?.model?.trim() || undefined;
    // Match the cli too: `agent:` wins over a same-named row of the other cli.
    entry = model ? findCatalogEntry(catalog, model, agent) : undefined;
  }

  const effort = taskEffort ?? resolveModelSettings(config, kind, agent)?.effort?.trim() ?? undefined;

  if (effort && entry && !entry.efforts.includes(effort)) {
    const allowed =
      entry.efforts.length === 0
        ? 'This model does not accept an effort override'
        : `Must be one of: ${entry.efforts.join(', ')}`;
    throw new LaunchSettingsError(`Effort "${effort}" is not allowed for model "${entry.model}". ${allowed}`);
  }

  return { agent, model, effort };
}
