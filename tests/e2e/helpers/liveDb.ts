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
import { insertMember } from '../../fixtures/factories';

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

/**
 * Give the stack's database the system member curated media is credited to,
 * as an integration test does for its own database: the stack is built from
 * the bare schema, and a curated upload needs the one is_system row. A no-op
 * when the row already exists.
 */
export function ensureSystemMember(): void {
  const db = openLiveDb();
  try {
    const existing = db.prepare('SELECT id FROM members WHERE is_system = 1').get();
    if (!existing) {
      insertMember(db, {
        id: 'member_e2e_system',
        slug: 'footbag_hacky',
        display_name: 'Footbag Hacky',
        real_name: 'Footbag Hacky',
        is_system: 1,
      });
    }
  } finally {
    db.close();
  }
}
