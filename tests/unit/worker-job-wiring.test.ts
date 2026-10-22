/**
 * The worker must actually run the job registry and write the missed-run
 * heartbeat, and must drain the notification feeds.
 *
 * The job bodies are covered by their own integration suites, and the registry
 * suite proves every recorded job is declared there and runs from one pass. What
 * nothing else verifies is that the worker calls that pass at all: without it
 * every job is implemented, tested and never run, and without the heartbeat the
 * missed-run alarm reads a dead scheduler as a missing line it cannot tell from
 * a quiet one.
 *
 * This reads the worker source rather than executing it, because the worker's
 * loops run forever, open a listening socket, and hold a database connection.
 * A source-level check is a coarse instrument, but the failure it guards against
 * is coarse too: a pass that is never mentioned is a pass that never runs.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const workerSource = readFileSync(join(process.cwd(), 'src', 'worker.ts'), 'utf8');

describe('worker scheduled-jobs loop', () => {
  it('runs the job registry on every tick and writes the heartbeat', () => {
    expect(
      workerSource.includes('runDueJobs('),
      'src/worker.ts never runs the job registry, so no scheduled job would run in production.',
    ).toBe(true);
    expect(
      workerSource.includes('writeJobsHeartbeat('),
      'src/worker.ts never writes the jobs heartbeat, so the missed-run alarm would read a '
        + 'healthy scheduler as a dead one.',
    ).toBe(true);
  });

  it('starts the loop and hands it the media-lease reclaim', () => {
    expect(workerSource).toContain('scheduledJobsLoop(transcodeServer.reapExpiredProcessing)');
  });

  it('waits for the running loops, bounded, before it closes the database at shutdown', () => {
    // Closing the database at once fails the write an in-flight job makes when
    // its provider call returns, leaving its run row marked running and a sent
    // message unrecorded.
    const shutdownBody = workerSource.slice(workerSource.indexOf('async function shutdown('));
    const waitAt = shutdownBody.indexOf('Promise.allSettled(loops)');
    const closeAt = shutdownBody.indexOf('checkpointAndCloseDatabase()');
    expect(waitAt, 'shutdown never waits for the loops').toBeGreaterThan(-1);
    expect(closeAt, 'shutdown never closes the database').toBeGreaterThan(-1);
    expect(waitAt, 'the database is closed before the loops are waited for').toBeLessThan(closeAt);
    expect(shutdownBody).toContain('SHUTDOWN_WAIT_MS');
    // A sleeping loop must wake at shutdown, or the wait would sit out a tick.
    expect(workerSource).toContain('stopSignal.abort()');
  });

  it('names no job itself, so the registry stays the one place a job is declared', () => {
    // A job called directly from the worker would run outside the due check,
    // the pruning and the heartbeat.
    expect(workerSource).not.toMatch(/operationsPlatformService\.run(?!EmailWorker|NotificationFeeds)\w+\(/);
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

  it('logs a job failure at a level production shows', () => {
    // Production runs at the warn level, so an info-level failure line would be
    // dropped and the failure would be invisible.
    expect(workerSource).toContain('logger.error(\'worker:');
    expect(workerSource).not.toMatch(/logger\.info\('worker:[^']*unexpected error/);
  });
});
