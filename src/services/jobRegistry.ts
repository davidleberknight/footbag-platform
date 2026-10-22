/**
 * JobRegistry -- the one declaration of every clock-driven job the application
 * runs, and the scheduler pass over it.
 *
 * Owns:
 *   - The registry: each job's story ID, cadence, run-row retention and entry
 *     point. A clock-driven job runs only from here, so the worker, the overdue
 *     check, the admin health page and the tests read one list and none of them
 *     can miss a job.
 *   - The scheduler pass (`runDueJobs`): runs each job that is due, in registry
 *     order, then prunes that job's run rows past its retention.
 *   - The missed-run signal: the overdue list and the heartbeat line the
 *     missed-run alarm reads.
 *
 * Does not own:
 *   - The job bodies and the run recorder (OperationsPlatformService and the
 *     services it delegates to).
 *   - The due and overdue arithmetic, which is pure and shared with the health
 *     page (`src/lib/jobSchedule.ts`).
 *   - The continuous pollers (the email outbox drain and the notification-feed
 *     poll), which are not scheduled jobs and keep their own worker loops.
 *
 * Required patterns:
 *   - Every entry's name is its story ID, and every entry point runs through
 *     `recordJobRun`, so each run leaves its `system_job_runs` row.
 *   - Cadence ships here and changes by deploy. A business threshold a job reads
 *     (a digest's interval, a retention period) stays in the configuration
 *     store and is read when needed.
 *   - Jobs run one after another, each in its own error boundary, so one
 *     failing job never stops the others.
 *   - The heartbeat line is written at warn on every tick, because production
 *     keeps only warn and above and the alarm reads this line.
 *
 * Persistence: reads system_job_runs (last run times); deletes system_job_runs
 * rows past each job's retention, always keeping the job's last success.
 *
 * Side effects: the job bodies' own; system_job_runs delete; the heartbeat log
 * line; logger.error when pruning fails.
 *
 * Service shape: module of functions over a constant registry; the worker hands
 * in the one dependency it alone holds (the media-lease reclaim).
 */
import { systemJobRuns } from '../db/db';
import { config } from '../config/env';
import { logger } from '../config/logger';
import { readIntConfig } from './configReader';
import { operationsPlatformService } from './operationsPlatformService';
import { RECONCILIATION_DIGEST_INTERVAL_DEFAULT_DAYS } from './paymentReconciliationService';
import {
  cadenceMs,
  isJobDue,
  isJobOverdue,
  JOB_TIMEOUT_MS,
  type JobTiming,
  type LastRunTimes,
} from '../lib/jobSchedule';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

// Run rows of most jobs are kept a little over a year, long enough to answer
// "when did this last go wrong" across a full annual cycle.
const DEFAULT_RUN_RETENTION_DAYS = 400;

// The media-lease reclaim runs every few minutes, so a month of its rows already
// says everything its history can.
const MEDIA_REAP_RUN_RETENTION_DAYS = 30;

export interface JobContext {
  /** The transcode worker's expired-lease reclaim, held by the worker process. */
  reapExpiredMediaJobs: () => Promise<{ reclaimedIds: string[] }>;
  /** A fixed clock for tests; production leaves it unset and reads the time. */
  now?: Date;
  /** Checked before each job, so a shutdown does not start one mid-tick. */
  shouldStop?: () => boolean;
}

export interface JobDefinition extends JobTiming {
  /** How long this job's run rows are kept, read when the pass prunes. */
  runRetentionDays: () => number;
  run: (ctx: JobContext) => Promise<unknown>;
}

function everyConfiguredDays(key: string, fallbackDays: number): () => number {
  // The reader falls back on a zero or negative value, so a bad setting cannot
  // turn a digest into a mailing on every tick.
  return () => readIntConfig(key, fallbackDays) * DAY_MS;
}

const fixedDays = (days: number) => () => days;

/**
 * Every clock-driven job, in the order a tick runs them. The payment
 * reconciliation comes before its digest, so a digest due on the same tick
 * reports that day's reconciliation.
 */
