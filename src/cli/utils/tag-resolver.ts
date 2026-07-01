/**
 * Shared tag ID/name resolution helper
 */

import { Tag } from '../../models';
import { TagService } from '../../services';

export interface TagResolution {
  /** The resolved tag, or null if not found. */
  tag: Tag | null;
  /** True if the input was interpreted as a numeric ID, false if resolved by name. */
  byId: boolean;
}

/**
 * Resolve a tag from a string that is either a numeric ID or a tag name.
 * ID interpretation happens ONLY when the trimmed input fully matches /^\d+$/.
 * Numeric IDs are verified for existence via getTag; anything else is resolved
 * by name via getTagByName. This keeps resolution symmetric with tag creation,
 * which forbids purely-numeric names, so digit-leading names (e.g. "2024release",
 * "12abc") are always treated as names.
 */
export function resolveTag(tagService: TagService, input: string): TagResolution {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) {
    return { tag: tagService.getTag(parseInt(trimmed, 10)), byId: true };
  }
  return { tag: tagService.getTagByName(trimmed), byId: false };
}
