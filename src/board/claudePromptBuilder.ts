// Claude prompt assembly and model/effort resolution for the board's
// /api/claude/tasks/:taskId/run route. Kept separate from PtySessionService,
// which only receives an already-built prompt/model/effort and does not
// concern itself with how they were derived.

import { TaskService } from '../services/TaskService';
import { loadConfig, resolvePhaseSettings, type AgentTool } from '../db/config';
import { resolveModelCatalog, findCatalogEntry, type ModelCatalogEntry } from '../db/modelCatalog';
import { BRANCH_AUTO_GENERATE } from '../models/Task';
import { getTaskModelOverride, getTaskEffortOverride, ModelOverrideKind } from './taskModelOverride';

export type ClaudeCommand = 'planning' | 'pr' | 'run';

const CODEX_AUTONOMY_INSTRUCTION = `

Proceed autonomously within this task's scope and the configured permissions. First look for answers in the task body, comments, repository, configuration, and existing implementation. Resolve routine choices, reversible implementation decisions, and minor ambiguities using existing conventions and reasonable assumptions. Record assumptions in the task or result.

Planning task decomposition, priority, and Ready decisions, and run-all implementation, validation, and already-authorized Git operations do not need repeated confirmation. Do not ask "shall I continue?". Do not ask again for permission already granted.

Ask the user only for unresolved requirements that materially change the result, required information only the user knows, unauthorized major destructive or irreversible actions, or external transmission of confidential information. Do not guess answers to important choices. Respect higher-priority instructions, administrator policies, and user stop requests.

Keep the sandbox and approval policy in effect. If automatic approval review rejects an action, use the rejection reason to find a materially safer alternative. If none is available, explain the rejection reason and the decision needed, then ask the user. Do not circumvent a rejection by retrying the same action through another route or switching to bypass or full access. If auto-review is unavailable, report the reason instead of silently weakening permissions.

The planning command updates task bodies, priorities, and states under the normal workspace-write permissions. It does not select read-only permissionMode: plan; when that permission mode is explicitly configured, respect its read-only restriction.`;

export function parseClaudeCommand(rawCommand: unknown): ClaudeCommand {
  return rawCommand === 'planning' ? 'planning' : rawCommand === 'pr' ? 'pr' : 'run';
}

export function buildClaudePrompt(
  taskId: number,
  command: ClaudeCommand,
  branch: string | null | undefined,
  { includeBranchInstruction = true, agent }: { includeBranchInstruction?: boolean; agent?: AgentTool } = {}
): string {
  const branchInstruction =
    command === 'planning' || !includeBranchInstruction
      ? ''
      : !branch || branch === BRANCH_AUTO_GENERATE
        ? `\n\nNo branch specified: Read this task's title and body, and generate an appropriate git branch name for the work. Format: task/${taskId}-<kebab-case> (alphanumeric characters and hyphens only, maximum 60 characters). Run git checkout -b with the generated branch name before starting work, then save the branch field via PATCH /api/tasks/${taskId} (body: { "branch": "<generated-branch-name>" }) after starting work.`
        : '';

  const exitInstruction =
    "\n\nWhen you have completed this task, send 'exit' as a prompt (not as a bash command) to end this session.";

  const skill =
    command === 'planning' ? 'agkan-planning-subtask' : command === 'pr' ? 'agkan-subtask' : 'agkan-subtask-direct';
  // agy does not interpret a slash command in its initial prompt, so it is asked for the skill by name.
  const skillLine = agent === 'agy' ? `Use "${skill}" to execute this task` : `/${skill}`;

  const autonomyInstruction = agent === 'codex' ? CODEX_AUTONOMY_INSTRUCTION : '';
  return `Task ID: ${taskId}\n${skillLine}${branchInstruction}${autonomyInstruction}${exitInstruction}`;
}

/**
 * Thrown when a task's model/effort cannot be resolved against the model catalog.
 * `source` is 'task' when a task-level override is involved (only that task is
 * affected) and 'config' when .agkan.yml alone produced the invalid combination
 * (every task launched with that config would fail the same way).
 */
export class LaunchSettingsError extends Error {
  constructor(
    message: string,
    readonly source: 'task' | 'config'
  ) {
    super(message);
  }
}

export interface LaunchSettings {
  agent: AgentTool;
  model?: string;
  effort?: string;
}

/**
 * Resolve which cli, model and effort a run of this task should use.
 * A task-level model override picks its catalog row's cli; without one the
 * phase settings determine the cli and model. In version 2, the phase effort
 * belongs to its configured model and is not inherited by a different model.
 * Effort is validated only when a catalog row can be identified.
 */
export function resolveLaunchSettings(
  taskService: TaskService | undefined,
  taskId: number,
  command: ClaudeCommand
): LaunchSettings {
  const config = loadConfig();
  const catalog = resolveModelCatalog(config);
  const kind: ModelOverrideKind = command === 'planning' ? 'planning' : 'run';
  const phaseSettings = resolvePhaseSettings(config, kind);

  const taskModel = taskService ? getTaskModelOverride(taskService, taskId, kind) : undefined;
  const taskEffort = taskService ? getTaskEffortOverride(taskService, taskId, kind) : undefined;

  let agent: AgentTool;
  let model: string | undefined;
  let entry: ModelCatalogEntry | undefined;

  if (taskModel) {
    entry = findCatalogEntry(catalog, taskModel);
    if (!entry) {
      throw new LaunchSettingsError(
        `Task model "${taskModel}" is not in modelCatalog. Must be one of: ${catalog.map((e) => e.model).join(', ')}`,
        'task'
      );
    }
    agent = entry.cli;
    model = entry.model;
  } else {
    agent = phaseSettings.agent;
    model = phaseSettings.model;
    // Match the cli too: `agent:` wins over a same-named row of the other cli.
    entry = model ? findCatalogEntry(catalog, model, agent) : undefined;
  }

  const configuredEffort = taskModel
    ? config.version === 2
      ? taskModel === phaseSettings.model
        ? phaseSettings.effort
        : undefined
      : resolvePhaseSettings(config, kind, agent).effort
    : phaseSettings.effort;
  const requestedEffort = taskEffort ?? configuredEffort ?? undefined;
  // A row with no efforts (agy's fixed variants) rejects --effort outright, so drop the
  // effort instead of failing the launch; writes are already refused by validateOverridePair.
  const effort = entry && entry.efforts.length === 0 ? undefined : requestedEffort;

  if (effort && entry && !entry.efforts.includes(effort)) {
    throw new LaunchSettingsError(
      `Effort "${effort}" is not allowed for model "${entry.model}". Must be one of: ${entry.efforts.join(', ')}`,
      taskModel || taskEffort ? 'task' : 'config'
    );
  }

  return { agent, model, effort };
}
