/**
 * Regression: SYS-job reaper writes status='aborted' to system_job_runs rows
 * left in 'running' state past the staleness threshold. The schema CHECK
 * constraint on system_job_runs.status must permit 'aborted' alongside
 * 'running' / 'succeeded' / 'failed'; without it, every reaper invocation
 * throws SQLITE_CONSTRAINT_CHECK and orphaned rows stay stuck forever.
 *
 * Reaping runs at the head of every job the lifecycle wrapper runs. This test
 * exercises that path against a freshly-built schema and a pre-seeded stale
 * 'running' row.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertSystemJobRun } from '../fixtures/factories';

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
    insertSystemJobRun(db, {
      id: rowId,
      job_name: jobName,
      started_at: startedAt,
      status: 'running',
      details_json: '{}',
    });
  } finally {
    db.close();
  }
}

describe('the job lifecycle wrapper reaps stale running rows to aborted', () => {
  // Every scheduled job goes through the same lifecycle wrapper, so every one is
  // reaped. Without it a killed job reads as still running for ever on the
  // health page, and is never counted among that job's failures.
  it('updates a row older than the staleness threshold from running to aborted when its job next runs', async () => {
    // Two hours in the past; the threshold is one hour.
    const staleStarted = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const staleId = 'sjr_stale_test_002';
    insertStaleRunning(staleId, 'SYS_Rebuild_Hashtag_Stats', staleStarted);
    expect(readById(staleId)?.status).toBe('running');

    await ops.operationsPlatformService.runHashtagStatsRebuild();

    const after = readById(staleId);
    expect(after?.status).toBe('aborted');
    expect(after?.finished_at).not.toBeNull();
    expect(after?.last_error).toBe('stale_running_reaped');
  });
});
