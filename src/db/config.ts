import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { effortsForDefaultCli, findCatalogEntry, resolveModelCatalog, type ModelCatalogEntry } from './modelCatalog';

export type AgentTool = 'claude' | 'codex' | 'agy' | 'grok';
export type ModelSettings = { model?: string; effort?: string };
export type PhaseModelSettings = ModelSettings & { agent?: AgentTool };
export type AgentModelSettings = {
  planning?: ModelSettings;
  run?: ModelSettings;
};
export type ResolvedPhaseSettings = {
  agent: AgentTool;
  model?: string;
  effort?: string;
};

/**
 * Configuration file type definition
 */
export interface Config {
  version?: number;
  agent?: AgentTool;
  path?: string;
  board?: {
    port?: number;
    title?: string;
  };
  models?: {
    planning?: PhaseModelSettings;
    run?: PhaseModelSettings;
    claude?: AgentModelSettings;
    codex?: AgentModelSettings;
    agy?: AgentModelSettings;
    grok?: AgentModelSettings;
  };
  modelCatalog?: ModelCatalogEntry[];
  permissionMode?: string;
}

/**
 * Resolve the configured AI coding agent.
 * Claude remains the default for backward compatibility.
 */
export function resolveAgentTool(config: Config): AgentTool {
  const agent = config.agent ?? 'claude';
  if (agent !== 'claude' && agent !== 'codex' && agent !== 'agy' && agent !== 'grok') {
    throw new Error('Invalid agent "' + String(agent) + '". Must be one of: claude, codex, agy, grok');
  }
  return agent;
}

function resolveConfigVersion(config: Config): 1 | 2 {
  const version = config.version ?? 1;
  if (version !== 1 && version !== 2) {
    throw new Error(`Unsupported config version "${String(version)}". Supported versions: 1, 2`);
  }
  return version;
}

/**
 * Resolve model settings for the selected agent. Agent-specific settings take
 * precedence over the legacy flat planning/run settings.
 * Pass `agent` to resolve for a cli other than the configured default (a task
 * whose model override selects a different cli).
 */
export function resolveModelSettings(
  config: Config,
  command: 'planning' | 'run',
  agent: AgentTool = resolveAgentTool(config)
): ModelSettings | undefined {
  resolveConfigVersion(config);
  if (config.version === 2) return config.models?.[command];
  return config.models?.[agent]?.[command] ?? config.models?.[command];
}

/** Resolve and validate the cli/model/effort bundle for one execution phase. */
export function resolvePhaseSettings(
  config: Config,
  phase: 'planning' | 'run',
  legacyAgentOverride?: AgentTool
): ResolvedPhaseSettings {
  const version = resolveConfigVersion(config);
  const phaseSettings = config.models?.[phase];
  if (version === 2 && phaseSettings !== undefined && (!phaseSettings || typeof phaseSettings !== 'object')) {
    throw new Error(`Invalid models.${phase}: must be an object with agent, model, and effort`);
  }
  const agent =
    version === 2
      ? phaseSettings?.agent !== undefined
        ? resolveAgentTool({ agent: phaseSettings.agent })
        : resolveAgentTool(config)
      : (legacyAgentOverride ?? resolveAgentTool(config));
  const settings = version === 2 ? phaseSettings : (config.models?.[agent]?.[phase] ?? config.models?.[phase]);
  if (version === 2 && settings?.model !== undefined && typeof settings.model !== 'string') {
    throw new Error(`Invalid models.${phase}.model: must be a string`);
  }
  if (version === 2 && settings?.effort !== undefined && typeof settings.effort !== 'string') {
    throw new Error(`Invalid models.${phase}.effort: must be a string`);
  }
  const model = settings?.model?.trim() || undefined;
  const effort = settings?.effort?.trim() || undefined;

  if (version === 2 && (model || effort)) {
    const catalog = resolveModelCatalog(config);
    const entry = model ? findCatalogEntry(catalog, model) : undefined;
    if (model && !entry) {
      throw new Error(`Invalid models.${phase}.model "${model}": model is not in modelCatalog`);
    }
    if (entry && entry.cli !== agent) {
      throw new Error(`Invalid models.${phase}: model "${model}" belongs to agent "${entry.cli}", not "${agent}"`);
    }
    const allowedEfforts = entry?.efforts ?? effortsForDefaultCli(catalog, agent);
    if (effort && !allowedEfforts.includes(effort)) {
      const allowed =
        allowedEfforts.length > 0
          ? `Must be one of: ${allowedEfforts.join(', ')}`
          : entry
            ? 'This model does not accept an effort'
            : `Agent "${agent}" has no models that accept an effort`;
      const target = model ? ` for model "${model}"` : ` for agent "${agent}"`;
      throw new Error(`Invalid models.${phase}.effort "${effort}"${target}. ${allowed}`);
    }
  }

  return { agent, model, effort };
}

