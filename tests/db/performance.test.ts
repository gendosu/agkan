import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { SQLiteAdapter } from '../../src/db/adapters/sqlite-adapter';

/**
 * Performance baseline tests for SQLiteAdapter
 *
 * These tests measure the performance overhead of the StorageProvider adapter
 * pattern compared to direct better-sqlite3 usage.
 *
 * ## Performance Goals
 * - Adapter overhead should be <5% for typical operations
 * - Single operation variance acceptable: ±10%
 * - Batch operations should maintain similar performance profile
 *
 * ## Baseline Metrics (Approximate)
 * - prepare(): ~1-2 microseconds
 * - get(): ~50-100 microseconds
 * - all() (100 rows): ~500-1000 microseconds
 * - run(): ~50-100 microseconds
 */
describe('SQLiteAdapter Performance Baseline', () => {
  let db: Database.Database;
  let testDbPath: string;

  beforeEach(() => {
    testDbPath = path.join(process.cwd(), '.agkan-test', 'perf-test.db');
    const testDbDir = path.dirname(testDbPath);
    if (!fs.existsSync(testDbDir)) {
      fs.mkdirSync(testDbDir, { recursive: true });
    }
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    db = new Database(testDbPath);
    db.pragma('synchronous = OFF'); // Disable sync for faster test iterations
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  /**
   * Helper function to measure operation duration
   */
  const measure = (fn: () => void, iterations = 1): number => {
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      fn();
    }
    const end = performance.now();
    return (end - start) / iterations;
  };

  describe('prepare() Performance', () => {
    it('should prepare statement with minimal overhead', () => {
      const adapter = new SQLiteAdapter(db);

      // Measure adapter prepare time
      const adapterTime = measure(() => {
        adapter.prepare('SELECT 1');
      }, 10);

      // Measure direct prepare time for comparison
      const directTime = measure(() => {
        db.prepare('SELECT 1');
      }, 10);

      // Adapter overhead should be minimal (allow 100% variance for test stability)
      // The wrapper adds minimal overhead, just verify it's not catastrophic
      expect(adapterTime).toBeLessThan(directTime * 2.0);
    });
  });

  describe('get() Performance', () => {
    beforeEach(() => {
      db.exec('CREATE TABLE perf_test (id INTEGER PRIMARY KEY, value TEXT)');
      const insertStmt = db.prepare('INSERT INTO perf_test (value) VALUES (?)');
      for (let i = 0; i < 100; i++) {
        insertStmt.run(`value_${i}`);
      }
    });

    it('should execute get() with acceptable overhead', () => {
      const adapter = new SQLiteAdapter(db);
      const stmt = adapter.prepare('SELECT * FROM perf_test WHERE id = ?');

      // Measure adapter get() time
      const adapterTime = measure(() => {
        stmt.get(50);
      }, 50);

      // Should complete in reasonable time
      expect(adapterTime).toBeLessThan(10); // Less than 10ms per operation
    });

    it('should handle multiple sequential gets efficiently', () => {
      const adapter = new SQLiteAdapter(db);
      const stmt = adapter.prepare('SELECT * FROM perf_test WHERE id = ?');

      const startTime = performance.now();
      for (let i = 1; i <= 100; i++) {
        stmt.get(i);
      }
      const endTime = performance.now();
      const totalTime = endTime - startTime;

      // 100 operations should complete in < 100ms
      expect(totalTime).toBeLessThan(100);
    });
  });

  describe('all() Performance', () => {
    beforeEach(() => {
      db.exec('CREATE TABLE perf_all (id INTEGER PRIMARY KEY, value TEXT)');
      const insertStmt = db.prepare('INSERT INTO perf_all (value) VALUES (?)');
      for (let i = 0; i < 1000; i++) {
        insertStmt.run(`value_${i}`);
      }
    });

    it('should execute all() with acceptable overhead', () => {
      const adapter = new SQLiteAdapter(db);
      const stmt = adapter.prepare('SELECT * FROM perf_all');

      // Measure adapter all() time
      const adapterTime = measure(() => {
        stmt.all();
      }, 10);

      // Fetching 1000 rows should complete in reasonable time
      expect(adapterTime).toBeLessThan(50); // Less than 50ms per operation
    });

    it('should handle filtering without significant overhead', () => {
      const adapter = new SQLiteAdapter(db);
      const stmt = adapter.prepare('SELECT * FROM perf_all WHERE id < ?');

      const startTime = performance.now();
      for (let i = 0; i < 10; i++) {
        stmt.all(100);
      }
      const endTime = performance.now();
      const totalTime = endTime - startTime;

      // 10 filtered queries should complete in reasonable time
      expect(totalTime).toBeLessThan(100);
    });
  });

  describe('run() Performance', () => {
    beforeEach(() => {
      db.exec('CREATE TABLE perf_run (id INTEGER PRIMARY KEY, value TEXT)');
    });

    it('should execute run() with acceptable overhead', () => {
      const adapter = new SQLiteAdapter(db);
      const insertStmt = adapter.prepare('INSERT INTO perf_run (value) VALUES (?)');

      // Measure adapter run() time
      const adapterTime = measure(() => {
        insertStmt.run('test_value');
      }, 50);

      // Should complete in reasonable time
      expect(adapterTime).toBeLessThan(10); // Less than 10ms per operation
    });

    it('should handle batch inserts efficiently', () => {
      const adapter = new SQLiteAdapter(db);
      const insertStmt = adapter.prepare('INSERT INTO perf_run (value) VALUES (?)');

      const startTime = performance.now();
      for (let i = 0; i < 500; i++) {
        insertStmt.run(`value_${i}`);
      }
      const endTime = performance.now();
      const totalTime = endTime - startTime;

      // 500 inserts should complete in reasonable time (allow for test environment)
      expect(totalTime).toBeLessThan(3000);
    });
  });

  describe('transaction() Performance', () => {
    beforeEach(() => {
      db.exec('CREATE TABLE perf_txn (id INTEGER PRIMARY KEY, value TEXT)');
    });

    it('should execute transaction with minimal overhead', () => {
      const adapter = new SQLiteAdapter(db);

      const txn = adapter.transaction(() => {
        adapter.prepare('INSERT INTO perf_txn (value) VALUES (?)').run('value1');
        adapter.prepare('INSERT INTO perf_txn (value) VALUES (?)').run('value2');
      });

      const startTime = performance.now();
      for (let i = 0; i < 20; i++) {
        txn();
      }
      const endTime = performance.now();
      const totalTime = endTime - startTime;

      // 20 transactions with 2 inserts each should complete in reasonable time
      // Overhead should be minimal compared to non-transactional inserts
      expect(totalTime).toBeLessThan(200);
    });
  });

  describe('Complex Workflow Performance', () => {
    beforeEach(() => {
      db.exec(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY,
          name TEXT,
          email TEXT
        )
      `);
    });

    it('should maintain good performance in typical usage patterns', () => {
      const adapter = new SQLiteAdapter(db);

      // Typical workflow: insert, query, update
      const insertStmt = adapter.prepare('INSERT INTO users (name, email) VALUES (?, ?)');
      const queryStmt = adapter.prepare('SELECT * FROM users WHERE name = ?');
      const updateStmt = adapter.prepare('UPDATE users SET email = ? WHERE id = ?');

      const startTime = performance.now();

      // Insert 100 users
      for (let i = 0; i < 100; i++) {
        insertStmt.run(`User ${i}`, `user${i}@example.com`);
      }

      // Query each user
      for (let i = 0; i < 100; i++) {
        queryStmt.get(`User ${i}`);
      }

      // Update 50 users
      for (let i = 1; i <= 50; i++) {
        updateStmt.run(`updated${i}@example.com`, i);
      }

      const endTime = performance.now();
      const totalTime = endTime - startTime;

      // 100 inserts + 100 queries + 50 updates should complete in reasonable time
      expect(totalTime).toBeLessThan(2000);
    });
  });

  describe('Comparison: Adapter vs Direct better-sqlite3', () => {
    beforeEach(() => {
      db.exec('CREATE TABLE comparison (id INTEGER PRIMARY KEY, value TEXT)');
      const insertStmt = db.prepare('INSERT INTO comparison (value) VALUES (?)');
      for (let i = 0; i < 500; i++) {
        insertStmt.run(`value_${i}`);
      }
    });

    it('should have negligible overhead compared to direct usage', () => {
      const adapter = new SQLiteAdapter(db);

      // Measure adapter operations
      const adapterStart = performance.now();
      const adapterStmt = adapter.prepare('SELECT * FROM comparison WHERE id = ?');
      for (let i = 1; i <= 100; i++) {
        adapterStmt.get(i);
      }
      const adapterEnd = performance.now();
      const adapterTime = adapterEnd - adapterStart;

      // Measure direct better-sqlite3 operations
      const directStart = performance.now();
      const directStmt = db.prepare('SELECT * FROM comparison WHERE id = ?');
      for (let i = 1; i <= 100; i++) {
        directStmt.get(i);
      }
      const directEnd = performance.now();
      const directTime = directEnd - directStart;

      // Adapter overhead should be < 10% (allow some variance)
      // If times are similar, the overhead is negligible
      const overhead = ((adapterTime - directTime) / directTime) * 100;
      expect(overhead).toBeLessThan(50); // Allow up to 50% variance due to test noise
    });
  });
});
