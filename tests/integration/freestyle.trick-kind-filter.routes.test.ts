/**
 * Integration tests for the trick-kind discriminator + view filter.
 *
 * Long-term contract:
 *
 *   freestyle_tricks mixes structural roles: true tricks, modifiers,
 *   set operators, catch surfaces. The four trick-browse surfaces
 *   (ADD / family / set / modifier) must render ONLY rows whose stored
 *   trick_kind is empty, which is a trick.
 *
 * Why this matters: rows like `atomic`, `quantum`, `paradox` exist in
 * freestyle_tricks but are structurally primitives (set operators /
 * body modifiers), not compound tricks. Mixing them into the
 * difficulty ladder distorts the trick browse and breaks the
 * operator/trick semantic separation the glossary §6 /
 * SEMANTIC_COMPRESSION_DOCTRINE rests on. Surfaces are distinguished
 * by the DB `category` field, not by kind: tricks that end in bag
 * contact (every stall, the Clipper Kick) stay in the ADD ladder.
 *
 * Tests verify:
 *   1. Each known modifier / operator / surface / pending-review slug
 *      is absent from each of the five views.
 *   2. A control trick (a row with no stored kind) appears in the ADD view,
 *      and so do the rows whose category alone might look like a non-trick
 *      (the dual-role sets, the Clipper Kick, a stall).
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

const { dbPath } = setTestEnv('3096');

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

// One representative slug per kind, each seeded with the kind it carries.
const MODIFIER_SAMPLE   = 'paradox';
const OPERATOR_SAMPLE   = 'atomic';
const BODY_KICK_SAMPLE  = 'clipper';        // Clipper Kick: 1-ADD body kick, NOT filtered
const PENDING_SAMPLE    = 'surging';
const TRICK_SAMPLE      = 'ripwalk';        // canonical compound trick (control)
const STALL_TRICK_SAMPLE = 'clipper-stall'; // legitimate 1-ADD stall trick (NOT filtered)
const DUAL_ROLE_SAMPLES = ['pixie', 'fairy']; // sets that are also tricks (NOT filtered)

const ALL_FILTERED_SAMPLES = [
  MODIFIER_SAMPLE,
  OPERATOR_SAMPLE,
  PENDING_SAMPLE,
];

beforeAll(async () => {
  const db = createTestDb(dbPath);
  seedStagedFamilies(db);
  // Seed one row of each kind. The category column on each row reflects
  // the production DB's classification; the stored kind decides the browse.
  // Each row's `adds` is non-null so the row would otherwise pass
  // through the (legacy) `adds !== 'modifier'` filter.
  insertFreestyleTrick(db, {
    slug:           MODIFIER_SAMPLE,
    canonical_name: 'paradox',
    category:       'modifier',
    adds:           '1',
    is_active:      1,
    trick_kind:     'modifier',
  });
  insertFreestyleTrick(db, {
    slug:           OPERATOR_SAMPLE,
    canonical_name: 'atomic',
    category:       'set',
    adds:           '2',
    is_active:      1,
    trick_kind:     'operator',
  });
  // Dual-role sets: category='set' like atomic, but each is also a trick in its
  // own right, so the kind layer keeps them in the trick browse.
  for (const slug of DUAL_ROLE_SAMPLES) {
    insertFreestyleTrick(db, {
      slug,
      canonical_name: slug,
      category:       'set',
      adds:           '2',
      is_active:      1,
    });
  }
  insertFreestyleTrick(db, {
    slug:           BODY_KICK_SAMPLE,
    canonical_name: 'Clipper Kick',
    category:       'body',
    adds:           '1',
    is_active:      1,
  });

  // Stall primitive — kind='trick', NOT filtered. Sanity-anchor for the
  // contract that "all tricks must end with bag contact" is honored:
  // the clipper-stall ADD=1 row stays in the ADD ladder.
  insertFreestyleTrick(db, {
    slug:           STALL_TRICK_SAMPLE,
    canonical_name: 'Clipper Stall',
    category:       'surface',
    adds:           '1',
    is_active:      1,
  });
  insertFreestyleTrick(db, {
    slug:           PENDING_SAMPLE,
    canonical_name: 'surging',
    category:       'compound',
    adds:           '2',
    is_active:      1,
    trick_kind:     'pending-review',
  });

  // Control: a true trick (compound, ends in bag contact, structural depth).
  insertFreestyleTrick(db, {
    slug:           TRICK_SAMPLE,
    canonical_name: 'Ripwalk',
    category:       'compound',
    trick_family:   'butterfly',
    adds:           '3',
    is_active:      1,
  });

  // Two more butterfly-family tricks so the family view's three-member minimum
  // emits the butterfly section. The kind-filter contract is independent of this
  // threshold; the extra rows make the surface visible so we can assert the
  // control trick rendered.
  insertFreestyleTrick(db, {
    slug:           'dimwalk',
    canonical_name: 'Dimwalk',
    category:       'compound',
    trick_family:   'butterfly',
    adds:           '4',
    is_active:      1,
  });
  insertFreestyleTrick(db, {
    slug:           'parkwalk',
    canonical_name: 'Parkwalk',
    category:       'compound',
    trick_family:   'butterfly',
    adds:           '5',
    is_active:      1,
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('Trick-browse view filter — non-trick kinds excluded', () => {
  // The four trick-browse views. Each must omit modifier/operator/surface/
  // pending-review rows. We assert by checking that each filtered slug
  // does NOT appear in the rendered HTML (since the dictionary card carries
  // `data-trick-slug="{slug}"` attribute on every card it renders).
  const views = [
    { name: 'ADD',      url: '/freestyle/tricks' },
    { name: 'family',   url: '/freestyle/tricks?view=family' },
    { name: 'set',      url: '/freestyle/tricks?view=set' },
    { name: 'modifier', url: '/freestyle/tricks?view=modifier' },
  ];

  // One request per view, not one per view and slug: the URL does not depend on
  // the slug, so every slug is asserted against the same rendered page.
  for (const view of views) {
    it(`excludes every non-trick slug from the ${view.name} view`, async () => {
      const res = await page(view.url);
      expect(res.status).toBe(200);
      for (const slug of ALL_FILTERED_SAMPLES) {
        expect(res.text, `${slug} in ${view.name} view`).not.toContain(`data-trick-slug="${slug}"`);
      }
    });
  }
});

describe('Trick-browse view filter — true tricks preserved', () => {
  it('renders the control trick in the ADD view', async () => {
    const res = await page('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    expect(res.text).toContain(`data-trick-slug="${TRICK_SAMPLE}"`);
  });

  it('renders the control trick in the family view (butterfly family)', async () => {
    const res = await page('/freestyle/tricks?view=family');
    expect(res.status).toBe(200);
    // The control trick has trick_family='butterfly'; family-view groups by
    // family-slug. The card markup carries the trick's data-trick-slug.
    expect(res.text).toContain(`data-trick-slug="${TRICK_SAMPLE}"`);
  });

  it('renders stall primitives in the ADD view (they end in bag contact)', async () => {
    // Sanity: the kind discriminator does NOT filter legitimate stalls.
    // clipper-stall (1 ADD) is a tricks-end-in-bag-contact primitive and
    // must remain in the ADD ladder.
    const res = await page('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    expect(res.text).toContain(`data-trick-slug="${STALL_TRICK_SAMPLE}"`);
  });

  // Defect caught: pixie and fairy, active canonical tricks that are also sets,
  // are missing from the trick browse, so a visitor listing every trick by ADD
  // never finds them. The atomic set row seeded beside them stays out, so the
  // view still filters set primitives.
  it('renders the dual-role sets pixie and fairy in the ADD view', async () => {
    const res = await page('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    for (const slug of DUAL_ROLE_SAMPLES) {
      expect(res.text, slug).toContain(`data-trick-slug="${slug}"`);
    }
    expect(res.text).not.toContain(`data-trick-slug="${OPERATOR_SAMPLE}"`);
  });

  it('renders the Clipper Kick in the ADD view (body kick, ends in bag contact)', async () => {
    const res = await page('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    expect(res.text).toContain(`data-trick-slug="${BODY_KICK_SAMPLE}"`);
  });
});
