const Database = require('better-sqlite3');
const db = new Database(process.argv[2]);
const exclusive = process.argv[4] === 'exclusive';
db.exec(exclusive ? 'BEGIN EXCLUSIVE' : 'BEGIN IMMEDIATE');
if (exclusive) db.prepare('UPDATE tasks SET title = ? WHERE id = ?').run('WAL after lock', Number(process.argv[5]));
process.stdout.write('locked\n');
setTimeout(() => {
  db.exec(exclusive ? 'COMMIT' : 'ROLLBACK');
  db.close();
}, Number(process.argv[3]));
