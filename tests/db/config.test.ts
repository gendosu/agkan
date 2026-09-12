import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import yaml from 'js-yaml';

/**
 * Comprehensive test suite for database path resolution
 *
 * Tests cover:
 * - Normal mode (NODE_ENV != 'test')
 * - Test mode (NODE_ENV = 'test')
 * - Environment variable priority
 * - Configuration file fallback
 * - Legacy config file fallback (.akan.yml → .agkan.yml)
 * - Default path fallback
 * - Error handling
 */

// Import functions that will be implemented in Phase 2.2
// These imports will fail until src/db/config.ts is created
import {
  resolveDatabasePath,
  isTestMode,
  getConfigFileName,
  getDefaultDirName,
  loadConfig,
  resolveAgentTool,
  resolveModelSettings,
  buildAgyPermissionArgs,
  buildGrokPermissionArgs,
  resolveProjectRoot,
} from '../../src/db/config';

describe('Agent tool resolution', () => {
  it('defaults to claude', () => {
    expect(resolveAgentTool({})).toBe('claude');
  });

  it('accepts codex', () => {
    expect(resolveAgentTool({ agent: 'codex' })).toBe('codex');
  });

  it('accepts agy', () => {
    expect(resolveAgentTool({ agent: 'agy' })).toBe('agy');
  });

  it('accepts grok', () => {
    expect(resolveAgentTool({ agent: 'grok' })).toBe('grok');
  });

  it('selects agent-specific model settings', () => {
    const config = {
      agent: 'codex' as const,
      models: {
        claude: { run: { model: 'claude-sonnet' } },
        codex: { run: { model: 'gpt-codex', effort: 'high' } },
      },
    };

    expect(resolveModelSettings(config, 'run')).toEqual({ model: 'gpt-codex', effort: 'high' });
  });

  it('falls back to legacy flat model settings', () => {
    expect(resolveModelSettings({ agent: 'codex', models: { run: { model: 'legacy-model' } } }, 'run')).toEqual({
      model: 'legacy-model',
    });
  });

  it('uses the explicitly passed agent instead of the configured one', () => {
    const config = {
      agent: 'codex' as const,
      models: {
        claude: { run: { model: 'claude-sonnet', effort: 'low' } },
        codex: { run: { model: 'gpt-codex', effort: 'high' } },
      },
    };

    expect(resolveModelSettings(config, 'run', 'claude')).toEqual({ model: 'claude-sonnet', effort: 'low' });
  });

  it('falls back to the legacy flat settings for the explicitly passed agent', () => {
    const config = {
      agent: 'claude' as const,
      models: { run: { model: 'legacy-model' } },
    };

    expect(resolveModelSettings(config, 'run', 'codex')).toEqual({ model: 'legacy-model' });
  });

  it('rejects unsupported values loaded from YAML', () => {
    expect(() => resolveAgentTool({ agent: 'other' as 'claude' })).toThrow(
      'Invalid agent "other". Must be one of: claude, codex, agy, grok'
    );
  });
});

describe('buildAgyPermissionArgs', () => {
  it('maps skipPermissions to the dangerous skip flag', () => {
    expect(buildAgyPermissionArgs({ permissionMode: 'skipPermissions' })).toEqual(['--dangerously-skip-permissions']);
  });

  it('maps bypassPermissions to the dangerous skip flag', () => {
    expect(buildAgyPermissionArgs({ permissionMode: 'bypassPermissions' })).toEqual(['--dangerously-skip-permissions']);
  });

  it('maps dontAsk to accept-edits mode', () => {
    expect(buildAgyPermissionArgs({ permissionMode: 'dontAsk' })).toEqual(['--mode', 'accept-edits']);
  });

  it('maps plan to plan mode', () => {
    expect(buildAgyPermissionArgs({ permissionMode: 'plan' })).toEqual(['--mode', 'plan']);
  });

  // agy has no equivalent of claude's "auto" mode, so the non-interactive default is
  // approximated with its skip-permissions flag.
  it('maps auto to the dangerous skip flag', () => {
    expect(buildAgyPermissionArgs({ permissionMode: 'auto' })).toEqual(['--dangerously-skip-permissions']);
  });

  it('maps an unset permission mode to the dangerous skip flag', () => {
    expect(buildAgyPermissionArgs({})).toEqual(['--dangerously-skip-permissions']);
  });

  it('passes no flags for the default (interactive) permission mode', () => {
    expect(buildAgyPermissionArgs({ permissionMode: 'default' })).toEqual([]);
  });
});

