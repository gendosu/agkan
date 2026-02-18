import { Tag, CreateTagInput, UpdateTagInput } from '../models';
import { getDatabase } from '../db/connection';
import { validateTagInput } from '../utils/input-validators';
import Database from 'better-sqlite3';

/**
 * Tag Service
 * Manages creation, retrieval, update, and deletion of tags
 */
export class TagService {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db || getDatabase();
  }
  /**
   * Create a new tag
   * @param input - Tag creation input
   * @returns Newly created tag
   * @throws Error if tag name already exists
   */
  createTag(input: CreateTagInput): Tag {
    const db = this.db;

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

    const stmt = db.prepare(`
      INSERT INTO tags (name, created_at)
      VALUES (?, ?)
    `);

    const result = stmt.run(input.name, now);

    const getStmt = db.prepare('SELECT * FROM tags WHERE id = ?');
    return getStmt.get(result.lastInsertRowid as number) as Tag;
  }

  /**
   * Get tag by ID
   * @param id - Tag ID
   * @returns Tag object or null if not found
   */
  getTag(id: number): Tag | null {
    const db = this.db;

    const stmt = db.prepare('SELECT * FROM tags WHERE id = ?');
    const result = stmt.get(id);

    return result ? (result as Tag) : null;
  }

  /**
   * Get tag by name
   * @param name - Tag name
   * @returns Tag object or null if not found
   */
  getTagByName(name: string): Tag | null {
    const db = this.db;

    const stmt = db.prepare('SELECT * FROM tags WHERE name = ?');
    const result = stmt.get(name);

    return result ? (result as Tag) : null;
  }

  /**
   * List all tags
   * @returns Array of tags sorted by creation date in descending order
   */
  listTags(): Tag[] {
    const db = this.db;

    const stmt = db.prepare('SELECT * FROM tags ORDER BY created_at DESC');
    const results = stmt.all();

    return results as Tag[];
  }

  /**
   * Update tag
   * @param id - Tag ID
   * @param input - Tag update input
   * @returns Updated tag object or null if not found
   * @throws Error if tag name already exists
   */
  updateTag(id: number, input: UpdateTagInput): Tag | null {
    const db = this.db;

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

    const stmt = db.prepare(`
      UPDATE tags
      SET name = COALESCE(?, name)
      WHERE id = ?
    `);

    stmt.run(input.name, id);

    return this.getTag(id);
  }

  /**
   * Delete tag
   * @param id - Tag ID
   * @returns True if deletion succeeded, false if tag not found
   */
  deleteTag(id: number): boolean {
    const db = this.db;

    const stmt = db.prepare('DELETE FROM tags WHERE id = ?');
    const result = stmt.run(id);

    return result.changes > 0;
  }
}
