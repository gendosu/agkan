/**
 * Tests for Claude prompt assembly and model/effort resolution
 * (src/board/claudePromptBuilder.ts)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import yaml from 'js-yaml';
import { resetDatabase } from '../../src/db/reset';
import { getStorageBackend } from '../../src/db/connection';
import { TaskService } from '../../src/services/TaskService';
import { persistTaskModelOverrides, persistTaskEffortOverrides } from '../../src/board/taskModelOverride';
import {
  parseClaudeCommand,
  buildClaudePrompt,
  isValidEffortLevel,
  VALID_EFFORT_LEVELS,
  isValidModelAlias,
  MODEL_ALIASES,
  resolveModelAndEffort,
  resolveLaunchSettings,
  LaunchSettingsError,
} from '../../src/board/claudePromptBuilder';

beforeEach(() => {
  resetDatabase();
});

function buildServices() {
  const db = getStorageBackend();
  return { ts: new TaskService(db) };
}

describe('parseClaudeCommand', () => {
  it('recognizes planning and pr, defaults everything else to run', () => {
    expect(parseClaudeCommand('planning')).toBe('planning');
    expect(parseClaudeCommand('pr')).toBe('pr');
    expect(parseClaudeCommand('run')).toBe('run');
    expect(parseClaudeCommand(undefined)).toBe('run');
    expect(parseClaudeCommand('bogus')).toBe('run');
  });
});

describe('buildClaudePrompt', () => {
  const exitInstruction =
    "\n\nWhen you have completed this task, send 'exit' as a prompt (not as a bash command) to end this session.";

  it('builds the planning prompt without a branch instruction, even without a branch', () => {
    expect(buildClaudePrompt(1, 'planning', null)).toBe(`Task ID: 1\n/agkan-planning-subtask${exitInstruction}`);
  });

  it('builds the pr prompt', () => {
    expect(buildClaudePrompt(1, 'pr', 'feature/foo')).toBe(`Task ID: 1\n/agkan-subtask${exitInstruction}`);
  });

  it('builds the run prompt', () => {
    expect(buildClaudePrompt(1, 'run', 'feature/foo')).toBe(`Task ID: 1\n/agkan-subtask-direct${exitInstruction}`);
  });

  it('appends the branch-generation instruction for pr/run when branch is null or <auto-generate>', () => {
    const promptNull = buildClaudePrompt(2, 'run', null);
    const promptAuto = buildClaudePrompt(2, 'run', '<auto-generate>');
    expect(promptNull).toContain('No branch specified');
    expect(promptNull).toContain('PATCH /api/tasks/2');
    expect(promptAuto).toBe(promptNull);
  });

  it('appends the branch-generation instruction for the pr command too', () => {
    const promptNull = buildClaudePrompt(4, 'pr', null);
    const promptAuto = buildClaudePrompt(4, 'pr', '<auto-generate>');
    expect(promptNull).toContain('No branch specified');
    expect(promptAuto).toBe(promptNull);
  });

  it('omits the branch-generation instruction once a branch is set', () => {
    const prompt = buildClaudePrompt(3, 'run', 'feature/bar');
    expect(prompt).not.toContain('No branch specified');
  });
});

describe('isValidEffortLevel / VALID_EFFORT_LEVELS', () => {
  it('accepts each documented level', () => {
    for (const level of VALID_EFFORT_LEVELS) {
      expect(isValidEffortLevel(level)).toBe(true);
    }
  });

  it('rejects unknown levels', () => {
    expect(isValidEffortLevel('ultra')).toBe(false);
    expect(isValidEffortLevel('')).toBe(false);
  });
});

describe('isValidModelAlias / MODEL_ALIASES', () => {
  it('lists exactly the aliases the board dropdown offers', () => {
    expect([...MODEL_ALIASES]).toEqual(['fable', 'opus', 'sonnet', 'haiku']);
  });

  it('accepts each documented alias', () => {
    for (const alias of MODEL_ALIASES) {
      expect(isValidModelAlias(alias)).toBe(true);
    }
  });

  it('rejects unknown aliases', () => {
    expect(isValidModelAlias('gpt-5')).toBe(false);
    expect(isValidModelAlias('Opus')).toBe(false);
    expect(isValidModelAlias('')).toBe(false);
  });
});

describe('resolveModelAndEffort', () => {
  // loadConfig() reads '<cwd>/.agkan-test.yml'. Other test files (e.g.
  // claudeRoutes.test.ts) write that same repo-root path, and vitest runs
  // test files concurrently across forks, so writing there too would race.
  // Isolate by mocking process.cwd() to a private tmp dir per test, matching
  // the pattern in tests/db/config.test.ts.
  let tmpCwd: string;
  let cwdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'agkan-prompt-builder-test-'));
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpCwd);
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    fs.rmSync(tmpCwd, { recursive: true, force: true });
  });

  function writeConfig(config: unknown): void {
    fs.writeFileSync(path.join(tmpCwd, '.agkan-test.yml'), yaml.dump(config));
  }

  it('returns undefined for both when no config or override is set', () => {
    const { ts } = buildServices();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    expect(resolveModelAndEffort(ts, task.id, 'run')).toEqual({ model: undefined, effort: undefined });
  });

  it('falls back to the run config for both pr and run commands', () => {
    const { ts } = buildServices();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    writeConfig({ models: { run: { model: 'claude-sonnet-4-6', effort: 'high' } } });

    expect(resolveModelAndEffort(ts, task.id, 'run')).toEqual({ model: 'claude-sonnet-4-6', effort: 'high' });
    expect(resolveModelAndEffort(ts, task.id, 'pr')).toEqual({ model: 'claude-sonnet-4-6', effort: 'high' });
  });

  it('uses the planning config only for the planning command', () => {
    const { ts } = buildServices();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    writeConfig({ models: { planning: { effort: 'low' } } });

    expect(resolveModelAndEffort(ts, task.id, 'planning')).toEqual({ model: undefined, effort: 'low' });
    expect(resolveModelAndEffort(ts, task.id, 'run')).toEqual({ model: undefined, effort: undefined });
  });

  it('prefers a task-level override over the config file', () => {
    const { ts } = buildServices();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    writeConfig({ models: { run: { effort: 'high' } } });
    persistTaskEffortOverrides(task.id, { run: 'xhigh' }, ts);
    persistTaskModelOverrides(task.id, { run: 'opus' }, ts);

    expect(resolveModelAndEffort(ts, task.id, 'run')).toEqual({ model: 'opus', effort: 'xhigh' });
  });

  it('skips task-level overrides when no task service is supplied', () => {
    const { ts } = buildServices();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    writeConfig({ models: { run: { effort: 'high' } } });
    persistTaskEffortOverrides(task.id, { run: 'xhigh' }, ts);

    expect(resolveModelAndEffort(undefined, task.id, 'run')).toEqual({ model: undefined, effort: 'high' });
  });
});

describe('resolveLaunchSettings', () => {
  // loadConfig() reads '<cwd>/.agkan-test.yml'; isolate by mocking process.cwd()
  // to a private tmp dir, matching the resolveModelAndEffort describe above.
  let tmpCwd: string;
  let cwdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'agkan-launch-settings-test-'));
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpCwd);
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    fs.rmSync(tmpCwd, { recursive: true, force: true });
  });

  function writeConfig(config: unknown): void {
    fs.writeFileSync(path.join(tmpCwd, '.agkan-test.yml'), yaml.dump(config));
  }

  it('defaults to the claude agent with no model or effort', () => {
    const { ts } = buildServices();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    expect(resolveLaunchSettings(ts, task.id, 'run')).toEqual({
      agent: 'claude',
      model: undefined,
      effort: undefined,
    });
  });

  it('takes the agent from the catalog row of the task-level model override', () => {
    const { ts } = buildServices();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    ts.updateTask(task.id, { model_run: 'gpt-5.6-sol' });

    expect(resolveLaunchSettings(ts, task.id, 'run')).toEqual({
      agent: 'codex',
      model: 'gpt-5.6-sol',
      effort: undefined,
    });
  });

  it('throws when the task-level model is not in the catalog', () => {
    const { ts } = buildServices();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    ts.updateTask(task.id, { model_run: 'gpt-5' });

    expect(() => resolveLaunchSettings(ts, task.id, 'run')).toThrow(LaunchSettingsError);
    expect(() => resolveLaunchSettings(ts, task.id, 'run')).toThrow(
      'Task model "gpt-5" is not in modelCatalog. Must be one of: fable, opus, sonnet, haiku, gpt-5.6-sol'
    );
  });

  it('uses the configured agent and its models block when the task has no model override', () => {
    const { ts } = buildServices();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    writeConfig({
      agent: 'codex',
      models: { claude: { run: { model: 'sonnet' } }, codex: { run: { model: 'gpt-5.6-sol', effort: 'none' } } },
    });

    expect(resolveLaunchSettings(ts, task.id, 'run')).toEqual({
      agent: 'codex',
      model: 'gpt-5.6-sol',
      effort: 'none',
    });
  });

  it('validates the effort against the catalog row of the task-level model', () => {
    const { ts } = buildServices();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    ts.updateTask(task.id, { model_run: 'opus', effort_run: 'none' });

    expect(() => resolveLaunchSettings(ts, task.id, 'run')).toThrow(
      'Effort "none" is not allowed for model "opus". Must be one of: low, medium, high, xhigh, max'
    );
  });

  it('validates a config effort when the config model resolves to a catalog row', () => {
    const { ts } = buildServices();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    writeConfig({ models: { run: { model: 'opus', effort: 'none' } } });

    expect(() => resolveLaunchSettings(ts, task.id, 'run')).toThrow(
      'Effort "none" is not allowed for model "opus". Must be one of: low, medium, high, xhigh, max'
    );
  });

  it('passes a config effort through unvalidated when the config model is not in the catalog', () => {
    const { ts } = buildServices();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    writeConfig({ models: { run: { model: 'claude-sonnet-4-6', effort: 'ultra' } } });

    expect(resolveLaunchSettings(ts, task.id, 'run')).toEqual({
      agent: 'claude',
      model: 'claude-sonnet-4-6',
      effort: 'ultra',
    });
  });

  it('ignores a catalog row that belongs to another cli when resolving the config model', () => {
    const { ts } = buildServices();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    // gpt-5.6-sol is a codex row; with agent: claude it must not be used to
    // validate the effort, so the unknown effort passes through.
    writeConfig({ models: { claude: { run: { model: 'gpt-5.6-sol', effort: 'ultra' } } } });

    expect(resolveLaunchSettings(ts, task.id, 'run')).toEqual({
      agent: 'claude',
      model: 'gpt-5.6-sol',
      effort: 'ultra',
    });
  });

  it('uses the planning config only for the planning command', () => {
    const { ts } = buildServices();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    writeConfig({ models: { planning: { effort: 'low' }, run: { effort: 'high' } } });

    expect(resolveLaunchSettings(ts, task.id, 'planning').effort).toBe('low');
    expect(resolveLaunchSettings(ts, task.id, 'run').effort).toBe('high');
    expect(resolveLaunchSettings(ts, task.id, 'pr').effort).toBe('high');
  });

  it('skips task-level overrides when no task service is supplied', () => {
    const { ts } = buildServices();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    ts.updateTask(task.id, { model_run: 'gpt-5.6-sol' });

    expect(resolveLaunchSettings(undefined, task.id, 'run')).toEqual({
      agent: 'claude',
      model: undefined,
      effort: undefined,
    });
  });

  it('throws a plain Error (not LaunchSettingsError) when the configured catalog is invalid', () => {
    const { ts } = buildServices();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    writeConfig({ modelCatalog: 'claude' });

    expect(() => resolveLaunchSettings(ts, task.id, 'run')).toThrow(
      'Invalid modelCatalog: must be an array of { cli, model, efforts } entries'
    );
    expect(() => resolveLaunchSettings(ts, task.id, 'run')).not.toThrow(LaunchSettingsError);
  });
});
