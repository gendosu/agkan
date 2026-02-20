/**
 * Storage Provider Interface Definition
 *
 * This interface defines the abstraction layer for database storage,
 * allowing the application to support multiple storage backends
 * (SQLite, Notion, PostgreSQL, etc.) without changing the application code.
 *
 * ## Design Pattern: Adapter Pattern
 * This interface serves as the target interface that adapters must implement.
 * Each backend (SQLite, PostgreSQL, etc.) implements this interface to provide
 * a uniform API to the application layer.
 *
 * ## Implementation: SQLiteAdapter
 * The current implementation uses SQLiteAdapter which wraps better-sqlite3
 * and translates its API to match this interface.
 *
 * ## Usage
 * Application code should depend on StorageProvider, not on specific implementations:
 *
 * ```typescript
 * const db: StorageProvider = getDatabase();
 * const result = db.prepare('SELECT * FROM users WHERE id = ?').get(1);
 * ```
 *
 * ## Future Backends
 * To add a new backend:
 * 1. Create an adapter class implementing StorageProvider
 * 2. Update storage-factory.ts to conditionally create the new adapter
 * 3. Update DatabaseConnection to support backend configuration
 * 4. Create comprehensive tests similar to sqlite-adapter.test.ts
 */

/**
 * Result of executing a statement that modifies data (INSERT, UPDATE, DELETE)
 *
 * This interface mirrors the better-sqlite3 Info object and provides
 * information about how many rows were affected and what the last inserted ID is.
 *
 * @example
 * ```typescript
 * const result = db.prepare('INSERT INTO users (name) VALUES (?)').run('Alice');
 * console.log(result.changes); // 1
 * console.log(result.lastInsertRowid); // 1 (or higher if other rows exist)
 * ```
 */
export interface StorageRunResult {
  /** Number of rows affected by the operation */
  changes: number;
  /** ID of the last inserted row (for INSERT operations) */
  lastInsertRowid: number | bigint;
}

/**
 * Prepared statement interface
 *
 * Represents a compiled SQL statement that can be executed multiple times.
 * Supports parameter binding, single-row queries, bulk queries, and modifications.
 *
 * ## Parameter Types
 * Parameters can be:
 * - `string`: Text values
 * - `number`: Integer or floating-point values
 * - `null`: NULL values in the database
 *
 * ## Execution Methods
 * - `get()`: Returns a single row (SELECT queries, or NULL if no match)
 * - `all()`: Returns all matching rows (SELECT queries)
 * - `run()`: Executes modification statements (INSERT, UPDATE, DELETE)
 *
 * ## Method Chaining
 * The `bind()` method returns this for method chaining:
 *
 * ```typescript
 * const stmt = db.prepare('SELECT * FROM users WHERE id = ? AND status = ?');
 * const user = stmt.bind(1, 'active').get();
 * ```
 *
 * ## Parameter Binding
 * Parameters can be provided:
 * 1. Inline with get/all/run methods: `stmt.get(1, 'active')`
 * 2. Via bind() method: `stmt.bind(1, 'active').get()`
 * 3. Combined: `stmt.bind(1).get('active')`
 */
export interface StorageStatement {
  /**
   * Bind parameters to the statement
   *
   * Binds parameters that will be used in subsequent get/all/run calls.
   * Parameters are matched to ? placeholders in the SQL statement in order.
   *
   * @param params - Parameters to bind (string, number, or null)
   * @returns This statement for method chaining
   *
   * @example
   * ```typescript
   * const stmt = db.prepare('SELECT * FROM users WHERE id = ? AND status = ?');
   * const user = stmt.bind(1, 'active').get();
   * ```
   */
  bind(...params: (string | number | null)[]): StorageStatement;

  /**
   * Get a single row from the result set
   *
   * Can be called with parameters (which will bind them) or without
   * (if parameters were previously bound via bind()).
   *
   * Returns the first matching row, or undefined if no rows match.
   *
   * @param params - Optional parameters to bind
   * @returns The row as an object with column names as keys, or undefined if no row
   *
   * @example
   * ```typescript
   * // With inline parameters
   * const user = db.prepare('SELECT * FROM users WHERE id = ?').get(1);
   *
   * // With bind() method
   * const user = db.prepare('SELECT * FROM users WHERE id = ?')
   *   .bind(1)
   *   .get();
   *
   * // Check result
   * if (user) {
   *   console.log(user.name); // Access column 'name'
   * }
   * ```
   */
  get(...params: (string | number | null)[]): Record<string, unknown> | undefined;

  /**
   * Get all rows from the result set
   *
   * Can be called with parameters (which will bind them) or without
   * (if parameters were previously bound via bind()).
   *
   * Returns an array of all matching rows. Empty array if no rows match.
   *
   * @param params - Optional parameters to bind
   * @returns Array of rows, each row is an object with column names as keys
   *
   * @example
   * ```typescript
   * // Get all users
   * const users = db.prepare('SELECT * FROM users').all();
   *
   * // Get users with specific status
   * const activeUsers = db.prepare('SELECT * FROM users WHERE status = ?')
   *   .all('active');
   *
   * // Process results
   * users.forEach((user) => {
   *   console.log(user.name);
   * });
   * ```
   */
  all(...params: (string | number | null)[]): Record<string, unknown>[];

