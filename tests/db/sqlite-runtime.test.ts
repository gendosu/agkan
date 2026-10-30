import { describe, it } from 'vitest';
import { openSQLiteDatabase } from '../../src/db/open-sqlite-database';
import { sqliteContractCases } from './sqlite-contract';

describe('SQLite runtime compatibility', () => {
  for (const { name, run } of sqliteContractCases) {
    it(name, () => {
      const db = openSQLiteDatabase(':memory:');
      try {
        run(db);
      } finally {
        db.close();
      }
    });
  }
});