describe('buildGrokPermissionArgs', () => {
  it('defaults to auto when unset', () => {
    expect(buildGrokPermissionArgs({})).toEqual(['--permission-mode', 'auto']);
  });

  it('passes auto explicitly', () => {
    expect(buildGrokPermissionArgs({ permissionMode: 'auto' })).toEqual(['--permission-mode', 'auto']);
  });

  it('maps skipPermissions to bypassPermissions', () => {
    expect(buildGrokPermissionArgs({ permissionMode: 'skipPermissions' })).toEqual([
      '--permission-mode',
      'bypassPermissions',
    ]);
  });

  it('passes bypassPermissions directly', () => {
    expect(buildGrokPermissionArgs({ permissionMode: 'bypassPermissions' })).toEqual([
      '--permission-mode',
      'bypassPermissions',
    ]);
  });

  it('passes acceptEdits directly', () => {
    expect(buildGrokPermissionArgs({ permissionMode: 'acceptEdits' })).toEqual(['--permission-mode', 'acceptEdits']);
  });

  it('passes dontAsk directly', () => {
    expect(buildGrokPermissionArgs({ permissionMode: 'dontAsk' })).toEqual(['--permission-mode', 'dontAsk']);
  });

  it('passes plan directly', () => {
    expect(buildGrokPermissionArgs({ permissionMode: 'plan' })).toEqual(['--permission-mode', 'plan']);
  });

  it('passes default directly', () => {
    expect(buildGrokPermissionArgs({ permissionMode: 'default' })).toEqual(['--permission-mode', 'default']);
  });
});

