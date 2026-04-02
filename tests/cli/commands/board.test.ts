/**
 * Tests for board command handler
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Command } from 'commander';
import { setupBoardCommand } from '../../../src/cli/commands/board';

vi.mock('../../../src/board/server', () => ({
  startBoardServer: vi.fn(),
}));

vi.mock('../../../src/db/config', () => ({
  loadConfig: vi.fn(() => ({})),
}));

vi.mock('../../../src/cli/utils/board-daemon', () => ({
  isBoardRunning: vi.fn(),
  spawnBoardDaemon: vi.fn(() => 12345),
  killBoardProcess: vi.fn(() => true),
}));

import { startBoardServer } from '../../../src/board/server';
import { loadConfig } from '../../../src/db/config';
import { isBoardRunning, spawnBoardDaemon, killBoardProcess } from '../../../src/cli/utils/board-daemon';

const mockLoadConfig = vi.mocked(loadConfig);
const mockIsBoardRunning = vi.mocked(isBoardRunning);
const mockSpawnBoardDaemon = vi.mocked(spawnBoardDaemon);
const mockKillBoardProcess = vi.mocked(killBoardProcess);

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
    mockLoadConfig.mockReturnValue({});
    mockIsBoardRunning.mockReturnValue(false);
    mockSpawnBoardDaemon.mockReturnValue(12345);
    mockKillBoardProcess.mockReturnValue(true);
    program = createProgram();
  });

  it('should register the board command', () => {
    const boardCommand = program.commands.find((cmd) => cmd.name() === 'board');
    expect(boardCommand).toBeDefined();
    expect(boardCommand?.description()).toBe('Start a local Kanban board viewer at localhost');
  });

  it('should have a --port option', () => {
    const boardCommand = program.commands.find((cmd) => cmd.name() === 'board');
    expect(boardCommand).toBeDefined();
    const portOption = boardCommand?.options.find((o) => o.long === '--port');
    expect(portOption).toBeDefined();
  });

  it('should have a --title option', () => {
    const boardCommand = program.commands.find((cmd) => cmd.name() === 'board');
    expect(boardCommand).toBeDefined();
    const titleOption = boardCommand?.options.find((o) => o.long === '--title');
    expect(titleOption).toBeDefined();
  });

  it('should call startBoardServer with default port 8080 when no config', async () => {
    mockLoadConfig.mockReturnValue({});
    await program.parseAsync(['node', 'test', 'board']);
    expect(startBoardServer).toHaveBeenCalledWith(8080, undefined);
  });

  it('should call startBoardServer with custom port', async () => {
    await program.parseAsync(['node', 'test', 'board', '--port', '3000']);
    expect(startBoardServer).toHaveBeenCalledWith(3000, undefined);
  });

  it('should call startBoardServer with title when --title is provided', async () => {
    await program.parseAsync(['node', 'test', 'board', '--title', 'My Project']);
    expect(startBoardServer).toHaveBeenCalledWith(8080, 'My Project');
  });

  it('should call startBoardServer with both custom port and title', async () => {
    await program.parseAsync(['node', 'test', 'board', '--port', '3000', '--title', 'My Project']);
    expect(startBoardServer).toHaveBeenCalledWith(3000, 'My Project');
  });

  it('should call startBoardServer with title when -t shorthand is used', async () => {
    await program.parseAsync(['node', 'test', 'board', '-t', 'Short Title']);
    expect(startBoardServer).toHaveBeenCalledWith(8080, 'Short Title');
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

  describe('config file integration', () => {
    it('should use port from config when --port flag is not provided', async () => {
      mockLoadConfig.mockReturnValue({ board: { port: 9090 } });
      program = createProgram();
      await program.parseAsync(['node', 'test', 'board']);
      expect(startBoardServer).toHaveBeenCalledWith(9090, undefined);
    });

    it('should use title from config when --title flag is not provided', async () => {
      mockLoadConfig.mockReturnValue({ board: { title: 'Config Title' } });
      program = createProgram();
      await program.parseAsync(['node', 'test', 'board']);
      expect(startBoardServer).toHaveBeenCalledWith(8080, 'Config Title');
    });

    it('should use both port and title from config', async () => {
      mockLoadConfig.mockReturnValue({ board: { port: 4000, title: 'My Board' } });
      program = createProgram();
      await program.parseAsync(['node', 'test', 'board']);
      expect(startBoardServer).toHaveBeenCalledWith(4000, 'My Board');
    });

    it('should prefer CLI --port flag over config port', async () => {
      mockLoadConfig.mockReturnValue({ board: { port: 9090 } });
      program = createProgram();
      await program.parseAsync(['node', 'test', 'board', '--port', '3000']);
      expect(startBoardServer).toHaveBeenCalledWith(3000, undefined);
    });

    it('should prefer CLI --title flag over config title', async () => {
      mockLoadConfig.mockReturnValue({ board: { title: 'Config Title' } });
      program = createProgram();
      await program.parseAsync(['node', 'test', 'board', '--title', 'CLI Title']);
      expect(startBoardServer).toHaveBeenCalledWith(8080, 'CLI Title');
    });

    it('should prefer CLI flags over all config values', async () => {
      mockLoadConfig.mockReturnValue({ board: { port: 9090, title: 'Config Title' } });
      program = createProgram();
      await program.parseAsync(['node', 'test', 'board', '--port', '3000', '--title', 'CLI Title']);
      expect(startBoardServer).toHaveBeenCalledWith(3000, 'CLI Title');
    });
  });

  describe('board start subcommand', () => {
    it('should spawn daemon with default port when not running', async () => {
      const logs: string[] = [];
      const spy = vi.spyOn(console, 'log').mockImplementation((...a) => logs.push(a.join(' ')));

      await program.parseAsync(['node', 'test', 'board', 'start']);

      expect(mockSpawnBoardDaemon).toHaveBeenCalledWith(['--port', '8080']);
      expect(logs.some((l) => l.includes('Board server started'))).toBe(true);
      spy.mockRestore();
    });

    it('should spawn daemon with custom port', async () => {
      await program.parseAsync(['node', 'test', 'board', '--port', '3000', 'start']);
      expect(mockSpawnBoardDaemon).toHaveBeenCalledWith(['--port', '3000']);
    });

    it('should spawn daemon with title when provided', async () => {
      await program.parseAsync(['node', 'test', 'board', '--title', 'My Board', 'start']);
      expect(mockSpawnBoardDaemon).toHaveBeenCalledWith(['--port', '8080', '--title', 'My Board']);
    });

    it('should log already running when board is running', async () => {
      mockIsBoardRunning.mockReturnValue(true);
      const logs: string[] = [];
      const spy = vi.spyOn(console, 'log').mockImplementation((...a) => logs.push(a.join(' ')));

      await program.parseAsync(['node', 'test', 'board', 'start']);

      expect(mockSpawnBoardDaemon).not.toHaveBeenCalled();
      expect(logs).toContain('Board server is already running');
      spy.mockRestore();
    });

    it('should use port from config', async () => {
      mockLoadConfig.mockReturnValue({ board: { port: 9090 } });
      program = createProgram();
      await program.parseAsync(['node', 'test', 'board', 'start']);
      expect(mockSpawnBoardDaemon).toHaveBeenCalledWith(['--port', '9090']);
    });

    it('should use title from config', async () => {
      mockLoadConfig.mockReturnValue({ board: { title: 'Config Board' } });
      program = createProgram();
      await program.parseAsync(['node', 'test', 'board', 'start']);
      expect(mockSpawnBoardDaemon).toHaveBeenCalledWith(['--port', '8080', '--title', 'Config Board']);
    });

    it('should exit with code 1 for invalid port', async () => {
      let exitCode: number | undefined;
      const originalExit = process.exit;
      process.exit = ((code?: number) => {
        exitCode = code;
      }) as never;

      try {
        await program.parseAsync(['node', 'test', 'board', '--port', 'bad', 'start']);
      } finally {
        process.exit = originalExit;
      }

      expect(exitCode).toBe(1);
      expect(mockSpawnBoardDaemon).not.toHaveBeenCalled();
    });
  });

  describe('board stop subcommand', () => {
    it('should kill board process when running', async () => {
      mockIsBoardRunning.mockReturnValue(true);
      const logs: string[] = [];
      const spy = vi.spyOn(console, 'log').mockImplementation((...a) => logs.push(a.join(' ')));

      await program.parseAsync(['node', 'test', 'board', 'stop']);

      expect(mockKillBoardProcess).toHaveBeenCalled();
      expect(logs).toContain('Board server stopped');
      spy.mockRestore();
    });

    it('should log not running when board is not running', async () => {
      mockIsBoardRunning.mockReturnValue(false);
      const logs: string[] = [];
      const spy = vi.spyOn(console, 'log').mockImplementation((...a) => logs.push(a.join(' ')));

      await program.parseAsync(['node', 'test', 'board', 'stop']);

      expect(mockKillBoardProcess).not.toHaveBeenCalled();
      expect(logs).toContain('Board server is not running');
      spy.mockRestore();
    });

    it('should exit with code 1 when kill fails', async () => {
      mockIsBoardRunning.mockReturnValue(true);
      mockKillBoardProcess.mockReturnValue(false);

      let exitCode: number | undefined;
      const originalExit = process.exit;
      process.exit = ((code?: number) => {
        exitCode = code;
      }) as never;

      try {
        await program.parseAsync(['node', 'test', 'board', 'stop']);
      } finally {
        process.exit = originalExit;
      }

      expect(exitCode).toBe(1);
    });
  });

  describe('board restart subcommand', () => {
    it('should kill and respawn daemon', async () => {
      const logs: string[] = [];
      const spy = vi.spyOn(console, 'log').mockImplementation((...a) => logs.push(a.join(' ')));

      await program.parseAsync(['node', 'test', 'board', 'restart']);

      expect(mockKillBoardProcess).toHaveBeenCalled();
      expect(mockSpawnBoardDaemon).toHaveBeenCalledWith(['--port', '8080']);
      expect(logs.some((l) => l.includes('Board server restarted'))).toBe(true);
      spy.mockRestore();
    });

    it('should restart with custom port', async () => {
      await program.parseAsync(['node', 'test', 'board', '--port', '4000', 'restart']);
      expect(mockSpawnBoardDaemon).toHaveBeenCalledWith(['--port', '4000']);
    });

    it('should restart with title', async () => {
      await program.parseAsync(['node', 'test', 'board', '--title', 'New Title', 'restart']);
      expect(mockSpawnBoardDaemon).toHaveBeenCalledWith(['--port', '8080', '--title', 'New Title']);
    });

    it('should restart even when board is not currently running', async () => {
      mockKillBoardProcess.mockReturnValue(false);

      await program.parseAsync(['node', 'test', 'board', 'restart']);

      expect(mockSpawnBoardDaemon).toHaveBeenCalled();
    });
  });
});
