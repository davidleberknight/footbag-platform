/**
 * Lifecycle smoke for OperationsPlatformService.runActivePlayerExpiryCheck.
 *
 * Verifies that each invocation:
 *   - inserts exactly one system_job_runs row with job_name set to
 *     SYS_Check_Active_Player_Expiry
 *   - transitions the row from 'running' to 'succeeded' on normal return
 *   - serializes the worker's counter struct into details_json
 *   - propagates the worker's return value to the caller
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { expectLoggedError } from '../setup-env';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { rowPin, snapshotIds, oneRowAddedSince } from '../fixtures/rowPinning';

const { dbPath } = setTestEnv('3091');

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
  started_at: string;
  finished_at: string | null;
  status: string;
  details_json: string;
  last_error: string | null;
}

// Runs of this job accumulate across the file, and their started_at values come
// from fixed injected dates while the run id is random, so no ordering names the
// one a given pass produced. Each case snapshots first and takes what its own
// call added.
const expiryJobRuns = rowPin(
  'system_job_runs',
  `job_name = 'SYS_Check_Active_Player_Expiry'`,
);

function snapshotJobRuns(): Set<string> {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  try {
    return snapshotIds(db, expiryJobRuns);
  } finally {
    db.close();
  }
}

function jobRunAddedSince(before: Set<string>): JobRunRow {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  try {
    return oneRowAddedSince<JobRunRow>(db, expiryJobRuns, before);
  } finally {
    db.close();
  }
}

function countJobRuns(): number {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  try {
    const r = db.prepare(`
      SELECT COUNT(*) AS n FROM system_job_runs
      WHERE job_name = 'SYS_Check_Active_Player_Expiry'
    `).get() as { n: number };
    return r.n;
  } finally {
    db.close();
  }
}

describe('OperationsPlatformService.runActivePlayerExpiryCheck — system_job_runs lifecycle', () => {
  it('writes one succeeded row per pass, with the counter struct in details_json', async () => {
    const before = countJobRuns();
    const beforeRuns = snapshotJobRuns();
    const now = new Date('2070-06-15T12:00:00.000Z');

    const result = await ops.operationsPlatformService.runActivePlayerExpiryCheck({ now });

    const after = countJobRuns();
    expect(after - before).toBe(1);

    const row = jobRunAddedSince(beforeRuns);
    expect(row.job_name).toBe('SYS_Check_Active_Player_Expiry');
    expect(row.status).toBe('succeeded');
    expect(row.finished_at).not.toBeNull();
    expect(row.last_error).toBeNull();

    const details = JSON.parse(row.details_json) as Record<string, number>;
    expect(details).toMatchObject({
      candidates_scanned:       expect.any(Number),
      reminders_enqueued:       expect.any(Number),
      expiry_rows_applied:      expect.any(Number),
      skipped_outside_window:   expect.any(Number),
      skipped_non_tier0:        expect.any(Number),
      skipped_unsubscribed:     expect.any(Number),
      skipped_email_suppressed: expect.any(Number),
      skipped_already_sent:     expect.any(Number),
      skipped_missing_email:    expect.any(Number),
    });

    // The wrapper's return value preserves the worker's struct shape.
    expect(result.candidates_scanned).toBe(details.candidates_scanned);
  });

  it('two passes write two rows', async () => {
    const before = countJobRuns();
    await ops.operationsPlatformService.runActivePlayerExpiryCheck({ now: new Date('2071-06-15T12:00:00.000Z') });
    await ops.operationsPlatformService.runActivePlayerExpiryCheck({ now: new Date('2071-06-16T12:00:00.000Z') });
    expect(countJobRuns() - before).toBe(2);
  });
});

describe('OperationsPlatformService.getActivePlayerExpiryIntervalMs', () => {
  it('defaults to 86400 seconds (24h) when no config override is set', () => {
    const ms = ops.operationsPlatformService.getActivePlayerExpiryIntervalMs();
    expect(ms).toBe(86400 * 1000);
  });
});

describe('OperationsPlatformService.recordJobRun — failure path', () => {
  it('on throw, marks the row failed with the error message and re-throws', async () => {
    expectLoggedError('SYS_Check_Active_Player_Expiry: failed');
    const before = countJobRuns();
    const beforeRuns = snapshotJobRuns();
    await expect(
      ops.operationsPlatformService.recordJobRun('SYS_Check_Active_Player_Expiry', () => {
        throw new Error('synthetic failure for test');
      }),
    ).rejects.toThrow(/synthetic failure/);

    expect(countJobRuns() - before).toBe(1);
    const failed = jobRunAddedSince(beforeRuns);
    expect(failed.status).toBe('failed');
    expect(failed.last_error).toContain('synthetic failure');
    expect(failed.finished_at).not.toBeNull();
  });
});
