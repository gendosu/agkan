import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { resolveDatabasePath } from './config';
import { runMigrations } from './schema';

/**
 * Singleton management of database connection
 */
export class DatabaseConnection {
  private static instance: Database.Database | null = null;

  /**
   * Get database instance (singleton)
   */
  public static getInstance(): Database.Database {
    if (!this.instance) {
      this.initialize();
    }
    return this.instance!;
  }

  /**
   * Initialize the database
   */
  private static initialize(): void {
    // Get database path from configuration file
    const dbPath = resolveDatabasePath();

    // Create data directory
    const dataDir = path.dirname(dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Create database connection
    this.instance = new Database(dbPath);

    // Enable foreign key constraints
    this.instance.pragma('foreign_keys = ON');

    // Run migrations
    runMigrations(this.instance);
  }

  /**
   * Close database connection
   */
  public static close(): void {
    if (this.instance) {
      this.instance.close();
      this.instance = null;
    }
  }
}

/**
 * Convenience function to get database instance
 */
export function getDatabase(): Database.Database {
  return DatabaseConnection.getInstance();
}
