/**
 * The scheduling rules every clock-driven job shares: when a job is due, when it
 * is overdue, and how long the worker waits between ticks. Pure functions over a
 * job's timing and the times of its last runs, so the scheduler, the missed-run
 * heartbeat and the admin health page all judge a job by the same arithmetic.
 */

/** How often the worker's scheduler wakes to run whatever is due. */
export const JOB_TICK_MS = 5 * 60 * 1000;

/**
 * How long one job may run before the pass stops waiting for it and moves on.
 * Jobs run one after another, so without a limit a single hung provider call
 * would hold every later job. Ten minutes is well past any job's normal run and
 * inside the missed-run alarm's fifteen-minute window, so one hang alone does
 * not read as a dead scheduler.
 */
export const JOB_TIMEOUT_MS = 10 * 60 * 1000;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// A daily job finishing a little later one day than the day before is normal;
// two hours past its day is a job that did not run.
const DAILY_GRACE_MS = 2 * HOUR_MS;

// An interval job is allowed three missed ticks before it reads as overdue, so a
// slow tick or a restart never trips the alarm on its own.
const INTERVAL_GRACE_MS = 3 * JOB_TICK_MS;

// A failed attempt is retried no sooner than this, or on the job's own cadence
// when that is shorter. Without it a daily job that fails would retry on every
// tick, repeating a provider call and an error alarm every five minutes.
const RETRY_SPACING_MS = HOUR_MS;

/**
 * A daily job runs once per UTC day, on the first tick of a day it has not yet
 * succeeded on. An interval job runs when its last success is older than its
 * interval, which is read when needed so a job can take it from configuration.
 */
export type JobCadence =
  | { kind: 'daily' }
  | { kind: 'interval'; everyMs: () => number };

export interface JobTiming {
  name: string;
  cadence: JobCadence;
}

/** The two times the rules below read from a job's run history. */
export interface LastRunTimes {
  lastSuccessAt: string | null;
  lastStartedAt: string | null;
}

export function cadenceMs(job: JobTiming): number {
  return job.cadence.kind === 'daily' ? DAY_MS : job.cadence.everyMs();
}

function graceMs(job: JobTiming): number {
  return job.cadence.kind === 'daily' ? DAILY_GRACE_MS : INTERVAL_GRACE_MS;
}

/**
 * Whether the job should run on this tick. A job that has never succeeded is
 * due at once; after a failure it waits out the retry spacing. Judged on the
 * last success rather than on the tick count, so after a restart or an outage
 * the first tick runs every job that fell behind.
 */
export function isJobDue(job: JobTiming, last: LastRunTimes | undefined, now: Date): boolean {
  const nowMs = now.getTime();
  const lastSuccessAt = last?.lastSuccessAt ?? null;
  const lastStartedAt = last?.lastStartedAt ?? null;
  // An attempt started after the last success finished did not succeed: it
  // failed, or it is still marked running after a crash.
  const lastAttemptFailed = lastStartedAt !== null
    && (lastSuccessAt === null || lastStartedAt > lastSuccessAt);
  if (lastAttemptFailed
    && nowMs - Date.parse(lastStartedAt) < Math.min(cadenceMs(job), RETRY_SPACING_MS)) {
    return false;
  }
  if (lastSuccessAt === null) return true;
  if (job.cadence.kind === 'daily') {
    return lastSuccessAt.slice(0, 10) < now.toISOString().slice(0, 10);
  }
  return nowMs - Date.parse(lastSuccessAt) >= cadenceMs(job);
}

/**
 * Whether the job has gone longer than its cadence plus its grace without a
 * success. A job that has never succeeded is judged from when the worker
 * started; a caller that cannot know that passes null and gets false, because
 * it reports a never-succeeded job as such already.
 */
export function isJobOverdue(
  job: JobTiming,
  last: LastRunTimes | undefined,
  now: Date,
  workerStartedAt: Date | null,
): boolean {
  const limitMs = cadenceMs(job) + graceMs(job);
  const lastSuccessAt = last?.lastSuccessAt ?? null;
  if (lastSuccessAt === null) {
    return workerStartedAt !== null && now.getTime() - workerStartedAt.getTime() > limitMs;
  }
  return now.getTime() - Date.parse(lastSuccessAt) > limitMs;
}
