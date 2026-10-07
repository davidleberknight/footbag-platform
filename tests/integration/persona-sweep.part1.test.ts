/**
 * Persona sweep, first third of the catalog: every persona signed in through
 * the persona switch, its own and its role's pages walked and checked by the
 * crawl oracles. The shared runner explains what is walked and why; the
 * catalog is split across three files only so vitest runs them in parallel.
 */
import { describe, it } from 'vitest';
import { runSweepPart } from '../fixtures/crawl/sweepSuite';

describe('persona sweep (part 1 of 3)', () => {
  it('every persona in this part renders its pages without a crawl finding', async () => {
    await runSweepPart(0);
  }, 300_000);
});
