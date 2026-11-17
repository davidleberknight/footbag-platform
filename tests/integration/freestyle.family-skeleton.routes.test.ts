/**
 * /freestyle/tricks?view=family — public family browse skeleton.
 *
 * The Family view renders the curated public-display family taxonomy, one
 * family per page (?view=family&family=<slug>):
 *   - Each public family renders as its own top-level id="family-{slug}"
 *     section on its own page, including roots, derived branches and minor
 *     lineages.
 *   - Sub-labels fold INTO the family whose terminal they conserve
 *     (subordinate rows, no top-level sub-label section).
 *   - Route-out labels (modifier ecosystems, alternative surfaces,
 *     foundational surfaces, sparse lineages) do NOT render as families (their
 *     family-view address is a 404) and their rows are skipped entirely.
 *   - Raw trick_family data is never overwritten, so ?family=<slug> filter
 *     URLs (including route-out labels) stay usable.
 *
 * The fixture seeds ≥2 rows per route-out label specifically so that, absent
 * the route-out, the rows.length > 1 filter would have rendered them — proving
 * the suppression is the route-out, not the singleton filter.
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

const { dbPath } = setTestEnv('3531');

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

const trick = (
  slug: string,
  trick_family: string,
  category: 'dex' | 'compound' = 'compound',
) => ({ slug, canonical_name: slug.replace(/-/g, ' '), trick_family, base_trick: trick_family, category, adds: '4', is_active: 1 as const });

beforeAll(async () => {
  const db = createTestDb(dbPath);
  seedStagedFamilies(db);
  // Each public family carries at least three members so it clears the
  // family-view three-member minimum.
  const rows = [
    // ── Osis family: native osis rows ──
    trick('osis', 'osis', 'dex'),
    trick('spinning_osis', 'osis'),

    // ── Torque family: renders as its own family (derived branch) ──
    trick('torque', 'torque', 'dex'),
    trick('spinning_torque', 'torque'),
    trick('gyro_torque', 'torque'),

    // ── Whirl family: native whirl rows ──
    trick('whirl', 'whirl', 'dex'),
    trick('paradox_whirl', 'whirl'),
    trick('ducking_whirl', 'whirl'),

    // ── Swirl family: renders as its own family (separate from whirl) ──
    trick('swirl', 'swirl', 'dex'),
    trick('paradox_swirl', 'swirl'),
    trick('ducking_swirl', 'swirl'),

    // ── twirl: route-out (sparse lineage), ≥2 rows so the singleton
    //    filter is not the reason it hides ──
    trick('twirl', 'twirl'), trick('big_twirl', 'twirl'),

    // ── Route-outs: modifier ecosystems (≥2 rows each) ──
    trick('big_pixie', 'pixie'), trick('lil_pixie', 'pixie'),
    trick('big_fairy', 'fairy'), trick('lil_fairy', 'fairy'),
    trick('big_atomic', 'atomic'), trick('lil_atomic', 'atomic'),
    trick('big_quantum', 'quantum'), trick('lil_quantum', 'quantum'),

    // ── Route-outs: alternative + foundational surfaces (≥2 rows each) ──
    trick('xbss_one', 'cross_body_sole_stall'), trick('xbss_two', 'cross_body_sole_stall'),
    trick('toe_one', 'toe_stall'), trick('toe_two', 'toe_stall'),
    trick('clip_stall_one', 'clipper_stall'), trick('clip_stall_two', 'clipper_stall'),

    // ── Other public families render as their own sections (≥3 rows) ──
    trick('eclipse', 'eclipse', 'dex'), trick('lunar_eclipse', 'eclipse'), trick('solar_eclipse', 'eclipse'),
    trick('drifter', 'drifter', 'dex'), trick('day_drifter', 'drifter'), trick('night_drifter', 'drifter'),
    trick('inside_stall', 'inside_stall', 'dex'), trick('guay', 'inside_stall'), trick('inside_stall_two', 'inside_stall'),
  ];
  for (const r of rows) insertFreestyleTrick(db, r);

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// One family's own page in the family view.
const familyPath = (slug: string) => `/freestyle/tricks?view=family&family=${slug}`;

async function familyView(slug: string): Promise<string> {
  const res = await page(familyPath(slug));
  expect(res.status, slug).toBe(200);
  return res.text;
}

// Every family page the view renders: the bare view's own family plus each
// family its chip row links to, concatenated.
async function everyFamilyPage(): Promise<string> {
  const bare = await page('/freestyle/tricks?view=family');
  expect(bare.status).toBe(200);
  const nav = bare.text.match(/<nav class="jump-bar jump-bar--wide" aria-label="Browse by family">([\s\S]*?)<\/nav>/)?.[1] ?? '';
  const hrefs = [...nav.matchAll(/<a href="([^"]+)">/g)].map(m => m[1]!.replace(/&amp;/g, '&').replace(/&#x3D;/g, '='));
  expect(hrefs.length, 'the chip row links the other rendered families').toBeGreaterThan(0);
  const pages = [bare.text];
  for (const href of hrefs) pages.push((await page(href)).text);
  return pages.join('\n');
}

describe('Family skeleton — public families render top-level', () => {
  it('renders the seeded families (osis, whirl, swirl, torque) as top-level sections', async () => {
    for (const slug of ['osis', 'whirl', 'swirl', 'torque']) {
      expect(await familyView(slug)).toContain(`id="family-${slug}"`);
    }
  });

  it('renders "Whirl" and "Swirl" as separate family headings', async () => {
    const whirl = await familyView('whirl');
    const swirl = await familyView('swirl');
    expect(whirl).toMatch(/<h2><a href="\/freestyle\/tricks\?view=family&amp;family=whirl">Whirl family<\/a><\/h2>/);
    expect(swirl).toMatch(/<h2><a href="\/freestyle\/tricks\?view=family&amp;family=swirl">Swirl family<\/a><\/h2>/);
    // The combined "Whirl / Swirl" name is gone.
    expect(whirl).not.toContain('Whirl / Swirl family');
    expect(swirl).not.toContain('Whirl / Swirl family');
  });
});

describe('Family skeleton — sub-labels fold in, sparse lineages route out', () => {
  it('renders guay under the inside-stall family, with no section of its own', async () => {
    const html = await familyView('inside_stall');
    // guay is an inside-stall family member; it has no top-level section of its own.
    expect(html).toContain('id="family-inside_stall"');
    expect(html).toContain('data-trick-slug="guay"');
    expect(await everyFamilyPage()).not.toContain('id="family-guay"');
    expect((await page(familyPath('guay'))).status).toBe(404);
  });

  it('does NOT render twirl as a family and skips its rows entirely', async () => {
    const html = await everyFamilyPage();
    expect(html, 'twirl must not be a top-level family').not.toContain('id="family-twirl"');
    expect((await page(familyPath('twirl'))).status).toBe(404);
    for (const slug of ['twirl', 'big_twirl']) {
      expect(html, `${slug} must not appear in family view`).not.toContain(`data-trick-slug="${slug}"`);
    }
  });
});

describe('Family skeleton — route-outs do not render as families', () => {
  it('does NOT render modifier-ecosystem families (pixie / fairy / atomic / quantum)', async () => {
    const html = await everyFamilyPage();
    for (const eco of ['pixie', 'fairy', 'atomic', 'quantum']) {
      expect(html, `${eco} must not be a family`).not.toContain(`id="family-${eco}"`);
      expect((await page(familyPath(eco))).status, `${eco} must have no family page`).toBe(404);
    }
  });

  it('does NOT render alternative/foundational surface families (cross-body-sole-stall / toe-stall / clipper-stall)', async () => {
    const html = await everyFamilyPage();
    for (const surf of ['cross_body_sole_stall', 'toe_stall', 'clipper_stall']) {
      expect(html, `${surf} must not be a family`).not.toContain(`id="family-${surf}"`);
      expect((await page(familyPath(surf))).status, `${surf} must have no family page`).toBe(404);
    }
  });

  it('route-out rows are absent from the family view entirely (skipped at bucketing)', async () => {
    const html = await everyFamilyPage();
    // Positive control: a public family's rows do render across the pages.
    expect(html).toContain('data-trick-slug="guay"');
    for (const slug of ['big_pixie', 'toe_one', 'xbss_one', 'big_atomic', 'big_quantum', 'clip_stall_one']) {
      expect(html, `${slug} must not appear in family view`).not.toContain(`data-trick-slug="${slug}"`);
    }
  });
});

describe('Family skeleton — other public families render safely', () => {
  it('renders drifter as a Family Parent page and eclipse as a minor lineage page of its own', async () => {
    const drifter = await familyView('drifter');
    expect(drifter).toContain('id="family-drifter"');
    expect(drifter).toContain('data-trick-slug="day_drifter"');
    // eclipse is a minor lineage: it gets its own family-view page too, and
    // its ?family= route is untouched.
    const eclipse = await familyView('eclipse');
    expect(eclipse).toContain('id="family-eclipse"');
    expect(eclipse).toContain('data-trick-slug="lunar_eclipse"');
  });
});

describe('Family skeleton — old ?family= filter URLs stay usable (data untouched)', () => {
  // The filter reads raw trick_family, which the skeleton never overwrites, so
  // sub-label and route-out URLs still resolve to their rows.
  it.each([
    ['swirl', 'swirl'],                            // public family label
    ['twirl', 'twirl'],                            // route-out label
    ['clipper_stall', 'clip_stall_one'],           // route-out surface label
    ['pixie', 'big_pixie'],                        // route-out ecosystem label
  ])('?family=%s returns 200 and still lists its rows', async (family, sampleSlug) => {
    const res = await page(`/freestyle/tricks?family=${family}`);
    expect(res.status).toBe(200);
    expect(res.text, `?family=${family} should list ${sampleSlug}`).toContain(`data-trick-slug="${sampleSlug}"`);
  });
});
