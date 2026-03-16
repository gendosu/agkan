import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

export const DETAIL_PANE_MAX_WIDTH = 800;

export interface BoardConfig {
  detailPaneWidth?: number;
}

interface RawConfigFile {
  board?: {
    detailPaneWidth?: unknown;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Read board config from .agkan/config.yml (or the provided directory).
 * Returns an empty object if the file does not exist, is invalid, or values are out of range.
 */
export function readBoardConfig(configDir: string): BoardConfig {
  const configFile = path.join(configDir, 'config.yml');

  if (!fs.existsSync(configFile)) {
    return {};
  }

  try {
    const content = fs.readFileSync(configFile, 'utf8');
    const raw = yaml.load(content) as RawConfigFile | null | undefined;

    if (!raw || typeof raw !== 'object') {
      return {};
    }

    const board = raw.board;
    if (!board || typeof board !== 'object') {
      return {};
    }

    const result: BoardConfig = {};

    const detailPaneWidth = board.detailPaneWidth;
    if (typeof detailPaneWidth === 'number' && detailPaneWidth <= DETAIL_PANE_MAX_WIDTH) {
      result.detailPaneWidth = detailPaneWidth;
    }

    return result;
  } catch {
    return {};
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
    },
  };

  fs.writeFileSync(configFile, yaml.dump(merged), 'utf8');
}
