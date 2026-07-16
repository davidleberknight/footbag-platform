/**
 * Public count correctness across the Dictionary and Emerging Vocabulary
 * surfaces. Every count a visitor reads must be produced from a live
 * source of truth and must reconcile:
 *   - the Dictionary summary reports active canonical trick pages, the
 *     public-searchable nickname count from the alias table, and the
 *     documented trick-name universe from the generated census;
 *   - the searchable-nickname count is every alias whose target trick is
 *     active, regardless of the display gate, and excludes inactive-target
 *     aliases;
 *   - the Emerging Vocabulary bucket totals reconcile to the generated
 *     observational surface;
 *   - the documented universe is stated whole and is never described as
 *     shrinking, and the retired "no real move is left out" copy is gone.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

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

const fmt = (n: number): string => n.toLocaleString('en-US');

// Three active canonical tricks (plain slugs resolve to trick-kind), one
// inactive trick used only as an alias target. Aliases: one active-target
// displayed, one active-target hidden, one inactive-target hidden. Public
// search resolves the two active-target aliases and never the inactive one,
// so the searchable-nickname count is 2.
const ACTIVE_CANONICAL = 3;
const SEARCHABLE_ALIASES = 2;

let createApp: Awaited<ReturnType<typeof importApp>>;

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

describe('Dictionary summary counts are source-of-truth driven', () => {
  it('reports active pages, searchable nicknames, and the documented universe from live sources', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks');
    expect(res.status).toBe(200);
    const html = res.text;

    // Active canonical trick pages (the DB-derived count).
    expect(html).toContain(`${fmt(ACTIVE_CANONICAL)} have one`);
    // Public-searchable aliases = active-target aliases (display-gate blind),
    // excluding the inactive-target alias. "Aliases and alternate names" is the
    // honest label: the count spans nicknames, abbreviations, spelling variants,
    // historical names, and hidden search/redirect forms, not just nicknames.
    expect(html).toContain(`through ${fmt(SEARCHABLE_ALIASES)} aliases and alternate names`);
    // Documented trick-name universe = the generated census, stated whole.
    expect(html).toContain(`spans ${fmt(OBSERVATIONAL_UNIVERSE_STATS.universeTotal)} names`);
  });

  it('preserves the historical universe wording and drops the retired copy', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks');
    const html = res.text;
    expect(html).toContain('preserved as names resolve');
    expect(html).toContain('only the unresolved work surface shrinks');
    // Retired / misleading copy must not return.
    expect(html).not.toContain('no real move is left out');
    expect(html).not.toContain('trick names in all');
  });
});

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
    const res = await request(await createApp()).get('/freestyle/observational');
    expect(res.status).toBe(200);
    // The archive subsections carry numeric counts computed from the
    // runtime-filtered rows (never hard-coded census figures).
    expect(res.text).toMatch(/Already represented <span class="text-muted">\(\d+\)/);
    // The observational-names archive sub-section is empty while its members are held
    // for review (publication gate), so its disclosure does not render.
    expect(res.text).not.toContain('Observational names');
  });

  it('frames itself as the active decision surface plus the resolved archive', async () => {
    const res = await request(await createApp()).get('/freestyle/observational');
    const html = res.text;
    expect(html).toContain('Nothing here duplicates a published canonical trick');
    expect(html).toContain('not active publication candidates');
  });
});
