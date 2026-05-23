/**
 * Integration tests for the dictionary-trick-card presentation hierarchy.
 *
 * Long-term contract (post PRESENTATION_OBJECT_HIERARCHY audit, 2026-05-16):
 *
 *   The canonical field order in EVERY browse view, regardless of density,
 *   is:
 *
 *     1. trick title (.dict-card-title)
 *     2. symbolic formula (.dict-card-equivalence  OR  .dict-card-notation)
 *     3. ADD chip (.dict-card-add)
 *     4. media chip (.dict-card-media-chip)
 *     5. status badge (.dict-card-status-badge)
 *
 *   Density modes (`registry` / `browse`) may differ in:
 *     - element wrapping types (<span> vs <p>)
 *     - layout CSS (grid vs flex column)
 *     - font sizes / weights / paddings
 *
 *   Density modes MUST NOT differ in:
 *     - DOM order of the five canonical slots above
 *     - title link href / display name
 *     - ADD label string
 *     - first-reading token text
 *     - media chip label
 *
 *   The DOM order is enforced by asserting positional ordering: for each
 *   pilot trick, the FIRST occurrence of each class-name marker within the
 *   card's <article> region must be in canonical order.
 *
 * The .dict-card-header wrapper is gone (was the root cause of the
 * presentation-object divergence in browse density).
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

const { dbPath } = setTestEnv('3101');

let createApp: Awaited<ReturnType<typeof importApp>>;

// Wave 3 (2026-05-22): paradox-whirl + spinning-whirl removed —
// promoted into FIRST_CLASS_TIER_2 alongside symposium-whirl (Wave 2).
// First-class compounds with tautological chain readings (canonical-
// name-equal) have those readings suppressed AND have no inline
// dict-card-notation rendered, so the "formula" slot no longer falls
// between title and ADD chip — the structural decomposition surfaces
// in the first-class secondary row below the status badges instead.
//
// dimwalk remains in PILOTS: its chain reading "stepping butterfly"
// is folk-name resolution (≢ canonical), so tautological suppression
// does NOT fire and the formula slot still renders.
const PILOTS = [
  { slug: 'dimwalk',         name: 'dimwalk',         family: 'butterfly', adds: '4' },
];

// Additional rows so the family-view `length > 1` heuristic admits
// the whirl and butterfly sections.
const FAMILY_COMPANIONS = [
  { slug: 'whirl',     name: 'whirl',     family: 'whirl',     adds: '3' },
  { slug: 'butterfly', name: 'butterfly', family: 'butterfly', adds: '3' },
];

beforeAll(async () => {
  const db = createTestDb(dbPath);
  for (const t of [...PILOTS, ...FAMILY_COMPANIONS]) {
    insertFreestyleTrick(db, {
      slug:           t.slug,
      canonical_name: t.name,
      trick_family:   t.family,
      category:       t.slug === 'whirl' ? 'dex' : 'compound',
      adds:           t.adds,
      is_active:      1,
    });
  }
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

/**
 * Extract the <article ...> region for a given trick slug from rendered HTML.
 * Returns null if no card region is found.
 */
function cardRegion(html: string, slug: string): string | null {
  const match = html.match(
    new RegExp(`<article class="dict-card[^"]*"[^>]*data-trick-slug="${slug}"[\\s\\S]*?<\\/article>`),
  );
  return match ? match[0] : null;
}

/**
 * Given a card region, return the index positions (in DOM order) of the
 * FIRST occurrence of each canonical slot marker. -1 if absent.
 */
function slotPositions(card: string) {
  return {
    title:    card.indexOf('class="dict-card-title"'),
    formula:  Math.min(
      ...[
        card.indexOf('class="core-trick-equivalence dict-card-equivalence'),
        card.indexOf('class="dict-card-notation'),
      ].filter(i => i !== -1).concat([Number.POSITIVE_INFINITY]),
    ),
    add:      card.indexOf('class="dict-card-add'),
    media:    card.indexOf('class="dict-card-media-chip'),
    statusBadge: card.indexOf('class="dict-card-status-badge'),
  };
}

