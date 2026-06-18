/**
 * Graceful-shutdown DB hook: checkpointAndCloseDatabase folds the WAL into the
 * main file and closes the connection, leaving the on-disk DB consistent for
 * the post-stop host backup. It is idempotent (a second call is a no-op).
 *
 * This file owns its own DB and runs the close last, so closing the shared
 * connection cannot affect other suites.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember } from '../fixtures/factories';

const { dbPath } = setTestEnv('3204');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let dbMod: typeof import('../../src/db/db');

beforeAll(async () => {
  const seed = createTestDb(dbPath);
  insertMember(seed, { id: 'cc-mem', slug: 'cc_mem' });
  seed.close();
  dbMod = await import('../../src/db/db');
});

afterAll(() => cleanupTestDb(dbPath));

describe('checkpointAndCloseDatabase', () => {
  it('checkpoints and closes the connection, and a second call is a no-op', () => {
    // Generate WAL activity so the checkpoint has something to fold in.
    dbMod.db.prepare(
      `UPDATE members SET updated_at = '2026-01-01T00:00:00.000Z' WHERE id = 'cc-mem'`,
    ).run();
    expect(dbMod.db.open).toBe(true);

    dbMod.checkpointAndCloseDatabase();
    expect(dbMod.db.open).toBe(false);

    // Idempotent: closing again does not throw.
    expect(() => dbMod.checkpointAndCloseDatabase()).not.toThrow();
  });
});