export const JOBS: readonly JobDefinition[] = [
  {
    name: 'SYS_Check_Active_Player_Expiry',
    cadence: { kind: 'daily' },
    runRetentionDays: fixedDays(DEFAULT_RUN_RETENTION_DAYS),
    run: (ctx) => operationsPlatformService.runActivePlayerExpiryCheck({ now: ctx.now }),
  },
  {
    name: 'SYS_Detect_Admin_Loss',
    cadence: { kind: 'daily' },
    runRetentionDays: fixedDays(DEFAULT_RUN_RETENTION_DAYS),
    run: (ctx) => operationsPlatformService.runAdminLossSweep(ctx.now),
  },
  {
    name: 'SYS_Cleanup_Soft_Deleted_Records',
    cadence: { kind: 'daily' },
    runRetentionDays: fixedDays(DEFAULT_RUN_RETENTION_DAYS),
    run: (ctx) => operationsPlatformService.runPiiPurgeScan({ now: ctx.now }),
  },
  {
    name: 'SYS_Cleanup_Expired_Tokens',
    cadence: { kind: 'daily' },
    runRetentionDays: fixedDays(DEFAULT_RUN_RETENTION_DAYS),
    run: (ctx) => operationsPlatformService.runExpiredTokenCleanup(ctx.now),
  },
  {
    name: 'SYS_Delete_Unfinished_Accounts',
    cadence: { kind: 'daily' },
    runRetentionDays: fixedDays(DEFAULT_RUN_RETENTION_DAYS),
    run: (ctx) => operationsPlatformService.runUnfinishedAccountCleanup(ctx.now),
  },
  {
    name: 'SYS_Rebuild_Hashtag_Stats',
    cadence: { kind: 'daily' },
    runRetentionDays: fixedDays(DEFAULT_RUN_RETENTION_DAYS),
    run: (ctx) => operationsPlatformService.runHashtagStatsRebuild(ctx.now),
  },
  {
    name: 'SYS_Admin_Queue_Digest',
    cadence: {
      kind: 'interval',
      everyMs: everyConfiguredDays('admin_queue_digest_interval_days', 1),
    },
    runRetentionDays: fixedDays(DEFAULT_RUN_RETENTION_DAYS),
    run: (ctx) => operationsPlatformService.runAdminQueueDigest(ctx.now),
  },
  {
    name: 'SYS_Admin_Queue_Escalation',
    cadence: { kind: 'daily' },
    runRetentionDays: fixedDays(DEFAULT_RUN_RETENTION_DAYS),
    run: (ctx) => operationsPlatformService.runStaleQueueEscalation(ctx.now),
  },
  {
    name: 'SYS_Reconcile_Payments_Nightly',
    cadence: { kind: 'daily' },
    // Each run row is that day's reconciliation report, which the Financial
    // Reports view reads back, so the rows are kept as long as payment records.
    runRetentionDays: () => readIntConfig('payment_retention_days', 2555),
    run: (ctx) => operationsPlatformService.runPaymentReconciliation(ctx.now),
  },
  {
    name: 'SYS_Reconciliation_Digest',
    cadence: {
      kind: 'interval',
      everyMs: everyConfiguredDays(
        'reconciliation_summary_interval_days',
        RECONCILIATION_DIGEST_INTERVAL_DEFAULT_DAYS,
      ),
    },
    runRetentionDays: fixedDays(DEFAULT_RUN_RETENTION_DAYS),
    run: (ctx) => operationsPlatformService.runReconciliationDigest(ctx.now),
  },
  {
    name: 'SYS_Purge_Reconciliation_Issues',
    cadence: { kind: 'daily' },
    runRetentionDays: fixedDays(DEFAULT_RUN_RETENTION_DAYS),
    run: (ctx) => operationsPlatformService.runReconciliationIssuePurge(ctx.now),
  },
  {
    name: 'SYS_Purge_Audit_Entries',
    cadence: { kind: 'daily' },
    runRetentionDays: fixedDays(DEFAULT_RUN_RETENTION_DAYS),
    run: (ctx) => operationsPlatformService.runAuditRetentionPurge(ctx.now),
  },
  {
    name: 'SYS_Reclaim_Expired_Media_Jobs',
    cadence: {
      kind: 'interval',
      // A quarter of the lease keeps the wait between a lease expiring and its
      // job being reclaimed short relative to the lease itself; the clamp keeps
      // an extreme operator override from producing a hammering or useless
      // cadence.
      everyMs: () =>
        Math.min(Math.max(Math.floor(config.mediaJobLeaseSeconds / 4), 60), 600) * 1000,
    },
    runRetentionDays: fixedDays(MEDIA_REAP_RUN_RETENTION_DAYS),
    run: (ctx) => operationsPlatformService.runMediaJobReap(ctx.reapExpiredMediaJobs, ctx.now),
  },
];

