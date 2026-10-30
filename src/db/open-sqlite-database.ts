import { createRequire } from 'node:module';
import type { SQLiteBinding, SQLiteDatabase, SQLiteStatement } from './types/sqlite';

const loadDriver = createRequire(__filename);

interface BunStatement extends Pick<SQLiteStatement, 'get' | 'all' | 'run'> {
  readonly paramsCount: number;
  finalize(): void;
}

interface BunDatabase extends Pick<SQLiteDatabase, 'exec' | 'transaction' | 'close'> {
  prepare(sql: string): BunStatement;
}

class BunSQLiteStatement implements SQLiteStatement {
  private boundParams: SQLiteBinding[] | undefined;

  constructor(private statement: BunStatement) {}

  bind(...params: SQLiteBinding[]): SQLiteStatement {
    if (this.boundParams !== undefined) {
      throw new TypeError('The bind() method can only be invoked once per statement object');
    }
    this.checkCount(params);
    this.boundParams = params;
    return this;
  }

  get(...params: SQLiteBinding[]): unknown {
    // better-sqlite3 returns undefined for a missing row; Bun returns null.
    return this.statement.get(...this.parameters(params)) ?? undefined;
  }

  all(...params: SQLiteBinding[]): unknown[] {
    return this.statement.all(...this.parameters(params));
  }

  run(...params: SQLiteBinding[]) {
    return this.statement.run(...this.parameters(params));
  }

  private parameters(params: SQLiteBinding[]): SQLiteBinding[] {
    if (this.boundParams !== undefined) {
      if (params.length > 0) throw new TypeError('This statement already has bound parameters');
      return this.boundParams;
    }
    this.checkCount(params);
    return params;
  }

  private checkCount(params: SQLiteBinding[]): void {
    // Bun can reuse previous bindings when no arguments are supplied.
    if (params.length !== this.statement.paramsCount) {
      throw new RangeError(`Expected ${this.statement.paramsCount} parameter values, received ${params.length}`);
    }
  }
}

class BunSQLiteDatabase implements SQLiteDatabase {
  private db: BunDatabase;

  constructor(filename: string) {
    const { Database } = loadDriver('bun:sqlite') as {
      Database: new (filename: string, options: { strict: boolean }) => BunDatabase;
    };
    this.db = new Database(filename, { strict: true });
  }

  prepare(sql: string): SQLiteStatement {
    return new BunSQLiteStatement(this.db.prepare(sql));
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  pragma(source: string): unknown[] {
    const statement = this.db.prepare(`PRAGMA ${source}`);
    try {
      return statement.all();
    } finally {
      statement.finalize();
    }
  }

  transaction<T>(fn: () => T): () => T {
    return this.db.transaction(fn);
  }

  close(): void {
    this.db.close();
  }
}

export function openSQLiteDatabase(filename: string): SQLiteDatabase {
  if (process.versions.bun) return new BunSQLiteDatabase(filename);

  // Loading the native Node driver under Bun crashes before it can be caught.
  const Database = loadDriver('better-sqlite3') as typeof import('better-sqlite3');
  const db = new Database(filename);
  return {
    prepare: (sql) => db.prepare<SQLiteBinding[]>(sql),
    exec: (sql) => {
      db.exec(sql);
    },
    pragma: (source) => db.pragma(source),
    transaction: (fn) => db.transaction(fn),
    close: () => {
      db.close();
    },
  };
}