describe('Presentation-hierarchy contract — registry density (ADD View canonical)', () => {
  for (const pilot of PILOTS) {
    it(`renders ${pilot.slug} with canonical field order in ADD View`, async () => {
      const app = createApp();
      const res = await request(app).get('/freestyle/tricks?view=add');
      expect(res.status).toBe(200);
      const card = cardRegion(res.text, pilot.slug);
      expect(card, `card not found for ${pilot.slug} in ADD View`).not.toBeNull();
      const pos = slotPositions(card!);
      // Required ordering: title BEFORE formula BEFORE ADD chip.
      expect(pos.title).toBeGreaterThanOrEqual(0);
      expect(pos.add).toBeGreaterThanOrEqual(0);
      expect(pos.formula).toBeGreaterThan(pos.title);
      expect(pos.add).toBeGreaterThan(pos.formula);
      // Article wrapper carries the dict-card--registry class on ADD View.
      expect(card!).toMatch(/class="dict-card dict-card--registry/);
      // No deprecated header wrapper.
      expect(card!).not.toContain('class="dict-card-header"');
    });
  }
});

describe('Presentation-hierarchy contract — Family View (registry density, post-unification)', () => {
  // After PRESENTATION_UNIFICATION (2026-05-16), all browse views including
  // Family View render with registry density. Cards are visually identical
  // to ADD View; only grouping differs.
  for (const pilot of PILOTS) {
    it(`renders ${pilot.slug} with canonical field order in Family View`, async () => {
      const app = createApp();
      const res = await request(app).get('/freestyle/tricks?view=family');
      expect(res.status).toBe(200);
      const card = cardRegion(res.text, pilot.slug);
      expect(card, `card not found for ${pilot.slug} in Family View`).not.toBeNull();
      const pos = slotPositions(card!);
      // Same required ordering as ADD View: title BEFORE formula BEFORE ADD.
      expect(pos.title).toBeGreaterThanOrEqual(0);
      expect(pos.add).toBeGreaterThanOrEqual(0);
      expect(pos.formula).toBeGreaterThan(pos.title);
      expect(pos.add).toBeGreaterThan(pos.formula);
      // Article wrapper carries the dict-card--registry class on every browse
      // view now (PRESENTATION_UNIFICATION). Family View must match ADD View.
      expect(card!).toMatch(/class="dict-card dict-card--registry/);
      // Browse-density class must NOT appear — Family View no longer uses it.
      expect(card!).not.toMatch(/class="dict-card dict-card--browse/);
      // The deprecated <header class="dict-card-header"> must not be emitted.
      expect(card!).not.toContain('class="dict-card-header"');
    });
  }
});

describe('Presentation-hierarchy contract — cross-density identity', () => {
  // The whole point of the normalization: same trick presents the same
  // canonical hierarchy in both densities.
  it('dimwalk renders title → formula → ADD in BOTH ADD and Family views', async () => {
    // Target swapped from paradox-whirl to dimwalk 2026-05-22: paradox-
    // whirl promoted into FIRST_CLASS_TIER_2 in Wave 3, which suppresses
    // its tautological "paradox whirl" chain reading. dimwalk is also
    // first-class but its chain reading "stepping butterfly" is folk-
    // name resolution (≢ canonical "dimwalk"), so the chain still
    // renders and the formula slot still falls between title and ADD —
    // preserving the canonical-field-order contract this test asserts.
    const app = createApp();
    const add = await request(app).get('/freestyle/tricks?view=add');
    const fam = await request(app).get('/freestyle/tricks?view=family');

    const addCard = cardRegion(add.text, 'dimwalk');
    const famCard = cardRegion(fam.text, 'dimwalk');
    expect(addCard).not.toBeNull();
    expect(famCard).not.toBeNull();

    const addPos = slotPositions(addCard!);
    const famPos = slotPositions(famCard!);

    // In both views: title -> formula -> ADD
    expect(addPos.title).toBeLessThan(addPos.formula);
    expect(addPos.formula).toBeLessThan(addPos.add);
    expect(famPos.title).toBeLessThan(famPos.formula);
    expect(famPos.formula).toBeLessThan(famPos.add);
  });

  it('canonical-name link href is identical across ADD and Family views', async () => {
    const app = createApp();
    const add = await request(app).get('/freestyle/tricks?view=add');
    const fam = await request(app).get('/freestyle/tricks?view=family');

    for (const pilot of PILOTS) {
      const addCard = cardRegion(add.text, pilot.slug);
      const famCard = cardRegion(fam.text, pilot.slug);
      expect(addCard).not.toBeNull();
      expect(famCard).not.toBeNull();
      const hrefPattern = new RegExp(
        `<a class="dict-card-title" href="/freestyle/tricks/${pilot.slug}">`,
      );
      expect(addCard!).toMatch(hrefPattern);
      expect(famCard!).toMatch(hrefPattern);
    }
  });

  it('ADD label is identical across ADD and Family views', async () => {
    const app = createApp();
    const add = await request(app).get('/freestyle/tricks?view=add');
    const fam = await request(app).get('/freestyle/tricks?view=family');

    for (const pilot of PILOTS) {
      const addCard = cardRegion(add.text, pilot.slug);
      const famCard = cardRegion(fam.text, pilot.slug);
      const addsLabel = `${pilot.adds} ADD`;
      expect(addCard!).toContain(addsLabel);
      expect(famCard!).toContain(addsLabel);
    }
  });
});

describe('Presentation-hierarchy contract — dict-card-header is removed everywhere', () => {
  it('no card on the trick dictionary index emits a dict-card-header wrapper', async () => {
    const app = createApp();
    for (const url of [
      '/freestyle/tricks',
      '/freestyle/tricks?view=family',
      '/freestyle/tricks?view=category',
      '/freestyle/tricks?view=component',
      '/freestyle/tricks?view=topology',
    ]) {
      const res = await request(app).get(url);
      expect(res.status).toBe(200);
      expect(
        res.text,
        `dict-card-header wrapper still present at ${url} — Slice should have removed it`,
      ).not.toContain('class="dict-card-header"');
    }
  });
});
