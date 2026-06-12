/**
 * /freestyle/tricks?view=family — public family browse skeleton.
 *
 * The Family view renders the curated public-display family taxonomy:
 *   - Each public family renders as its own top-level id="family-{slug}"
 *     section, including roots and derived branches.
 *   - Sub-labels fold INTO the family whose terminal they conserve
 *     (subordinate rows, no top-level sub-label section).
 *   - Route-out labels (modifier ecosystems, alternative surfaces,
 *     foundational surfaces, sparse lineages) do NOT render as families and
 *     their rows are skipped entirely.
 *   - Raw trick_family data is never overwritten, so ?family=<slug> filter
 *     URLs (including route-out labels) stay usable.
 *
 * The fixture seeds ≥2 rows per route-out label specifically so that, absent
 * the route-out, the rows.length > 1 filter would have rendered them — proving
 * the suppression is the route-out, not the singleton filter.
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

const { dbPath } = setTestEnv('3531');

let createApp: Awaited<ReturnType<typeof importApp>>;

const trick = (
  slug: string,
  trick_family: string,
  category: 'dex' | 'compound' = 'compound',
) => ({ slug, canonical_name: slug.replace(/-/g, ' '), trick_family, base_trick: trick_family, category, adds: '4', is_active: 1 as const });

beforeAll(async () => {
  const db = createTestDb(dbPath);

  const rows = [
    // ── Osis family: native osis rows ──
    trick('osis', 'osis', 'dex'),
    trick('spinning-osis', 'osis'),

    // ── Torque family: renders as its own family (derived branch) ──
    trick('torque', 'torque', 'dex'),
    trick('spinning-torque', 'torque'),

    // ── Whirl family: native whirl rows ──
    trick('whirl', 'whirl', 'dex'),
    trick('paradox-whirl', 'whirl'),

    // ── Swirl family: renders as its own family (separate from whirl) ──
    trick('swirl', 'swirl', 'dex'),
    trick('paradox-swirl', 'swirl'),

    // ── twirl: route-out (sparse lineage), ≥2 rows so the singleton
    //    filter is not the reason it hides ──
    trick('twirl', 'twirl'), trick('big-twirl', 'twirl'),

    // ── Route-outs: modifier ecosystems (≥2 rows each) ──
    trick('big-pixie', 'pixie'), trick('lil-pixie', 'pixie'),
    trick('big-fairy', 'fairy'), trick('lil-fairy', 'fairy'),
    trick('big-atomic', 'atomic'), trick('lil-atomic', 'atomic'),
    trick('big-quantum', 'quantum'), trick('lil-quantum', 'quantum'),

    // ── Route-outs: alternative + foundational surfaces (≥2 rows each) ──
    trick('xbss-one', 'cross-body-sole-stall'), trick('xbss-two', 'cross-body-sole-stall'),
    trick('toe-one', 'toe-stall'), trick('toe-two', 'toe-stall'),
    trick('clip-stall-one', 'clipper-stall'), trick('clip-stall-two', 'clipper-stall'),

    // ── Other public families render as their own sections (≥2 rows) ──
    trick('eclipse', 'eclipse', 'dex'), trick('lunar-eclipse', 'eclipse'),
    trick('drifter', 'drifter', 'dex'), trick('day-drifter', 'drifter'),
    trick('inside-stall', 'inside-stall', 'dex'), trick('guay', 'guay'),
  ];
  for (const r of rows) insertFreestyleTrick(db, r);

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

async function familyView(): Promise<string> {
  const res = await request(await createApp()).get('/freestyle/tricks?view=family');
  expect(res.status).toBe(200);
  return res.text;
}

describe('Family skeleton — public families render top-level', () => {
  it('renders the seeded families (osis, whirl, swirl, torque) as top-level sections', async () => {
    const html = await familyView();
    expect(html).toContain('id="family-osis"');
    expect(html).toContain('id="family-whirl"');
    expect(html).toContain('id="family-swirl"');
    expect(html).toContain('id="family-torque"');
  });

  it('renders "Whirl" and "Swirl" as separate family headings', async () => {
    const html = await familyView();
    expect(html).toMatch(/<h2><a href="\/freestyle\/tricks\?family=whirl">Whirl family<\/a><\/h2>/);
    expect(html).toMatch(/<h2><a href="\/freestyle\/tricks\?family=swirl">Swirl family<\/a><\/h2>/);
    // The combined "Whirl / Swirl" name is gone.
    expect(html).not.toContain('Whirl / Swirl family');
  });
});

describe('Family skeleton — sub-labels fold in, sparse lineages route out', () => {
  it('renders the guay sub-label rows nested under the inside-stall family', async () => {
    const html = await familyView();
    // guay folds into inside-stall; it has no top-level section of its own.
    expect(html).toContain('id="family-inside-stall"');
    expect(html).not.toContain('id="family-guay"');
    expect(html).toContain('data-trick-slug="guay"');
  });

  it('does NOT render twirl as a family and skips its rows entirely', async () => {
    const html = await familyView();
    expect(html, 'twirl must not be a top-level family').not.toContain('id="family-twirl"');
    for (const slug of ['twirl', 'big-twirl']) {
      expect(html, `${slug} must not appear in family view`).not.toContain(`data-trick-slug="${slug}"`);
    }
  });
});

describe('Family skeleton — route-outs do not render as families', () => {
  it('does NOT render modifier-ecosystem families (pixie / fairy / atomic / quantum)', async () => {
    const html = await familyView();
    for (const eco of ['pixie', 'fairy', 'atomic', 'quantum']) {
      expect(html, `${eco} must not be a family`).not.toContain(`id="family-${eco}"`);
    }
  });

  it('does NOT render alternative/foundational surface families (cross-body-sole-stall / toe-stall / clipper-stall)', async () => {
    const html = await familyView();
    for (const surf of ['cross-body-sole-stall', 'toe-stall', 'clipper-stall']) {
      expect(html, `${surf} must not be a family`).not.toContain(`id="family-${surf}"`);
    }
  });

  it('route-out rows are absent from the family view entirely (skipped at bucketing)', async () => {
    const html = await familyView();
    for (const slug of ['big-pixie', 'toe-one', 'xbss-one', 'big-atomic', 'big-quantum', 'clip-stall-one']) {
      expect(html, `${slug} must not appear in family view`).not.toContain(`data-trick-slug="${slug}"`);
    }
  });
});

describe('Family skeleton — other public families render safely', () => {
  it('renders drifter as a Family Parent section and eclipse in the Minor Lineages band', async () => {
    const html = await familyView();
    // drifter (above the current first-class threshold) is a full section.
    expect(html).toContain('id="family-drifter"');
    expect(html).toContain('data-trick-slug="day-drifter"');
    // eclipse (below the threshold) is demoted to the compact Minor Lineages
    // band rather than a full section; its ?family= route is untouched.
    expect(html).not.toContain('id="family-eclipse"');
    expect(html).toContain('id="minor-lineages"');
    expect(html).toContain('/freestyle/tricks?family=eclipse');
  });
});

describe('Family skeleton — old ?family= filter URLs stay usable (data untouched)', () => {
  // The filter reads raw trick_family, which the skeleton never overwrites, so
  // sub-label and route-out URLs still resolve to their rows.
  it.each([
    ['swirl', 'swirl'],                            // public family label
    ['twirl', 'twirl'],                            // route-out label
    ['clipper-stall', 'clip-stall-one'],           // route-out surface label
    ['pixie', 'big-pixie'],                        // route-out ecosystem label
  ])('?family=%s returns 200 and still lists its rows', async (family, sampleSlug) => {
    const res = await request(await createApp()).get(`/freestyle/tricks?family=${family}`);
    expect(res.status).toBe(200);
    expect(res.text, `?family=${family} should list ${sampleSlug}`).toContain(`data-trick-slug="${sampleSlug}"`);
  });
});
