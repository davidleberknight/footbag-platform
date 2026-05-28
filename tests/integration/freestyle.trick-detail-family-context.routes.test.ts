/**
 * GET /freestyle/tricks/:slug — family-context resolution (Phase C F1/F2).
 *
 * The trick-detail family surfaces must agree with the family-view browse by
 * applying the parent-family skeleton (freestyleParentFamilies.ts) instead of
 * the raw trick_family. Three surfaces are covered:
 *   - the hero family chip (.trick-hero-meta-chip-family),
 *   - the family-lineage ladder section (.trick-family-lineage),
 *   - the family-anchor callout.
 *
 * Behaviors pinned:
 *   1. A child label folds to its parent: a torque-family compound shows the
 *      Osis family, not a "Torque family"; the chip href targets the parent.
 *   2. The parent ladder includes its folded children (consistent ladder on
 *      parent and child pages).
 *   3. The combined parent carries the "Whirl / Swirl" display name.
 *   4. A route-out family (foundational surface / modifier ecosystem) suppresses
 *      the family chip AND the family-lineage section — no misleading
 *      "<surface/ecosystem> family".
 *   No trick_family data is overwritten; resolution is the reversible content map.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3532');

let createApp: Awaited<ReturnType<typeof importApp>>;

const t = (
  slug: string,
  trick_family: string,
  category: 'dex' | 'compound' = 'compound',
) => ({ slug, canonical_name: slug.replace(/-/g, ' '), trick_family, base_trick: trick_family, category, adds: '4', is_active: 1 as const });

beforeAll(async () => {
  const db = createTestDb(dbPath);
  const rows = [
    // Osis parent + native child + folded torque-label child
    t('osis', 'osis', 'dex'),
    t('spinning-osis', 'osis'),
    t('paradox-torque', 'torque'),   // child label torque → folds into osis
    // Whirl / Swirl parent + folded swirl-label child
    t('whirl', 'whirl', 'dex'),
    t('paradox-whirl', 'whirl'),
    t('swirl', 'swirl', 'dex'),       // child label swirl → folds into whirl
    // Route-outs (≥2 each so a singleton filter wouldn't be the reason they hide)
    t('clipper-stall', 'clipper-stall', 'dex'),
    t('reaper', 'clipper-stall'),
    t('big-pixie', 'pixie'),
    t('lil-pixie', 'pixie'),
  ];
  for (const r of rows) insertFreestyleTrick(db, r);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

async function page(slug: string): Promise<string> {
  const res = await request(await createApp()).get(`/freestyle/tricks/${slug}`);
  expect(res.status).toBe(200);
  return res.text;
}

const familyChip = /class="trick-hero-meta-chip trick-hero-meta-chip-family"[^>]*href="(\/freestyle\/tricks\?family=[a-z-]+)"[^>]*>([^<]+)</;

describe('Trick-detail family context — child labels fold to their parent', () => {
  it('a torque-family compound shows the Osis family chip (not "Torque family")', async () => {
    const html = await page('paradox-torque');
    const m = html.match(familyChip);
    expect(m, 'family chip present').not.toBeNull();
    expect(m![1]).toBe('/freestyle/tricks?family=osis');
    expect(m![2]).toBe('Osis family');
    expect(html).not.toContain('>Torque family<');
  });

  it('the Osis parent ladder includes its folded torque-label child', async () => {
    const html = await page('osis');
    expect(html).toContain('trick-family-lineage');
    // Ladder members render as detail links within the lineage section.
    expect(html).toContain('href="/freestyle/tricks/paradox-torque"');
    expect(html).toContain('href="/freestyle/tricks/spinning-osis"');
  });

  it('the combined parent carries the "Whirl / Swirl" display name', async () => {
    const whirl = await page('whirl');
    expect(whirl.match(familyChip)![2]).toBe('Whirl / Swirl family');
    // The folded swirl child shows the same parent chip.
    const swirl = await page('swirl');
    const m = swirl.match(familyChip)!;
    expect(m[1]).toBe('/freestyle/tricks?family=whirl');
    expect(m[2]).toBe('Whirl / Swirl family');
  });
});

describe('Trick-detail family context — route-outs suppress the family surfaces', () => {
  it('a foundational-surface family (clipper-stall) shows no family chip and no lineage section', async () => {
    const html = await page('clipper-stall');
    expect(html).not.toContain('trick-hero-meta-chip-family');
    expect(html).not.toContain('trick-family-lineage');
  });

  it('a modifier-ecosystem family (pixie) shows no family chip and no lineage section', async () => {
    const html = await page('big-pixie');
    expect(html).not.toContain('trick-hero-meta-chip-family');
    expect(html).not.toContain('trick-family-lineage');
  });
});
