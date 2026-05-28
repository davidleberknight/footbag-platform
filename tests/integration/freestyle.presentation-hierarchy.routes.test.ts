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

/**
 * The ADD view (2026-05-27) uses its own two-line dict-add-row contract,
 * NOT the shared dict-card. Extract its <article class="dict-add-row ...>
 * region for a slug.
 */
function addRowRegion(html: string, slug: string): string | null {
  const match = html.match(
    new RegExp(`<article class="dict-add-row[^"]*"[^>]*data-trick-slug="${slug}"[\\s\\S]*?<\\/article>`),
  );
  return match ? match[0] : null;
}

describe('Presentation-hierarchy contract — ADD View two-line row (2026-05-27)', () => {
  // The ADD view no longer renders the shared dict-card. It uses the
  // dict-add-row two-line contract: line 1 (head) = title + hashtag +
  // optional interpretation; line 2 (notation) = JOB + ADD. The canonical
  // ADD-view order is: title (line 1) BEFORE the JOB/ADD notation (line 2).
  for (const pilot of PILOTS) {
    it(`renders ${pilot.slug} with the two-line row order in ADD View`, async () => {
      const app = createApp();
      const res = await request(app).get('/freestyle/tricks?view=add');
      expect(res.status).toBe(200);
      const row = addRowRegion(res.text, pilot.slug);
      expect(row, `add-row not found for ${pilot.slug} in ADD View`).not.toBeNull();
      const titlePos    = row!.indexOf('class="dict-add-row-title"');
      const headPos     = row!.indexOf('class="dict-add-row-head"');
      const notationPos = row!.indexOf('class="dict-add-row-notation"');
      const jobPos      = row!.indexOf('class="dict-add-row-label">JOB<');
      const addPos      = row!.indexOf('class="dict-add-row-label">ADD<');
      // Line 1 (head + title) precedes line 2 (notation with JOB + ADD).
      expect(titlePos).toBeGreaterThanOrEqual(0);
      expect(headPos).toBeGreaterThanOrEqual(0);
      expect(notationPos).toBeGreaterThan(titlePos);
      expect(jobPos).toBeGreaterThan(notationPos);
      expect(addPos).toBeGreaterThan(jobPos);
      // The ADD view never renders the shared dict-card wrapper or chip.
      expect(row!).not.toContain('dict-card--registry');
      expect(row!).not.toMatch(/class="dict-card-add[ "]/);
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

describe('Presentation-hierarchy contract — ADD vs Family render distinct contracts (2026-05-27)', () => {
  // The 2026-05-27 normalization intentionally ended the ADD==Family
  // identity invariant. ADD view = the two-line dict-add-row contract;
  // Family view = the shared dict-card. Each view keeps its own canonical
  // order; the link target + ADD value remain reachable in both.
  it('dimwalk renders the two-line order in ADD and the shared-card order in Family', async () => {
    // dimwalk is first-class but its chain reading "stepping butterfly" is
    // folk-name resolution (≢ canonical "dimwalk"), so on the shared card
    // its formula slot still renders between title and ADD.
    const app = createApp();
    const add = await request(app).get('/freestyle/tricks?view=add');
    const fam = await request(app).get('/freestyle/tricks?view=family');

    const addRow  = addRowRegion(add.text, 'dimwalk');
    const famCard = cardRegion(fam.text, 'dimwalk');
    expect(addRow, 'add-row missing in ADD view').not.toBeNull();
    expect(famCard, 'dict-card missing in Family view').not.toBeNull();

    // ADD view: title (line 1) precedes the JOB/ADD notation (line 2).
    const addTitle    = addRow!.indexOf('class="dict-add-row-title"');
    const addNotation = addRow!.indexOf('class="dict-add-row-notation"');
    expect(addTitle).toBeGreaterThanOrEqual(0);
    expect(addNotation).toBeGreaterThan(addTitle);

    // Family view: shared-card order title -> formula -> ADD chip.
    const famPos = slotPositions(famCard!);
    expect(famPos.title).toBeLessThan(famPos.formula);
    expect(famPos.formula).toBeLessThan(famPos.add);
  });

  it('the detail-page link is reachable in both views (distinct anchor class)', async () => {
    const app = createApp();
    const add = await request(app).get('/freestyle/tricks?view=add');
    const fam = await request(app).get('/freestyle/tricks?view=family');

    for (const pilot of PILOTS) {
      const addRow  = addRowRegion(add.text, pilot.slug);
      const famCard = cardRegion(fam.text, pilot.slug);
      expect(addRow).not.toBeNull();
      expect(famCard).not.toBeNull();
      // Same href target, different anchor class per contract.
      expect(addRow!).toMatch(
        new RegExp(`<a class="dict-add-row-title" href="/freestyle/tricks/${pilot.slug}">`),
      );
      expect(famCard!).toMatch(
        new RegExp(`<a class="dict-card-title" href="/freestyle/tricks/${pilot.slug}">`),
      );
    }
  });

  it('ADD value is reachable in both views — Family via the N-ADD chip, ADD via section header + line-2 ADD', async () => {
    const app = createApp();
    const add = await request(app).get('/freestyle/tricks?view=add');
    const fam = await request(app).get('/freestyle/tricks?view=family');

    for (const pilot of PILOTS) {
      const addRow  = addRowRegion(add.text, pilot.slug);
      const famCard = cardRegion(fam.text, pilot.slug);
      // Family: the shared-card N-ADD chip carries the label text.
      expect(famCard!).toContain(`${pilot.adds} ADD`);
      // ADD view: the green chip is gone; the value is carried by the
      // ADD-grouped section header + the row's line-2 ADD slot.
      expect(add.text).toContain(`id="add-${pilot.adds}"`);
      expect(addRow!).toContain('class="dict-add-row-add"');
      expect(addRow!).not.toMatch(/class="dict-card-add[ "]/);
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
