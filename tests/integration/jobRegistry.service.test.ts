/**
 * The job registry and its scheduler pass.
 *
 * The contract: every scheduled job the operations service records a run for is
 * declared in the registry and runs from it; one pass runs each job that is due
 * and nothing else, so a repeat pass is a no-op and the first pass after an
 * outage catches every job up; one failing job never stops the rest; each job's
 * run rows are pruned past its own retention while its last success is always
 * kept; and the heartbeat line names the overdue jobs, the signal the missed-run
 * alarm reads.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertSystemConfig, insertSystemJobRun } from '../fixtures/factories';
import { REPO_ROOT } from '../fixtures/sourceTree';
import { expectLoggedError } from '../setup-env';
import { cadenceMs } from '../../src/lib/jobSchedule';

const { dbPath } = setTestEnv('4733');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let registry: typeof import('../../src/services/jobRegistry');
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let ops: typeof import('../../src/services/operationsPlatformService');
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let logger: typeof import('../../src/config/logger').logger;

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-07-21T03:00:00.000Z');
const daysBefore = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

function withDb<T>(fn: (db: BetterSqlite3.Database) => T): T {
  const db = new BetterSqlite3(dbPath);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

function succeededJobNames(): string[] {
  return withDb((db) => (db.prepare(
    "SELECT DISTINCT job_name FROM system_job_runs WHERE status = 'succeeded' ORDER BY job_name",
  ).all() as { job_name: string }[]).map((r) => r.job_name));
}

function runIdsFor(jobName: string): string[] {
  return withDb((db) => (db.prepare(
    'SELECT id FROM system_job_runs WHERE job_name = ? ORDER BY id',
  ).all(jobName) as { id: string }[]).map((r) => r.id));
}

const noReap = async () => ({ reclaimedIds: [] as string[] });

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  registry = await import('../../src/services/jobRegistry');
  ops = await import('../../src/services/operationsPlatformService');
  ({ logger } = await import('../../src/config/logger'));
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(() => {
  withDb((db) => db.prepare('DELETE FROM system_job_runs').run());
});

describe('what the registry declares', () => {
  it('holds every job the operations service records a run for, and nothing else', () => {
    // A job implemented and recorded but missing from the registry would never
    // run in production, however well its own tests pass; a registry entry
    // naming no recorded job would run nothing and leave no run row.
    const source = readFileSync(
      path.join(REPO_ROOT, 'src', 'services', 'operationsPlatformService.ts'), 'utf8',
    );
    const recorded = [...source.matchAll(/recordJobRun\(\s*'([A-Za-z_]+)'/g)].map((m) => m[1]).sort();
    const declared = registry.JOBS.map((job) => job.name).sort();
    expect(recorded.length).toBeGreaterThan(0);
    expect(declared).toEqual(recorded);
  });
});

// The background jobs that run outside the scheduler: continuous pollers with
// their own worker loops, event-driven handlers, and host and storage jobs.
const JOBS_OUTSIDE_REGISTRY = [
  'SYS_Send_Email',
  'SYS_Handle_SES_Bounce_And_Complaint_Feed',
  'SYS_Handle_Stripe_Webhooks',
  'SYS_Process_One_Time_Payments',
  'SYS_Process_Recurring_Donations',
  'SYS_Continuous_Database_Backup',
  'SYS_Host_Snapshots',
  'SYS_Cross_Region_Replication',
  'SYS_Storage_Lifecycle_Expiry',
];

describe('the background-jobs catalogue', () => {
  // An operator answering an alarm reads the catalogue, and an author adding a
  // job reads the registry; a job in one and not the other is one the operator
  // cannot find or one that runs undocumented.
  const doc = readFileSync(path.join(REPO_ROOT, 'docs', 'BACKGROUND_JOBS.md'), 'utf8');
  const catalogueSection = doc.split('## Catalogue')[1]?.split('\n## ')[0] ?? '';
  const catalogueRows = [...catalogueSection.matchAll(/^\| (SYS_[A-Za-z_]+) \|/gm)].map((m) => m[1]);
  const storyHeadings = [...doc.matchAll(/^### (SYS_[A-Za-z_]+)\s*$/gm)].map((m) => m[1]);

  it('lists every registry job with a row and a story', () => {
    for (const job of registry.JOBS) {
      expect(catalogueRows, `${job.name} has no catalogue row`).toContain(job.name);
      expect(storyHeadings, `${job.name} has no story`).toContain(job.name);
    }
  });

  it('names in each row a job that runs, from the registry or outside it', () => {
    const known = new Set([...registry.JOBS.map((job) => job.name), ...JOBS_OUTSIDE_REGISTRY]);
    expect(catalogueRows.length).toBeGreaterThan(0);
    expect(catalogueRows.filter((name) => !known.has(name))).toEqual([]);
    for (const name of JOBS_OUTSIDE_REGISTRY) {
      expect(catalogueRows, `${name} has no catalogue row`).toContain(name);
      expect(storyHeadings, `${name} has no story`).toContain(name);
    }
  });
});

describe('one scheduler pass', () => {
  it('runs every job on a fresh database, each leaving a succeeded run row under its own name', async () => {
    const { ran, failed } = await registry.runDueJobs({ now: NOW, reapExpiredMediaJobs: noReap });
    const declared = registry.JOBS.map((job) => job.name).sort();
    expect(failed).toEqual([]);
    expect([...ran].sort()).toEqual(declared);
    expect(succeededJobNames()).toEqual(declared);
  });

  it('records each entry\'s run under that entry\'s own name', async () => {
    // Two entries pointing at each other's entry points would still leave a
    // complete set of names after a full pass, while each job's cadence,
    // retention and overdue check judged the other job's runs.
    for (const job of registry.JOBS) {
      withDb((db) => db.prepare('DELETE FROM system_job_runs').run());
      await registry.runDueJobs({ now: NOW, reapExpiredMediaJobs: noReap }, [job]);
      expect(succeededJobNames(), `${job.name} recorded its run under another name`)
        .toEqual([job.name]);
    }
  });

  it('runs nothing on a second pass at the same moment', async () => {
    // A tick that reran a job already done would repeat every email it sends.
    await registry.runDueJobs({ now: NOW, reapExpiredMediaJobs: noReap });
    const { ran } = await registry.runDueJobs({ now: NOW, reapExpiredMediaJobs: noReap });
    expect(ran).toEqual([]);
  });

  it('on the next day reruns the daily jobs but not a digest whose interval has not passed', async () => {
    await registry.runDueJobs({ now: NOW, reapExpiredMediaJobs: noReap });
    const nextDay = new Date(NOW.getTime() + DAY);
    const { ran } = await registry.runDueJobs({ now: nextDay, reapExpiredMediaJobs: noReap });
    const daily = registry.JOBS.filter((job) => job.cadence.kind === 'daily').map((job) => job.name);
    for (const name of daily) expect(ran, `${name} did not run on the next day`).toContain(name);
    expect(ran).not.toContain('SYS_Reconciliation_Digest');
  });

  it('keeps running the jobs after one that fails', async () => {
    expectLoggedError('SYS_Test_Throws: failed');
    const ranAfter: string[] = [];
    const jobs = [
      {
        name: 'SYS_Test_Throws',
        cadence: { kind: 'daily' as const },
        runRetentionDays: () => 400,
        run: () => ops.operationsPlatformService.recordJobRun('SYS_Test_Throws', () => {
          throw new Error('boom');
        }, NOW),
      },
      {
        name: 'SYS_Test_After',
        cadence: { kind: 'daily' as const },
        runRetentionDays: () => 400,
        run: async () => { ranAfter.push('SYS_Test_After'); },
      },
    ];
    const { ran, failed } = await registry.runDueJobs({ now: NOW, reapExpiredMediaJobs: noReap }, jobs);
    expect(failed).toEqual(['SYS_Test_Throws']);
    expect(ran).toEqual(['SYS_Test_After']);
    expect(ranAfter).toEqual(['SYS_Test_After']);
  });

  it('stops waiting for a job past its time limit and runs the jobs after it', async () => {
    // A hung provider call in one job would otherwise hold every later job,
    // the media-lease reclaim included, until the missed-run alarm fired.
    expectLoggedError('exceeded its time limit');
    const ranAfter: string[] = [];
    const jobs = [
      {
        name: 'SYS_Test_Hangs',
        cadence: { kind: 'daily' as const },
        runRetentionDays: () => 400,
        run: () => new Promise<void>(() => {}),
      },
      {
        name: 'SYS_Test_After_Hang',
        cadence: { kind: 'daily' as const },
        runRetentionDays: () => 400,
        run: async () => { ranAfter.push('SYS_Test_After_Hang'); },
      },
    ];
    const { ran, failed } = await registry.runDueJobs(
      { now: NOW, reapExpiredMediaJobs: noReap }, jobs, 50,
    );
    expect(failed).toEqual(['SYS_Test_Hangs']);
    expect(ran).toEqual(['SYS_Test_After_Hang']);
    expect(ranAfter).toEqual(['SYS_Test_After_Hang']);
  });

  it('starts no job once the worker is stopping', async () => {
    const { ran } = await registry.runDueJobs({
      now: NOW, reapExpiredMediaJobs: noReap, shouldStop: () => true,
    });
    expect(ran).toEqual([]);
  });
});

describe('a configured digest interval', () => {
  it('falls back to its default on a zero setting, so the digest cannot mail on every tick', async () => {
    withDb((db) => insertSystemConfig(db, {
      config_key: 'admin_queue_digest_interval_days', value_json: '0',
    }));
    try {
      const digest = registry.JOBS.filter((job) => job.name === 'SYS_Admin_Queue_Digest');
      const first = await registry.runDueJobs({ now: NOW, reapExpiredMediaJobs: noReap }, digest);
      const tickLater = new Date(NOW.getTime() + 5 * 60 * 1000);
      const second = await registry.runDueJobs({ now: tickLater, reapExpiredMediaJobs: noReap }, digest);
      expect(first.ran).toEqual(['SYS_Admin_Queue_Digest']);
      expect(second.ran).toEqual([]);
    } finally {
      withDb((db) => insertSystemConfig(db, {
        config_key: 'admin_queue_digest_interval_days', value_json: '1',
      }));
    }
  });
});

describe('pruning run rows', () => {
  it('removes rows past the retention but keeps the last success, even when it is that old', async () => {
    // An operator asking when a long-broken job last worked must still get an
    // answer after its older history has aged out.
    expectLoggedError('SYS_Test_Prune: failed');
    const oldSuccess = withDb((db) => insertSystemJobRun(db, {
      job_name: 'SYS_Test_Prune', status: 'succeeded', started_at: daysBefore(500),
    }));
    const oldFailure = withDb((db) => insertSystemJobRun(db, {
      job_name: 'SYS_Test_Prune', status: 'failed', started_at: daysBefore(450),
    }));
    const recentFailure = withDb((db) => insertSystemJobRun(db, {
      job_name: 'SYS_Test_Prune', status: 'failed', started_at: daysBefore(2),
    }));
    const jobs = [{
      name: 'SYS_Test_Prune',
      cadence: { kind: 'daily' as const },
      runRetentionDays: () => 400,
      run: () => ops.operationsPlatformService.recordJobRun('SYS_Test_Prune', () => {
        throw new Error('still broken');
      }, NOW),
    }];
    await registry.runDueJobs({ now: NOW, reapExpiredMediaJobs: noReap }, jobs);
    const ids = runIdsFor('SYS_Test_Prune');
    expect(ids).toContain(oldSuccess);
    expect(ids).toContain(recentFailure);
    expect(ids).not.toContain(oldFailure);
    expect(ids).toHaveLength(3);
  });

  it('keeps the reconciliation reports for the payment-record retention, not the default', async () => {
    // Each reconciliation run row is that day's report, read back by the
    // Financial Reports view; pruning it at the default retention would delete
    // financial history.
    const report = withDb((db) => insertSystemJobRun(db, {
      job_name: 'SYS_Reconcile_Payments_Nightly', status: 'succeeded', started_at: daysBefore(1000),
    }));
    const tokenRun = withDb((db) => insertSystemJobRun(db, {
      job_name: 'SYS_Cleanup_Expired_Tokens', status: 'succeeded', started_at: daysBefore(1000),
    }));
    await registry.runDueJobs({ now: NOW, reapExpiredMediaJobs: noReap });
    expect(runIdsFor('SYS_Reconcile_Payments_Nightly')).toContain(report);
    expect(runIdsFor('SYS_Cleanup_Expired_Tokens')).not.toContain(tokenRun);
  });
});

describe('the heartbeat', () => {
  it('names a job whose last success is older than its cadence plus grace, and only that one', async () => {
    await registry.runDueJobs({ now: NOW, reapExpiredMediaJobs: noReap });
    withDb((db) => db.prepare(
      "UPDATE system_job_runs SET started_at = ?, finished_at = ? WHERE job_name = 'SYS_Cleanup_Expired_Tokens'",
    ).run(daysBefore(3), daysBefore(3)));
    const warn = vi.spyOn(logger, 'warn');
    try {
      const overdue = registry.writeJobsHeartbeat(NOW, new Date(NOW.getTime() - DAY));
      expect(overdue).toEqual(['SYS_Cleanup_Expired_Tokens']);
      expect(warn).toHaveBeenCalledWith('jobs.heartbeat', {
        overdue: 1, overdueJobs: ['SYS_Cleanup_Expired_Tokens'],
      });
    } finally {
      warn.mockRestore();
    }
  });

  it('writes the line with a zero count when every job is current, so the alarm sees the worker alive', async () => {
    await registry.runDueJobs({ now: NOW, reapExpiredMediaJobs: noReap });
    const warn = vi.spyOn(logger, 'warn');
    try {
      registry.writeJobsHeartbeat(NOW, new Date(NOW.getTime() - DAY));
      expect(warn).toHaveBeenCalledWith('jobs.heartbeat', { overdue: 0, overdueJobs: [] });
    } finally {
      warn.mockRestore();
    }
  });

  it('counts a job that has never succeeded once the worker has been up past its limit', () => {
    // The longest limit is the reconciliation digest's configured interval, so
    // after two days every job but that one is overdue, and once the worker has
    // been up longer than that interval every job is.
    const afterTwoDays = registry.listOverdueJobs(NOW, new Date(NOW.getTime() - 2 * DAY));
    expect(afterTwoDays).toEqual(
      registry.JOBS.map((job) => job.name).filter((name) => name !== 'SYS_Reconciliation_Digest'),
    );
    const digest = registry.JOBS.find((job) => job.name === 'SYS_Reconciliation_Digest')!;
    const pastLongestLimit = new Date(NOW.getTime() - cadenceMs(digest) - DAY);
    expect(registry.listOverdueJobs(NOW, pastLongestLimit))
      .toEqual(registry.JOBS.map((job) => job.name));
    expect(registry.listOverdueJobs(NOW, NOW)).toEqual([]);
  });
});