interface JobSummaryRow {
  job_name: string;
  last_started_at: string | null;
  last_success_at: string | null;
}

/** Each job's last success and last start, read in one pass over the run table. */
function readLastRunTimes(now: Date): Map<string, LastRunTimes> {
  const nowIso = now.toISOString();
  const rows = systemJobRuns.summarizeByJob.all(nowIso, nowIso) as JobSummaryRow[];
  return new Map(rows.map((r) => [
    r.job_name,
    { lastSuccessAt: r.last_success_at, lastStartedAt: r.last_started_at },
  ]));
}

function pruneRuns(job: JobDefinition, now: Date): number {
  const cutoff = new Date(now.getTime() - job.runRetentionDays() * DAY_MS).toISOString();
  return systemJobRuns.pruneFinishedBefore.run(job.name, cutoff, job.name).changes;
}

const TIMED_OUT = Symbol('timed out');

/** The job's own promise, or TIMED_OUT once the limit passes first. */
async function withinLimit(work: Promise<unknown>, limitMs: number): Promise<unknown> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise((resolve) => { timer = setTimeout(() => resolve(TIMED_OUT), limitMs); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One scheduler pass: runs every job that is due, in registry order, and prunes
 * each job it ran. A job's failure is already recorded on its run row and logged
 * at error by the run recorder, so it is counted here and the pass moves on. A
 * job still running at the time limit is left to finish in the background,
 * logged at error and counted as failed, so it cannot hold the jobs after it.
 */
export async function runDueJobs(
  ctx: JobContext,
  jobs: readonly JobDefinition[] = JOBS,
  timeoutMs: number = JOB_TIMEOUT_MS,
): Promise<{ ran: string[]; failed: string[] }> {
  const ran: string[] = [];
  const failed: string[] = [];
  const lastRunTimes = readLastRunTimes(ctx.now ?? new Date());
  for (const job of jobs) {
    if (ctx.shouldStop?.()) break;
    const now = ctx.now ?? new Date();
    if (!isJobDue(job, lastRunTimes.get(job.name), now)) continue;
    try {
      const work = job.run(ctx);
      // A job that later fails after being left behind has already been
      // counted; its failure is still recorded and logged by the run recorder.
      work.catch(() => {});
      if (await withinLimit(work, timeoutMs) === TIMED_OUT) {
        logger.error('worker: scheduled job exceeded its time limit; moving on', {
          job: job.name,
          limitMs: timeoutMs,
        });
        failed.push(job.name);
        continue;
      }
      ran.push(job.name);
    } catch {
      failed.push(job.name);
    }
    try {
      pruneRuns(job, now);
    } catch (err) {
      logger.error('worker: job-run prune failed', {
        job: job.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { ran, failed };
}

/**
 * The registry jobs that have gone longer than their cadence plus grace
 * without a success. `workerStartedAt` lets a job that has never succeeded
 * count as overdue once the worker has been up long enough; null leaves such a
 * job out.
 */
export function listOverdueJobs(now: Date, workerStartedAt: Date | null): string[] {
  const lastRunTimes = readLastRunTimes(now);
  return JOBS
    .filter((job) => isJobOverdue(job, lastRunTimes.get(job.name), now, workerStartedAt))
    .map((job) => job.name);
}

/**
 * The tick's heartbeat: one warn line carrying the overdue count and names. The
 * missed-run alarm fires when the count stays above zero or the line stops
 * arriving, so the same alarm catches an overdue job and a dead worker.
 */
export function writeJobsHeartbeat(now: Date, workerStartedAt: Date): string[] {
  const overdueJobs = listOverdueJobs(now, workerStartedAt);
  logger.warn('jobs.heartbeat', { overdue: overdueJobs.length, overdueJobs });
  return overdueJobs;
}

/**
 * Jobs frequent enough that their successful runs would crowd every other job
 * out of a recent-runs list; their failures are still listed.
 */
export function listHighFrequencyJobNames(): string[] {
  return JOBS.filter((job) => cadenceMs(job) < HOUR_MS).map((job) => job.name);
}
