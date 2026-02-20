/**
 * Storage Provider Interface Definition
 *
 * This interface defines the abstraction layer for database storage,
 * allowing the application to support multiple storage backends
 * (SQLite, Notion, etc.) without changing the application code.
 */

/**
 * Result of executing a statement that modifies data (INSERT, UPDATE, DELETE)
 * This interface mirrors the better-sqlite3 Info object
 */
export interface StorageRunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

/**
 * Prepared statement interface
 * Represents a compiled SQL statement that can be executed multiple times
 */
export interface StorageStatement {
  /**
   * Bind parameters to the statement
   * @param params - Parameters to bind
   * @returns This statement for method chaining
   */
  bind(...params: (string | number | null)[]): StorageStatement;

  /**
   * Get a single row
   * Can be called with parameters (which will bind them) or without
   * (to get the next row after bind() was called)
   * @param params - Optional parameters to bind
   * @returns The row as an object, or undefined if no row
   */
  get(...params: (string | number | null)[]): Record<string, unknown> | undefined;

  /**
   * Get all rows
   * Can be called with parameters (which will bind them) or without
   * (to get all remaining rows after bind() was called)
   * @param params - Optional parameters to bind
   * @returns Array of all rows
   */
  all(...params: (string | number | null)[]): Record<string, unknown>[];

  /**
   * Execute the statement (for INSERT, UPDATE, DELETE)
   * @param params - Parameters for the statement
   * @returns Result with changes and lastInsertRowid
   */
  run(...params: (string | number | null)[]): StorageRunResult;
}

/**
 * Storage provider interface
 * Defines the API for interacting with a storage backend
 */
export interface StorageProvider {
  /**
   * Prepare a SQL statement
   * @param sql - SQL statement to prepare
   * @returns Prepared statement
   */
  prepare(sql: string): StorageStatement;

  /**
   * Execute SQL directly (for schema operations, pragmas, etc.)
   * @param sql - SQL to execute
   */
  exec(sql: string): void;

  /**
   * Execute a PRAGMA command
   * @param pragma - PRAGMA command (e.g., "foreign_keys = ON")
   * @returns Result of the pragma, or array of results for query pragmas
   */
  pragma(pragma: string): Record<string, unknown> | Record<string, unknown>[] | void;

  /**
   * Create a transaction
   * @param fn - Function to execute within the transaction
   * @returns Function to execute the transaction
   */
  transaction(fn: () => void): () => void;

  /**
   * Close the storage connection
   */
  close(): void;
}