describe('Database Path Resolution', () => {
  const originalEnv = process.env;
  const testConfigFile = '.agkan.yml';
  const testConfigFileTest = '.agkan-test.yml';
  const legacyConfigFile = '.akan.yml';
  const legacyConfigFileTest = '.akan-test.yml';
  let tmpCwd: string;

  beforeEach(() => {
    // Reset environment variables
    process.env = { ...originalEnv };
    delete process.env.AGENT_KANBAN_DB_PATH;

    // Use an isolated temp directory as cwd so parallel workers do not collide
    // on config files such as .agkan.yml / .agkan-test.yml.
    tmpCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'agkan-config-test-'));
    vi.spyOn(process, 'cwd').mockReturnValue(tmpCwd);
  });

  afterEach(() => {
    // Restore environment variables and mocks
    process.env = originalEnv;
    vi.restoreAllMocks();

    // Remove temp cwd
    fs.rmSync(tmpCwd, { recursive: true, force: true });
  });

  describe('Normal Mode (NODE_ENV != "test")', () => {
    beforeEach(() => {
      // Ensure we're not in test mode for these tests
      // Note: vitest sets NODE_ENV=test by default, so we temporarily override
      const currentEnv = process.env.NODE_ENV;
      if (currentEnv === 'test') {
        process.env.NODE_ENV = 'development';
      }
    });

    afterEach(() => {
      // Restore test mode for other tests
      process.env.NODE_ENV = 'test';
    });

    describe('Environment Variable Priority', () => {
      it('should use AGENT_KANBAN_DB_PATH with absolute path', () => {
        const testPath = '/tmp/test-absolute.db';
        process.env.AGENT_KANBAN_DB_PATH = testPath;

        const result = resolveDatabasePath();

        expect(result).toBe(testPath);
      });

      it('should use AGENT_KANBAN_DB_PATH with relative path (resolved from cwd)', () => {
        const relativePath = 'custom/db.db';
        process.env.AGENT_KANBAN_DB_PATH = relativePath;

        const result = resolveDatabasePath();

        expect(result).toBe(path.join(process.cwd(), relativePath));
      });

      it('should prioritize AGENT_KANBAN_DB_PATH over config file', () => {
        // Create config file
        const configPath = path.join(process.cwd(), testConfigFile);
        fs.writeFileSync(configPath, yaml.dump({ path: 'config-path.db' }));

        // Set environment variable
        const envPath = '/tmp/env-priority.db';
        process.env.AGENT_KANBAN_DB_PATH = envPath;

        const result = resolveDatabasePath();

        expect(result).toBe(envPath);
        expect(result).not.toContain('config-path.db');
      });

      it('should prioritize AGENT_KANBAN_DB_PATH over default path', () => {
        const envPath = '/tmp/env-over-default.db';
        process.env.AGENT_KANBAN_DB_PATH = envPath;

        const result = resolveDatabasePath();

        expect(result).toBe(envPath);
        expect(result).not.toContain('.agkan/data.db');
      });
    });

    describe('Configuration File Fallback', () => {
      it('should use config file path (absolute) when env var is not set', () => {
        const configDbPath = '/tmp/config-absolute.db';
        const configPath = path.join(process.cwd(), testConfigFile);
        fs.writeFileSync(configPath, yaml.dump({ path: configDbPath }));

        const result = resolveDatabasePath();

        expect(result).toBe(configDbPath);
      });

      it('should use config file path (relative) when env var is not set', () => {
        const relativePath = 'data/custom.db';
        const configPath = path.join(process.cwd(), testConfigFile);
        fs.writeFileSync(configPath, yaml.dump({ path: relativePath }));

        const result = resolveDatabasePath();

        expect(result).toBe(path.join(process.cwd(), relativePath));
      });

      it('should use .agkan.yml in normal mode (not .agkan-test.yml)', () => {
        // Create both config files
        const normalConfigPath = path.join(process.cwd(), testConfigFile);
        const testConfigPath = path.join(process.cwd(), testConfigFileTest);

        fs.writeFileSync(normalConfigPath, yaml.dump({ path: 'normal-mode.db' }));
        fs.writeFileSync(testConfigPath, yaml.dump({ path: 'test-mode.db' }));

        const result = resolveDatabasePath();

        expect(result).toContain('normal-mode.db');
        expect(result).not.toContain('test-mode.db');
      });
    });

    describe('Default Path Fallback', () => {
      it('should use default path .agkan/data.db when no config exists', () => {
        const result = resolveDatabasePath();

        expect(result).toBe(path.join(process.cwd(), '.agkan', 'data.db'));
      });
    });

    describe('Legacy Config Fallback (.akan.yml)', () => {
      it('should read from legacy .akan.yml when .agkan.yml does not exist', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const legacyDbPath = '/tmp/legacy-config.db';
        const legacyPath = path.join(process.cwd(), legacyConfigFile);
        fs.writeFileSync(legacyPath, yaml.dump({ path: legacyDbPath }));

        const result = resolveDatabasePath();

        expect(result).toBe(legacyDbPath);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[WARNING]'));
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('.akan.yml'));
        warnSpy.mockRestore();
      });

      it('should prefer .agkan.yml over legacy .akan.yml', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const newConfigPath = path.join(process.cwd(), testConfigFile);
        const legacyPath = path.join(process.cwd(), legacyConfigFile);
        fs.writeFileSync(newConfigPath, yaml.dump({ path: 'new-config.db' }));
        fs.writeFileSync(legacyPath, yaml.dump({ path: 'legacy-config.db' }));

        const result = resolveDatabasePath();

        expect(result).toContain('new-config.db');
        expect(result).not.toContain('legacy-config.db');
        expect(warnSpy).not.toHaveBeenCalled();
        warnSpy.mockRestore();
      });
    });
  });

  describe('Test Mode (NODE_ENV = "test")', () => {
    beforeEach(() => {
      // Ensure we're in test mode
      process.env.NODE_ENV = 'test';
    });

    describe('Environment Variable Priority', () => {
      it('should use AGENT_KANBAN_DB_PATH in test mode (env var has highest priority)', () => {
        const envPath = '/tmp/test-mode-env.db';
        process.env.AGENT_KANBAN_DB_PATH = envPath;

        const result = resolveDatabasePath();

        expect(result).toBe(envPath);
      });

      it('should prioritize AGENT_KANBAN_DB_PATH over test mode config file', () => {
        // Create test mode config file
        const testConfigPath = path.join(process.cwd(), testConfigFileTest);
        fs.writeFileSync(testConfigPath, yaml.dump({ path: 'test-config.db' }));

        // Set environment variable
        const envPath = '/tmp/test-env-priority.db';
        process.env.AGENT_KANBAN_DB_PATH = envPath;

        const result = resolveDatabasePath();

        expect(result).toBe(envPath);
        expect(result).not.toContain('test-config.db');
      });
    });

    describe('Configuration File Fallback', () => {
      it('should use .agkan-test.yml in test mode (not .agkan.yml)', () => {
        // Create both config files
        const normalConfigPath = path.join(process.cwd(), testConfigFile);
        const testConfigPath = path.join(process.cwd(), testConfigFileTest);

        fs.writeFileSync(normalConfigPath, yaml.dump({ path: 'normal-config.db' }));
        fs.writeFileSync(testConfigPath, yaml.dump({ path: 'test-config.db' }));

        const result = resolveDatabasePath();

        expect(result).toContain('test-config.db');
        expect(result).not.toContain('normal-config.db');
      });

      it('should use test config file path (relative) when env var is not set', () => {
        const relativePath = 'test-data/test.db';
        const testConfigPath = path.join(process.cwd(), testConfigFileTest);
        fs.writeFileSync(testConfigPath, yaml.dump({ path: relativePath }));

        const result = resolveDatabasePath();

        expect(result).toBe(path.join(process.cwd(), relativePath));
      });
    });

    describe('Default Path Fallback', () => {
      it('should use default test path in .agkan-test directory when no config exists', () => {
        const result = resolveDatabasePath();

        const workerId = process.env.VITEST_WORKER_ID;
        const expectedFile = workerId ? `data-${workerId}.db` : 'data.db';
        expect(result).toBe(path.join(process.cwd(), getDefaultDirName(), expectedFile));
      });

      it('should use .agkan-test directory (not .agkan) in test mode', () => {
        const result = resolveDatabasePath();

        expect(result).toContain('.agkan-test');
        expect(result).not.toContain('.agkan/data.db');
      });
    });

    describe('Legacy Config Fallback (.akan-test.yml)', () => {
      it('should read from legacy .akan-test.yml when .agkan-test.yml does not exist', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const legacyDbPath = '/tmp/legacy-test-config.db';
        const legacyPath = path.join(process.cwd(), legacyConfigFileTest);
        fs.writeFileSync(legacyPath, yaml.dump({ path: legacyDbPath }));

        const result = resolveDatabasePath();

        expect(result).toBe(legacyDbPath);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[WARNING]'));
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('.akan-test.yml'));
        warnSpy.mockRestore();
      });
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'test';
    });

    it('should fallback to default path when config file is corrupted', () => {
      // Create corrupted YAML file
      const configPath = path.join(process.cwd(), testConfigFileTest);
      fs.writeFileSync(configPath, 'invalid: yaml: content:\n  - broken');

      const result = resolveDatabasePath();

      // Should fallback to default path
      const workerId = process.env.VITEST_WORKER_ID;
      const expectedFile = workerId ? `data-${workerId}.db` : 'data.db';
      expect(result).toBe(path.join(process.cwd(), getDefaultDirName(), expectedFile));
    });
  });

  describe('Production Path Warning', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'test';
    });

    it('should warn when AGENT_KANBAN_DB_PATH points to .agkan path in test mode', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const productionPath = path.join(process.cwd(), '.agkan', 'data.db');
      process.env.AGENT_KANBAN_DB_PATH = productionPath;

      resolveDatabasePath();

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[WARNING]'));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(productionPath));
      warnSpy.mockRestore();
    });

    it('should not warn when AGENT_KANBAN_DB_PATH points to .agkan-test path in test mode', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const testPath = path.join(process.cwd(), '.agkan-test', 'data.db');
      process.env.AGENT_KANBAN_DB_PATH = testPath;

      resolveDatabasePath();

      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('should not warn when AGENT_KANBAN_DB_PATH points to an unrelated path in test mode', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      process.env.AGENT_KANBAN_DB_PATH = '/tmp/some-other.db';

      resolveDatabasePath();

      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('should warn when config file specifies .agkan path in test mode', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const productionDbPath = path.join(process.cwd(), '.agkan', 'data.db');
      const configPath = path.join(process.cwd(), testConfigFileTest);
      fs.writeFileSync(configPath, yaml.dump({ path: productionDbPath }));

      resolveDatabasePath();

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[WARNING]'));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(productionDbPath));
      warnSpy.mockRestore();
    });

    it('should not warn when using default test path (.agkan-test/data.db)', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = resolveDatabasePath();

      expect(result).toContain('.agkan-test');
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('loadConfig', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'test';
    });

    it('should return empty object when config file does not exist', () => {
      const config = loadConfig();
      expect(config).toEqual({});
    });

    it('should return parsed config with path field', () => {
      const configPath = path.join(process.cwd(), testConfigFileTest);
      fs.writeFileSync(configPath, yaml.dump({ path: '/some/path.db' }));

      const config = loadConfig();
      expect(config.path).toBe('/some/path.db');
    });

    it('should return parsed config with board.port field', () => {
      const configPath = path.join(process.cwd(), testConfigFileTest);
      fs.writeFileSync(configPath, yaml.dump({ board: { port: 9090 } }));

      const config = loadConfig();
      expect(config.board?.port).toBe(9090);
    });

    it('should return parsed config with board.title field', () => {
      const configPath = path.join(process.cwd(), testConfigFileTest);
      fs.writeFileSync(configPath, yaml.dump({ board: { title: 'My Board' } }));

      const config = loadConfig();
      expect(config.board?.title).toBe('My Board');
    });

    it('should return parsed config with both board.port and board.title', () => {
      const configPath = path.join(process.cwd(), testConfigFileTest);
      fs.writeFileSync(configPath, yaml.dump({ board: { port: 4000, title: 'Project Board' } }));

      const config = loadConfig();
      expect(config.board?.port).toBe(4000);
      expect(config.board?.title).toBe('Project Board');
    });

    it('should return empty object when config file is corrupted', () => {
      const configPath = path.join(process.cwd(), testConfigFileTest);
      fs.writeFileSync(configPath, 'invalid: yaml: content:\n  - broken');

      const config = loadConfig();
      expect(config).toEqual({});
    });

    it('should use test config file (.agkan-test.yml) in test mode', () => {
      const normalConfigPath = path.join(process.cwd(), testConfigFile);
      const testConfigPath = path.join(process.cwd(), testConfigFileTest);

      fs.writeFileSync(normalConfigPath, yaml.dump({ board: { port: 1111 } }));
      fs.writeFileSync(testConfigPath, yaml.dump({ board: { port: 2222 } }));

      const config = loadConfig();
      expect(config.board?.port).toBe(2222);
    });

    it('should return parsed config with models.planning field', () => {
      const configPath = path.join(process.cwd(), testConfigFileTest);
      fs.writeFileSync(configPath, yaml.dump({ models: { planning: { model: 'claude-opus-4-7' } } }));

      const config = loadConfig();
      expect(config.models?.planning?.model).toBe('claude-opus-4-7');
    });

    it('should return parsed config with models.run field', () => {
      const configPath = path.join(process.cwd(), testConfigFileTest);
      fs.writeFileSync(configPath, yaml.dump({ models: { run: { model: 'claude-sonnet-4-6' } } }));

      const config = loadConfig();
      expect(config.models?.run?.model).toBe('claude-sonnet-4-6');
    });

    it('should return parsed config with both models.planning and models.run', () => {
      const configPath = path.join(process.cwd(), testConfigFileTest);
      fs.writeFileSync(
        configPath,
        yaml.dump({ models: { planning: { model: 'claude-opus-4-7' }, run: { model: 'claude-sonnet-4-6' } } })
      );

      const config = loadConfig();
      expect(config.models?.planning?.model).toBe('claude-opus-4-7');
      expect(config.models?.run?.model).toBe('claude-sonnet-4-6');
    });

    it('should return parsed config with models.planning including effort', () => {
      const configPath = path.join(process.cwd(), testConfigFileTest);
      fs.writeFileSync(configPath, yaml.dump({ models: { planning: { model: 'claude-opus-4-7', effort: 'high' } } }));

      const config = loadConfig();
      expect(config.models?.planning?.model).toBe('claude-opus-4-7');
      expect(config.models?.planning?.effort).toBe('high');
    });

    it('should return parsed config with models.run including effort', () => {
      const configPath = path.join(process.cwd(), testConfigFileTest);
      fs.writeFileSync(configPath, yaml.dump({ models: { run: { model: 'claude-sonnet-4-6', effort: 'low' } } }));

      const config = loadConfig();
      expect(config.models?.run?.model).toBe('claude-sonnet-4-6');
      expect(config.models?.run?.effort).toBe('low');
    });

    it('should return parsed config with effort only (no model)', () => {
      const configPath = path.join(process.cwd(), testConfigFileTest);
      fs.writeFileSync(configPath, yaml.dump({ models: { run: { effort: 'max' } } }));

      const config = loadConfig();
      expect(config.models?.run?.model).toBeUndefined();
      expect(config.models?.run?.effort).toBe('max');
    });
  });

  describe('Helper Functions', () => {
    it('isTestMode should return true when NODE_ENV=test', () => {
      process.env.NODE_ENV = 'test';
      expect(isTestMode()).toBe(true);
    });

    it('isTestMode should return false when NODE_ENV is not test', () => {
      process.env.NODE_ENV = 'development';
      expect(isTestMode()).toBe(false);

      process.env.NODE_ENV = 'production';
      expect(isTestMode()).toBe(false);

      delete process.env.NODE_ENV;
      expect(isTestMode()).toBe(false);
    });

    it('getConfigFileName should return correct filename based on mode', () => {
      process.env.NODE_ENV = 'test';
      expect(getConfigFileName()).toBe('.agkan-test.yml');

      process.env.NODE_ENV = 'development';
      expect(getConfigFileName()).toBe('.agkan.yml');
    });

    it('getDefaultDirName should return correct directory based on mode', () => {
      process.env.NODE_ENV = 'test';
      expect(getDefaultDirName()).toBe('.agkan-test');

      process.env.NODE_ENV = 'production';
      expect(getDefaultDirName()).toBe('.agkan');
    });
  });
});

