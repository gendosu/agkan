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
import { MetadataService } from '../../src/services/MetadataService';
import { persistTaskModelOverrides, persistTaskEffortOverrides } from '../../src/board/taskModelOverride';
import {
  parseClaudeCommand,
  buildClaudePrompt,
  isValidEffortLevel,
  VALID_EFFORT_LEVELS,
  resolveModelAndEffort,
} from '../../src/board/claudePromptBuilder';

beforeEach(() => {
  resetDatabase();
});

function buildServices() {
  const db = getStorageBackend();
  return { ts: new TaskService(db), ms: new MetadataService(db) };
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
    const { ts, ms } = buildServices();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    expect(resolveModelAndEffort(ms, task.id, 'run')).toEqual({ model: undefined, effort: undefined });
  });

  it('falls back to the run config for both pr and run commands', () => {
    const { ts, ms } = buildServices();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    writeConfig({ models: { run: { model: 'claude-sonnet-4-6', effort: 'high' } } });

    expect(resolveModelAndEffort(ms, task.id, 'run')).toEqual({ model: 'claude-sonnet-4-6', effort: 'high' });
    expect(resolveModelAndEffort(ms, task.id, 'pr')).toEqual({ model: 'claude-sonnet-4-6', effort: 'high' });
  });

  it('uses the planning config only for the planning command', () => {
    const { ts, ms } = buildServices();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    writeConfig({ models: { planning: { effort: 'low' } } });

    expect(resolveModelAndEffort(ms, task.id, 'planning')).toEqual({ model: undefined, effort: 'low' });
    expect(resolveModelAndEffort(ms, task.id, 'run')).toEqual({ model: undefined, effort: undefined });
  });

  it('prefers a task-level override over the config file', () => {
    const { ts, ms } = buildServices();
    const task = ts.createTask({ title: 'Task', status: 'backlog' });
    writeConfig({ models: { run: { effort: 'high' } } });
    persistTaskEffortOverrides(task.id, { run: 'xhigh' }, ms);
    persistTaskModelOverrides(task.id, { run: 'opus' }, ms);

    expect(resolveModelAndEffort(ms, task.id, 'run')).toEqual({ model: 'opus', effort: 'xhigh' });
  });
});
