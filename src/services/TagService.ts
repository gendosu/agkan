import { Tag, CreateTagInput, UpdateTagInput } from '../models';
import { getStorageBackend } from '../db/connection';
import { validateTagInput } from '../utils/input-validators';
import { StorageBackend } from '../db/types/repository';

/**
 * Tag Service
 * Manages creation, retrieval, update, and deletion of tags
 */
export class TagService {
  private backend: StorageBackend;

  constructor(backend?: StorageBackend) {
    this.backend = backend ?? getStorageBackend();
  }

  /**
   * Create a new tag
   * @param input - Tag creation input
   * @returns Newly created tag
   * @throws Error if tag name already exists
   */
  createTag(input: CreateTagInput): Tag {
    // Validate input fields
    const validationErrors = validateTagInput(input);
    if (validationErrors.length > 0) {
      throw new Error(validationErrors[0].message);
    }

    // Check for duplicate tag names
    const existingTag = this.getTagByName(input.name);
    if (existingTag) {
      throw new Error(`Tag with name "${input.name}" already exists`);
    }

    const now = new Date().toISOString();
    return this.backend.tags.create({ name: input.name, created_at: now });
  }

  /**
   * Get tag by ID
   * @param id - Tag ID
   * @returns Tag object or null if not found
   */
  getTag(id: number): Tag | null {
    return this.backend.tags.findById(id);
  }

  /**
   * Get tag by name
   * @param name - Tag name
   * @returns Tag object or null if not found
   */
  getTagByName(name: string): Tag | null {
    return this.backend.tags.findByName(name);
  }

  /**
   * List all tags
   * @returns Array of tags sorted by creation date in descending order
   */
  listTags(): Tag[] {
    return this.backend.tags.findAll();
  }

  /**
   * Update tag
   * @param id - Tag ID
   * @param input - Tag update input
   * @returns Updated tag object or null if not found
   * @throws Error if tag name already exists
   */
  updateTag(id: number, input: UpdateTagInput): Tag | null {
    // Verify that tag exists
    const existingTag = this.getTag(id);
    if (!existingTag) {
      return null;
    }

    // Validate name if being updated
    if (input.name !== undefined) {
      if (!input.name || input.name.trim().length === 0) {
        throw new Error('Name is required');
      }
      if (input.name.length > 50) {
        throw new Error('Name must not exceed 50 characters');
      }
      if (/^\d+$/.test(input.name.trim())) {
        throw new Error('Tag name cannot be purely numeric');
      }
    }

    // Check for duplicate tag name if changing the name
    if (input.name !== undefined && input.name !== existingTag.name) {
      const duplicateTag = this.getTagByName(input.name);
      if (duplicateTag) {
        throw new Error(`Tag with name "${input.name}" already exists`);
      }
    }

    return this.backend.tags.update(id, input);
  }

  /**
   * Delete tag
   * @param id - Tag ID
   * @returns True if deletion succeeded, false if tag not found
   */
  deleteTag(id: number): boolean {
    return this.backend.tags.delete(id);
  }
}
