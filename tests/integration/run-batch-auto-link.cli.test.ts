/**
 * Wiring test for the cutover batch-auto-link entry point: the runner invokes
 * the staging job and records a system_job_runs row, so the go-live cutover
 * step is actually executable. The candidate-staging logic itself is covered
 * by the OperationsPlatformService batch-auto-link suite; this asserts only
 * that the entry point reaches it and reports a clean run.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';

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