/**
 * Build claude CLI permission arguments from config.
 * - "skipPermissions" → --dangerously-skip-permissions (legacy behavior)
 * - any other value → --permission-mode <value>
 * - undefined → --permission-mode auto (default)
 */
export function buildPermissionArgs(config: Config): string[] {
  const mode = config.permissionMode;
  if (mode === 'skipPermissions') {
    return ['--dangerously-skip-permissions'];
  }
  return ['--permission-mode', mode ?? 'auto'];
}

/**
 * Codex's workspace-write sandbox blocks all network access by default, which also
 * blocks the agkan CLI's board notification (`POST /api/board/notify` to localhost)
 * from inside the session. Without it the DB is updated but the Board never learns
 * about the change until a reload, so the sandbox must explicitly allow network
 * access. Codex has no loopback-only option, so this opens outbound network access
 * for the whole session. The value must stay an unquoted TOML boolean: `"true"`
 * would be parsed as a string and ignored.
 */
const CODEX_WORKSPACE_WRITE_WITH_NETWORK_ARGS = [
  '--sandbox',
  'workspace-write',
  '--config',
  'sandbox_workspace_write.network_access=true',
];

/**
 * Build Codex CLI approval and sandbox arguments from the existing permission
 * setting. Modes without a direct Codex equivalent use the safe interactive
 * default.
 */
export function buildCodexPermissionArgs(config: Config): string[] {
  switch (config.permissionMode) {
    case 'skipPermissions':
    case 'bypassPermissions':
      return ['--dangerously-bypass-approvals-and-sandbox'];
    case 'dontAsk':
      return ['--ask-for-approval', 'never', ...CODEX_WORKSPACE_WRITE_WITH_NETWORK_ARGS];
    case 'plan':
      return ['--ask-for-approval', 'never', '--sandbox', 'read-only'];
    default:
      return ['--ask-for-approval', 'on-request', ...CODEX_WORKSPACE_WRITE_WITH_NETWORK_ARGS];
  }
}

/**
 * Build agy CLI permission/mode arguments from the existing permission setting.
 * agy has no equivalent of claude's "auto" mode, so "auto" (and the unset
 * default, which means "auto") is approximated with --dangerously-skip-permissions
 * to keep board runs non-interactive. Other modes without a direct agy
 * equivalent use agy's own interactive default (request-review).
 */
export function buildAgyPermissionArgs(config: Config): string[] {
  switch (config.permissionMode) {
    case undefined:
    case 'auto':
    case 'skipPermissions':
    case 'bypassPermissions':
      return ['--dangerously-skip-permissions'];
    case 'dontAsk':
      return ['--mode', 'accept-edits'];
    case 'plan':
      return ['--mode', 'plan'];
    default:
      return [];
  }
}

/**
 * Build Grok CLI permission arguments from the configured permission setting.
 * grok natively supports: default, acceptEdits, auto, dontAsk, bypassPermissions, plan.
 * - undefined or "auto" → --permission-mode auto (default)
 * - "skipPermissions" or "bypassPermissions" → --permission-mode bypassPermissions
 * - "acceptEdits" / "dontAsk" / "plan" / "default" → --permission-mode <value>
 */
export function buildGrokPermissionArgs(config: Config): string[] {
  switch (config.permissionMode) {
    case undefined:
    case 'auto':
      return ['--permission-mode', 'auto'];
    case 'skipPermissions':
    case 'bypassPermissions':
      return ['--permission-mode', 'bypassPermissions'];
    case 'acceptEdits':
    case 'dontAsk':
    case 'plan':
    case 'default':
      return ['--permission-mode', config.permissionMode];
    default:
      return ['--permission-mode', config.permissionMode];
  }
}

