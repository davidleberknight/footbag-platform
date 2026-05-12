/**
 * Regression: SYS-job reaper writes status='aborted' to system_job_runs rows
 * left in 'running' state past the staleness threshold. The schema CHECK
 * constraint on system_job_runs.status must permit 'aborted' alongside
 * 'running' / 'succeeded' / 'failed'; without it, every reaper invocation
 * throws SQLITE_CONSTRAINT_CHECK and orphaned rows stay stuck forever.
 *
 * Reaping is invoked at the head of each SYS-job pass (see
 * runBatchAutoLink). This test exercises that path against a freshly-built
 * schema and a pre-seeded stale 'running' row.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3092');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let ops: typeof import('../../src/services/operationsPlatformService');

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  ops = await import('../../src/services/operationsPlatformService');
});

afterAll(() => cleanupTestDb(dbPath));

interface JobRunRow {
  id: string;
  job_name: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  last_error: string | null;
}

function readById(rowId: string): JobRunRow | undefined {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  try {
    return db
      .prepare(
        `SELECT id, job_name, status, started_at, finished_at, last_error
         FROM system_job_runs
         WHERE id = ?`,
      )
      .get(rowId) as JobRunRow | undefined;
  } finally {
    db.close();
  }
}

function insertStaleRunning(rowId: string, jobName: string, startedAt: string): void {
  const db = new BetterSqlite3(dbPath);
  try {
    db.prepare(
      `INSERT INTO system_job_runs (
         id, created_at, created_by, updated_at, updated_by, version,
         job_name, started_at, status, details_json
       ) VALUES (?, ?, 'system', ?, 'system', 1, ?, ?, 'running', '{}')`,
    ).run(rowId, startedAt, startedAt, jobName, startedAt);
  } finally {
    db.close();
  }
}

describe('runBatchAutoLink reaper writes status=aborted to stale running rows', () => {
  it('updates a SYS_Batch_Auto_Link row older than the staleness threshold from running to aborted', async () => {
    // Insert a stale row 2 hours in the past; threshold is 1h.
    const staleStarted = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const staleId = 'sjr_stale_test_001';
    insertStaleRunning(staleId, 'SYS_Batch_Auto_Link', staleStarted);

    // Sanity: row starts as 'running'.
    const before = readById(staleId);
    expect(before?.status).toBe('running');

    // Invoking the wrapper triggers reapStaleRunning before recordJobRun.
    // We do not care about the new run's outcome; we only assert the stale
    // row was successfully transitioned to 'aborted'.
    await ops.operationsPlatformService.runBatchAutoLink();

    const after = readById(staleId);
    expect(after?.status).toBe('aborted');
    expect(after?.finished_at).not.toBeNull();
    expect(after?.last_error).toBe('stale_running_reaped');
  });
});
