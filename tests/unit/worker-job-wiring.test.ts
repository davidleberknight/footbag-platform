/**
 * Every scheduled job must actually be invoked by the worker's daily tick.
 *
 * The job bodies are covered by their own integration suites, but nothing
 * verified that the worker calls them. A job can be fully implemented, fully
 * tested, and simply never run, and no test would notice: the suite would stay
 * green while the work silently never happened in production. Reconciliation is
 * the case that prompted this, but the gap applied to every job on the tick.
 *
 * This reads the worker source rather than executing it, because the worker's
 * loops run forever, open a listening socket, and hold a database connection.
 * A source-level check is a coarse instrument, but the failure it guards against
 * is coarse too: a job that is never mentioned is a job that never runs.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const workerSource = readFileSync(join(process.cwd(), 'src', 'worker.ts'), 'utf8');

/** Entry points the daily tick is responsible for calling. */
const DAILY_TICK_JOBS = [
  'runActivePlayerExpiryCheck',
  'runStagedCandidateExpiry',
  'runPiiPurgeScan',
  'runHashtagStatsRebuild',
  'runAdminQueueDigest',
  'runStaleQueueEscalation',
  'runPaymentReconciliation',
  'runReconciliationDigest',
  'runReconciliationIssuePurge',
] as const;

describe('worker daily tick', () => {
  it.each(DAILY_TICK_JOBS)('invokes %s', (job) => {
    expect(
      workerSource.includes(`operationsPlatformService.${job}(`),
      `src/worker.ts never calls ${job}, so that job would never run in production `
        + 'however well its own tests pass.',
    ).toBe(true);
  });

  it('drains the notification feeds, and cuts the poll short at shutdown', () => {
    // The feed poll holds its connection open waiting for a message, so a loop
    // that is never started reads no bounce and no alarm while looking healthy,
    // and one that is never aborted is still waiting when the database closes
    // underneath it.
    expect(
      workerSource.includes('operationsPlatformService.runNotificationFeeds('),
      'src/worker.ts never drains the notification feeds, so bounces would never reach '
        + 'the suppression record and alarms would never reach the admin surface.',
    ).toBe(true);
    expect(
      workerSource.includes('feedPollAbort.abort()'),
      'shutdown never aborts the feed poll, so a stop arriving mid-wait leaves the poll '
        + 'running against a database that has been closed.',
    ).toBe(true);
  });

  it('guards each job separately so one failure cannot cancel the rest of the tick', () => {
    // A single try/catch around the whole tick would let the first failing job
    // silently skip every job after it, on every run, until someone noticed.
    const tryBlocks = workerSource.match(/try \{/g) ?? [];
    expect(tryBlocks.length).toBeGreaterThanOrEqual(DAILY_TICK_JOBS.length);
  });

  it('logs a job failure at a level production shows', () => {
    // Production runs at the warn level, so an info-level failure line would be
    // dropped and the failure would be invisible.
    expect(workerSource).toContain('logger.error(\'worker:');
    expect(workerSource).not.toMatch(/logger\.info\('worker:[^']*unexpected error/);
  });
});
