// Claude prompt assembly and model/effort resolution for the board's
// /api/claude/tasks/:taskId/run route. Kept separate from PtySessionService,
// which only receives an already-built prompt/model/effort and does not
// concern itself with how they were derived.

import { MetadataService } from '../services/MetadataService';
import { loadConfig } from '../db/config';
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

export interface ResolvedModelEffort {
  model?: string;
  effort?: string;
}

/**
 * Resolve the model/effort to use for a Claude run.
 * Priority: task-level override (UI selection) > config file > default.
 * 'pr' and 'run' commands both use the 'run' model configuration.
 */
export function resolveModelAndEffort(
  ms: MetadataService,
  taskId: number,
  command: ClaudeCommand
): ResolvedModelEffort {
  const config = loadConfig();
  const overrideKind: ModelOverrideKind = command === 'planning' ? 'planning' : 'run';
  const rawConfig = command === 'planning' ? config.models?.planning : config.models?.run;
  const model = getTaskModelOverride(ms, taskId, overrideKind) ?? rawConfig?.model?.trim() ?? undefined;
  const effort = getTaskEffortOverride(ms, taskId, overrideKind) ?? rawConfig?.effort?.trim() ?? undefined;
  return { model, effort };
}