describe('Worktree project root resolution', () => {
  const originalEnv = process.env;
  let tmpBase: string;
  let mainRoot: string;
  let worktreeDir: string;

  const writeGitFile = (gitdir: string) => {
    fs.writeFileSync(path.join(worktreeDir, '.git'), `gitdir: ${gitdir}\n`);
  };

  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: 'development' };
    delete process.env.AGENT_KANBAN_DB_PATH;

    tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'agkan-worktree-test-'));
    mainRoot = path.join(tmpBase, 'main');
    worktreeDir = path.join(tmpBase, 'wt');
    fs.mkdirSync(path.join(mainRoot, '.git', 'worktrees', 'wt'), { recursive: true });
    fs.mkdirSync(worktreeDir);
    vi.spyOn(process, 'cwd').mockReturnValue(worktreeDir);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
    fs.rmSync(tmpBase, { recursive: true, force: true });
  });

  describe('resolveProjectRoot', () => {
    it('returns cwd when no .git entry exists', () => {
      expect(resolveProjectRoot()).toBe(worktreeDir);
    });

    it('returns cwd when .git is a directory (regular repository)', () => {
      fs.mkdirSync(path.join(worktreeDir, '.git'));
      expect(resolveProjectRoot()).toBe(worktreeDir);
    });

    it('returns cwd for a submodule-style .git file', () => {
      writeGitFile(path.join(mainRoot, '.git', 'modules', 'wt'));
      expect(resolveProjectRoot()).toBe(worktreeDir);
    });

    it('returns cwd when the .git file has no gitdir line', () => {
      fs.writeFileSync(path.join(worktreeDir, '.git'), 'not a gitdir pointer\n');
      expect(resolveProjectRoot()).toBe(worktreeDir);
    });

    it('returns cwd when the referenced main repository does not exist', () => {
      writeGitFile(path.join(tmpBase, 'missing', '.git', 'worktrees', 'wt'));
      expect(resolveProjectRoot()).toBe(worktreeDir);
    });

    it('returns the main repository root for an absolute worktree gitdir', () => {
      writeGitFile(path.join(mainRoot, '.git', 'worktrees', 'wt'));
      expect(resolveProjectRoot()).toBe(mainRoot);
    });

    it('returns the main repository root for a relative worktree gitdir', () => {
      writeGitFile(path.join('..', 'main', '.git', 'worktrees', 'wt'));
      expect(resolveProjectRoot()).toBe(mainRoot);
    });

    it('tolerates CRLF line endings in the .git file', () => {
      fs.writeFileSync(path.join(worktreeDir, '.git'), `gitdir: ${path.join(mainRoot, '.git', 'worktrees', 'wt')}\r\n`);
      expect(resolveProjectRoot()).toBe(mainRoot);
    });

    it('returns cwd in test mode even inside a worktree', () => {
      process.env.NODE_ENV = 'test';
      writeGitFile(path.join(mainRoot, '.git', 'worktrees', 'wt'));
      expect(resolveProjectRoot()).toBe(worktreeDir);
    });
  });

  describe('inside a worktree', () => {
    beforeEach(() => {
      writeGitFile(path.join(mainRoot, '.git', 'worktrees', 'wt'));
    });

    it('loadConfig reads .agkan.yml from the main repository root', () => {
      fs.writeFileSync(path.join(mainRoot, '.agkan.yml'), yaml.dump({ board: { port: 4321 } }));

      expect(loadConfig()).toEqual({ board: { port: 4321 } });
    });

    it('resolveDatabasePath defaults to .agkan/data.db under the main repository root', () => {
      expect(resolveDatabasePath()).toBe(path.join(mainRoot, '.agkan', 'data.db'));
    });

    it('resolveDatabasePath resolves a relative config path from the main repository root', () => {
      fs.writeFileSync(path.join(mainRoot, '.agkan.yml'), yaml.dump({ path: './custom/db.sqlite' }));

      expect(resolveDatabasePath()).toBe(path.join(mainRoot, 'custom', 'db.sqlite'));
    });

    it('resolveDatabasePath resolves a relative legacy config path from the main repository root', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      fs.writeFileSync(path.join(mainRoot, '.akan.yml'), yaml.dump({ path: './legacy/db.sqlite' }));

      expect(resolveDatabasePath()).toBe(path.join(mainRoot, 'legacy', 'db.sqlite'));
      warnSpy.mockRestore();
    });

    it('ignores a .agkan.yml placed in the worktree itself', () => {
      fs.writeFileSync(path.join(worktreeDir, '.agkan.yml'), yaml.dump({ path: './wt/db.sqlite' }));

      expect(resolveDatabasePath()).toBe(path.join(mainRoot, '.agkan', 'data.db'));
    });

    it('still resolves a relative AGENT_KANBAN_DB_PATH from cwd', () => {
      process.env.AGENT_KANBAN_DB_PATH = './env/db.sqlite';

      expect(resolveDatabasePath()).toBe(path.join(worktreeDir, 'env', 'db.sqlite'));
    });

    it('keeps .agkan-test/ under the worktree in test mode', () => {
      process.env.NODE_ENV = 'test';
      fs.writeFileSync(path.join(mainRoot, '.agkan-test.yml'), yaml.dump({ path: './main-test/db.sqlite' }));
      const workerId = process.env.VITEST_WORKER_ID;
      const expectedFile = workerId ? `data-${workerId}.db` : 'data.db';

      expect(resolveDatabasePath()).toBe(path.join(worktreeDir, '.agkan-test', expectedFile));
    });
  });
});
