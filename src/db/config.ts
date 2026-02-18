import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

/**
 * Configuration file type definition
 */
export interface Config {
  path?: string;
}

/**
 * Check if running in test mode
 */
export function isTestMode(): boolean {
  return process.env.NODE_ENV === 'test';
}

/**
 * Get config file name based on current mode
 */
export function getConfigFileName(): string {
  return isTestMode() ? '.agkan-test.yml' : '.agkan.yml';
}

/**
 * Get default directory name based on current mode
 */
export function getDefaultDirName(): string {
  return isTestMode() ? '.agkan-test' : '.agkan';
}

/**
 * Get legacy config file name for backward compatibility
 */
function getLegacyConfigFileName(): string {
  return isTestMode() ? '.akan-test.yml' : '.akan.yml';
}

/**
 * Check if a resolved database path appears to be a production path.
 * A path is considered a production path if it contains '.agkan'
 * but NOT '.agkan-test'.
 */
function isProductionPath(dbPath: string): boolean {
  return dbPath.includes('.agkan') && !dbPath.includes('.agkan-test');
}

/**
 * Resolve database path with priority order:
 * 1. Environment variable: AGENT_KANBAN_DB_PATH (highest priority)
 * 2. Configuration file: .agkan.yml or .agkan-test.yml (mode-specific)
 *    2a. Fallback: .akan.yml or .akan-test.yml (legacy, with migration warning)
 * 3. Default path: .agkan/data.db or .agkan-test/data.db (lowest priority)
 */
export function resolveDatabasePath(): string {
  // Priority 1: Check environment variable
  if (process.env.AGENT_KANBAN_DB_PATH) {
    const envPath = process.env.AGENT_KANBAN_DB_PATH;
    // Resolve relative paths from current working directory
    const resolvedPath = path.isAbsolute(envPath) ? envPath : path.join(process.cwd(), envPath);

    // Warn if in test mode but path appears to be a production path
    if (isTestMode() && isProductionPath(resolvedPath)) {
      console.warn(
        `[WARNING] Running in test mode but AGENT_KANBAN_DB_PATH points to a production path: ${resolvedPath}. ` +
          'This may cause production data to be modified or deleted.'
      );
    }

    return resolvedPath;
  }

  // Priority 2: Check configuration file
  const configFileName = getConfigFileName();
  const configPath = path.join(process.cwd(), configFileName);

  if (fs.existsSync(configPath)) {
    try {
      const configContent = fs.readFileSync(configPath, 'utf8');
      const config = yaml.load(configContent) as Config;

      if (config.path) {
        // Resolve relative paths from current working directory
        const dbPath = path.isAbsolute(config.path) ? config.path : path.join(process.cwd(), config.path);

        // Warn if in test mode but path appears to be a production path
        if (isTestMode() && isProductionPath(dbPath)) {
          console.warn(
            `[WARNING] Running in test mode but config file specifies a production path: ${dbPath}. ` +
              'This may cause production data to be modified or deleted.'
          );
        }

        return dbPath;
      }
    } catch {
      // Fallback to default path on error (e.g., corrupted YAML)
      // Silent fallback - no warning needed per test expectations
    }
  } else {
    // Priority 2a: Fallback to legacy config file (.akan.yml / .akan-test.yml)
    const legacyConfigFileName = getLegacyConfigFileName();
    const legacyConfigPath = path.join(process.cwd(), legacyConfigFileName);

    if (fs.existsSync(legacyConfigPath)) {
      console.warn(
        `[WARNING] Legacy config file '${legacyConfigFileName}' found. ` +
          `Please rename it to '${configFileName}' to suppress this warning.`
      );

      try {
        const configContent = fs.readFileSync(legacyConfigPath, 'utf8');
        const config = yaml.load(configContent) as Config;

        if (config.path) {
          const dbPath = path.isAbsolute(config.path) ? config.path : path.join(process.cwd(), config.path);

          if (isTestMode() && isProductionPath(dbPath)) {
            console.warn(
              `[WARNING] Running in test mode but config file specifies a production path: ${dbPath}. ` +
                'This may cause production data to be modified or deleted.'
            );
          }

          return dbPath;
        }
      } catch {
        // Silent fallback
      }
    }
  }

  // Priority 3: Default path
  const defaultDir = getDefaultDirName();
  return path.join(process.cwd(), defaultDir, 'data.db');
}
