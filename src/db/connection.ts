import { openSQLiteDatabase } from './open-sqlite-database';
import type { SQLiteDatabase } from './types/sqlite';
import path from 'path';
import fs from 'fs';
import { loadConfig, resolveDatabaseJournalMode, resolveDatabasePath } from './config';
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
  private static rawDatabase: SQLiteDatabase | null = null;

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
    const journalMode = resolveDatabaseJournalMode(loadConfig());
    // Get database path from configuration file
    const dbPath = resolveDatabasePath();

    // Create data directory
    const dataDir = path.dirname(dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Create database connection
    const database = openSQLiteDatabase(dbPath);
    try {
      try {
        const current = (database.pragma('journal_mode') as { journal_mode: string }[])[0]?.journal_mode;
        // Memory databases cannot use WAL. Already-WAL files must remain readable during a writer transaction.
        if (current !== 'memory') {
          if (current !== journalMode) {
            const actual = (database.pragma(`journal_mode = ${journalMode}`) as { journal_mode: string }[])[0]
              ?.journal_mode;
            if (actual !== journalMode) {
              throw new Error(`SQLite returned journal_mode=${String(actual)}`);
            }
          }
          if (journalMode === 'wal') database.pragma('synchronous = FULL');
        }
      } catch (cause) {
        throw new Error(
          `Could not set database journal_mode=${journalMode}: ${cause instanceof Error ? cause.message : String(cause)}. ` +
            'Stop all Board and CLI processes using this database, then retry. ' +
            'For a network filesystem, configure database.journalMode: delete before opening the database.',
          { cause }
        );
      }
      database.pragma('foreign_keys = ON');
      runMigrations(database);
      const provider = getStorageProvider(database);
      const backend = new SQLiteStorageBackend(database);
      this.rawDatabase = database;
      this.instance = provider;
      this.backendInstance = backend;
    } catch (error) {
      try {
        database.close();
      } catch {
        // Preserve the initialization failure even if closing the failed connection also fails.
      }
      throw error;
    }
  }

  /**
   * Get the SQLite driver instance used by this runtime
   */
  public static getRawDatabase(): SQLiteDatabase {
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
