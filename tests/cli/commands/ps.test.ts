/**
 * Tests for ps command handler
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Command } from 'commander';
import { setupPsCommand } from '../../../src/cli/commands/ps';

vi.mock('../../../src/db/config', () => ({
  loadConfig: vi.fn(() => ({})),
}));

vi.mock('../../../src/cli/utils/service-container', () => ({
  getServiceContainer: vi.fn(() => ({
    taskService: {
      getTask: vi.fn((id: number) => {
        const tasks: Record<number, { id: number; title: string }> = {
          1: { id: 1, title: 'Task One' },
          2: { id: 2, title: 'Task Two' },
        };
        return tasks[id] ?? null;
      }),
    },
  })),
}));

import { loadConfig } from '../../../src/db/config';

const mockLoadConfig = vi.mocked(loadConfig);

function createProgram(): Command {
  const prog = new Command();
  prog.exitOverride();
  setupPsCommand(prog);
  return prog;
}

function mockFetch(response: unknown, ok = true): void {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => response,
  });
}

describe('setupPsCommand', () => {
  let program: Command;
  let consoleLogs: string[];
  let consoleErrors: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadConfig.mockReturnValue({});
    program = createProgram();
    consoleLogs = [];
    consoleErrors = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => consoleLogs.push(args.join(' ')));
    vi.spyOn(console, 'error').mockImplementation((...args) => consoleErrors.push(args.join(' ')));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers the ps command at top level', () => {
    const psCommand = program.commands.find((cmd) => cmd.name() === 'ps');
    expect(psCommand).toBeDefined();
    expect(psCommand?.description()).toBe('List currently executing Claude processes');
  });

  it('has --port option', () => {
    const psCommand = program.commands.find((cmd) => cmd.name() === 'ps');
    const portOption = psCommand?.options.find((o) => o.long === '--port');
    expect(portOption).toBeDefined();
  });

  it('has --json option', () => {
    const psCommand = program.commands.find((cmd) => cmd.name() === 'ps');
    const jsonOption = psCommand?.options.find((o) => o.long === '--json');
    expect(jsonOption).toBeDefined();
  });

  it('displays no processes message when none are running', async () => {
    mockFetch({ tasks: [] });
    await program.parseAsync(['node', 'test', 'ps']);
    expect(consoleLogs.join(' ')).toContain('No Claude processes currently running');
  });

  it('displays running processes with task title and command', async () => {
    mockFetch({ tasks: [{ taskId: 1, command: 'run' }] });
    await program.parseAsync(['node', 'test', 'ps']);
    const output = consoleLogs.join('\n');
    expect(output).toContain('[1]');
    expect(output).toContain('Task One');
    expect(output).toContain('run');
  });

  it('displays multiple running processes', async () => {
    mockFetch({
      tasks: [
        { taskId: 1, command: 'run' },
        { taskId: 2, command: 'planning' },
      ],
    });
    await program.parseAsync(['node', 'test', 'ps']);
    const output = consoleLogs.join('\n');
    expect(output).toContain('[1]');
    expect(output).toContain('Task One');
    expect(output).toContain('[2]');
    expect(output).toContain('Task Two');
    expect(output).toContain('planning');
  });

  it('shows (unknown) for tasks not found in DB', async () => {
    mockFetch({ tasks: [{ taskId: 999, command: 'run' }] });
    await program.parseAsync(['node', 'test', 'ps']);
    const output = consoleLogs.join('\n');
    expect(output).toContain('[999]');
    expect(output).toContain('(unknown)');
  });

  it('outputs JSON when --json flag is used with no processes', async () => {
    mockFetch({ tasks: [] });
    await program.parseAsync(['node', 'test', 'ps', '--json']);
    const parsed = JSON.parse(consoleLogs[0]);
    expect(parsed).toEqual({ processes: [] });
  });

  it('outputs JSON when --json flag is used with processes', async () => {
    mockFetch({ tasks: [{ taskId: 1, command: 'run' }] });
    await program.parseAsync(['node', 'test', 'ps', '--json']);
    const parsed = JSON.parse(consoleLogs[0]);
    expect(parsed).toEqual({
      processes: [{ taskId: 1, title: 'Task One', command: 'run' }],
    });
  });

  it('uses port from config when --port flag is not provided', async () => {
    mockLoadConfig.mockReturnValue({ board: { port: 9090 } });
    program = createProgram();
    mockFetch({ tasks: [] });
    await program.parseAsync(['node', 'test', 'ps']);
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:9090/api/running-tasks');
  });

  it('uses custom port when --port flag is provided', async () => {
    mockFetch({ tasks: [] });
    await program.parseAsync(['node', 'test', 'ps', '--port', '3000']);
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:3000/api/running-tasks');
  });

  it('uses default port 8080 when no config and no flag', async () => {
    mockFetch({ tasks: [] });
    await program.parseAsync(['node', 'test', 'ps']);
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:8080/api/running-tasks');
  });

  it('exits with code 1 when board server is not reachable', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'ps']);
    } finally {
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    expect(consoleErrors.join(' ')).toContain('Could not connect to board server');
  });

  it('exits with code 1 for invalid port', async () => {
    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'ps', '--port', 'abc']);
    } finally {
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
  });
});