  /**
   * Execute a modification statement (INSERT, UPDATE, DELETE)
   *
   * Returns information about the operation including number of affected rows
   * and the last inserted row ID (for INSERT operations).
   *
   * @param params - Parameters for the statement
   * @returns Result with changes count and lastInsertRowid
   *
   * @example
   * ```typescript
   * // INSERT
   * const result = db.prepare('INSERT INTO users (name) VALUES (?)')
   *   .run('Alice');
   * console.log(result.lastInsertRowid); // ID of new row
   *
   * // UPDATE
   * const result = db.prepare('UPDATE users SET status = ? WHERE id = ?')
   *   .run('active', 1);
   * console.log(result.changes); // Number of rows updated
   *
   * // DELETE
   * const result = db.prepare('DELETE FROM users WHERE status = ?')
   *   .run('inactive');
   * console.log(result.changes); // Number of rows deleted
   * ```
   */
  run(...params: (string | number | null)[]): StorageRunResult;
}

/**
 * Storage provider interface
 *
 * Defines the API for interacting with a storage backend. This is the main
 * interface that application code should depend on. Each concrete implementation
 * (SQLiteAdapter, PostgresAdapter, etc.) provides a backend-specific implementation.
 *
 * ## Architecture
 * ```
 * Application Code
 *     ↓
 * StorageProvider (this interface)
 *     ↓
 * SQLiteAdapter (or other implementations)
 *     ↓
 * better-sqlite3 (or other database library)
 * ```
 *
 * ## Getting a Provider
 * Use the DatabaseConnection singleton:
 *
 * ```typescript
 * import { getDatabase } from 'src/db/connection';
 * const db: StorageProvider = getDatabase();
 * ```
 *
 * ## Operations
 * - **DDL**: Use exec() for schema operations
 * - **DML**: Use prepare() → get/all/run for data operations
 * - **Transactions**: Use transaction() to wrap operations
 * - **Configuration**: Use pragma() for database settings
 */
export interface StorageProvider {
  /**
   * Prepare a SQL statement for execution
   *
   * Prepares a SQL statement and returns a StorageStatement that can be
   * executed multiple times with different parameters.
   *
   * The statement is compiled once and can be executed many times,
   * which is more efficient than re-parsing the SQL each time.
   *
   * @param sql - SQL statement to prepare (may include ? placeholders for parameters)
   * @returns Prepared statement ready for execution
   * @throws If the SQL syntax is invalid
   *
   * @example
   * ```typescript
   * const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
   * const user1 = stmt.get(1);
   * const user2 = stmt.get(2); // Reuses the prepared statement
   * ```
   */
  prepare(sql: string): StorageStatement;

  /**
   * Execute SQL directly without returning a statement object
   *
   * Used for operations where you don't need parameter binding or repeated
   * execution. Common uses:
   * - Schema operations (CREATE TABLE, DROP TABLE, ALTER TABLE)
   * - Multiple SQL statements in one call
   * - One-time operations without parameter binding
   *
   * @param sql - SQL to execute (can be multiple statements separated by semicolons)
   * @throws If the SQL syntax is invalid or execution fails
   *
   * @example
   * ```typescript
   * // Create table
   * db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)');
   *
   * // Create multiple tables
   * db.exec(`
   *   CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
   *   CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER);
   * `);
   *
   * // Insert data (not recommended for repeated operations)
   * db.exec("INSERT INTO users (name) VALUES ('Alice')");
   * ```
   */
  exec(sql: string): void;

  /**
   * Execute a PRAGMA command
   *
   * PRAGMAs are SQLite-specific commands for configuration, introspection,
   * and optimization. They can return configuration values or information about
   * the database structure.
   *
   * @param pragma - PRAGMA command (e.g., "foreign_keys = ON", "journal_mode = WAL")
   * @returns Result of the pragma:
   *   - Record: For single-value pragmas (e.g., journal_mode)
   *   - Record[]: For pragmas that return multiple rows (e.g., table_info)
   *   - void: For pragmas that don't return values
   *
   * @example
   * ```typescript
   * // Configuration pragmas
   * db.pragma('foreign_keys = ON');        // Enable foreign key constraints
   * db.pragma('journal_mode = WAL');       // Use write-ahead logging
   * db.pragma('synchronous = NORMAL');     // Balance safety and performance
   *
   * // Query pragmas
   * const mode = db.pragma('journal_mode');
   * // Returns: [{ journal_mode: 'wal' }]
   *
   * const tableInfo = db.pragma('table_info(users)');
   * // Returns: [
   * //   { cid: 0, name: 'id', type: 'INTEGER', ... },
   * //   { cid: 1, name: 'name', type: 'TEXT', ... }
   * // ]
   * ```
   */
  pragma(pragma: string): Record<string, unknown> | Record<string, unknown>[] | void;

  /**
   * Create a database transaction
   *
   * Wraps a function in a database transaction. The function will be executed
   * within a BEGIN/COMMIT block. If any error occurs during execution, the
   * transaction is rolled back.
   *
   * This is useful for atomicity: either all operations succeed or none of them do.
   *
   * @param fn - Function to execute within the transaction
   * @returns A callable function that executes the transaction
   * @throws If an error occurs during transaction execution, the transaction is rolled back
   *
   * @example
   * ```typescript
   * // Create a transaction function
   * const transferMoney = db.transaction(() => {
   *   db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?')
   *     .run(100, 1); // Debit account 1
   *
   *   db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?')
   *     .run(100, 2); // Credit account 2
   *
   *   // If any error occurs, both operations are rolled back
   * });
   *
   * // Execute the transaction
   * try {
   *   transferMoney();
   *   console.log('Transfer successful');
   * } catch (error) {
   *   console.log('Transfer failed, changes rolled back');
   * }
   * ```
   */
  transaction(fn: () => void): () => void;

  /**
   * Close the storage connection
   *
   * Closes the underlying database connection and releases any resources.
   * After calling close(), the provider should not be used.
   *
   * This is typically called during application shutdown.
   *
   * @example
   * ```typescript
   * const db = getDatabase();
   * // ... use db ...
   * db.close(); // Clean up when done
   * ```
   */
  close(): void;
}
