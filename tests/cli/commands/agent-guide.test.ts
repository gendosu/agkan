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
});
