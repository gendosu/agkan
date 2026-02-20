import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { SQLiteAdapter } from '../../src/db/adapters/sqlite-adapter';
import { StorageProvider } from '../../src/db/types/storage';

describe('SQLiteAdapter', () => {
  let db: Database.Database;
  let adapter: StorageProvider;
  const testDbPath = path.join(process.cwd(), '.agkan-test', 'sqlite-adapter-test.db');

  beforeEach(() => {
    // Create test database directory if it doesn't exist
    const testDbDir = path.dirname(testDbPath);
    if (!fs.existsSync(testDbDir)) {
      fs.mkdirSync(testDbDir, { recursive: true });
    }

    // Delete test database if it exists
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Create new database and adapter
    db = new Database(testDbPath);
    adapter = new SQLiteAdapter(db);
  });

  afterEach(() => {
    // Close adapter and database
    adapter.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('SQLiteAdapter Initialization', () => {
    it('should create adapter from better-sqlite3 database', () => {
      expect(adapter).toBeDefined();
      expect(adapter).toBeInstanceOf(SQLiteAdapter);
    });

    it('should have all required methods exposed', () => {
      expect(typeof adapter.prepare).toBe('function');
      expect(typeof adapter.exec).toBe('function');
      expect(typeof adapter.pragma).toBe('function');
      expect(typeof adapter.transaction).toBe('function');
      expect(typeof adapter.close).toBe('function');
    });
  });

  describe('prepare() Method Tests', () => {
    it('should prepare a valid SQL statement', () => {
      const stmt = adapter.prepare('SELECT 1');
      expect(stmt).toBeDefined();
      expect(stmt).toHaveProperty('get');
      expect(stmt).toHaveProperty('all');
      expect(stmt).toHaveProperty('run');
      expect(stmt).toHaveProperty('bind');
    });

    it('should return StorageStatement interface', () => {
      const stmt = adapter.prepare('SELECT 1 as value');
      expect(typeof stmt.get).toBe('function');
      expect(typeof stmt.all).toBe('function');
      expect(typeof stmt.run).toBe('function');
      expect(typeof stmt.bind).toBe('function');
    });

    it('should prepare multiple statements independently', () => {
      const stmt1 = adapter.prepare('SELECT 1');
      const stmt2 = adapter.prepare('SELECT 2');
      expect(stmt1).not.toBe(stmt2);
    });

    it('should throw on invalid SQL syntax', () => {
      expect(() => {
        adapter.prepare('INVALID SQL STATEMENT');
      }).toThrow();
    });
  });

  describe('exec() Method Tests', () => {
    it('should execute simple SQL without parameters', () => {
      expect(() => {
        adapter.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');
      }).not.toThrow();

      // Verify table was created
      const result = adapter.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='test'").get();
      expect(result).toBeDefined();
      expect((result as Record<string, unknown>).name).toBe('test');
    });

    it('should throw on invalid SQL', () => {
      expect(() => {
        adapter.exec('INVALID SQL');
      }).toThrow();
    });

    it('should execute CREATE TABLE statement', () => {
      const sql = 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT)';
      expect(() => {
        adapter.exec(sql);
      }).not.toThrow();

      const tables = adapter.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
      expect(tables.length).toBeGreaterThan(0);
      expect(tables.some((t) => (t as Record<string, unknown>).name === 'users')).toBe(true);
    });

    it('should execute INSERT statement via exec', () => {
      adapter.exec('CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)');
      expect(() => {
        adapter.exec("INSERT INTO items (name) VALUES ('item1')");
      }).not.toThrow();

      const item = adapter.prepare('SELECT * FROM items').get();
      expect(item).toBeDefined();
      expect((item as Record<string, unknown>).name).toBe('item1');
    });

    it('should execute multiple statements in sequence', () => {
      expect(() => {
        adapter.exec('CREATE TABLE tbl1 (id INTEGER)');
        adapter.exec('CREATE TABLE tbl2 (id INTEGER)');
        adapter.exec('CREATE TABLE tbl3 (id INTEGER)');
      }).not.toThrow();

      const tables = adapter.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
      expect(tables.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('pragma() Method Tests', () => {
    it('should execute PRAGMA commands', () => {
      const result = adapter.pragma('journal_mode');
      expect(result).toBeDefined();
    });

    it('should return PRAGMA query results', () => {
      const result = adapter.pragma('journal_mode');
      expect(Array.isArray(result)).toBe(true);
      expect((result as Record<string, unknown>[])[0]).toHaveProperty('journal_mode');
    });

    it('should handle PRAGMA foreign_keys', () => {
      adapter.pragma('foreign_keys = ON');
      const result = adapter.pragma('foreign_keys');
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should support multiple consecutive PRAGMA calls', () => {
      expect(() => {
        adapter.pragma('synchronous = NORMAL');
        adapter.pragma('cache_size = 10000');
        adapter.pragma('journal_mode = WAL');
      }).not.toThrow();
    });

    it('should execute PRAGMA table_info', () => {
      adapter.exec('CREATE TABLE test_table (id INTEGER PRIMARY KEY, name TEXT, value REAL)');
      const result = adapter.pragma('table_info(test_table)');
      expect(Array.isArray(result)).toBe(true);
      expect((result as Record<string, unknown>[]).length).toBe(3);
    });
  });

  describe('Transaction Tests', () => {
    beforeEach(() => {
      // Create test table
      adapter.exec('CREATE TABLE counter (id INTEGER PRIMARY KEY, count INTEGER)');
      adapter.prepare('INSERT INTO counter (count) VALUES (0)').run();
    });

    it('should return a callable function from transaction()', () => {
      const txn = adapter.transaction(() => {
        // Empty transaction for testing
      });
      expect(typeof txn).toBe('function');
    });

    it('should execute transactions successfully and commit', () => {
      const txn = adapter.transaction(() => {
        adapter.prepare('UPDATE counter SET count = count + 1').run();
        adapter.prepare('UPDATE counter SET count = count + 1').run();
      });

      txn();

      const result = adapter.prepare('SELECT count FROM counter').get() as Record<string, unknown>;
      expect(result.count).toBe(2);
    });

    it('should rollback transaction on error', () => {
      const txn = adapter.transaction(() => {
        adapter.prepare('UPDATE counter SET count = 100').run();
        throw new Error('Intentional error');
      });

      expect(() => {
        txn();
      }).toThrow();

      const result = adapter.prepare('SELECT count FROM counter').get() as Record<string, unknown>;
      expect(result.count).toBe(0); // Should be rolled back
    });

    it('should support multiple transactions in sequence', () => {
      const txn1 = adapter.transaction(() => {
        adapter.prepare('UPDATE counter SET count = count + 1').run();
      });

      const txn2 = adapter.transaction(() => {
        adapter.prepare('UPDATE counter SET count = count + 10').run();
      });

      txn1();
      txn2();

      const result = adapter.prepare('SELECT count FROM counter').get() as Record<string, unknown>;
      expect(result.count).toBe(11);
    });

    it('should handle nested transaction calls', () => {
      const innerTxn = adapter.transaction(() => {
        adapter.prepare('UPDATE counter SET count = count + 5').run();
      });

      const outerTxn = adapter.transaction(() => {
        adapter.prepare('UPDATE counter SET count = count + 1').run();
        innerTxn();
      });

      outerTxn();

      const result = adapter.prepare('SELECT count FROM counter').get() as Record<string, unknown>;
      expect(result.count).toBe(6);
    });
  });

  describe('StorageStatement Tests (from prepared statements)', () => {
    beforeEach(() => {
      adapter.exec(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY,
          name TEXT,
          age INTEGER,
          email TEXT
        )
      `);
    });

    it('should run() executes and returns StorageRunResult with changes', () => {
      const stmt = adapter.prepare('INSERT INTO users (name, age, email) VALUES (?, ?, ?)');
      const result = stmt.run('Alice', 30, 'alice@example.com');

      expect(result).toHaveProperty('changes');
      expect(result).toHaveProperty('lastInsertRowid');
      expect(result.changes).toBe(1);
    });

    it('should return lastInsertRowid from run()', () => {
      const stmt = adapter.prepare('INSERT INTO users (name, age, email) VALUES (?, ?, ?)');
      const result = stmt.run('Bob', 25, 'bob@example.com');

      expect(result.lastInsertRowid).toBe(1);
    });

    it('should get() return single row or undefined', () => {
      adapter
        .prepare('INSERT INTO users (name, age, email) VALUES (?, ?, ?)')
        .run('Charlie', 35, 'charlie@example.com');

      const result = adapter.prepare('SELECT * FROM users WHERE name = ?').get('Charlie');
      expect(result).toBeDefined();
      expect((result as Record<string, unknown>).name).toBe('Charlie');
    });

    it('should get() return undefined when no rows match', () => {
      const result = adapter.prepare('SELECT * FROM users WHERE name = ?').get('NonExistent');
      expect(result).toBeUndefined();
    });

    it('should all() return array of rows', () => {
      adapter.prepare('INSERT INTO users (name, age, email) VALUES (?, ?, ?)').run('Diana', 28, 'diana@example.com');
      adapter.prepare('INSERT INTO users (name, age, email) VALUES (?, ?, ?)').run('Eve', 32, 'eve@example.com');

      const results = adapter.prepare('SELECT * FROM users').all();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(2);
    });

    it('should all() return empty array when no rows match', () => {
      const results = adapter.prepare('SELECT * FROM users WHERE name = ?').all('NonExistent');
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });

    it('should bind() with various parameter types', () => {
      const stmt = adapter.prepare('INSERT INTO users (name, age, email) VALUES (?, ?, ?)');

      // Test with string
      expect(() => {
        stmt.run('Frank', 40, 'frank@example.com');
      }).not.toThrow();

      // Test with number
      expect(() => {
        const stmt2 = adapter.prepare('INSERT INTO users (name, age, email) VALUES (?, ?, ?)');
        stmt2.run('Grace', 22, 'grace@example.com');
      }).not.toThrow();

      // Test with null
      expect(() => {
        const stmt3 = adapter.prepare('INSERT INTO users (name, age, email) VALUES (?, ?, ?)');
        stmt3.run('Henry', null, 'henry@example.com');
      }).not.toThrow();
    });

    it('should bind() with multiple parameters', () => {
      const stmt = adapter.prepare('INSERT INTO users (name, age, email) VALUES (?, ?, ?)');
      const result = stmt.run('Ivy', 27, 'ivy@example.com');
      expect(result.changes).toBe(1);

      const inserted = adapter.prepare('SELECT * FROM users WHERE name = ?').get('Ivy');
      expect((inserted as Record<string, unknown>).age).toBe(27);
    });

    it('should support bind() method chaining', () => {
      const stmt = adapter.prepare('SELECT * FROM users WHERE name = ? AND age = ?');
      adapter.prepare('INSERT INTO users (name, age, email) VALUES (?, ?, ?)').run('Jack', 29, 'jack@example.com');

      const result = stmt.bind('Jack', 29).get();
      expect(result).toBeDefined();
      expect((result as Record<string, unknown>).name).toBe('Jack');
    });

    it('should get() with inline parameters', () => {
      adapter.prepare('INSERT INTO users (name, age, email) VALUES (?, ?, ?)').run('Karen', 31, 'karen@example.com');

      const result = adapter.prepare('SELECT * FROM users WHERE name = ?').get('Karen');
      expect(result).toBeDefined();
      expect((result as Record<string, unknown>).name).toBe('Karen');
    });

    it('should all() with inline parameters', () => {
      adapter.prepare('INSERT INTO users (name, age, email) VALUES (?, ?, ?)').run('Leo', 26, 'leo@example.com');
      adapter.prepare('INSERT INTO users (name, age, email) VALUES (?, ?, ?)').run('Mia', 26, 'mia@example.com');

      const results = adapter.prepare('SELECT * FROM users WHERE age = ?').all(26);
      expect(results.length).toBe(2);
    });

    it('should run() with multiple parameter sets in sequence', () => {
      const stmt = adapter.prepare('INSERT INTO users (name, age, email) VALUES (?, ?, ?)');

      stmt.run('Oscar', 23, 'oscar@example.com');
      stmt.run('Paula', 24, 'paula@example.com');
      stmt.run('Quinn', 25, 'quinn@example.com');

      const all = adapter.prepare('SELECT * FROM users').all();
      expect(all.length).toBe(3);
    });

    it('should return correct data types from get()', () => {
      adapter.prepare('INSERT INTO users (name, age, email) VALUES (?, ?, ?)').run('Rachel', 33, 'rachel@example.com');

      const result = adapter.prepare('SELECT * FROM users WHERE name = ?').get('Rachel') as Record<string, unknown>;
      expect(typeof result.name).toBe('string');
      expect(typeof result.age).toBe('number');
      expect(typeof result.email).toBe('string');
    });
  });

  describe('Error Handling Tests', () => {
    it('should throw on invalid SQL syntax in prepare()', () => {
      expect(() => {
        adapter.prepare('INVALID SQL');
      }).toThrow();
    });

    it('should throw on invalid SQL syntax in exec()', () => {
      expect(() => {
        adapter.exec('INVALID SQL STATEMENT');
      }).toThrow();
    });

    it('should throw error in transactions on constraint violation', () => {
      adapter.exec('CREATE TABLE unique_test (id INTEGER PRIMARY KEY, email TEXT UNIQUE)');
      adapter.prepare('INSERT INTO unique_test (email) VALUES (?)').run('test@example.com');

      const txn = adapter.transaction(() => {
        adapter.prepare('INSERT INTO unique_test (email) VALUES (?)').run('test@example.com');
      });

      expect(() => {
        txn();
      }).toThrow();
    });

    it('should handle database close() properly', () => {
      adapter.close();
      // Attempting to use adapter after close should throw
      expect(() => {
        adapter.prepare('SELECT 1').get();
      }).toThrow();
    });

    it('should not throw on trying to insert NULL into nullable column', () => {
      adapter.exec('CREATE TABLE nullable_test (id INTEGER, value TEXT)');
      const stmt = adapter.prepare('INSERT INTO nullable_test (id, value) VALUES (?, ?)');

      expect(() => {
        stmt.run(1, null);
      }).not.toThrow();
    });

    it('should throw on attempting to insert into non-existent table', () => {
      expect(() => {
        adapter.prepare('INSERT INTO nonexistent (id) VALUES (?)').run(1);
      }).toThrow();
    });
  });

  describe('Integration Tests', () => {
    it('should execute full workflow: prepare → bind → get', () => {
      adapter.exec('CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT, price REAL)');

      // Insert
      adapter.prepare('INSERT INTO products (name, price) VALUES (?, ?)').run('Laptop', 999.99);

      // Retrieve
      const result = adapter.prepare('SELECT * FROM products WHERE name = ?').get('Laptop');

      expect(result).toBeDefined();
      expect((result as Record<string, unknown>).name).toBe('Laptop');
      expect((result as Record<string, unknown>).price).toBe(999.99);
    });

    it('should execute multiple statements in sequence', () => {
      adapter.exec('CREATE TABLE orders (id INTEGER PRIMARY KEY, product TEXT, qty INTEGER)');

      const stmt = adapter.prepare('INSERT INTO orders (product, qty) VALUES (?, ?)');
      stmt.run('Widget', 5);
      stmt.run('Gadget', 3);
      stmt.run('Doohickey', 7);

      const all = adapter.prepare('SELECT * FROM orders').all();
      expect(all.length).toBe(3);
      expect((all[0] as Record<string, unknown>).qty).toBe(5);
      expect((all[1] as Record<string, unknown>).qty).toBe(3);
      expect((all[2] as Record<string, unknown>).qty).toBe(7);
    });

    it('should handle complex query with WHERE clause and parameters', () => {
      adapter.exec('CREATE TABLE sales (id INTEGER PRIMARY KEY, item TEXT, amount REAL, region TEXT)');

      adapter.prepare('INSERT INTO sales (item, amount, region) VALUES (?, ?, ?)').run('Item A', 100, 'North');
      adapter.prepare('INSERT INTO sales (item, amount, region) VALUES (?, ?, ?)').run('Item B', 200, 'South');
      adapter.prepare('INSERT INTO sales (item, amount, region) VALUES (?, ?, ?)').run('Item A', 150, 'South');

      const results = adapter.prepare('SELECT * FROM sales WHERE region = ? AND item = ?').all('South', 'Item A');

      expect(results.length).toBe(1);
      expect((results[0] as Record<string, unknown>).amount).toBe(150);
    });

    it('should work with UPDATE and DELETE statements', () => {
      adapter.exec('CREATE TABLE records (id INTEGER PRIMARY KEY, status TEXT, count INTEGER)');

      adapter.prepare('INSERT INTO records (status, count) VALUES (?, ?)').run('active', 1);
      adapter.prepare('INSERT INTO records (status, count) VALUES (?, ?)').run('inactive', 0);

      // Update
      const updateResult = adapter.prepare('UPDATE records SET count = ? WHERE status = ?').run(5, 'active');
      expect(updateResult.changes).toBe(1);

      // Verify update
      const updated = adapter.prepare('SELECT * FROM records WHERE status = ?').get('active');
      expect((updated as Record<string, unknown>).count).toBe(5);

      // Delete
      const deleteResult = adapter.prepare('DELETE FROM records WHERE status = ?').run('inactive');
      expect(deleteResult.changes).toBe(1);

      // Verify delete
      const deleted = adapter.prepare('SELECT * FROM records WHERE status = ?').get('inactive');
      expect(deleted).toBeUndefined();
    });

    it('should support aggregate functions', () => {
      adapter.exec('CREATE TABLE data_values (id INTEGER PRIMARY KEY, value INTEGER)');

      adapter.prepare('INSERT INTO data_values (value) VALUES (?)').run(10);
      adapter.prepare('INSERT INTO data_values (value) VALUES (?)').run(20);
      adapter.prepare('INSERT INTO data_values (value) VALUES (?)').run(30);

      const result = adapter.prepare('SELECT SUM(value) as total, AVG(value) as average FROM data_values').get();
      expect((result as Record<string, unknown>).total).toBe(60);
      expect((result as Record<string, unknown>).average).toBe(20);
    });

    it('should handle statement parameter types correctly', () => {
      adapter.exec('CREATE TABLE params (id INTEGER PRIMARY KEY, text TEXT, num INTEGER, real REAL, blob BLOB)');

      const stmt = adapter.prepare('INSERT INTO params (text, num, real) VALUES (?, ?, ?)');
      stmt.run('test', 42, 3.14);

      const result = adapter.prepare('SELECT * FROM params').get() as Record<string, unknown>;
      expect(result.text).toBe('test');
      expect(result.num).toBe(42);
      expect(result.real).toBe(3.14);
    });
  });
});
