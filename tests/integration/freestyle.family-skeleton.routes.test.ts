/**
 * /freestyle/tricks?view=family — parent-family skeleton (2026-05-28).
 *
 * The Family view renders a reversible parent-family taxonomy driven by
 * src/content/freestyleParentFamilies.ts + RETIRED_FAMILIES:
 *   - 8 canonical parent anchors render as top-level family sections.
 *   - approved child labels fold INTO their parent (subordinate rows, no
 *     top-level child section).
 *   - route-out labels (modifier ecosystems / alternative surfaces /
 *     foundational surfaces / multi-bag/kick) do NOT render as families.
 *   - deferred labels keep rendering as their own family, untouched.
 *   - raw trick_family data is never overwritten, so old ?family=<slug>
 *     filter URLs (including merged + retired labels) stay usable.
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
    // ── Osis parent: native osis rows + folded torque-lineage children ──
    trick('osis', 'osis', 'dex'),
    trick('spinning-osis', 'osis'),
    trick('torque', 'torque'),            // folds into osis
    trick('spinning-torque', 'torque'),   // folds into osis

    // ── Whirl / Swirl parent: native whirl rows + folded swirl/twirl ──
    trick('whirl', 'whirl', 'dex'),
    trick('paradox-whirl', 'whirl'),
    trick('swirl', 'swirl', 'dex'),       // folds into whirl
    trick('twirl', 'twirl'),              // folds into whirl

    // ── Route-outs: modifier ecosystems (≥2 rows each) ──
    trick('big-pixie', 'pixie'), trick('lil-pixie', 'pixie'),
    trick('big-fairy', 'fairy'), trick('lil-fairy', 'fairy'),
    trick('big-atomic', 'atomic'), trick('lil-atomic', 'atomic'),
    trick('big-quantum', 'quantum'), trick('lil-quantum', 'quantum'),

    // ── Route-outs: alternative + foundational surfaces (≥2 rows each) ──
    trick('xbss-one', 'cross-body-sole-stall'), trick('xbss-two', 'cross-body-sole-stall'),
    trick('toe-one', 'toe-stall'), trick('toe-two', 'toe-stall'),
    trick('clip-stall-one', 'clipper-stall'), trick('clip-stall-two', 'clipper-stall'),

    // ── Deferred labels: still render as their own family (≥2 rows) ──
    trick('eclipse', 'eclipse', 'dex'), trick('lunar-eclipse', 'eclipse'),
    trick('drifter', 'drifter', 'dex'), trick('day-drifter', 'drifter'),
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

describe('Family skeleton — canonical parents render top-level', () => {
  it('renders the seeded parents (osis, whirl) as top-level family sections', async () => {
    const html = await familyView();
    expect(html).toContain('id="family-osis"');
    expect(html).toContain('id="family-whirl"');
  });

  it('renders the combined "Whirl / Swirl" display name on the whirl parent', async () => {
    const html = await familyView();
    expect(html).toMatch(/<h2><a href="\/freestyle\/tricks\?family=whirl">Whirl \/ Swirl family<\/a><\/h2>/);
  });
});

describe('Family skeleton — approved children fold in subordinate, not top-level', () => {
  it('does NOT render top-level sections for folded child labels', async () => {
    const html = await familyView();
    for (const child of ['torque', 'swirl', 'twirl']) {
      expect(html, `${child} must not be a top-level family`).not.toContain(`id="family-${child}"`);
    }
  });

  it('renders the child rows nested under their parent section', async () => {
    const html = await familyView();
    // torque + spinning-torque live under the osis section.
    const osis = html.slice(html.indexOf('id="family-osis"'), html.indexOf('id="family-whirl"') > html.indexOf('id="family-osis"') ? html.indexOf('id="family-whirl"') : html.length);
    expect(osis).toContain('data-trick-slug="torque"');
    expect(osis).toContain('data-trick-slug="spinning-torque"');
    // swirl + twirl appear somewhere in the family view (under whirl).
    expect(html).toContain('data-trick-slug="swirl"');
    expect(html).toContain('data-trick-slug="twirl"');
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

describe('Family skeleton — deferred labels still render safely', () => {
  it('renders deferred labels (eclipse, drifter) as their own family sections', async () => {
    const html = await familyView();
    expect(html).toContain('id="family-eclipse"');
    expect(html).toContain('id="family-drifter"');
    expect(html).toContain('data-trick-slug="lunar-eclipse"');
    expect(html).toContain('data-trick-slug="day-drifter"');
  });
});

describe('Family skeleton — old ?family= filter URLs stay usable (data untouched)', () => {
  // The filter reads raw trick_family, which the skeleton never overwrites, so
  // merged-child and retired-label URLs still resolve to their rows.
  it.each([
    ['torque', 'torque'],                          // merged child label
    ['swirl', 'swirl'],                            // merged child label
    ['clipper-stall', 'clip-stall-one'],           // retired (route-out) label
    ['pixie', 'big-pixie'],                        // retired (ecosystem) label
  ])('?family=%s returns 200 and still lists its rows', async (family, sampleSlug) => {
    const res = await request(await createApp()).get(`/freestyle/tricks?family=${family}`);
    expect(res.status).toBe(200);
    expect(res.text, `?family=${family} should list ${sampleSlug}`).toContain(`data-trick-slug="${sampleSlug}"`);
  });
});
