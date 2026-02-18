/**
 * Tests for tag list command handler
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Command } from 'commander';
import { setupTagListCommand } from '../../../../src/cli/commands/tag/list';
import { getDatabase } from '../../../../src/db/connection';
import { TagService } from '../../../../src/services';

describe('setupTagListCommand', () => {
  let program: Command;

  beforeEach(() => {
    // Reset database before each test
    const db = getDatabase();
    db.exec('DELETE FROM tags');
    db.exec("DELETE FROM sqlite_sequence WHERE name='tags'");

    // Create a fresh program with top-level tag command
    program = new Command();
    program.command('tag').description('Tag management commands');

    // Setup the list command
    setupTagListCommand(program);
  });

  it('should register the list command', () => {
    const tagCommand = program.commands.find((cmd) => cmd.name() === 'tag');
    expect(tagCommand).toBeDefined();

    const listCommand = tagCommand?.commands.find((cmd) => cmd.name() === 'list');
    expect(listCommand).toBeDefined();
    expect(listCommand?.description()).toBe('List all tags');
  });

  it('should have correct options', () => {
    const tagCommand = program.commands.find((cmd) => cmd.name() === 'tag');
    const listCommand = tagCommand?.commands.find((cmd) => cmd.name() === 'list');

    const options = listCommand?.options || [];
    const optionNames = options.map((opt) => opt.long);

    expect(optionNames).toContain('--json');
  });

  it('should show "No tags found" when there are no tags', async () => {
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'tag', 'list']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('No tags found');
  });

  it('should list tags when tags exist', async () => {
    const tagService = new TagService();
    tagService.createTag({ name: 'frontend' });
    tagService.createTag({ name: 'backend' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'tag', 'list']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('frontend');
    expect(output).toContain('backend');
  });

  it('should output JSON with empty tags array when no tags exist with --json option', async () => {
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'tag', 'list', '--json']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const parsed = JSON.parse(consoleLogs.join(''));
    expect(parsed.totalCount).toBe(0);
    expect(parsed.tags).toHaveLength(0);
  });

  it('should output JSON with tags when tags exist with --json option', async () => {
    const tagService = new TagService();
    tagService.createTag({ name: 'alpha' });
    tagService.createTag({ name: 'beta' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'tag', 'list', '--json']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const parsed = JSON.parse(consoleLogs.join(''));
    expect(parsed.totalCount).toBe(2);
    expect(parsed.tags).toHaveLength(2);
    const names = parsed.tags.map((t: { name: string }) => t.name);
    expect(names).toContain('alpha');
    expect(names).toContain('beta');
  });

  it('should include taskCount in JSON output', async () => {
    const tagService = new TagService();
    tagService.createTag({ name: 'counted-tag' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'tag', 'list', '--json']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const parsed = JSON.parse(consoleLogs.join(''));
    expect(parsed.tags[0].taskCount).toBeDefined();
    expect(parsed.tags[0].taskCount).toBe(0);
  });
});
