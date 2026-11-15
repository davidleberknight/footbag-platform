/**
 * Integration tests for navigation cross-links between the dictionary
 * surface and the Freestyle Concepts surface.
 *
 * Long-term contract pinned:
 *
 *   1. Freestyle heroes are breadcrumb + title + subhead only — no
 *      cross-link CTA inside the hero. The Freestyle Concepts body still
 *      references the trick dictionary in prose.
 *
 *   2. No browse view renders chain tokens. A chain reading is structural
 *      content belonging to the trick's own page, so the shared browse row
 *      carries identity and notation only.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { cachedGet } from '../fixtures/cachedGet';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import { seedStagedOperatorsAndModifiers } from '../fixtures/stagedOperators';
import { seedStagedFamilies } from '../fixtures/stagedFamilies';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3100');

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

beforeAll(async () => {
  const db = createTestDb(dbPath);
  seedStagedFamilies(db);
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

  // The operators and the placed modifiers the pages link, as the rebuild seeds them.
  seedStagedOperatorsAndModifiers(db);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('Browse rows carry no chain tokens on any view', () => {
  // A browse row carries identity and notation. A chain reading is structural
  // content and reads on the trick's own page, so no browse view renders one,
  // and none renders glossary-linked chain token markup. ripwalk is the
  // probe: its chain reading "stepping butterfly" survives
  // the tautological filter, so if any view still rendered chain tokens, this
  // is the trick that would show them.
  it('no browse view renders a chain token', async () => {
    const app = createApp();
    // The views this fixture places ripwalk in; the set and modifier views
    // group by modifier link, which ripwalk has none of.
    for (const view of ['add', 'family']) {
      const res = await request(app).get(`/freestyle/tricks?view=${view}`);
      expect(res.status).toBe(200);
      const row = res.text.match(/data-trick-slug="ripwalk"[\s\S]*?<\/article>/);
      expect(row, `ripwalk row missing in ${view} view`).not.toBeNull();
      expect(row![0], `${view} row carries a chain token`).not.toMatch(/sem-token/);
    }
  });
});

describe('Freestyle heroes carry their own parts only, never navigation', () => {
  it('the Freestyle Concepts hero holds no action link to another page', async () => {
    const res = await page('/freestyle/concepts');
    expect(res.status).toBe(200);
    const hero = res.text.match(/<div class="hero[^"]*"[\s\S]*?<\/div>\s*<div class="wrapper/);
    expect(hero, 'Concepts hero block').not.toBeNull();
    expect(hero![0]).not.toContain('class="action-link"');
  });

  it('the trick-dictionary hero holds no action link to another page', async () => {
    const res = await page('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    const hero = res.text.match(/<div class="hero[^"]*"[\s\S]*?<\/div>\s*<div class="wrapper/);
    expect(hero, 'dictionary hero block').not.toBeNull();
    expect(hero![0]).not.toContain('class="action-link"');
  });

  it('Freestyle Concepts still cross-references the trick dictionary in its body', async () => {
    const res = await page('/freestyle/concepts');
    expect(res.text).toContain('href="/freestyle/tricks"');
  });
});
