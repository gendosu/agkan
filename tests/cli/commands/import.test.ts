/**
 * Tests for import command handler
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';
import { setupImportCommand } from '../../../src/cli/commands/import';
import { TaskService } from '../../../src/services/TaskService';
import { resetDatabase } from '../../../src/db/reset';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { ExportData } from '../../../src/services/ExportImportService';

const TEST_FILE = join(process.cwd(), '.test-import-' + process.pid + '.json');

function writeTestFile(data: unknown): void {
  writeFileSync(TEST_FILE, JSON.stringify(data));
}

describe('setupImportCommand', () => {
  let program: Command;

  beforeEach(() => {
    resetDatabase();
    program = new Command();
    program.exitOverride();
    setupImportCommand(program);
  });

  afterEach(() => {
    if (existsSync(TEST_FILE)) {
      unlinkSync(TEST_FILE);
    }
    vi.restoreAllMocks();
  });

  it('should register the import command', () => {
    const importCommand = program.commands.find((cmd) => cmd.name() === 'import');
    expect(importCommand).toBeDefined();
    expect(importCommand?.description()).toBe('Import tasks from a JSON export file');
  });

  it('should import tasks from a valid JSON file', async () => {
    const exportData: ExportData = {
      version: '1.0.0',
      exported_at: '2026-01-01T00:00:00.000Z',
      tasks: [
        {
          id: 1,
          title: 'Imported Task',
          body: 'body content',
          author: 'alice',
          assignees: null,
          status: 'ready',
          parent_id: null,
          created_at: '2026-01-01T10:00:00.000Z',
          updated_at: '2026-01-01T10:00:00.000Z',
          tags: [],
          metadata: {},
          comments: [],
          blocked_by: [],
        },
      ],
    };
    writeTestFile(exportData);

    const stdoutWrites: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((data: unknown) => {
      stdoutWrites.push(String(data));
      return true;
    });

    await program.parseAsync(['node', 'test', 'import', TEST_FILE]);

    const output = stdoutWrites.join('');
    expect(output).toContain('Imported 1 task(s) successfully');

    const taskService = new TaskService();
    const tasks = taskService.listTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('Imported Task');
  });

  it('should write error to stderr and exit 1 for invalid JSON', async () => {
    writeFileSync(TEST_FILE, 'not valid json');

    const stderrWrites: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((data: unknown) => {
      stderrWrites.push(String(data));
      return true;
    });

    let exitCode: number | undefined;
    vi.spyOn(process, 'exit').mockImplementation((code?: number | string | null) => {
      exitCode = code as number;
      throw new Error('process.exit called');
    });

    try {
      await program.parseAsync(['node', 'test', 'import', TEST_FILE]);
    } catch {
      // Expected process.exit
    }

    expect(stderrWrites.join('')).toContain('Invalid JSON file');
    expect(exitCode).toBe(1);
  });

  it('should write error to stderr and exit 1 for missing file', async () => {
    const stderrWrites: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((data: unknown) => {
      stderrWrites.push(String(data));
      return true;
    });

    let exitCode: number | undefined;
    vi.spyOn(process, 'exit').mockImplementation((code?: number | string | null) => {
      exitCode = code as number;
      throw new Error('process.exit called');
    });

    try {
      await program.parseAsync(['node', 'test', 'import', '/nonexistent/path/backup.json']);
    } catch {
      // Expected process.exit
    }

    expect(stderrWrites.join('')).toContain('Error:');
    expect(exitCode).toBe(1);
  });

  it('should write error to stderr for invalid export format', async () => {
    writeTestFile({ version: '1.0.0', exported_at: '2026-01-01T00:00:00.000Z' });

    const stderrWrites: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((data: unknown) => {
      stderrWrites.push(String(data));
      return true;
    });

    let exitCode: number | undefined;
    vi.spyOn(process, 'exit').mockImplementation((code?: number | string | null) => {
      exitCode = code as number;
      throw new Error('process.exit called');
    });

    try {
      await program.parseAsync(['node', 'test', 'import', TEST_FILE]);
    } catch {
      // Expected process.exit
    }

    expect(stderrWrites.join('')).toContain('missing tasks array');
    expect(exitCode).toBe(1);
  });
});
