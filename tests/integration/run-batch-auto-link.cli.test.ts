/**
 * Wiring test for the batch-auto-link entry point: the runner invokes the
 * staging job and records a system_job_runs row, so an operator seeding a test
 * environment can actually execute it. The candidate-staging logic itself is covered
 * by the OperationsPlatformService batch-auto-link suite; this asserts only
 * that the entry point reaches it and reports a clean run.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { expectLoggedError } from '../setup-env';

const { dbPath } = setTestEnv('3110');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let runner: typeof import('../../src/runBatchAutoLink');

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  runner = await import('../../src/runBatchAutoLink');
});

afterAll(() => cleanupTestDb(dbPath));

describe('runBatchAutoLinkJob (cutover entry point)', () => {
  it('runs the staging job and records a succeeded system_job_runs row', async () => {
    const code = await runner.runBatchAutoLinkJob();
    expect(code).toBe(0);

    const db = new BetterSqlite3(dbPath, { readonly: true });
    try {
      const row = db.prepare(`
        SELECT status FROM system_job_runs
        WHERE job_name = 'SYS_Batch_Auto_Link'
        ORDER BY started_at DESC LIMIT 1
      `).get() as { status: string } | undefined;
      expect(row?.status).toBe('succeeded');
    } finally {
      db.close();
    }
  });
});

describe('runBatchAutoLinkJob refuses production', () => {
  it('returns non-zero and stages nothing when the environment is production', async () => {
    // The pass belongs to seeded environments. On the real database the members
    // it would scan are people who have finished signing up, and the only
    // surface that renders a staged suggestion is the wizard, which is closed
    // to them -- so every row it wrote would be unreadable and unresolvable.
    const before = new BetterSqlite3(dbPath, { readonly: true });
    const runsBefore = (before.prepare(
      "SELECT COUNT(*) AS n FROM system_job_runs WHERE job_name = 'SYS_Batch_Auto_Link'",
    ).get() as { n: number }).n;
    before.close();

    expectLoggedError(/batch auto-link refused/);
    const code = await runner.runBatchAutoLinkJob('production');
    expect(code).toBe(1);

    const after = new BetterSqlite3(dbPath, { readonly: true });
    const runsAfter = (after.prepare(
      "SELECT COUNT(*) AS n FROM system_job_runs WHERE job_name = 'SYS_Batch_Auto_Link'",
    ).get() as { n: number }).n;
    after.close();
    expect(runsAfter).toBe(runsBefore);
  });
});
