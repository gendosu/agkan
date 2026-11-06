import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { DatabaseConnection, getStorageBackend } from '../../src/db/connection';
import { openSQLiteDatabase } from '../../src/db/open-sqlite-database';
import { runMigrations } from '../../src/db/schema';
import { SQLiteStorageBackend } from '../../src/db/adapters/sqlite-storage-backend';
import { TaskService } from '../../src/services/TaskService';
import { TaskTagService } from '../../src/services/TaskTagService';
import { TagService } from '../../src/services/TagService';
import { MetadataService } from '../../src/services/MetadataService';
import { CommentService } from '../../src/services/CommentService';
import { TaskBlockService } from '../../src/services/TaskBlockService';
import { registerBoardRoutes } from '../../src/board/boardRoutes';

if (process.argv[2] === 'migrate') {
  const old = openSQLiteDatabase(process.env.AGENT_KANBAN_DB_PATH!);
  runMigrations(old);
  new TaskService(new SQLiteStorageBackend(old)).createTask({ title: 'WAL before lock', status: 'ready' });
  if ((old.pragma('journal_mode')[0] as { journal_mode: string }).journal_mode !== 'delete') {
    throw new Error('Legacy fixture must start in DELETE mode');
  }
  old.close();
}
const backend = getStorageBackend();
assert.deepEqual(DatabaseConnection.getRawDatabase().pragma('journal_mode'), [{ journal_mode: 'wal' }]);
assert.deepEqual(DatabaseConnection.getRawDatabase().pragma('synchronous'), [{ synchronous: 2 }]);
const ts = new TaskService(backend);
if (process.argv[2] !== 'migrate') ts.createTask({ title: 'WAL before lock', status: 'ready' });
const app = new Hono();
registerBoardRoutes(app, {
  ts,
  database: backend,
  tts: new TaskTagService(backend),
  tags: new TagService(backend),
  ms: new MetadataService(backend),
  cs: new CommentService(backend),
  tbs: new TaskBlockService(backend),
  configDir: process.cwd(),
});
const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 }, ({ port }) => {
  console.log(JSON.stringify({ port }));
});
process.on('SIGTERM', () => {
  server.close(() => {
    DatabaseConnection.close();
    process.exit(0);
  });
});
