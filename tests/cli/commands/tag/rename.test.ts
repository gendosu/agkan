/**
 * Tests for tag rename command handler
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Command } from 'commander';
import { setupTagRenameCommand } from '../../../../src/cli/commands/tag/rename';
import { getDatabase } from '../../../../src/db/connection';
import { TagService } from '../../../../src/services';

describe('setupTagRenameCommand', () => {
  let program: Command;

  beforeEach(() => {
    // Reset database before each test
    const db = getDatabase();
    db.exec('DELETE FROM tags');
    db.exec("DELETE FROM sqlite_sequence WHERE name='tags'");

    // Create a fresh program with top-level tag command
    program = new Command();
    program.command('tag').description('Tag management commands');

    // Setup the rename command
    setupTagRenameCommand(program);
  });

  it('should register the rename command', () => {
    const tagCommand = program.commands.find((cmd) => cmd.name() === 'tag');
    expect(tagCommand).toBeDefined();

    const renameCommand = tagCommand?.commands.find((cmd) => cmd.name() === 'rename');
    expect(renameCommand).toBeDefined();
    expect(renameCommand?.description()).toBe('Rename a tag');
  });

  it('should have correct arguments', () => {
    const tagCommand = program.commands.find((cmd) => cmd.name() === 'tag');
    const renameCommand = tagCommand?.commands.find((cmd) => cmd.name() === 'rename');

    expect(renameCommand?.registeredArguments).toHaveLength(2);
    expect(renameCommand?.registeredArguments[0].name()).toBe('id-or-name');
    expect(renameCommand?.registeredArguments[1].name()).toBe('new-name');
  });

  it('should rename an existing tag by ID', async () => {
    const tagService = new TagService();
    tagService.createTag({ name: 'old-name' });
    const tag = tagService.listTags()[0];
    expect(tag).toBeDefined();

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'tag', 'rename', String(tag.id), 'new-name']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('✓');
    expect(output).toContain('new-name');

    const updatedTag = tagService.getTag(tag.id);
    expect(updatedTag?.name).toBe('new-name');
  });

  it('should rename an existing tag by name', async () => {
    const tagService = new TagService();
    tagService.createTag({ name: 'rename-by-name' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'tag', 'rename', 'rename-by-name', 'renamed-tag']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('✓');

    const tags = tagService.listTags();
    expect(tags).toHaveLength(1);
    expect(tags[0].name).toBe('renamed-tag');
  });

  it('should output JSON on successful rename with --json option', async () => {
    const tagService = new TagService();
    tagService.createTag({ name: 'json-rename' });
    const tag = tagService.listTags()[0];

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'tag', 'rename', String(tag.id), 'json-renamed', '--json']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const parsed = JSON.parse(consoleLogs.join(''));
    expect(parsed.success).toBe(true);
    expect(parsed.id).toBe(tag.id);
    expect(parsed.old_name).toBe('json-rename');
    expect(parsed.new_name).toBe('json-renamed');
  });

  it('should show error when tag does not exist by ID', async () => {
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'tag', 'rename', '999', 'new-name']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('999');
  });

  it('should show error when tag does not exist by name', async () => {
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'tag', 'rename', 'nonexistent-tag', 'new-name']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('nonexistent-tag');
  });

  it('should show error when new name already exists', async () => {
    const tagService = new TagService();
    tagService.createTag({ name: 'existing-tag' });
    tagService.createTag({ name: 'another-tag' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'tag', 'rename', 'existing-tag', 'another-tag']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('already exists');
  });

  it('should show JSON error when new name already exists with --json option', async () => {
    const tagService = new TagService();
    tagService.createTag({ name: 'tag-a' });
    tagService.createTag({ name: 'tag-b' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'tag', 'rename', 'tag-a', 'tag-b', '--json']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const parsed = JSON.parse(consoleLogs[0]);
    expect(parsed.success).toBe(false);
  });

  it('should show error for empty new name', async () => {
    const tagService = new TagService();
    tagService.createTag({ name: 'empty-test' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'tag', 'rename', 'empty-test', '  ']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
  });

  it('should show error for purely numeric new name', async () => {
    const tagService = new TagService();
    tagService.createTag({ name: 'numeric-test' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'tag', 'rename', 'numeric-test', '12345']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
  });
});
