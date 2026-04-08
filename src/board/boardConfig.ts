import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

export const DETAIL_PANE_MAX_WIDTH = 800;

export type ThemePreference = 'dark' | 'light' | 'system';
export const VALID_THEMES: ThemePreference[] = ['dark', 'light', 'system'];
export type LlmPreference = 'codex' | 'claude';
export const VALID_LLMS: LlmPreference[] = ['codex', 'claude'];

export interface BoardConfig {
  detailPaneWidth?: number;
  theme?: ThemePreference;
  llm?: LlmPreference;
}

interface RawConfigFile {
  board?: {
    detailPaneWidth?: unknown;
    theme?: unknown;
    llm?: unknown;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Read board config from .agkan/config.yml (or the provided directory).
 * Defaults llm to "claude" when absent/invalid.
 */
export function readBoardConfig(configDir: string): BoardConfig {
  const configFile = path.join(configDir, 'config.yml');

  if (fs.existsSync(configFile) === false) {
    return { llm: 'claude' };
  }

  try {
    const content = fs.readFileSync(configFile, 'utf8');
    const raw = yaml.load(content) as RawConfigFile | null | undefined;

    if (raw == null || typeof raw !== 'object') {
      return { llm: 'claude' };
    }

    const board = raw.board;
    if (board == null || typeof board !== 'object') {
      return { llm: 'claude' };
    }

    const result: BoardConfig = { llm: 'claude' };

    const detailPaneWidth = board.detailPaneWidth;
    if (typeof detailPaneWidth === 'number' && detailPaneWidth <= DETAIL_PANE_MAX_WIDTH) {
      result.detailPaneWidth = detailPaneWidth;
    }

    const theme = board.theme;
    if (typeof theme === 'string' && (VALID_THEMES as string[]).includes(theme)) {
      result.theme = theme as ThemePreference;
    }

    const llm = board.llm;
    if (typeof llm === 'string' && (VALID_LLMS as string[]).includes(llm)) {
      result.llm = llm as LlmPreference;
    }

    return result;
  } catch {
    return { llm: 'claude' };
  }
}

/**
 * Write board config to .agkan/config.yml (or the provided directory).
 * Creates the directory if it does not exist.
 * Merges with existing config data to preserve other settings.
 */
export function writeBoardConfig(configDir: string, config: BoardConfig): void {
  fs.mkdirSync(configDir, { recursive: true });

  const configFile = path.join(configDir, 'config.yml');

  let existing: RawConfigFile = {};
  if (fs.existsSync(configFile)) {
    try {
      const content = fs.readFileSync(configFile, 'utf8');
      const parsed = yaml.load(content) as RawConfigFile | null | undefined;
      if (parsed && typeof parsed === 'object') {
        existing = parsed;
      }
    } catch {
      // Start fresh if existing file is invalid
    }
  }

  const merged: RawConfigFile = {
    ...existing,
    board: {
      ...(existing.board ?? {}),
      ...(config.detailPaneWidth !== undefined ? { detailPaneWidth: config.detailPaneWidth } : {}),
      ...(config.theme !== undefined ? { theme: config.theme } : {}),
      ...(config.llm !== undefined ? { llm: config.llm } : {}),
    },
  };

  fs.writeFileSync(configFile, yaml.dump(merged), 'utf8');
}
