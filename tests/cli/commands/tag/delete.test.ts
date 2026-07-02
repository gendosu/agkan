/**
 * Tests for tag delete command handler
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Command } from 'commander';
import { setupTagDeleteCommand } from '../../../../src/cli/commands/tag/delete';
import { getDatabase } from '../../../../src/db/connection';
import { TagService } from '../../../../src/services';
import * as serviceContainer from '../../../../src/cli/utils/service-container';

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

  it('should delete a tag named "12abc" by name, not truncate to numeric ID 12', async () => {
    const tagService = new TagService();
    // Create 11 filler tags so a real tag with id=12 exists, distinct from "12abc".
    for (let i = 1; i <= 11; i++) {
      tagService.createTag({ name: `filler-${i}` });
    }
    const idTwelveTag = tagService.createTag({ name: 'id-twelve' });
    expect(idTwelveTag.id).toBe(12);
    const digitLeadingTag = tagService.createTag({ name: '12abc' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    const originalExit = process.exit;
    process.exit = (() => {}) as never;

    try {
      await program.parseAsync(['node', 'test', 'tag', 'delete', '12abc']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    const output = consoleLogs.join('\n');
    expect(output).toContain('✓');

    expect(tagService.getTag(idTwelveTag.id)).not.toBeNull();
    expect(tagService.getTag(digitLeadingTag.id)).toBeNull();
  });

  it('should show error when a numeric-ID-looking tag does not exist (not resolved by name)', async () => {
    const tagService = new TagService();
    tagService.createTag({ name: 'unrelated-tag' });

    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(' '));

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
    }) as never;

    try {
      await program.parseAsync(['node', 'test', 'tag', 'delete', '424242']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('Tag with ID 424242 not found');
  });

  it('should throw when tag command is not registered', () => {
    const programWithoutTag = new Command();
    expect(() => setupTagDeleteCommand(programWithoutTag)).toThrow('Tag command not found');
  });

  it('should handle non-Error thrown in inner catch as unknown error', async () => {
    const tagService = new TagService();
    tagService.createTag({ name: 'inner-error-tag' });
    const tag = tagService.listTags()[0];

    const spy = vi.spyOn(serviceContainer, 'getServiceContainer').mockReturnValue({
      tagService: {
        getTag: (id: number) => tagService.getTag(id),
        getTagByName: (name: string) => tagService.getTagByName(name),
        listTags: () => tagService.listTags(),
        createTag: (data: Parameters<typeof tagService.createTag>[0]) => tagService.createTag(data),
        updateTag: (id: number, data: Parameters<typeof tagService.updateTag>[1]) => tagService.updateTag(id, data),
        deleteTag: () => {
          throw 'string error';
        },
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
      await program.parseAsync(['node', 'test', 'tag', 'delete', String(tag.id)]);
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
      throw new Error('outer plain error delete');
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
      await program.parseAsync(['node', 'test', 'tag', 'delete', '1']);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
      spy.mockRestore();
    }

    expect(exitCode).toBe(1);
    const output = consoleLogs.join('\n');
    expect(output).toContain('outer plain error delete');
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
      await program.parseAsync(['node', 'test', 'tag', 'delete', '1']);
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
