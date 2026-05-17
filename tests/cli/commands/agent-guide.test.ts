/**
 * Tests for agent-guide command handler
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Command } from 'commander';
import { setupAgentGuideCommand } from '../../../src/cli/commands/agent-guide';
import { createProgram, runCommand } from '../../helpers/command-test-utils';

describe('setupAgentGuideCommand', () => {
  let program: Command;

  beforeEach(() => {
    program = createProgram(setupAgentGuideCommand);
  });

  it('should register the agent-guide command', () => {
    const agentGuideCommand = program.commands.find((cmd) => cmd.name() === 'agent-guide');
    expect(agentGuideCommand).toBeDefined();
    expect(agentGuideCommand?.description()).toBe('Show agent guide for using agkan');
  });

  it('should output SKILL.md content when executed', async () => {
    const { logs } = await runCommand(program, ['agent-guide']);
    const output = logs.join('\n');

    // Check that the output contains agkan-related content from SKILL.md
    expect(output).toContain('agkan');
    expect(output).toContain('agkan task add');
    expect(output).toContain('agkan task list');
  });

  it('should contain status descriptions with 7 statuses', async () => {
    const { logs } = await runCommand(program, ['agent-guide']);
    const output = logs.join('\n');

    expect(output).toContain('7 statuses');
  });

  it('should contain icebox status', async () => {
    const { logs } = await runCommand(program, ['agent-guide']);
    const output = logs.join('\n');

    expect(output).toContain('icebox');
  });

  it('should contain review status', async () => {
    const { logs } = await runCommand(program, ['agent-guide']);
    const output = logs.join('\n');

    expect(output).toContain('review');
  });

  it('should output plain text without --hook flag', async () => {
    const { logs } = await runCommand(program, ['agent-guide']);
    const output = logs.join('\n');

    expect(output).not.toMatch(/^\{/);
    expect(output).toContain('agkan');
  });

  it('should output JSON with additionalContext when --hook flag is specified', async () => {
    const { logs } = await runCommand(program, ['agent-guide', '--hook']);
    const output = logs.join('\n');

    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty('additionalContext');
    expect(typeof parsed.additionalContext).toBe('string');
    expect(parsed.additionalContext).toContain('agkan');
  });

  it('should output valid single-line JSON when --hook flag is specified', async () => {
    const { logs } = await runCommand(program, ['agent-guide', '--hook']);
    expect(logs).toHaveLength(1);
    expect(() => JSON.parse(logs[0])).not.toThrow();
  });

  it('should output deprecation warning to stderr when --hook flag is specified', async () => {
    const { errors } = await runCommand(program, ['agent-guide', '--hook']);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('DEPRECATED');
    expect(errors[0]).toContain('agkan context --hook');
  });

  it('should not output deprecation warning to stderr without --hook flag', async () => {
    const { errors } = await runCommand(program, ['agent-guide']);
    expect(errors).toHaveLength(0);
  });

  it('should output JSON to stdout unchanged when --hook flag is specified', async () => {
    const { logs } = await runCommand(program, ['agent-guide', '--hook']);
    const parsed = JSON.parse(logs[0]);
    expect(parsed).toHaveProperty('additionalContext');
    expect(parsed.additionalContext).toContain('agkan');
  });
});
