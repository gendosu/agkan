import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Command } from 'commander';
import { setupConfigGetCommand, DEFAULT_BOARD_PORT } from '../../../../src/cli/commands/config/get';
import * as configModule from '../../../../src/db/config';

describe('setupConfigGetCommand', () => {
  let program: Command;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    program = new Command();
    program.exitOverride();
    setupConfigGetCommand(program);
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should register the config get command', () => {
    const configCommand = program.commands.find((cmd) => cmd.name() === 'config');
    expect(configCommand).toBeDefined();

    const getCommand = configCommand?.commands.find((cmd) => cmd.name() === 'get');
    expect(getCommand).toBeDefined();
    expect(getCommand?.description()).toBe('Get resolved config values from .agkan.yml');
  });

  it('should have --json option', () => {
    const configCommand = program.commands.find((cmd) => cmd.name() === 'config');
    const getCommand = configCommand?.commands.find((cmd) => cmd.name() === 'get');
    const optionNames = (getCommand?.options || []).map((o) => o.long);
    expect(optionNames).toContain('--json');
  });

  it('should output full config as JSON', async () => {
    vi.spyOn(configModule, 'loadConfig').mockReturnValue({ board: { port: 9090 } });
    vi.spyOn(configModule, 'resolveDatabasePath').mockReturnValue('/fake/path/data.db');

    await program.parseAsync(['node', 'agkan', 'config', 'get', '--json']);

    const output = consoleLogSpy.mock.calls.map((c) => c[0]).join('');
    const parsed = JSON.parse(output);
    expect(parsed.success).toBe(true);
    expect(parsed.config.board.port).toBe(9090);
    expect(parsed.config.path).toBe('/fake/path/data.db');
  });

  it('should apply default board port when not specified', async () => {
    vi.spyOn(configModule, 'loadConfig').mockReturnValue({});
    vi.spyOn(configModule, 'resolveDatabasePath').mockReturnValue('/default/path/data.db');

    await program.parseAsync(['node', 'agkan', 'config', 'get', '--json']);

    const output = consoleLogSpy.mock.calls.map((c) => c[0]).join('');
    const parsed = JSON.parse(output);
    expect(parsed.config.board.port).toBe(DEFAULT_BOARD_PORT);
  });

  it('should output specific key value', async () => {
    vi.spyOn(configModule, 'loadConfig').mockReturnValue({ board: { port: 7777 } });
    vi.spyOn(configModule, 'resolveDatabasePath').mockReturnValue('/fake/data.db');

    await program.parseAsync(['node', 'agkan', 'config', 'get', 'board.port', '--json']);

    const output = consoleLogSpy.mock.calls.map((c) => c[0]).join('');
    const parsed = JSON.parse(output);
    expect(parsed.success).toBe(true);
    expect(parsed.key).toBe('board.port');
    expect(parsed.value).toBe(7777);
  });

  it('should error on unknown key', async () => {
    vi.spyOn(configModule, 'loadConfig').mockReturnValue({});
    vi.spyOn(configModule, 'resolveDatabasePath').mockReturnValue('/fake/data.db');

    await expect(program.parseAsync(['node', 'agkan', 'config', 'get', 'nonexistent.key', '--json'])).rejects.toThrow(
      'process.exit'
    );
  });
});
