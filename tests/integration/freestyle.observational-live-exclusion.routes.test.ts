/**
 * Emerging Vocabulary live publication gate: the observational universe is a pure
 * CSV artifact and carries every documented name, including ones already published
 * or aliased in the database. The rendered surface excludes any candidate whose
 * name is a db-tracked trick (any status) or a registered alias, applied at
 * request time so an in-app edit takes effect immediately, and every frontier
 * count is recomputed from the filtered rows.
 *
 * Pins: active-canonical exclusion, alias exclusion, hyphen/underscore slug
 * normalization at the comparison boundary, an unaffected control row, and the
 * "Ready for curation" tile recomputed from the runtime-filtered universe.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertFreestyleTrick, insertFreestyleTrickAlias } from '../fixtures/factories';
import { OBSERVATIONAL_UNIVERSE } from '../../src/content/freestyleObservationalUniverse';

const { dbPath } = setTestEnv('3121');
let createApp: Awaited<ReturnType<typeof importApp>>;

// Comparison key mirrors the service: alphanumeric-only, so a hyphen candidate
// slug and an underscore database slug collapse to the same key.
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// Pick real candidates from the generated universe so the test tracks the module.
const READY = OBSERVATIONAL_UNIVERSE.filter(c => c.evState === 'ready');
const EXCLUDED_ACTIVE = READY[0];                                  // excluded via active trick
const CONTROL = READY[1];                                         // unaffected control (ready, unseeded)
const EXCLUDED_ALIAS = OBSERVATIONAL_UNIVERSE.find(c =>            // excluded via alias (non-ready)
  c.evState !== 'ready' && c.slug !== EXCLUDED_ACTIVE?.slug && /[a-z]/i.test(c.name));

beforeAll(async () => {
  const db = createTestDb(dbPath);
  // Active canonical trick whose underscore slug matches the hyphen candidate
  // slug once normalized: proves active-canonical exclusion + slug normalization.
  insertFreestyleTrick(db, {
    slug: EXCLUDED_ACTIVE.slug.replace(/-/g, '_'),
    canonical_name: EXCLUDED_ACTIVE.name, adds: '2', category: 'dex',
    review_status: 'expert_reviewed', is_active: 1,
  });
  // A canonical trick to be the alias target, with a slug that is NOT a candidate.
  insertFreestyleTrick(db, {
    slug: 'zzz_alias_target', canonical_name: 'ZZZ Alias Target', adds: '2',
    category: 'dex', review_status: 'expert_reviewed', is_active: 1,
  });
  // An alias whose slug matches another candidate: proves alias exclusion.
  insertFreestyleTrickAlias(db, EXCLUDED_ALIAS!.slug.replace(/-/g, '_'), 'zzz_alias_target', EXCLUDED_ALIAS!.name);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/observational — live publication exclusion', () => {
  it('excludes a candidate now published as an active canonical trick (slug normalized)', async () => {
    const res = await request(await createApp()).get('/freestyle/observational');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain(EXCLUDED_ACTIVE.name);
  });

  it('excludes a candidate now registered as an alias', async () => {
    const res = await request(await createApp()).get('/freestyle/observational');
    expect(res.text).not.toContain(EXCLUDED_ALIAS!.name);
  });

  it('still renders an unaffected control candidate', async () => {
    const res = await request(await createApp()).get('/freestyle/observational');
    expect(res.text).toContain(CONTROL.name);
  });
});

describe('observational counts recomputed from the runtime-filtered universe', () => {
  it('the Ready-for-curation tile equals the filtered ready count, not the baked census', async () => {
    const { freestyleService } = await import('../../src/services/freestyleService');
    const vm = freestyleService.getObservationalLayerPage();
    const publishedKeys = new Set([
      key(EXCLUDED_ACTIVE.slug), key('zzz_alias_target'), key(EXCLUDED_ALIAS!.slug),
    ]);
    const expectedReady = READY.filter(c => !publishedKeys.has(key(c.slug))).length;
    const readyTile = vm.content.stats.find(s => s.label === 'Ready for curation');
    expect(readyTile).toBeDefined();
    expect(readyTile!.value).toBe(String(expectedReady));
    // The seeded active-canonical candidate was a ready row, so the filtered
    // count is strictly below the raw census (proving at least one live exclusion).
    expect(expectedReady).toBeLessThan(READY.length);
  });
});
