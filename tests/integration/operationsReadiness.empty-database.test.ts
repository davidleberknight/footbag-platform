/**
 * Readiness on a database file that holds no schema.
 *
 * Opening a database path that does not exist creates an empty file, and an
 * empty file answers a bare `SELECT 1`. A deploy onto a host whose database is
 * missing or empty therefore used to report the stack ready, and the smoke
 * check that followed was the first thing to notice. Readiness must be false
 * until the schema is present, and true once it is.
 *
 * Its own file because every other suite builds the schema before importing
 * the service, and this one must not.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';

import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3961');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let ops: typeof import('../../src/services/operationsPlatformService');

beforeAll(async () => {
  ops = await import('../../src/services/operationsPlatformService');
  ops.setTestMemoryPercentForTests(10);
});

afterAll(() => {
  ops.resetTestMemoryPercentForTests();
  cleanupTestDb(dbPath);
});

describe('readiness reads the schema, not merely the connection', () => {
  // Defect caught: a host with an empty or missing database is reported ready,
  // so the deploy's readiness poll passes and the site serves errors.
  it('is not ready on a database with no schema, and ready once the schema exists', () => {
    const empty = ops.operationsPlatformService.checkReadiness();
    expect(empty.isReady).toBe(false);
    expect(empty.checks.database.isReady).toBe(false);

    // A database holding some table but not the schema's core one is no more
    // ready than an empty file: a half-written or foreign file must not pass.
    const stray = new BetterSqlite3(dbPath);
    stray.exec('CREATE TABLE unrelated (id TEXT)');
    stray.close();
    expect(ops.operationsPlatformService.checkReadiness().checks.database.isReady).toBe(false);

    createTestDb(dbPath).close();
    const built = ops.operationsPlatformService.checkReadiness();
    expect(built.checks.database.isReady).toBe(true);
    expect(built.isReady).toBe(true);
  });
});
