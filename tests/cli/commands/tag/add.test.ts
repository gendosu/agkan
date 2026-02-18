/**
 * Tests for tag add command handler
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Command } from 'commander';
import { setupTagAddCommand } from '../../../../src/cli/commands/tag/add';
import { getDatabase } from '../../../../src/db/connection';
import { TagService } from '../../../../src/services';

describe('setupTagAddCommand', () => {
  let program: Command;

  beforeEach(() => {
    // Reset database before each test
    const db = getDatabase();
    db.exec('DELETE FROM tags');
    db.exec("DELETE FROM sqlite_sequence WHERE name='tags'");

    // Create a fresh program with top-level tag command
    program = new Command();
    program.exitOverride();
    program.command('tag').description('Tag management commands');

    // Setup the add command
    setupTagAddCommand(program);
  });

  it('should register the add command', () => {
    const tagCommand = program.commands.find((cmd) => cmd.name() === 'tag');
    expect(tagCommand).toBeDefined();

    const addCommand = tagCommand?.commands.find((cmd) => cmd.name() === 'add');
    expect(addCommand).toBeDefined();
    expect(addCommand?.description()).toBe('Create a new tag');
  });

  it('should have correct arguments', () => {
    const tagCommand = program.commands.find((cmd) => cmd.name() === 'tag');
    const addCommand = tagCommand?.commands.find((cmd) => cmd.name() === 'add');

    expect(addCommand?.registeredArguments).toHaveLength(1);
    expect(addCommand?.registeredArguments[0].name()).toBe('name');
  });

  it('should reject name exceeding 50 characters', async () => {
    const longName = 'a'.repeat(51);
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'tag', 'add', longName]);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('50');

    const tagService = new TagService();
    expect(tagService.listTags()).toHaveLength(0);
  });

  it('should create tag with valid name', async () => {
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'tag', 'add', 'valid-tag']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const tagService = new TagService();
    const tags = tagService.listTags();
    expect(tags).toHaveLength(1);
    expect(tags[0].name).toBe('valid-tag');
  });

  it('should output success message containing tag name', async () => {
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'tag', 'add', 'my-tag']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('✓');
    expect(output).toContain('my-tag');
  });

  it('should output JSON on successful add with --json option', async () => {
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'tag', 'add', 'json-tag', '--json']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const parsed = JSON.parse(consoleLogs[0]);
    expect(parsed.success).toBe(true);
    expect(parsed.name).toBe('json-tag');
    expect(parsed.id).toBeDefined();
  });

  it('should show error for duplicate tag name', async () => {
    const tagService = new TagService();
    tagService.createTag({ name: 'existing-tag' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'tag', 'add', 'existing-tag']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('existing-tag');
  });

  it('should show JSON error for duplicate tag name with --json option', async () => {
    const tagService = new TagService();
    tagService.createTag({ name: 'dup-tag' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'tag', 'add', 'dup-tag', '--json']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const parsed = JSON.parse(consoleLogs[0]);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toBeDefined();
  });
});
