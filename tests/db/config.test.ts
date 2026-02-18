import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
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
import { resolveDatabasePath, isTestMode, getConfigFileName, getDefaultDirName } from '../../src/db/config';

describe('Database Path Resolution', () => {
  const originalEnv = process.env;
  const testConfigFile = '.agkan.yml';
  const testConfigFileTest = '.agkan-test.yml';
  const legacyConfigFile = '.akan.yml';
  const legacyConfigFileTest = '.akan-test.yml';

  beforeEach(() => {
    // Reset environment variables
    process.env = { ...originalEnv };
    delete process.env.AGENT_KANBAN_DB_PATH;

    // Clean up test files
    [testConfigFile, testConfigFileTest, legacyConfigFile, legacyConfigFileTest].forEach((file) => {
      const filePath = path.join(process.cwd(), file);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });
  });

  afterEach(() => {
    // Restore environment variables
    process.env = originalEnv;

    // Clean up test files
    [testConfigFile, testConfigFileTest, legacyConfigFile, legacyConfigFileTest].forEach((file) => {
      const filePath = path.join(process.cwd(), file);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });
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
      it('should use default test path .agkan-test/data.db when no config exists', () => {
        const result = resolveDatabasePath();

        expect(result).toBe(path.join(process.cwd(), '.agkan-test', 'data.db'));
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
      expect(result).toBe(path.join(process.cwd(), '.agkan-test', 'data.db'));
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
