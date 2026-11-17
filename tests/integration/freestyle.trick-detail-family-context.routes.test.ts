/**
 * GET /freestyle/tricks/:slug — family-context resolution.
 *
 * The trick-detail family surfaces must agree with the family-view browse by
 * resolving each row to the public family it renders under, not the raw
 * trick_family. Three surfaces are covered:
 *   - the hero family chip (.trick-hero-meta-chip-family),
 *   - the family browse link in Related Tricks (data-family-browse).
 *
 * Behaviors pinned:
 *   1. A derived-branch family resolves to itself: a torque-family compound
 *      shows the Torque family, and the chip href targets it.
 *   2. A family's browse link targets that family, never a sibling or parent
 *      family that would absorb its members.
 *   3. Whirl and swirl resolve to their own separate families.
 *   4. A route-out family (foundational surface / modifier ecosystem) suppresses
 *      the family chip AND the family link — no misleading
 *      "<surface/ecosystem> family".
 *   No trick_family data is overwritten; resolution is the reversible content map.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cachedGet } from '../fixtures/cachedGet';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import { seedStagedFamilies } from '../fixtures/stagedFamilies';
import { insertFreestyleTrick } from '../fixtures/factories';
import { STAGED_FAMILIES } from '../../freestyle/inputs/curator_content/freestyleFamilies';

const familyNote = (slug: string): string => {
  const note = STAGED_FAMILIES.find(f => f.slug === slug)?.trickPageNote;
  if (!note) throw new Error(`the staged ${slug} family carries no trick-page note`);
  return note;
};

const { dbPath } = setTestEnv('3532');

let createApp: Awaited<ReturnType<typeof importApp>>;
const getPage = cachedGet(() => createApp());

const t = (
  slug: string,
  trick_family: string,
  category: 'dex' | 'compound' = 'compound',
) => ({ slug, canonical_name: slug.replace(/-/g, ' '), trick_family, base_trick: trick_family, category, adds: '4', is_active: 1 as const });

beforeAll(async () => {
  const db = createTestDb(dbPath);
  seedStagedFamilies(db);
  const rows = [
    // Osis family + native member
    t('osis', 'osis', 'dex'),
    t('spinning-osis', 'osis'),
    // Torque family (derived branch, resolves to itself) + member. The anchor
    // is stored as the real dictionary stores it: under the osis label, with a
    // curator family override to torque.
    { ...t('torque', 'osis', 'dex'), family_override: 'torque' },
    t('paradox-torque', 'torque'),
    // A third torque member, so the family view gives torque its own page for
    // the browse link to land on.
    t('spinning-torque', 'torque'),
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
  const res = await getPage(`/freestyle/tricks/${slug}`);
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
    // The hero family chip resolves to the branch (Torque), never its Osis
    // parent. Osis surfaces only through the separate branch-to-root
    // "also a member of" note, as an additional-family chip — not a second
    // hero family chip.
    expect(html).toContain('class="trick-also-family-chip" href="/freestyle/tricks?family=osis">Osis family</a>');
  });

  // Defect caught: a branch family's anchor, stored under its parent's label,
  // shows the parent family's paragraph (torque showing the osis note) and
  // never its own. The two notes are read from the staged families the
  // rebuild seeds.
  it('the torque anchor shows the torque family paragraph, and the osis anchor the osis one', async () => {
    const torque = await page('torque');
    expect(torque).toContain(familyNote('torque'));
    expect(torque).not.toContain(familyNote('osis'));
    expect(await page('osis')).toContain(familyNote('osis'));
  });

  // Defect caught: a branch family's trick sends a reader to its parent root's
  // membership, so the Torque tricks appear to belong to Osis.
  it('a torque-family trick and an osis-family trick each link their own family\'s membership', async () => {
    const browse = /<a class="action-link" href="([^"]+)" data-family-browse>/;
    const unescape = (h: string | undefined) => (h ?? '').replace(/&#x3D;/g, '=').replace(/&amp;/g, '&');
    const torqueHref = unescape((await page('paradox-torque')).match(browse)?.[1]);
    const osisHref = unescape((await page('spinning-osis')).match(browse)?.[1]);
    expect(torqueHref).toBe('/freestyle/tricks?view=family&family=torque');
    expect(osisHref).toBe('/freestyle/tricks?view=family&family=osis');
    // Each link lands on a page that renders that family's section.
    expect((await getPage(torqueHref)).text).toContain('id="family-torque"');
    expect((await getPage(osisHref)).text).toContain('id="family-osis"');
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
  it('a foundational-surface family (clipper-stall) shows no family chip and no family link', async () => {
    const html = await page('clipper-stall');
    expect(html).not.toContain('trick-hero-meta-chip-family');
    expect(html).not.toContain('data-family-browse');
  });

  it('a modifier-ecosystem family (pixie) shows no family chip and no family link', async () => {
    const html = await page('big-pixie');
    expect(html).not.toContain('trick-hero-meta-chip-family');
    expect(html).not.toContain('data-family-browse');
  });
});
