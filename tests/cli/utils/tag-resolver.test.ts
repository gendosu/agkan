/**
 * Tests for the shared tag ID/name resolution helper
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { resolveTag } from '../../../src/cli/utils/tag-resolver';
import { getDatabase } from '../../../src/db/connection';
import { TagService } from '../../../src/services';

describe('resolveTag', () => {
  let tagService: TagService;

  beforeEach(() => {
    const db = getDatabase();
    db.exec('DELETE FROM tags');
    db.exec("DELETE FROM sqlite_sequence WHERE name='tags'");
    tagService = new TagService();
  });

  it('resolves an existing numeric ID and marks byId true', () => {
    tagService.createTag({ name: 'bug' });
    const tag = tagService.listTags()[0];

    const result = resolveTag(tagService, String(tag.id));

    expect(result.byId).toBe(true);
    expect(result.tag?.id).toBe(tag.id);
  });

  it('returns null tag for a non-existent numeric ID', () => {
    const result = resolveTag(tagService, '999999');

    expect(result.byId).toBe(true);
    expect(result.tag).toBeNull();
  });

  it('resolves an existing tag name and marks byId false', () => {
    tagService.createTag({ name: 'feature' });

    const result = resolveTag(tagService, 'feature');

    expect(result.byId).toBe(false);
    expect(result.tag?.name).toBe('feature');
  });

  it('returns null tag for a non-existent tag name', () => {
    const result = resolveTag(tagService, 'nonexistent-tag');

    expect(result.byId).toBe(false);
    expect(result.tag).toBeNull();
  });

  it('treats a digit-leading tag name as a name, not a truncated numeric ID', () => {
    const releaseTag = tagService.createTag({ name: '2024release' });

    const result = resolveTag(tagService, '2024release');

    expect(result.byId).toBe(false);
    expect(result.tag?.id).toBe(releaseTag.id);
    expect(result.tag?.name).toBe('2024release');
  });

  it('treats "12abc" as a name, not ID 12', () => {
    tagService.createTag({ name: '12abc' });

    const result = resolveTag(tagService, '12abc');

    expect(result.byId).toBe(false);
    expect(result.tag?.name).toBe('12abc');
  });

  it('trims whitespace before resolving', () => {
    tagService.createTag({ name: 'trimmed' });

    const result = resolveTag(tagService, '  trimmed  ');

    expect(result.byId).toBe(false);
    expect(result.tag?.name).toBe('trimmed');
  });
});
