import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { resolveDatabasePath } from './config';
import { runMigrations } from './schema';
import { StorageProvider } from './types/storage';
import { StorageBackend } from './types/repository';
import { getStorageProvider } from './storage-factory';
import { SQLiteStorageBackend } from './adapters/sqlite-storage-backend';

/**
 * Singleton management of database connection
 */
export class DatabaseConnection {
  private static instance: StorageProvider | null = null;
  private static backendInstance: StorageBackend | null = null;
  private static rawDatabase: Database.Database | null = null;

  /**
   * Get database instance (singleton)
   * @returns StorageProvider instance
   * @deprecated Use getStorageBackend() instead
   */
  public static getInstance(): StorageProvider {
    if (!this.instance) {
      this.initialize();
    }
    return this.instance!;
  }

  /**
   * Get StorageBackend instance (singleton)
   * @returns StorageBackend instance
   */
  public static getBackendInstance(): StorageBackend {
    if (!this.backendInstance) {
      this.initialize();
    }
    return this.backendInstance!;
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

    // Wrap with storage provider (legacy)
    this.instance = getStorageProvider(this.rawDatabase);

    // Create StorageBackend
    this.backendInstance = new SQLiteStorageBackend(this.rawDatabase);
  }

  /**
   * Get the raw better-sqlite3 Database instance
   */
  public static getRawDatabase(): Database.Database {
    if (!this.rawDatabase) {
      this.initialize();
    }
    return this.rawDatabase!;
  }

  /**
   * Close database connection
   */
  public static close(): void {
    if (this.instance) {
      this.instance = null;
    }
    if (this.backendInstance) {
      this.backendInstance = null;
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
 * @deprecated Use getStorageBackend() instead
 */
export function getDatabase(): StorageProvider {
  return DatabaseConnection.getInstance();
}

/**
 * Convenience function to get StorageBackend instance
 * @returns StorageBackend instance
 */
export function getStorageBackend(): StorageBackend {
  return DatabaseConnection.getBackendInstance();
}
