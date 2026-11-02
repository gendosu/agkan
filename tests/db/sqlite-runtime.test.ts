import { describe, it } from 'vitest';
import { openSQLiteDatabase } from '../../src/db/open-sqlite-database';
import { sqliteContractCases } from './sqlite-contract';
import { verifySQLiteContention } from './sqlite-contention';

describe('SQLite runtime compatibility', () => {
  it('waits for independent process locks during migration and run-log writes', verifySQLiteContention);
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
