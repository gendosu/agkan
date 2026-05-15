/**
 * Tests for tag add command handler
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Command } from 'commander';
import { setupTagAddCommand } from '../../../../src/cli/commands/tag/add';
import { getDatabase } from '../../../../src/db/connection';
import { TagService } from '../../../../src/services';
import * as serviceContainer from '../../../../src/cli/utils/service-container';

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

  it('should throw when tag command is not registered', () => {
    const programWithoutTag = new Command();
    programWithoutTag.exitOverride();
    expect(() => setupTagAddCommand(programWithoutTag)).toThrow('Tag command not found');
  });

  it('should show error for whitespace-only name', async () => {
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'tag', 'add', '   ']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('empty');
  });

  it('should handle plain Error thrown in inner catch', async () => {
    const tagService = new TagService();
    const spy = vi.spyOn(serviceContainer, 'getServiceContainer').mockReturnValue({
      tagService: {
        getTag: (id: number) => tagService.getTag(id),
        getTagByName: (name: string) => tagService.getTagByName(name),
        listTags: () => tagService.listTags(),
        createTag: () => {
          throw new Error('inner plain error');
        },
        updateTag: (id: number, data: Parameters<typeof tagService.updateTag>[1]) => tagService.updateTag(id, data),
        deleteTag: (id: number) => tagService.deleteTag(id),
      },
    } as ReturnType<typeof serviceContainer.getServiceContainer>);

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'tag', 'add', 'test-tag']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
      spy.mockRestore();
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('inner plain error');
  });

  it('should handle non-Error thrown in inner catch as unknown error', async () => {
    const tagService = new TagService();
    const spy = vi.spyOn(serviceContainer, 'getServiceContainer').mockReturnValue({
      tagService: {
        getTag: (id: number) => tagService.getTag(id),
        getTagByName: (name: string) => tagService.getTagByName(name),
        listTags: () => tagService.listTags(),
        createTag: () => {
          throw 'string error';
        },
        updateTag: (id: number, data: Parameters<typeof tagService.updateTag>[1]) => tagService.updateTag(id, data),
        deleteTag: (id: number) => tagService.deleteTag(id),
      },
    } as ReturnType<typeof serviceContainer.getServiceContainer>);

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'tag', 'add', 'test-tag']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
      spy.mockRestore();
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('unknown error');
  });

  it('should handle plain Error thrown in outer catch', async () => {
    const spy = vi.spyOn(serviceContainer, 'getServiceContainer').mockImplementation(() => {
      throw new Error('outer plain error');
    });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'tag', 'add', 'test-tag']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
      spy.mockRestore();
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('outer plain error');
  });

  it('should handle non-Error thrown in outer catch as unknown error', async () => {
    const spy = vi.spyOn(serviceContainer, 'getServiceContainer').mockImplementation(() => {
      throw 'outer string error';
    });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'tag', 'add', 'test-tag']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
      spy.mockRestore();
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('unknown error');
  });
});
