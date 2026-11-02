const Database = require('better-sqlite3');
const db = new Database(process.argv[2]);
db.exec('BEGIN IMMEDIATE');
process.stdout.write('locked\n');
setTimeout(() => {
  db.exec('ROLLBACK');
  db.close();
}, Number(process.argv[3]));
