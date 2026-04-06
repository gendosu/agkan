/**
 * Tests for init command handler
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { setupInitCommand } from '../../../src/cli/commands/init';
import { createProgram } from '../../helpers/command-test-utils';

vi.mock('../../../src/db/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/db/config')>();
  return {
    ...actual,
    getConfigFileName: vi.fn(() => '.agkan.yml'),
    getDefaultDirName: vi.fn(() => '.agkan'),
  };
});

import { getConfigFileName, getDefaultDirName } from '../../../src/db/config';

const mockGetConfigFileName = vi.mocked(getConfigFileName);
const mockGetDefaultDirName = vi.mocked(getDefaultDirName);

describe('setupInitCommand', () => {
  let program: Command;
  let logs: string[];
  let originalLog: typeof console.log;
  let originalCwd: typeof process.cwd;
  let tmpDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConfigFileName.mockReturnValue('.agkan.yml');
    mockGetDefaultDirName.mockReturnValue('.agkan');
    program = createProgram(setupInitCommand);

    logs = [];
    originalLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));

    // Create a temporary directory for each test
    tmpDir = fs.mkdtempSync(path.join('/tmp', 'agkan-init-test-'));

    originalCwd = process.cwd;
    process.cwd = () => tmpDir;
  });

  afterEach(() => {
    console.log = originalLog;
    process.cwd = originalCwd;

    // Clean up temporary directory
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should register the init command', () => {
    const initCommand = program.commands.find((cmd) => cmd.name() === 'init');
    expect(initCommand).toBeDefined();
    expect(initCommand?.description()).toBe('Initialize agkan configuration and data directory');
  });

  it('should create .agkan.yml when it does not exist', async () => {
    await program.parseAsync(['node', 'test', 'init']);

    const configPath = path.join(tmpDir, '.agkan.yml');
    expect(fs.existsSync(configPath)).toBe(true);
  });

  it('should create .agkan directory when it does not exist', async () => {
    await program.parseAsync(['node', 'test', 'init']);

    const dirPath = path.join(tmpDir, '.agkan');
    expect(fs.existsSync(dirPath)).toBe(true);
    expect(fs.statSync(dirPath).isDirectory()).toBe(true);
  });

  it('should write default config content to .agkan.yml', async () => {
    await program.parseAsync(['node', 'test', 'init']);

    const configPath = path.join(tmpDir, '.agkan.yml');
    const content = fs.readFileSync(configPath, 'utf8');
    expect(content).toContain('path:');
    expect(content).toContain('.agkan/data.db');
  });

  it('should display success messages after creation', async () => {
    await program.parseAsync(['node', 'test', 'init']);

    expect(logs.some((l) => l.includes('.agkan.yml'))).toBe(true);
    expect(logs.some((l) => l.includes('.agkan'))).toBe(true);
  });

  it('should skip creating .agkan.yml if it already exists', async () => {
    const configPath = path.join(tmpDir, '.agkan.yml');
    const originalContent = 'path: custom/path/data.db\n';
    fs.writeFileSync(configPath, originalContent);

    await program.parseAsync(['node', 'test', 'init']);

    const content = fs.readFileSync(configPath, 'utf8');
    expect(content).toBe(originalContent);
  });

  it('should skip creating .agkan directory if it already exists', async () => {
    const dirPath = path.join(tmpDir, '.agkan');
    fs.mkdirSync(dirPath);
    const markerFile = path.join(dirPath, 'marker.txt');
    fs.writeFileSync(markerFile, 'existing');

    await program.parseAsync(['node', 'test', 'init']);

    expect(fs.existsSync(markerFile)).toBe(true);
  });

  it('should display skip messages when files already exist', async () => {
    const configPath = path.join(tmpDir, '.agkan.yml');
    fs.writeFileSync(configPath, 'path: custom/path\n');
    const dirPath = path.join(tmpDir, '.agkan');
    fs.mkdirSync(dirPath);

    await program.parseAsync(['node', 'test', 'init']);

    expect(logs.some((l) => l.includes('skip') || l.includes('Skip') || l.includes('already'))).toBe(true);
  });

  it('should create common tags on first init', async () => {
    await program.parseAsync(['node', 'test', 'init']);

    // Verify database was initialized and can be accessed
    const { getDatabase } = await import('../../../src/db/connection');
    const db = getDatabase();

    const stmt = db.prepare('SELECT COUNT(*) as count FROM tags');
    const result = stmt.get() as { count: number };

    expect(result.count).toBeGreaterThanOrEqual(7);
  });

  it('should create specific default tags', async () => {
    await program.parseAsync(['node', 'test', 'init']);

    const { getDatabase } = await import('../../../src/db/connection');
    const db = getDatabase();

    const expectedTags = ['bug', 'security', 'improvement', 'test', 'performance', 'refactor', 'docs'];
    const checkStmt = db.prepare('SELECT COUNT(*) as count FROM tags WHERE name = ?');

    for (const tagName of expectedTags) {
      const result = checkStmt.get(tagName) as { count: number };
      expect(result.count).toBe(1);
    }
  });

  it('should not duplicate tags if init is run again', async () => {
    await program.parseAsync(['node', 'test', 'init']);

    const { getDatabase } = await import('../../../src/db/connection');
    const db = getDatabase();

    const countBefore = (db.prepare('SELECT COUNT(*) as count FROM tags').get() as { count: number }).count;

    // Run init again
    await program.parseAsync(['node', 'test', 'init']);

    const countAfter = (db.prepare('SELECT COUNT(*) as count FROM tags').get() as { count: number }).count;

    expect(countAfter).toBe(countBefore);
  });
});
