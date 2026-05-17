/**
 * Claude Code .claude/settings.local.json integration.
 *
 * Idempotently installs a SessionStart hook that calls `agkan context --hook`.
 * Existing keys, other hooks, and file indentation style are preserved.
 */

import fs from 'fs';
import path from 'path';

const RELATIVE_SETTINGS_PATH = path.join('.claude', 'settings.local.json');
const HOOK_COMMAND = 'agkan context --hook';
const MATCHER = 'startup|resume|clear|compact';

export type ClaudeSettingsStatus = 'created' | 'updated' | 'skipped' | 'error';

export interface ClaudeSettingsResult {
  status: ClaudeSettingsStatus;
  message: string;
}

interface HookEntry {
  type: 'command';
  command: string;
}

interface SessionStartEntry {
  matcher: string;
  hooks: HookEntry[];
}

interface SettingsShape {
  hooks?: {
    SessionStart?: SessionStartEntry[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

function detectIndent(text: string): string | number {
  const match = text.match(/\n([ \t]+)/);
  if (!match) return 2;
  return match[1];
}

function hasAgkanHook(config: SettingsShape): boolean {
  const entries = config.hooks?.SessionStart;
  if (!Array.isArray(entries)) return false;
  for (const entry of entries) {
    if (!Array.isArray(entry?.hooks)) continue;
    for (const hook of entry.hooks) {
      if (hook?.type === 'command' && hook?.command === HOOK_COMMAND) {
        return true;
      }
    }
  }
  return false;
}

export function installSessionStartHook(cwd: string): ClaudeSettingsResult {
  const claudeDir = path.join(cwd, '.claude');
  const settingsPath = path.join(cwd, RELATIVE_SETTINGS_PATH);

  try {
    if (!fs.existsSync(claudeDir)) {
      fs.mkdirSync(claudeDir, { recursive: true });
    }

    const fileExisted = fs.existsSync(settingsPath);
    const rawText = fileExisted ? fs.readFileSync(settingsPath, 'utf8') : '{}';
    const indent = fileExisted ? detectIndent(rawText) : 2;

    let config: SettingsShape;
    try {
      config = JSON.parse(rawText) as SettingsShape;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return {
        status: 'error',
        message: `Failed to parse ${RELATIVE_SETTINGS_PATH}: ${reason}`,
      };
    }

    if (hasAgkanHook(config)) {
      return {
        status: 'skipped',
        message: `Skipped: ${RELATIVE_SETTINGS_PATH} (agkan hook already present)`,
      };
    }

    if (!config.hooks) config.hooks = {};
    if (!Array.isArray(config.hooks.SessionStart)) config.hooks.SessionStart = [];
    config.hooks.SessionStart.push({
      matcher: MATCHER,
      hooks: [{ type: 'command', command: HOOK_COMMAND }],
    });

    let backupPath: string | undefined;
    if (fileExisted) {
      const now = new Date();
      const ts =
        String(now.getFullYear()) +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0') +
        String(now.getHours()).padStart(2, '0') +
        String(now.getMinutes()).padStart(2, '0') +
        String(now.getSeconds()).padStart(2, '0');
      backupPath = `${settingsPath}.agkan-backup-${ts}`;
      try {
        fs.copyFileSync(settingsPath, backupPath);
      } catch (backupErr) {
        const reason = backupErr instanceof Error ? backupErr.message : String(backupErr);
        return {
          status: 'error',
          message: `Failed to backup ${RELATIVE_SETTINGS_PATH}: ${reason}`,
        };
      }
    }

    fs.writeFileSync(settingsPath, JSON.stringify(config, null, indent) + '\n', 'utf8');

    const relativeBackup = backupPath
      ? path.relative(cwd, backupPath)
      : undefined;

    return fileExisted
      ? {
          status: 'updated',
          message: `Updated: ${RELATIVE_SETTINGS_PATH} (added agkan SessionStart hook, backup: ${relativeBackup})`,
        }
      : {
          status: 'created',
          message: `Created: ${RELATIVE_SETTINGS_PATH} (added agkan SessionStart hook)`,
        };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      status: 'error',
      message: `Failed to update ${RELATIVE_SETTINGS_PATH}: ${reason}`,
    };
  }
}
