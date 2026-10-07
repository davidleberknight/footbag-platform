/**
 * One persona-sweep part as a test body: boots the crawl fixture in this
 * file's own database, sweeps this part's share of the catalog, and fails with
 * every finding no exemption covers.
 *
 * Importing this module prepares the environment, so a part file imports it
 * before anything boots the app; each part file owns its own temp database.
 */
import { expect, vi } from 'vitest';
import { cleanupTestDb, importApp } from '../testDb';
import { supertestFetcher } from './core';
import { canariesFor } from './canaries';
import { applyFindingExemptions, CRAWL_FINDING_EXEMPTIONS, SWEEP_FINDING_EXEMPTIONS } from './exemptions';
import { personasForPart, sweepPersonas } from './personaSweep';
import { prepareCrawlEnv, seedCrawlFixture, teardownCrawlFixture } from './seedCrawlFixture';

export const SWEEP_PARTS = 3;

const env = prepareCrawlEnv('3590');

export async function runSweepPart(part: number): Promise<void> {
  try {
    const fixture = await seedCrawlFixture(env);
    const createApp = await importApp();
    const { logger } = await import('../../../src/config/logger');
    const loggedErrorCount = () => (vi.isMockFunction(logger.error) ? vi.mocked(logger.error).mock.calls.length : 0);
    const personas = personasForPart(part, SWEEP_PARTS);
    const result = await sweepPersonas(personas, supertestFetcher(createApp()), {
      selfOrigin: 'http://localhost:3590', canaries: canariesFor(fixture.canaries), loggedErrorCount,
    });
    expect(result.swept.length, 'this part swept no persona').toBeGreaterThan(0);
    // Staleness of the shared exemptions is judged by the full crawls, which
    // reach every page they name; a part sees only its personas' share.
    const { open } = applyFindingExemptions(result.findings, [...CRAWL_FINDING_EXEMPTIONS, ...SWEEP_FINDING_EXEMPTIONS]);
    expect(open, `persona sweep findings (deep-walked: ${result.deepened.join(', ')})`).toEqual([]);
  } finally {
    await teardownCrawlFixture(env);
    cleanupTestDb(env.dbPath);
  }
}