/**
 * Resolve the directory that holds the project's `.agkan.yml` / `.agkan/`.
 *
 * Inside a `git worktree` checkout, `.git` is a file containing
 * `gitdir: <main>/.git/worktrees/<name>`; in that case the main repository
 * root is returned so the worktree shares the main checkout's config and DB.
 * Anything else (regular repository, submodule, non-git directory, unreadable
 * or dangling pointer) resolves to `process.cwd()`.
 *
 * Test mode always resolves to `process.cwd()`: `.agkan-test/` must stay
 * isolated per checkout, otherwise vitest runs in several worktrees would share
 * the main repository's `data-<worker>.db` files.
 */
export function resolveProjectRoot(): string {
  const cwd = process.cwd();
  if (isTestMode()) {
    return cwd;
  }
  try {
    const gitPath = path.join(cwd, '.git');
    if (!fs.statSync(gitPath).isFile()) {
      return cwd;
    }
    const match = /^gitdir:\s*(.+?)\s*$/m.exec(fs.readFileSync(gitPath, 'utf8'));
    if (!match) {
      return cwd;
    }
    const gitDir = path.resolve(cwd, match[1]);
    const worktreesDir = path.dirname(gitDir);
    const mainGitDir = path.dirname(worktreesDir);
    if (path.basename(worktreesDir) !== 'worktrees' || path.basename(mainGitDir) !== '.git') {
      return cwd;
    }
    const mainRoot = path.dirname(mainGitDir);
    return fs.statSync(mainRoot).isDirectory() ? mainRoot : cwd;
  } catch {
    return cwd;
  }
}

/**
 * Load and parse the configuration file.
 * Returns the parsed Config object, or an empty object if the file does not exist or is invalid.
 */
export function loadConfig(): Config {
  const configFileName = getConfigFileName();
  const configPath = path.join(resolveProjectRoot(), configFileName);

  if (fs.existsSync(configPath)) {
    let parsed: Config | null | undefined;
    try {
      const configContent = fs.readFileSync(configPath, 'utf8');
      parsed = yaml.load(configContent) as Config | null | undefined;
    } catch {
      return {};
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const normalized = { ...parsed, version: parsed.version ?? 1 };
    resolveConfigVersion(normalized);
    return normalized;
  }

  return {};
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
 * Worker-specific suffix used only when Vitest runs tests in parallel.
 * Returns empty string in production, development, and CLI execution.
 */
export function getWorkerSuffix(): string {
  if (!isTestMode()) return '';
  const workerId = process.env.VITEST_WORKER_ID;
  return workerId ? `-worker-${workerId}` : '';
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

  // Priority 2: Check configuration file (relative to the project root, which is
  // the main repository when running inside a git worktree)
  const projectRoot = resolveProjectRoot();
  const configFileName = getConfigFileName();
  const configPath = path.join(projectRoot, configFileName);

  if (fs.existsSync(configPath)) {
    try {
      const configContent = fs.readFileSync(configPath, 'utf8');
      const config = yaml.load(configContent) as Config;

      if (config.path) {
        // Resolve relative paths from the project root
        const dbPath = path.isAbsolute(config.path) ? config.path : path.join(projectRoot, config.path);

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
    const legacyConfigPath = path.join(projectRoot, legacyConfigFileName);

    if (fs.existsSync(legacyConfigPath)) {
      console.warn(
        `[WARNING] Legacy config file '${legacyConfigFileName}' found. ` +
          `Please rename it to '${configFileName}' to suppress this warning.`
      );

      try {
        const configContent = fs.readFileSync(legacyConfigPath, 'utf8');
        const config = yaml.load(configContent) as Config;

        if (config.path) {
          const dbPath = path.isAbsolute(config.path) ? config.path : path.join(projectRoot, config.path);

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
  const workerId = process.env.VITEST_WORKER_ID;
  const dbFileName = isTestMode() && workerId ? `data-${workerId}.db` : 'data.db';
  return path.join(projectRoot, defaultDir, dbFileName);
}
