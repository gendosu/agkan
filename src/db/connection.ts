import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { resolveDatabasePath } from './config';
import { runMigrations } from './schema';
import { StorageProvider } from './types/storage';
import { getStorageProvider } from './storage-factory';

/**
 * Singleton management of database connection
 */
export class DatabaseConnection {
  private static instance: StorageProvider | null = null;
  private static rawDatabase: Database.Database | null = null;

  /**
   * Get database instance (singleton)
   * @returns StorageProvider instance
   */
  public static getInstance(): StorageProvider {
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
    this.rawDatabase = new Database(dbPath);

    // Enable foreign key constraints
    this.rawDatabase.pragma('foreign_keys = ON');

    // Run migrations
    runMigrations(this.rawDatabase);

    // Wrap with storage provider
    this.instance = getStorageProvider(this.rawDatabase);
  }

  /**
   * Close database connection
   */
  public static close(): void {
    if (this.instance) {
      this.instance.close();
      this.instance = null;
    }
    if (this.rawDatabase) {
      this.rawDatabase.close();
      this.rawDatabase = null;
    }
  }
}

/**
 * Convenience function to get database instance
 * @returns StorageProvider instance
 */
export function getDatabase(): StorageProvider {
  return DatabaseConnection.getInstance();
}
