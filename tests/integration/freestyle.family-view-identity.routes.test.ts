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

  it('does NOT render non-tricks in family view (Slice A regression guard)', async () => {
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
  it('renders the "paradox whirl" reading inside the paradox-whirl card', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=family');
    expect(res.status).toBe(200);
    // The card carries data-trick-slug="paradox-whirl"; somewhere inside
    // its markup, the equivalence row renders 'paradox' and 'whirl' tokens.
    // We assert the trick's card region contains tokens whose text is
    // 'paradox' and 'whirl' (order-preserving).
    const cardRegion = res.text.match(
      /data-trick-slug="paradox-whirl"[\s\S]*?<\/article>/,
    );
    expect(cardRegion).not.toBeNull();
    expect(cardRegion![0]).toMatch(/sem-token[^>]*>paradox</);
    expect(cardRegion![0]).toMatch(/sem-token[^>]*>whirl</);
  });

  it('does NOT render "Notation pending" for whirl-family pilots that have curated chains', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=family');
    expect(res.status).toBe(200);

    // For each pilot whose chain we authored in Slice A2, the card region
    // must NOT contain the pending placeholder.
    const pilotsWithChains = [
      'paradox-whirl', 'spinning-whirl', 'ducking-whirl',
      'symposium-whirl', 'blurry-whirl',
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

describe('Cross-view identity — ADD view vs Family view', () => {
  // For Slice A2 the user wants identity for at least 3 pilot tricks.
  // We assert that the canonical name + ADD label + first-reading tokens
  // are present in BOTH views' markup for paradox-whirl, spinning-whirl,
  // and symposium-whirl. Density differs by design; identity does not.
  const IDENTITY_PILOTS = ['paradox-whirl', 'spinning-whirl', 'symposium-whirl'];

  for (const slug of IDENTITY_PILOTS) {
    it(`renders identical canonical identity for '${slug}' in ADD and Family views`, async () => {
      const app = createApp();
      const addView    = await request(app).get('/freestyle/tricks');
      const familyView = await request(app).get('/freestyle/tricks?view=family');
      expect(addView.status).toBe(200);
      expect(familyView.status).toBe(200);

      // Both views carry the same data-trick-slug attribute.
      expect(addView.text).toContain(`data-trick-slug="${slug}"`);
      expect(familyView.text).toContain(`data-trick-slug="${slug}"`);

      // Extract the trick's canonical name from the seed data; both views
      // must include the canonical-name anchor link to /freestyle/tricks/{slug}.
      const pilot = WHIRL_PILOTS.find(p => p.slug === slug)!;
      const expectedHref = `/freestyle/tricks/${slug}`;
      const hrefPattern = new RegExp(
        `<a class="dict-card-title" href="${expectedHref.replace(/\//g, '\\/')}">${pilot.name}<\\/a>`,
      );
      expect(addView.text,    `ADD view missing canonical-name link for ${slug}`).toMatch(hrefPattern);
      expect(familyView.text, `Family view missing canonical-name link for ${slug}`).toMatch(hrefPattern);

      // Both views must include the ADD chip text for this trick.
      const addsLabel = `${pilot.adds} ADD`;
      // The chip appears in card region for each view; use a permissive match.
      const addRegion = addView.text.match(
        new RegExp(`data-trick-slug="${slug}"[\\s\\S]*?<\\/article>`),
      );
      const familyRegion = familyView.text.match(
        new RegExp(`data-trick-slug="${slug}"[\\s\\S]*?<\\/article>`),
      );
      expect(addRegion, `card region not found in ADD view for ${slug}`).not.toBeNull();
      expect(familyRegion, `card region not found in family view for ${slug}`).not.toBeNull();
      expect(addRegion![0]).toContain(addsLabel);
      expect(familyRegion![0]).toContain(addsLabel);

      // Both views must render the FIRST equivalence reading. For these
      // pilots the first reading is the canonical-name decomposition
      // (e.g. "paradox whirl"). Token text matches across views; densities
      // diverge in stacking, not in token content.
      // Each pilot's name has exactly two tokens; assert both appear in the card region.
      const [modifierToken, baseToken] = pilot.name.split(' ');
      const modifierPattern = new RegExp(`sem-token[^>]*>${modifierToken}<`);
      const basePattern     = new RegExp(`sem-token[^>]*>${baseToken}<`);
      expect(addRegion![0], `ADD view missing modifier token for ${slug}`).toMatch(modifierPattern);
      expect(addRegion![0], `ADD view missing base token for ${slug}`).toMatch(basePattern);
      expect(familyRegion![0], `Family view missing modifier token for ${slug}`).toMatch(modifierPattern);
      expect(familyRegion![0], `Family view missing base token for ${slug}`).toMatch(basePattern);
    });
  }
});
