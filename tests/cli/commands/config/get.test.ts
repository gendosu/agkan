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

  it('includes the resolved model catalog in the JSON output', async () => {
    vi.spyOn(configModule, 'loadConfig').mockReturnValue({});
    vi.spyOn(configModule, 'resolveDatabasePath').mockReturnValue('/fake/data.db');

    await program.parseAsync(['node', 'agkan', 'config', 'get', '--json']);

    const output = consoleLogSpy.mock.calls.map((c) => c[0]).join('');
    const parsed = JSON.parse(output);
    expect(parsed.config.modelCatalog).toEqual([
      { cli: 'claude', model: 'fable', efforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
      { cli: 'claude', model: 'opus', efforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
      { cli: 'claude', model: 'sonnet', efforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
      { cli: 'claude', model: 'haiku', efforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
    ]);
  });

  it('resolves the configured model catalog by dot notation', async () => {
    vi.spyOn(configModule, 'loadConfig').mockReturnValue({
      modelCatalog: [{ cli: 'codex', model: 'gpt-5.6-sol', efforts: ['low'] }],
    });
    vi.spyOn(configModule, 'resolveDatabasePath').mockReturnValue('/fake/data.db');

    await program.parseAsync(['node', 'agkan', 'config', 'get', 'modelCatalog', '--json']);

    const output = consoleLogSpy.mock.calls.map((c) => c[0]).join('');
    expect(JSON.parse(output).value).toEqual([{ cli: 'codex', model: 'gpt-5.6-sol', efforts: ['low'] }]);
  });

  it('prints one text line per catalog row', async () => {
    vi.spyOn(configModule, 'loadConfig').mockReturnValue({
      modelCatalog: [{ cli: 'codex', model: 'gpt-5.6-sol', efforts: ['none', 'low'] }],
    });
    vi.spyOn(configModule, 'resolveDatabasePath').mockReturnValue('/fake/data.db');

    await program.parseAsync(['node', 'agkan', 'config', 'get']);

    const output = consoleLogSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('modelCatalog: codex gpt-5.6-sol (none, low)');
  });

  it('should apply default board port when not specified', async () => {
    vi.spyOn(configModule, 'loadConfig').mockReturnValue({});
    vi.spyOn(configModule, 'resolveDatabasePath').mockReturnValue('/default/path/data.db');

    await program.parseAsync(['node', 'agkan', 'config', 'get', '--json']);

    const output = consoleLogSpy.mock.calls.map((c) => c[0]).join('');
    const parsed = JSON.parse(output);
    expect(parsed.config.board.port).toBe(DEFAULT_BOARD_PORT);
    expect(parsed.config.agent).toBe('claude');
  });

  it('outputs codex when configured as the agent', async () => {
    vi.spyOn(configModule, 'loadConfig').mockReturnValue({ agent: 'codex' });
    vi.spyOn(configModule, 'resolveDatabasePath').mockReturnValue('/default/path/data.db');

    await program.parseAsync(['node', 'agkan', 'config', 'get', 'agent', '--json']);

    const output = consoleLogSpy.mock.calls.map((c) => c[0]).join('');
    expect(JSON.parse(output).value).toBe('codex');
  });

  it('outputs agent-specific model settings by dot notation', async () => {
    vi.spyOn(configModule, 'loadConfig').mockReturnValue({
      agent: 'codex',
      models: {
        claude: { run: { model: 'claude-sonnet' } },
        codex: { run: { model: 'gpt-codex' } },
      },
    });
    vi.spyOn(configModule, 'resolveDatabasePath').mockReturnValue('/fake/data.db');

    await program.parseAsync(['node', 'agkan', 'config', 'get', 'models.codex.run.model', '--json']);

    const output = consoleLogSpy.mock.calls.map((c) => c[0]).join('');
    expect(JSON.parse(output).value).toBe('gpt-codex');
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
