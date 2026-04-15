/**
 * Tests for board config (detail pane width persistence in .agkan/config.yml)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import yaml from 'js-yaml';
import { readBoardConfig, writeBoardConfig, DETAIL_PANE_MAX_WIDTH, VALID_THEMES } from '../../src/board/boardConfig';

describe('boardConfig', () => {
  let testConfigDir: string;
  let testConfigFile: string;

  beforeEach(() => {
    testConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agkan-boardconfig-test-'));
    testConfigFile = path.join(testConfigDir, 'config.yml');
  });

  afterEach(() => {
    if (fs.existsSync(testConfigDir)) {
      fs.rmSync(testConfigDir, { recursive: true, force: true });
    }
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

    it('should read theme "dark" from config file', () => {
      fs.mkdirSync(testConfigDir, { recursive: true });
      fs.writeFileSync(testConfigFile, yaml.dump({ board: { theme: 'dark' } }), 'utf8');

      const config = readBoardConfig(testConfigDir);
      expect(config.theme).toBe('dark');
    });

    it('should read theme "light" from config file', () => {
      fs.mkdirSync(testConfigDir, { recursive: true });
      fs.writeFileSync(testConfigFile, yaml.dump({ board: { theme: 'light' } }), 'utf8');

      const config = readBoardConfig(testConfigDir);
      expect(config.theme).toBe('light');
    });

    it('should read theme "system" from config file', () => {
      fs.mkdirSync(testConfigDir, { recursive: true });
      fs.writeFileSync(testConfigFile, yaml.dump({ board: { theme: 'system' } }), 'utf8');

      const config = readBoardConfig(testConfigDir);
      expect(config.theme).toBe('system');
    });

    it('should ignore theme when value is invalid', () => {
      fs.mkdirSync(testConfigDir, { recursive: true });
      fs.writeFileSync(testConfigFile, yaml.dump({ board: { theme: 'invalid-theme' } }), 'utf8');

      const config = readBoardConfig(testConfigDir);
      expect(config.theme).toBeUndefined();
    });

    it('should ignore theme when value is not a string', () => {
      fs.mkdirSync(testConfigDir, { recursive: true });
      fs.writeFileSync(testConfigFile, yaml.dump({ board: { theme: 123 } }), 'utf8');

      const config = readBoardConfig(testConfigDir);
      expect(config.theme).toBeUndefined();
    });
  });

  describe('writeBoardConfig', () => {
    it('should create the config directory if it does not exist', () => {
      const newDir = path.join(testConfigDir, 'newdir-' + Date.now());
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

    it('should write theme to config file', () => {
      writeBoardConfig(testConfigDir, { theme: 'dark' });

      const content = fs.readFileSync(testConfigFile, 'utf8');
      const parsed = yaml.load(content) as { board?: { theme?: string } };
      expect(parsed.board?.theme).toBe('dark');
    });

    it('should preserve detailPaneWidth when writing theme', () => {
      fs.mkdirSync(testConfigDir, { recursive: true });
      fs.writeFileSync(testConfigFile, yaml.dump({ board: { detailPaneWidth: 500 } }), 'utf8');

      writeBoardConfig(testConfigDir, { theme: 'light' });

      const content = fs.readFileSync(testConfigFile, 'utf8');
      const parsed = yaml.load(content) as { board?: { detailPaneWidth?: number; theme?: string } };
      expect(parsed.board?.detailPaneWidth).toBe(500);
      expect(parsed.board?.theme).toBe('light');
    });
  });

  describe('DETAIL_PANE_MAX_WIDTH', () => {
    it('should be a positive number', () => {
      expect(DETAIL_PANE_MAX_WIDTH).toBeGreaterThan(0);
    });
  });

  describe('VALID_THEMES', () => {
    it('should contain dark, light, and system', () => {
      expect(VALID_THEMES).toContain('dark');
      expect(VALID_THEMES).toContain('light');
      expect(VALID_THEMES).toContain('system');
    });
  });
});
