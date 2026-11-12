/**
 * Running a scheduled job on demand through the testkit.
 *
 * The contract: on a stack whose worker already ran the job today, an on-demand
 * run still runs it, through the job's own registry entry and the run recorder,
 * so it leaves a true run row stamped at the time it ran; a failing job is
 * recorded and reported as failed, never as ran; and a name the registry does
 * not hold is refused before anything is written.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember } from '../fixtures/factories';
import { expectLoggedError } from '../setup-env';

const { dbPath } = setTestEnv('4791');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let registry: typeof import('../../src/services/jobRegistry');
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let runner: typeof import('../../src/testkit/runRegistryJob');

const WORKER_TICK = new Date('2026-07-21T00:05:00.000Z');
const LATER_SAME_DAY = new Date('2026-07-21T14:30:00.000Z');
const noReap = async () => ({ reclaimedIds: [] as string[] });

function runsOf(jobName: string): { status: string; started_at: string }[] {
  const db = new BetterSqlite3(dbPath);
  try {
    return db.prepare(
      'SELECT status, started_at FROM system_job_runs WHERE job_name = ? ORDER BY started_at, id',
    ).all(jobName) as { status: string; started_at: string }[];
  } finally {
    db.close();
  }
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  // A serving administrator, as on every running stack, so the administrator-loss
  // sweep inside the worker's pass has nothing to report.
  insertMember(db, { id: 'rj_admin', slug: 'rj_admin', login_email: 'rj-admin@example.com', is_admin: 1, last_login_at: WORKER_TICK.toISOString() });
  db.close();
  registry = await import('../../src/services/jobRegistry');
  runner = await import('../../src/testkit/runRegistryJob');
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(() => {
  const db = new BetterSqlite3(dbPath);
  db.prepare('DELETE FROM system_job_runs').run();
  db.close();
});

describe('runRegistryJobNow', () => {
  it('runs a daily job the worker already ran today, leaving a second true run row at the time it ran', async () => {
    // The real starting state: the worker's first tick of the day has run every job.
    await registry.runDueJobs({ now: WORKER_TICK, reapExpiredMediaJobs: noReap });
    expect(runsOf('SYS_Reconcile_Payments_Nightly')).toEqual([
      { status: 'succeeded', started_at: WORKER_TICK.toISOString() },
    ]);
    // The scheduler on its own would not run it again today.
    const tick = await registry.runDueJobs({ now: LATER_SAME_DAY, reapExpiredMediaJobs: noReap });
    expect(tick.ran).not.toContain('SYS_Reconcile_Payments_Nightly');

    const result = await runner.runRegistryJobNow('SYS_Reconcile_Payments_Nightly', { now: LATER_SAME_DAY });

    expect(result.status).toBe('ran');
    expect(runsOf('SYS_Reconcile_Payments_Nightly')).toEqual([
      { status: 'succeeded', started_at: WORKER_TICK.toISOString() },
      { status: 'succeeded', started_at: LATER_SAME_DAY.toISOString() },
    ]);
  });

  it('reports a failing job as failed and leaves its failed run row, never claiming it ran', async () => {
    // The media-lease reclaim belongs to the worker process; outside it the job fails.
    expectLoggedError(/SYS_Reclaim_Expired_Media_Jobs: failed/);

    const result = await runner.runRegistryJobNow('SYS_Reclaim_Expired_Media_Jobs', { now: LATER_SAME_DAY });

    expect(result).toEqual({
      status: 'failed',
      job: 'SYS_Reclaim_Expired_Media_Jobs',
      error: 'The media-lease reclaim runs only in the worker process.',
    });
    expect(runsOf('SYS_Reclaim_Expired_Media_Jobs')).toEqual([
      { status: 'failed', started_at: LATER_SAME_DAY.toISOString() },
    ]);
  });

  it('refuses a name the job registry does not hold, before writing any run row', async () => {
    await expect(runner.runRegistryJobNow('SYS_Not_A_Job')).rejects.toBeInstanceOf(runner.RegistryJobRefusedError);
    const db = new BetterSqlite3(dbPath);
    const count = (db.prepare('SELECT COUNT(*) AS n FROM system_job_runs').get() as { n: number }).n;
    db.close();
    expect(count).toBe(0);
  });
});
