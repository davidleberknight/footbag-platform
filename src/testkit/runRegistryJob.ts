/**
 * Runs one scheduled job now, on development and staging, through its own
 * job-registry entry.
 *
 * A scheduled job's outcome is otherwise unobservable on a running stack until
 * its schedule comes round: the worker runs a daily job on the first tick of the
 * UTC day and an interval job once its interval passes, so on a stack whose
 * worker already ran today nothing a tester or a persona seed does makes the job
 * due again. This is the established on-demand run of a scheduled job (a CronJob
 * started by hand, a test draining a queue): the same entry the scheduler calls,
 * through the same run recorder, so the run leaves a true `system_job_runs` row
 * stamped at the time it ran and its failure is recorded as a failure.
 *
 * At the real current time a run does only what the scheduler's next due tick
 * would do over the same data. The time is the injected `now` only where a test
 * owns its database; a shared stack's clock is never moved, because a run row
 * stamped in the future would hold the scheduler off its real schedule.
 *
 * Refuses production. The production image is built without the testkit, and
 * this check stands behind that so a mis-built image still cannot run a job off
 * its schedule there.
 */
import { config } from '../config/env';
import { JOBS, type JobContext } from '../services/jobRegistry';

export type RunRegistryJobResult =
  | { status: 'ran'; job: string; result: unknown }
  | { status: 'failed'; job: string; error: string };

export class RegistryJobRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegistryJobRefusedError';
  }
}

export interface RunRegistryJobOpts {
  /** A fixed clock, for a test that owns its database. */
  now?: Date;
  /** The media-lease reclaim, which only the worker process holds. */
  reapExpiredMediaJobs?: JobContext['reapExpiredMediaJobs'];
}

export async function runRegistryJobNow(
  name: string,
  opts: RunRegistryJobOpts = {},
): Promise<RunRegistryJobResult> {
  if (config.footbagEnv === 'production') {
    throw new RegistryJobRefusedError('A scheduled job is never run on demand in production.');
  }
  const job = JOBS.find((j) => j.name === name);
  if (!job) {
    throw new RegistryJobRefusedError(`No scheduled job named ${name} is in the job registry.`);
  }
  const ctx: JobContext = {
    now: opts.now,
    reapExpiredMediaJobs: opts.reapExpiredMediaJobs ?? (async () => {
      throw new Error('The media-lease reclaim runs only in the worker process.');
    }),
  };
  try {
    return { status: 'ran', job: name, result: await job.run(ctx) };
  } catch (err) {
    // The run recorder has already marked the run failed and logged it.
    return { status: 'failed', job: name, error: err instanceof Error ? err.message : String(err) };
  }
}
