/**
 * Open the running e2e stack's live SQLite database for test seeding.
 *
 * The stack launcher writes the ephemeral database path to a well-known temp
 * file; specs that need seeded rows (personas, freestyle tricks) open the live
 * database through this helper, insert what they need, and close it before
 * driving the browser. Also pins JWT_LOCAL_KEYPAIR_PATH to the stack's keypair
 * so a spec that signs a session resolves the same key the app verifies with.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';

const DB_PATH_FILE = path.join(process.env.TMPDIR ?? '/tmp', 'footbag-e2e-db-path');

export function openLiveDb(): BetterSqlite3.Database {
  const dbPath = fs.readFileSync(DB_PATH_FILE, 'utf8').trim();
  // Must match the path start-stack.sh exports so the test signer and the
  // running app's verifier resolve to the same keypair file.
  process.env.JWT_LOCAL_KEYPAIR_PATH =
    process.env.JWT_LOCAL_KEYPAIR_PATH
    ?? path.join(process.env.TMPDIR ?? '/tmp', 'footbag-e2e-jwt.pem');
  const db = new BetterSqlite3(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}
