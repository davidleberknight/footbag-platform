/**
 * Integration tests for navigation cross-links between the dictionary
 * surface and the Freestyle Concepts surface.
 *
 * Long-term contract pinned:
 *
 *   1. The semantic-token shaper resolves a Concepts anchor per token:
 *      modifier-role tokens with a modifier-feel card map to
 *      `/freestyle/concepts#modifier-{slug}`; base-anchor-role tokens
 *      for known core atoms map to `/freestyle/concepts#term-{slug}`.
 *      Side-positional / unknown / unlisted slugs receive null.
 *
 *   2. Each Freestyle Concepts modifier-feel card carries a "Browse X
 *      tricks" deep-link into the dictionary.
 *
 *   3. Freestyle heroes are breadcrumb + title + subhead only — no
 *      cross-link CTA inside the hero. The Freestyle Concepts body still
 *      references the trick dictionary in prose.
 *
 *   4. No browse view renders chain tokens. A chain reading is structural
 *      content belonging to the trick's own page, so the shared browse row
 *      carries identity and notation only.
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

const { dbPath } = setTestEnv('3100');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Seed a whirl-family compound whose chain reading uses modifiers
  // and a base-anchor — the rendered card must wrap both in anchor links.
  // blurry-whirl is the rendering target because it remains non-first-
  // class (composite-modifier compound; blurry → stepping+paradox
  // expansion isn't supported at the parser layer per Red ruling).
  // Non-first-class compounds preserve their tautological chain readings,
  // so blurry-whirl's "blurry whirl" reading still renders with linked
  // tokens. paradox-whirl + spinning-whirl are in
  // FIRST_CLASS_TIER_2; their tautological chains
  // are suppressed (the first-class summary row carries the structural
  // decomposition instead). They remain seeded for the resolver-level
  // tests below which exercise pure text-to-token resolution and are
  // independent of rendering.
  insertFreestyleTrick(db, {
    slug:           'paradox-whirl',
    canonical_name: 'paradox whirl',
    trick_family:   'whirl',
    category:       'compound',
    adds:           '4',
    is_active:      1,
  });
  insertFreestyleTrick(db, {
    slug:           'spinning-whirl',
    canonical_name: 'spinning whirl',
    trick_family:   'whirl',
    category:       'compound',
    adds:           '4',
    is_active:      1,
  });
  insertFreestyleTrick(db, {
    slug:           'blurry-whirl',
    canonical_name: 'blurry whirl',
    trick_family:   'whirl',
    category:       'compound',
    adds:           '5',
    is_active:      1,
  });
  // The base anchor for the family.
  insertFreestyleTrick(db, {
    slug:           'whirl',
    canonical_name: 'whirl',
    trick_family:   'whirl',
    category:       'dex',
    adds:           '3',
    is_active:      1,
  });
  // ripwalk is seeded as the rendering-target for the linked-
  // token assertions below. ripwalk's chain reading "stepping butterfly"
  // is non-tautological with the canonical name, so it survives the
  // universal tautological-reading filter and exercises the linked-
  // token render contract.
  insertFreestyleTrick(db, {
    slug:           'ripwalk',
    canonical_name: 'ripwalk',
    trick_family:   'butterfly',
    category:       'compound',
    adds:           '4',
    is_active:      1,
  });
  insertFreestyleTrick(db, {
    slug:           'butterfly',
    canonical_name: 'butterfly',
    trick_family:   'butterfly',
    category:       'dex',
    adds:           '3',
    is_active:      1,
  });
  // Third butterfly member so the family clears the family-view three-member
  // minimum and the ripwalk card below renders.
  insertFreestyleTrick(db, {
    slug:           'parkwalk',
    canonical_name: 'parkwalk',
    trick_family:   'butterfly',
    category:       'compound',
    adds:           '5',
    is_active:      1,
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('Browse rows carry no chain tokens on any view', () => {
  // A browse row carries identity and notation. A chain reading is structural
  // content and reads on the trick's own page, so no browse view renders one,
  // and none renders the glossary-linked token markup that used to accompany
  // it. ripwalk is the probe: its chain reading "stepping butterfly" survives
  // the tautological filter, so if any view still rendered chain tokens, this
  // is the trick that would show them.
  it('no browse view renders a chain token', async () => {
    const app = createApp();
    // The views this fixture places ripwalk in; the component and
    // movement-system views group by modifier link, which ripwalk has none of.
    for (const view of ['add', 'family', 'category', 'dex-count']) {
      const res = await request(app).get(`/freestyle/tricks?view=${view}`);
      expect(res.status).toBe(200);
      const row = res.text.match(/data-trick-slug="ripwalk"[\s\S]*?<\/article>/);
      expect(row, `ripwalk row missing in ${view} view`).not.toBeNull();
      expect(row![0], `${view} row carries a chain token`).not.toMatch(/sem-token/);
    }
  });
});

describe('Freestyle Concepts modifier cards — "See tricks using X" deep-links', () => {
  it('renders a tricks-link footer on every set-modifier card', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/concepts');
    expect(res.status).toBe(200);
    // Each modifier card carries the tricks-link paragraph; spot-check the four
    // most pedagogically central ones. The movement-system view groups by axis,
    // so there is no per-modifier anchor; every card's browse link lands on the
    // view itself.
    for (const slug of ['pixie', 'atomic', 'paradox', 'symposium']) {
      expect(
        res.text,
        `Concepts modifier card for '${slug}' missing tricks-link footer`,
      ).toContain('href="/freestyle/tricks?view=movement-system"');
    }
  });

  it('renders the tricks-link class wrapper on the footer paragraph', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/concepts');
    expect(res.text).toContain('class="glossary-modifier-card-tricks-link"');
  });

  it('preserves the modifier-pixie deep-link anchor, cross-linked to its set definition', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/concepts');
    // Pixie is set vocabulary, defined in the Timing & Sets chapter. Its feel
    // card moved there, but the modifier-pixie anchor that dictionary tokens
    // deep-link to survives as a thin cross-link so those deep links resolve.
    expect(res.text).toContain('id="modifier-pixie"');
    const stub = res.text.match(/id="modifier-pixie"[^>]*href="([^"]+)"/);
    expect(stub).not.toBeNull();
    expect(stub![1]).toBe('#section-timing-sets');
  });
});

describe('Freestyle heroes carry their own parts only, never navigation', () => {
  it('the Freestyle Concepts hero holds no action link to another page', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/concepts');
    expect(res.status).toBe(200);
    const hero = res.text.match(/<div class="hero[^"]*"[\s\S]*?<\/div>\s*<div class="wrapper/);
    expect(hero, 'Concepts hero block').not.toBeNull();
    expect(hero![0]).not.toContain('class="action-link"');
  });

  it('the trick-dictionary hero holds no action link to another page', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    const hero = res.text.match(/<div class="hero[^"]*"[\s\S]*?<\/div>\s*<div class="wrapper/);
    expect(hero, 'dictionary hero block').not.toBeNull();
    expect(hero![0]).not.toContain('class="action-link"');
  });

  it('Freestyle Concepts still cross-references the trick dictionary in its body', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/concepts');
    expect(res.text).toContain('href="/freestyle/tricks"');
  });
});
