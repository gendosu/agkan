/**
 * Tests for board config (detail pane width persistence in .agkan/config.yml)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { readBoardConfig, writeBoardConfig, DETAIL_PANE_MAX_WIDTH } from '../../src/board/boardConfig';

describe('boardConfig', () => {
  const testConfigDir = path.join(process.cwd(), '.agkan-test');
  const testConfigFile = path.join(testConfigDir, 'config.yml');

  function cleanupConfigFile() {
    if (fs.existsSync(testConfigFile)) {
      fs.unlinkSync(testConfigFile);
    }
  }

  beforeEach(() => {
    cleanupConfigFile();
  });

  afterEach(() => {
    cleanupConfigFile();
  });

  describe('readBoardConfig', () => {
    it('should return empty config when config file does not exist', () => {
      const config = readBoardConfig(testConfigDir);
      expect(config).toEqual({});
    });

    it('should read detailPaneWidth from config file', () => {
      fs.mkdirSync(testConfigDir, { recursive: true });
      fs.writeFileSync(testConfigFile, yaml.dump({ board: { detailPaneWidth: 500 } }), 'utf8');

      const config = readBoardConfig(testConfigDir);
      expect(config.detailPaneWidth).toBe(500);
    });

    it('should return empty config when config file is invalid YAML', () => {
      fs.mkdirSync(testConfigDir, { recursive: true });
      fs.writeFileSync(testConfigFile, 'invalid: yaml: content: [broken', 'utf8');

      const config = readBoardConfig(testConfigDir);
      expect(config).toEqual({});
    });

    it('should return empty config when board section is missing', () => {
      fs.mkdirSync(testConfigDir, { recursive: true });
      fs.writeFileSync(testConfigFile, yaml.dump({ other: 'data' }), 'utf8');

      const config = readBoardConfig(testConfigDir);
      expect(config).toEqual({});
    });

    it('should return empty config when detailPaneWidth is not a number', () => {
      fs.mkdirSync(testConfigDir, { recursive: true });
      fs.writeFileSync(testConfigFile, yaml.dump({ board: { detailPaneWidth: 'not-a-number' } }), 'utf8');

      const config = readBoardConfig(testConfigDir);
      expect(config).toEqual({});
    });

    it('should ignore detailPaneWidth when it exceeds DETAIL_PANE_MAX_WIDTH', () => {
      fs.mkdirSync(testConfigDir, { recursive: true });
      fs.writeFileSync(testConfigFile, yaml.dump({ board: { detailPaneWidth: DETAIL_PANE_MAX_WIDTH + 1 } }), 'utf8');

      const config = readBoardConfig(testConfigDir);
      expect(config.detailPaneWidth).toBeUndefined();
    });

    it('should accept detailPaneWidth equal to DETAIL_PANE_MAX_WIDTH', () => {
      fs.mkdirSync(testConfigDir, { recursive: true });
      fs.writeFileSync(testConfigFile, yaml.dump({ board: { detailPaneWidth: DETAIL_PANE_MAX_WIDTH } }), 'utf8');

      const config = readBoardConfig(testConfigDir);
      expect(config.detailPaneWidth).toBe(DETAIL_PANE_MAX_WIDTH);
    });
  });

  describe('writeBoardConfig', () => {
    it('should create the config directory if it does not exist', () => {
      const newDir = path.join(process.cwd(), '.agkan-test-new-' + Date.now());
      try {
        writeBoardConfig(newDir, { detailPaneWidth: 400 });
        expect(fs.existsSync(newDir)).toBe(true);
      } finally {
        if (fs.existsSync(newDir)) {
          fs.rmSync(newDir, { recursive: true });
        }
      }
    });

    it('should write detailPaneWidth to config file', () => {
      writeBoardConfig(testConfigDir, { detailPaneWidth: 450 });

      expect(fs.existsSync(testConfigFile)).toBe(true);
      const content = fs.readFileSync(testConfigFile, 'utf8');
      const parsed = yaml.load(content) as { board?: { detailPaneWidth?: number } };
      expect(parsed.board?.detailPaneWidth).toBe(450);
    });

    it('should preserve existing config data when writing', () => {
      fs.mkdirSync(testConfigDir, { recursive: true });
      fs.writeFileSync(testConfigFile, yaml.dump({ board: { someOtherKey: 'value' } }), 'utf8');

      writeBoardConfig(testConfigDir, { detailPaneWidth: 350 });

      const content = fs.readFileSync(testConfigFile, 'utf8');
      const parsed = yaml.load(content) as { board?: { detailPaneWidth?: number; someOtherKey?: string } };
      expect(parsed.board?.detailPaneWidth).toBe(350);
      expect(parsed.board?.someOtherKey).toBe('value');
    });
  });

  describe('DETAIL_PANE_MAX_WIDTH', () => {
    it('should be a positive number', () => {
      expect(DETAIL_PANE_MAX_WIDTH).toBeGreaterThan(0);
    });
  });
});
