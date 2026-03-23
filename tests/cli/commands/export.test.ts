/**
 * Tests for export command handler
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Command } from 'commander';
import { setupExportCommand } from '../../../src/cli/commands/export';
import { TaskService } from '../../../src/services/TaskService';
import { resetDatabase } from '../../../src/db/reset';

describe('setupExportCommand', () => {
  let program: Command;

  beforeEach(() => {
    resetDatabase();
    program = new Command();
    program.exitOverride();
    setupExportCommand(program);
  });

  it('should register the export command', () => {
    const exportCommand = program.commands.find((cmd) => cmd.name() === 'export');
    expect(exportCommand).toBeDefined();
    expect(exportCommand?.description()).toBe(
      'Export all tasks to JSON format (pipe to file: agkan export > backup.json)'
    );
  });

  it('should output valid JSON to stdout', async () => {
    const taskService = new TaskService();
    taskService.createTask({ title: 'Test Task', status: 'ready' });

    const stdoutWrites: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((data: unknown) => {
      stdoutWrites.push(String(data));
      return true;
    });

    try {
      await program.parseAsync(['node', 'test', 'export']);
    } finally {
      vi.restoreAllMocks();
    }

    const output = stdoutWrites.join('');
    expect(output).toBeTruthy();

    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty('version');
    expect(parsed).toHaveProperty('exported_at');
    expect(parsed).toHaveProperty('tasks');
    expect(Array.isArray(parsed.tasks)).toBe(true);
    expect(parsed.tasks).toHaveLength(1);
    expect(parsed.tasks[0].title).toBe('Test Task');
  });

  it('should output empty tasks array when no tasks exist', async () => {
    const stdoutWrites: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((data: unknown) => {
      stdoutWrites.push(String(data));
      return true;
    });

    try {
      await program.parseAsync(['node', 'test', 'export']);
    } finally {
      vi.restoreAllMocks();
    }

    const output = stdoutWrites.join('');
    const parsed = JSON.parse(output);
    expect(parsed.tasks).toHaveLength(0);
  });
});
