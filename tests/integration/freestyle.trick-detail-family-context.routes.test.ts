/**
 * GET /freestyle/tricks/:slug — family-context resolution.
 *
 * The trick-detail family surfaces must agree with the family-view browse by
 * resolving each row to the public family it renders under, not the raw
 * trick_family. Three surfaces are covered:
 *   - the hero family chip (.trick-hero-meta-chip-family),
 *   - the family-lineage ladder section (.trick-family-lineage),
 *   - the family-anchor callout.
 *
 * Behaviors pinned:
 *   1. A derived-branch family resolves to itself: a torque-family compound
 *      shows the Torque family, and the chip href targets it.
 *   2. A family ladder includes its own members (consistent ladder on family
 *      and member pages) and does not absorb a sibling family's members.
 *   3. Whirl and swirl resolve to their own separate families.
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
    // Osis family + native member
    t('osis', 'osis', 'dex'),
    t('spinning-osis', 'osis'),
    // Torque family (derived branch, resolves to itself) + member
    t('torque', 'torque', 'dex'),
    t('paradox-torque', 'torque'),
    // Whirl family + member
    t('whirl', 'whirl', 'dex'),
    t('paradox-whirl', 'whirl'),
    // Swirl family (separate from whirl) + member
    t('swirl', 'swirl', 'dex'),
    t('paradox-swirl', 'swirl'),
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

describe('Trick-detail family context — families resolve to themselves', () => {
  it('a torque-family compound shows the Torque family chip', async () => {
    const html = await page('paradox-torque');
    const m = html.match(familyChip);
    expect(m, 'family chip present').not.toBeNull();
    expect(m![1]).toBe('/freestyle/tricks?family=torque');
    expect(m![2]).toBe('Torque family');
    expect(html).not.toContain('>Osis family<');
  });

  it('the Torque family ladder includes its members and the Osis ladder does not absorb them', async () => {
    const torque = await page('torque');
    expect(torque).toContain('trick-family-lineage');
    // Ladder members render as detail links within the lineage section.
    expect(torque).toContain('href="/freestyle/tricks/paradox-torque"');
    // The osis ladder lists its own members, not the torque-label rows.
    const osis = await page('osis');
    expect(osis).toContain('href="/freestyle/tricks/spinning-osis"');
    expect(osis).not.toContain('href="/freestyle/tricks/paradox-torque"');
  });

  it('whirl and swirl resolve to their own separate families', async () => {
    const whirl = await page('whirl');
    const wm = whirl.match(familyChip)!;
    expect(wm[1]).toBe('/freestyle/tricks?family=whirl');
    expect(wm[2]).toBe('Whirl family');
    const swirl = await page('swirl');
    const sm = swirl.match(familyChip)!;
    expect(sm[1]).toBe('/freestyle/tricks?family=swirl');
    expect(sm[2]).toBe('Swirl family');
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
