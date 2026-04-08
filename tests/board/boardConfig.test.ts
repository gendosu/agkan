/**
 * Tests for board config (detail pane width persistence in .agkan/config.yml)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import {
  readBoardConfig,
  writeBoardConfig,
  DETAIL_PANE_MAX_WIDTH,
  VALID_THEMES,
  VALID_LLMS,
} from '../../src/board/boardConfig';

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
    it('should return default llm when config file does not exist', () => {
      const config = readBoardConfig(testConfigDir);
      expect(config.llm).toBe('claude');
    });

    it('should read detailPaneWidth from config file', () => {
      fs.mkdirSync(testConfigDir, { recursive: true });
      fs.writeFileSync(testConfigFile, yaml.dump({ board: { detailPaneWidth: 500 } }), 'utf8');

      const config = readBoardConfig(testConfigDir);
      expect(config.detailPaneWidth).toBe(500);
      expect(config.llm).toBe('claude');
    });

    it('should return default llm when config file is invalid YAML', () => {
      fs.mkdirSync(testConfigDir, { recursive: true });
      fs.writeFileSync(testConfigFile, 'invalid: yaml: content: [broken', 'utf8');

      const config = readBoardConfig(testConfigDir);
      expect(config).toEqual({ llm: 'claude' });
    });

    it('should return default llm when board section is missing', () => {
      fs.mkdirSync(testConfigDir, { recursive: true });
      fs.writeFileSync(testConfigFile, yaml.dump({ other: 'data' }), 'utf8');

      const config = readBoardConfig(testConfigDir);
      expect(config).toEqual({ llm: 'claude' });
    });

    it('should ignore detailPaneWidth when it is not a number', () => {
      fs.mkdirSync(testConfigDir, { recursive: true });
      fs.writeFileSync(testConfigFile, yaml.dump({ board: { detailPaneWidth: 'not-a-number' } }), 'utf8');

      const config = readBoardConfig(testConfigDir);
      expect(config.detailPaneWidth).toBeUndefined();
      expect(config.llm).toBe('claude');
    });

    it('should ignore detailPaneWidth when it exceeds DETAIL_PANE_MAX_WIDTH', () => {
      fs.mkdirSync(testConfigDir, { recursive: true });
      fs.writeFileSync(testConfigFile, yaml.dump({ board: { detailPaneWidth: DETAIL_PANE_MAX_WIDTH + 1 } }), 'utf8');

      const config = readBoardConfig(testConfigDir);
      expect(config.detailPaneWidth).toBeUndefined();
      expect(config.llm).toBe('claude');
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
      expect(config.llm).toBe('claude');
    });

    it('should read llm "codex" from config file', () => {
      fs.mkdirSync(testConfigDir, { recursive: true });
      fs.writeFileSync(testConfigFile, yaml.dump({ board: { llm: 'codex' } }), 'utf8');

      const config = readBoardConfig(testConfigDir);
      expect(config.llm).toBe('codex');
    });

    it('should read llm "claude" from config file', () => {
      fs.mkdirSync(testConfigDir, { recursive: true });
      fs.writeFileSync(testConfigFile, yaml.dump({ board: { llm: 'claude' } }), 'utf8');

      const config = readBoardConfig(testConfigDir);
      expect(config.llm).toBe('claude');
    });

    it('should default llm to "claude" when llm value is invalid', () => {
      fs.mkdirSync(testConfigDir, { recursive: true });
      fs.writeFileSync(testConfigFile, yaml.dump({ board: { llm: 'invalid-llm' } }), 'utf8');

      const config = readBoardConfig(testConfigDir);
      expect(config.llm).toBe('claude');
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

    it('should write theme to config file', () => {
      writeBoardConfig(testConfigDir, { theme: 'dark' });

      const content = fs.readFileSync(testConfigFile, 'utf8');
      const parsed = yaml.load(content) as { board?: { theme?: string } };
      expect(parsed.board?.theme).toBe('dark');
    });

    it('should write llm to config file', () => {
      writeBoardConfig(testConfigDir, { llm: 'codex' });

      const content = fs.readFileSync(testConfigFile, 'utf8');
      const parsed = yaml.load(content) as { board?: { llm?: string } };
      expect(parsed.board?.llm).toBe('codex');
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

  describe('VALID_LLMS', () => {
    it('should contain codex and claude', () => {
      expect(VALID_LLMS).toContain('codex');
      expect(VALID_LLMS).toContain('claude');
    });
  });
});
