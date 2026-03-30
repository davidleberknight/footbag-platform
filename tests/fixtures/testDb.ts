/**
 * Shared test database setup helpers.
 *
 * New test files should use these instead of repeating the ~20 lines of
 * boilerplate for env vars, schema loading, and cleanup.
 *
 * Usage:
 *   // At module top level (before any src/ import):
 *   const { dbPath, sessionSecret } = setTestEnv('3050');
 *
 *   let createApp: Awaited<ReturnType<typeof importApp>>;
 *
 *   beforeAll(async () => {
 *     const db = createTestDb(dbPath);
 *     insertMember(db, { ... });
 *     db.close();
 *     createApp = await importApp();
 *   });
 *
 *   afterAll(() => cleanupTestDb(dbPath));
 */
import BetterSqlite3 from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

/**
 * Set all required env vars for a test file.
 * Must be called at module top level BEFORE any dynamic import of src/.
 * Returns the generated dbPath and sessionSecret for use in test helpers.
 */
export function setTestEnv(port: string): { dbPath: string; sessionSecret: string } {
  const dbPath = path.join(process.cwd(), `test-${port}-${Date.now()}.db`);
  const sessionSecret = `test-secret-${port}`;

  process.env.FOOTBAG_DB_PATH = dbPath;
  process.env.PORT            = port;
  process.env.NODE_ENV        = 'test';
  process.env.LOG_LEVEL       = 'error';
  process.env.PUBLIC_BASE_URL = `http://localhost:${port}`;
  process.env.SESSION_SECRET  = sessionSecret;

  return { dbPath, sessionSecret };
}

/**
 * Create and initialize a test database with the full schema.
 * Returns an open db handle; caller should close it after inserting test data.
 */
export function createTestDb(dbPath: string): BetterSqlite3.Database {
  const schema = fs.readFileSync(
    path.join(process.cwd(), 'database', 'schema.sql'),
    'utf8',
  );
  const db = new BetterSqlite3(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(schema);
  return db;
}

/**
 * Remove the test database and WAL/SHM sidecars.
 */
export function cleanupTestDb(dbPath: string): void {
  for (const ext of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(dbPath + ext); } catch { /* ignore */ }
  }
}

/**
 * Dynamic import of createApp. Call in beforeAll after env vars are set.
 */
export async function importApp(): Promise<typeof import('../../src/app').createApp> {
  const mod = await import('../../src/app');
  return mod.createApp;
}
