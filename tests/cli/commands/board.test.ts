/**
 * Tests for board command handler
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Command } from 'commander';
import { setupBoardCommand } from '../../../src/cli/commands/board';

vi.mock('../../../src/board/server', () => ({
  startBoardServer: vi.fn(),
}));

import { startBoardServer } from '../../../src/board/server';

function createProgram(): Command {
  const prog = new Command();
  prog.exitOverride();
  setupBoardCommand(prog);
  return prog;
}

describe('setupBoardCommand', () => {
  let program: Command;

  beforeEach(() => {
    vi.clearAllMocks();
    program = createProgram();
  });

  it('should register the board command', () => {
    const boardCommand = program.commands.find((cmd) => cmd.name() === 'board');
    expect(boardCommand).toBeDefined();
    expect(boardCommand?.description()).toBe('Start a local Kanban board viewer at localhost');
  });

  it('should have a --port option defaulting to 8080', () => {
    const boardCommand = program.commands.find((cmd) => cmd.name() === 'board');
    expect(boardCommand).toBeDefined();
    const portOption = boardCommand?.options.find((o) => o.long === '--port');
    expect(portOption).toBeDefined();
    expect(portOption?.defaultValue).toBe('8080');
  });

  it('should call startBoardServer with default port 8080', async () => {
    await program.parseAsync(['node', 'test', 'board']);
    expect(startBoardServer).toHaveBeenCalledWith(8080);
  });

  it('should call startBoardServer with custom port', async () => {
    await program.parseAsync(['node', 'test', 'board', '--port', '3000']);
    expect(startBoardServer).toHaveBeenCalledWith(3000);
  });

  it('should exit with code 1 for invalid port', async () => {
    const logs: string[] = [];
    const originalError = console.error;
    console.error = (...a: unknown[]) => logs.push(a.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'board', '--port', 'abc']);
    } finally {
      console.error = originalError;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    expect(startBoardServer).not.toHaveBeenCalled();
  });
});
