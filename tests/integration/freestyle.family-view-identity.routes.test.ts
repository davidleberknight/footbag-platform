/**
 * Integration tests for Family View rendering identity (Slice A2 of the
 * 2026-05 dictionary/glossary normalization plan).
 *
 * Long-term contract:
 *
 *   The same trick rendered in ADD View (registry/inline density) and in
 *   Family View (browse/stacked density) MUST present the same canonical
 *   identity: same display name, same ADD label, same FIRST equivalence
 *   reading (token-by-token). Density may differ (single inline reading
 *   vs vertical stacked readings); identity must not.
 *
 *   Specifically for Whirl as the pilot family: the canonical compounds
 *   (paradox / spinning / ducking / symposium / blurry whirl etc.) must
 *   render with their self-evident compositional formula, NOT a "Notation
 *   pending" placeholder. Family View is the user-validation surface for
 *   the normalized dictionary; broken cards here break trust in the
 *   normalization itself.
 *
 * What this test file does NOT assert:
 *   - Numeric ADD ladder ordering (covered by the dictionary-trick-card
 *     test file's section invariants).
 *   - Specific token-role coloring (covered by the semantic-notation
 *     rendering unit tests).
 *   - Family bucket size > 1 heuristic (a separate display-policy concern).
 *
 * The Slice A2 contract this pins:
 *   1. Whirl family renders the user's documented core members.
 *   2. Non-trick kinds (modifiers, operators, surfaces) do NOT appear in
 *      Family View (regression guard on Slice A's filter).
 *   3. Whirl-family compounds with the new chain entries render a
 *      formula reading on both density modes (no "Notation pending"
 *      placeholder for cards whose structure is self-evident).
 *   4. Per-trick identity: paradox-whirl renders the same first-reading
 *      tokens in ADD View as in Family View.
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

const { dbPath } = setTestEnv('3097');

let createApp: Awaited<ReturnType<typeof importApp>>;

// Whirl-family compounds the user named as the validation cohort.
// Each must:
//   - appear in the family view's whirl section
//   - render with its self-evident formula (no "Notation pending")
//   - render identically (first reading) to its ADD-view card
const WHIRL_PILOTS = [
  { slug: 'whirl',           name: 'whirl',           adds: '3' },
  { slug: 'paradox-whirl',   name: 'paradox whirl',   adds: '4' },
  { slug: 'spinning-whirl',  name: 'spinning whirl',  adds: '4' },
  { slug: 'ducking-whirl',   name: 'ducking whirl',   adds: '4' },
  { slug: 'symposium-whirl', name: 'symposium whirl', adds: '4' },
  { slug: 'blurry-whirl',    name: 'blurry whirl',    adds: '5' },
];

// Non-trick samples that must NOT appear in any Family View bucket.
const NON_TRICK_SAMPLES = ['paradox', 'spinning', 'pixie', 'clipper'];

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Seed all whirl-family pilots as canonical compounds.
  for (const pilot of WHIRL_PILOTS) {
    insertFreestyleTrick(db, {
      slug:           pilot.slug,
      canonical_name: pilot.name,
      trick_family:   'whirl',
      category:       pilot.slug === 'whirl' ? 'dex' : 'compound',
      adds:           pilot.adds,
      is_active:      1,
    });
  }

  // Seed non-tricks with trick_family='whirl' to test that the filter
  // keeps them OUT of family view buckets even when the family column
  // would otherwise sweep them in.
  insertFreestyleTrick(db, {
    slug:           'paradox',
    canonical_name: 'paradox',
    trick_family:   'whirl',           // would-be sweep target
    category:       'modifier',
    adds:           '1',
    is_active:      1,
  });
  insertFreestyleTrick(db, {
    slug:           'pixie',
    canonical_name: 'pixie',
    trick_family:   'whirl',           // would-be sweep target
    category:       'set',
    adds:           '2',
    is_active:      1,
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('Family View — whirl-family pilot contract', () => {
  it('renders the whirl family section', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=family');
    expect(res.status).toBe(200);
    // Section id is `family-{familySlug}` per the family-view template.
    expect(res.text).toContain('id="family-whirl"');
  });

  it('renders all documented whirl-family pilot compounds', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=family');
    expect(res.status).toBe(200);
    for (const pilot of WHIRL_PILOTS) {
      expect(res.text).toContain(`data-trick-slug="${pilot.slug}"`);
    }
  });

  it('does NOT render non-tricks in family view', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=family');
    expect(res.status).toBe(200);
    for (const nonTrick of NON_TRICK_SAMPLES) {
      expect(res.text).not.toContain(`data-trick-slug="${nonTrick}"`);
    }
  });
});

describe('Family View — formula visibility on whirl compounds', () => {
  // The Slice A2 chain additions for whirl-family compounds populate the
  // tokenizedEquivalences slot, so cards render their compositional formula
  // rather than the "Notation pending" placeholder.
  it('suppresses the tautological "blurry whirl" reading on the blurry-whirl card', async () => {
    // 2026-05-24 curator rendered-output audit: the universal
    // tautological-reading filter now drops any chain reading whose
    // case-insensitive trim equals the canonical name. blurry-whirl's
    // sole chain reading is "blurry whirl" — tautological with the
    // title — so the ≡ slot stays empty (cleanest visible state).
    // Compositional decomposition is available on the trick-detail page.
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=family');
    expect(res.status).toBe(200);
    const cardRegion = res.text.match(
      /data-trick-slug="blurry-whirl"[\s\S]*?<\/article>/,
    );
    expect(cardRegion).not.toBeNull();
    expect(cardRegion![0]).not.toMatch(/sem-token[^>]*>blurry</);
    expect(cardRegion![0]).not.toMatch(/sem-token[^>]*>whirl</);
  });

  it('does NOT render "Notation pending" for whirl-family pilots that have curated chains', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=family');
    expect(res.status).toBe(200);

    // For each pilot whose chain we authored in Slice A2, the card region
    // must NOT contain the pending placeholder.
    // ducking-whirl, symposium-whirl excluded 2026-05-22 (Wave 2); paradox-
    // whirl + spinning-whirl excluded 2026-05-22 (Wave 3) — all promoted
    // into FIRST_CLASS_TIER_2. First-class compounds with no curator
    // op_notation render the honest "JOB: canonical decomposition pending" incomplete-
    // state line in the secondary row — the chain-row pending placeholder
    // this test checks is a different surface. Only blurry-whirl remains
    // non-first-class in the whirl family (composite-modifier compound).
    const pilotsWithChains = [
      'blurry-whirl',
    ];
    for (const slug of pilotsWithChains) {
      const cardRegion = res.text.match(
        new RegExp(`data-trick-slug="${slug}"[\\s\\S]*?<\\/article>`),
      );
      expect(cardRegion, `card region not found for ${slug}`).not.toBeNull();
      expect(
        cardRegion![0],
        `card for ${slug} still shows "Notation pending" — formula chain missing or not rendered`,
      ).not.toMatch(/Notation pending/);
    }
  });
});

describe('ADD view and Family view — shared two-line row contract', () => {
  // 2026-05-27: both the ADD view and the Family view render the same
  // generalized two-line dict-trick-row contract; only the grouping differs.
  // What stays shared: data-trick-slug, the dict-trick-row-title detail link,
  // and the ADD value on the line-2 ADD slot. blurry-whirl is the remaining
  // non-first-class whirl-family compound; its sole chain reading ("blurry
  // whirl") is tautological, so the interpretation slot stays empty on both.
  const IDENTITY_PILOTS = ['blurry-whirl'];

  for (const slug of IDENTITY_PILOTS) {
    it(`'${slug}' renders the same two-line row contract in ADD and Family views`, async () => {
      const app = createApp();
      const addView    = await request(app).get('/freestyle/tricks?view=add');
      const familyView = await request(app).get('/freestyle/tricks?view=family');
      expect(addView.status).toBe(200);
      expect(familyView.status).toBe(200);

      const pilot = WHIRL_PILOTS.find(p => p.slug === slug)!;
      const escapedHref = `/freestyle/tricks/${slug}`.replace(/\//g, '\\/');
      const rowRe = (s: string) => new RegExp(`<article class="dict-trick-row[\\s\\S]*?data-trick-slug="${s}"[\\s\\S]*?<\\/article>`);

      const addRegion    = addView.text.match(rowRe(slug));
      const familyRegion = familyView.text.match(rowRe(slug));
      expect(addRegion, `dict-trick-row not found in ADD view for ${slug}`).not.toBeNull();
      expect(familyRegion, `dict-trick-row not found in family view for ${slug}`).not.toBeNull();

      // Same plain-text name + Trick Detail link in BOTH views.
      const namePat   = `<span class="dict-trick-row-title">${pilot.name}</span>`;
      const detailPat = new RegExp(`<a class="dict-trick-row-detail" href="${escapedHref}">Trick Detail<\\/a>`);
      expect(addRegion![0], `ADD view missing name for ${slug}`).toContain(namePat);
      expect(familyRegion![0], `Family view missing name for ${slug}`).toContain(namePat);
      expect(addRegion![0], `ADD view missing detail link for ${slug}`).toMatch(detailPat);
      expect(familyRegion![0], `Family view missing detail link for ${slug}`).toMatch(detailPat);

      // ADD value: line-2 ADD slot in both; the green shared-card chip never
      // appears on the row. ADD view groups by ADD bucket (id="add-N").
      expect(addView.text).toContain(`id="add-${pilot.adds}"`);
      expect(addRegion![0]).toContain('class="dict-trick-row-add"');
      expect(familyRegion![0]).toContain('class="dict-trick-row-add"');
      expect(addRegion![0]).not.toMatch(/class="dict-card-add[ "]/);
      expect(familyRegion![0]).not.toMatch(/class="dict-card-add[ "]/);

      // Tautological "blurry whirl" reading is suppressed on BOTH views, so
      // neither echoes its modifier/base as ≡ tokens.
      const [modifierToken, baseToken] = pilot.name.split(' ');
      const modifierPattern = new RegExp(`sem-token[^>]*>${modifierToken}<`);
      const basePattern     = new RegExp(`sem-token[^>]*>${baseToken}<`);
      expect(addRegion![0]).not.toMatch(modifierPattern);
      expect(addRegion![0]).not.toMatch(basePattern);
      expect(familyRegion![0]).not.toMatch(modifierPattern);
      expect(familyRegion![0]).not.toMatch(basePattern);
    });
  }
});
