/**
 * Tests for context command handler
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Command } from 'commander';
import { setupContextCommand } from '../../../src/cli/commands/context';
import { createProgram, runCommand } from '../../helpers/command-test-utils';

describe('setupContextCommand', () => {
  let program: Command;

  beforeEach(() => {
    program = createProgram(setupContextCommand);
  });

  it('should register the context command', () => {
    const cmd = program.commands.find((c) => c.name() === 'context');
    expect(cmd).toBeDefined();
    expect(cmd?.description()).toBe('Output minimal agkan context for Claude Code SessionStart hook');
  });

  it('should output plain text guide without --hook flag', async () => {
    const { logs } = await runCommand(program, ['context']);
    const output = logs.join('\n');

    expect(output).toContain('agkan');
    expect(output).toContain('agkan task list');
    expect(output).toContain('agkan task add');
    expect(output).toContain('agkan agent-guide');
  });

  it('should reference the seven statuses in correct order', async () => {
    const { logs } = await runCommand(program, ['context']);
    const output = logs.join('\n');

    expect(output).toContain('icebox');
    expect(output).toContain('backlog');
    expect(output).toContain('ready');
    expect(output).toContain('in_progress');
    expect(output).toContain('review');
    expect(output).toContain('done');
    expect(output).toContain('closed');
  });

  it('should output non-JSON plain text by default', async () => {
    const { logs } = await runCommand(program, ['context']);
    const output = logs.join('\n');

    expect(output).not.toMatch(/^\{/);
  });

  it('should output single-line JSON with additionalContext when --hook is given', async () => {
    const { logs } = await runCommand(program, ['context', '--hook']);
    expect(logs).toHaveLength(1);

    const parsed = JSON.parse(logs[0]);
    expect(parsed).toHaveProperty('additionalContext');
    expect(typeof parsed.additionalContext).toBe('string');
    expect(parsed.additionalContext).toContain('agkan task list');
  });

  it('should output a short minimal guide (under ~50 lines)', async () => {
    const { logs } = await runCommand(program, ['context']);
    const lineCount = logs.join('\n').split('\n').length;

    expect(lineCount).toBeLessThan(50);
  });
});
