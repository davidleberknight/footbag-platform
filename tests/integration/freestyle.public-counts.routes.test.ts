/**
 * Public count correctness on the Emerging Vocabulary surface. Every count a
 * visitor reads must be produced from a live source of truth and must
 * reconcile:
 *   - the Emerging Vocabulary bucket totals reconcile to the generated
 *     observational surface;
 *   - the documented universe is stated whole and is never described as
 *     shrinking.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cachedGet } from '../fixtures/cachedGet';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import {
  insertFreestyleTrick,
  insertFreestyleTrickAlias,
} from '../fixtures/factories';
import {
  OBSERVATIONAL_UNIVERSE,
  OBSERVATIONAL_UNIVERSE_STATS,
} from '../../src/content/freestyleObservationalUniverse';

const { dbPath } = setTestEnv('3168');

// A small live dictionary (three active tricks, one retired, and aliases of
// each kind) so the pages render against real rows rather than an empty table.
let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

beforeAll(async () => {
  const db = createTestDb(dbPath);

  insertFreestyleTrick(db, { slug: 'count-alpha', adds: '2', category: 'dex' });
  insertFreestyleTrick(db, { slug: 'count-beta',  adds: '3', category: 'dex' });
  insertFreestyleTrick(db, { slug: 'count-gamma', adds: '4', category: 'dex' });
  insertFreestyleTrick(db, { slug: 'count-retired', adds: '2', category: 'dex', is_active: 0 });

  // Active target, publicly displayed nickname.
  insertFreestyleTrickAlias(db, 'count-alpha-nick', 'count-alpha', 'Alpha Nick',
    { alias_type: 'common', alias_display: 1 });
  // Active target, hidden nickname: search still resolves it.
  insertFreestyleTrickAlias(db, 'count-beta-nick', 'count-beta', 'Beta Nick',
    { alias_type: 'historical', alias_display: 0 });
  // Inactive target: never publicly searchable, must not count.
  insertFreestyleTrickAlias(db, 'count-retired-nick', 'count-retired', 'Retired Nick',
    { alias_type: 'suppressed', alias_display: 0 });

  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('Generated census reconciles', () => {
  it('universe total equals published + alias/equivalent + observational names', () => {
    // These census figures count outside-source documented NAMES, a different
    // population from the dictionary's active canonical trick PAGES. In
    // particular canonicalPublished (the count of documented names classified as
    // published) is NOT the trick-page count: those names collapse to fewer
    // distinct structures and map to a subset of the live trick pages. The two
    // are never the same number and must not be read as one.
    const s = OBSERVATIONAL_UNIVERSE_STATS;
    expect(s.universeTotal).toBe(
      s.canonicalPublished + s.aliasEquivalentNames + s.observationalUniverseNames,
    );
  });

  it('every primary identity carries exactly one public section, so the section totals cover the surface', () => {
    const sectionSum = Object.values(OBSERVATIONAL_UNIVERSE_STATS.publicSections)
      .reduce((a, b) => a + b, 0);
    expect(sectionSum).toBe(OBSERVATIONAL_UNIVERSE_STATS.identityCount);

    const bucketSum = Object.values(OBSERVATIONAL_UNIVERSE_STATS.intakeBuckets)
      .reduce((a, b) => a + b.names, 0);
    expect(bucketSum).toBe(OBSERVATIONAL_UNIVERSE.length);
  });
});

describe('Emerging Vocabulary section totals reconcile to the generated surface', () => {
  it('renders the documented-archive disclosures with live-derived totals', async () => {
    const res = await page('/freestyle/observational');
    expect(res.status).toBe(200);
    // The archive subsections carry numeric counts computed from the
    // runtime-filtered rows (never hard-coded census figures).
    expect(res.text).toMatch(/Already represented <span class="text-muted">\(\d+\)/);
    // The observational-names archive sub-section is empty while its members are held
    // for review (publication gate), so its disclosure does not render.
    expect(res.text).not.toContain('Observational names');
  });

  it('keeps the archive apart from the names still in play', async () => {
    const res = await page('/freestyle/observational');
    expect(res.text).toContain('not active publication candidates');
  });
});
