/**
 * Tests for tag delete command handler
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Command } from 'commander';
import { setupTagDeleteCommand } from '../../../../src/cli/commands/tag/delete';
import { getDatabase } from '../../../../src/db/connection';
import { TagService } from '../../../../src/services';

describe('setupTagDeleteCommand', () => {
  let program: Command;

  beforeEach(() => {
    // Reset database before each test
    const db = getDatabase();
    db.exec('DELETE FROM tags');
    db.exec("DELETE FROM sqlite_sequence WHERE name='tags'");

    // Create a fresh program with top-level tag command
    program = new Command();
    program.command('tag').description('Tag management commands');

    // Setup the delete command
    setupTagDeleteCommand(program);
  });

  it('should register the delete command', () => {
    const tagCommand = program.commands.find((cmd) => cmd.name() === 'tag');
    expect(tagCommand).toBeDefined();

    const deleteCommand = tagCommand?.commands.find((cmd) => cmd.name() === 'delete');
    expect(deleteCommand).toBeDefined();
    expect(deleteCommand?.description()).toBe('Delete a tag');
  });

  it('should have correct arguments', () => {
    const tagCommand = program.commands.find((cmd) => cmd.name() === 'tag');
    const deleteCommand = tagCommand?.commands.find((cmd) => cmd.name() === 'delete');

    expect(deleteCommand?.registeredArguments).toHaveLength(1);
    expect(deleteCommand?.registeredArguments[0].name()).toBe('id-or-name');
  });

  it('should delete an existing tag', async () => {
    const tagService = new TagService();
    tagService.createTag({ name: 'to-delete' });
    const tag = tagService.listTags()[0];
    expect(tag).toBeDefined();

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'tag', 'delete', String(tag.id)]);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('✓');

    const remaining = tagService.listTags();
    expect(remaining).toHaveLength(0);
  });

  it('should output JSON on successful delete with --json option', async () => {
    const tagService = new TagService();
    tagService.createTag({ name: 'json-delete' });
    const tag = tagService.listTags()[0];

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'tag', 'delete', String(tag.id), '--json']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const parsed = JSON.parse(consoleLogs.join(''));
    expect(parsed.success).toBe(true);
    expect(parsed.id).toBe(tag.id);
    expect(parsed.name).toBe('json-delete');
  });

  it('should show error when tag does not exist', async () => {
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'tag', 'delete', '999']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('999');
  });

  it('should show JSON error when tag does not exist with --json option', async () => {
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'tag', 'delete', '999', '--json']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const parsed = JSON.parse(consoleLogs[0]);
    expect(parsed.success).toBe(false);
  });

  it('should show error when tag name does not exist', async () => {
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'tag', 'delete', 'nonexistent-tag']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('nonexistent-tag');
  });

  it('should delete a tag by name', async () => {
    const tagService = new TagService();
    tagService.createTag({ name: 'delete-by-name' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'tag', 'delete', 'delete-by-name']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('✓');

    const remaining = tagService.listTags();
    expect(remaining).toHaveLength(0);
  });
});
