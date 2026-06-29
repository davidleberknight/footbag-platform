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
 * Extract the two-line <article class="dict-trick-row ...> region for a slug.
 * The migrated browse views (ADD, Family) render this generalized row.
 */
function trickRowRegion(html: string, slug: string): string | null {
  const match = html.match(
    new RegExp(`<article class="dict-trick-row[^"]*"[^>]*data-trick-slug="${slug}"[\\s\\S]*?<\\/article>`),
  );
  return match ? match[0] : null;
}

describe('Presentation-hierarchy contract — ADD View two-line row', () => {
  // The ADD view no longer renders the shared dict-card. It uses the
  // dict-trick-row two-line contract: line 1 (head) = title + hashtag +
  // optional interpretation; line 2 (notation) = JOB + ADD. The canonical
  // ADD-view order is: title (line 1) BEFORE the JOB/ADD notation (line 2).
  for (const pilot of PILOTS) {
    it(`renders ${pilot.slug} with the two-line row order in ADD View`, async () => {
      const app = createApp();
      const res = await request(app).get('/freestyle/tricks?view=add');
      expect(res.status).toBe(200);
      const row = trickRowRegion(res.text, pilot.slug);
      expect(row, `add-row not found for ${pilot.slug} in ADD View`).not.toBeNull();
      const titlePos    = row!.indexOf('class="dict-trick-row-title"');
      const headPos     = row!.indexOf('class="dict-trick-row-head"');
      const notationPos = row!.indexOf('class="dict-trick-row-notation"');
      const jobPos      = row!.indexOf('class="dict-trick-row-label">JOB<');
      const addPos      = row!.indexOf('class="dict-trick-row-label">ADD<');
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

describe('Presentation-hierarchy contract — Family View two-line row', () => {
  // Family migrated to the same generalized two-line dict-trick-row contract
  // as the ADD view. Row order: title (line 1) BEFORE the JOB/ADD notation
  // (line 2). No shared dict-card wrapper, no green chip.
  for (const pilot of PILOTS) {
    it(`renders ${pilot.slug} with the two-line row order in Family View`, async () => {
      const app = createApp();
      const res = await request(app).get('/freestyle/tricks?view=family');
      expect(res.status).toBe(200);
      const row = trickRowRegion(res.text, pilot.slug);
      expect(row, `trick-row not found for ${pilot.slug} in Family View`).not.toBeNull();
      const titlePos    = row!.indexOf('class="dict-trick-row-title"');
      const notationPos = row!.indexOf('class="dict-trick-row-notation"');
      const jobPos      = row!.indexOf('class="dict-trick-row-label">JOB<');
      const addPos      = row!.indexOf('class="dict-trick-row-label">ADD<');
      expect(titlePos).toBeGreaterThanOrEqual(0);
      expect(notationPos).toBeGreaterThan(titlePos);
      expect(jobPos).toBeGreaterThan(notationPos);
      expect(addPos).toBeGreaterThan(jobPos);
      // No shared dict-card wrapper / green chip / deprecated header.
      expect(row!).not.toContain('dict-card--registry');
      expect(row!).not.toMatch(/class="dict-card-add[ "]/);
      expect(row!).not.toContain('class="dict-card-header"');
    });
  }
});

describe('Presentation-hierarchy contract — ADD and Family share the two-line row contract', () => {
  // Both ADD and Family migrated to the generalized two-line dict-trick-row.
  // They render the SAME row contract; only the grouping (ADD bucket vs
  // family section) differs. (Long-term target: every browse view on this
  // same contract.)
  it('dimwalk renders the two-line order (title -> JOB/ADD notation) in BOTH ADD and Family', async () => {
    const app = createApp();
    const add = await request(app).get('/freestyle/tricks?view=add');
    const fam = await request(app).get('/freestyle/tricks?view=family');

    for (const [label, html] of [['ADD', add.text], ['Family', fam.text]] as const) {
      const row = trickRowRegion(html, 'dimwalk');
      expect(row, `dimwalk row missing in ${label} view`).not.toBeNull();
      const titlePos    = row!.indexOf('class="dict-trick-row-title"');
      const notationPos = row!.indexOf('class="dict-trick-row-notation"');
      expect(titlePos).toBeGreaterThanOrEqual(0);
      expect(notationPos).toBeGreaterThan(titlePos);
    }
  });

  it('the detail page is reached through the same Trick Detail link in both views', async () => {
    const app = createApp();
    const add = await request(app).get('/freestyle/tricks?view=add');
    const fam = await request(app).get('/freestyle/tricks?view=family');

    for (const pilot of PILOTS) {
      const addRow = trickRowRegion(add.text, pilot.slug);
      const famRow = trickRowRegion(fam.text, pilot.slug);
      expect(addRow).not.toBeNull();
      expect(famRow).not.toBeNull();
      // The name is plain text; the detail page is reached via the Trick Detail link.
      const pat = new RegExp(`<a class="dict-trick-row-detail" href="/freestyle/tricks/${pilot.slug}">Trick Detail</a>`);
      expect(addRow!).toMatch(pat);
      expect(famRow!).toMatch(pat);
    }
  });

  it('ADD value rides the grouping header + line-2 ADD slot in both views (no green chip)', async () => {
    const app = createApp();
    const add = await request(app).get('/freestyle/tricks?view=add');
    const fam = await request(app).get('/freestyle/tricks?view=family');

    for (const pilot of PILOTS) {
      const addRow = trickRowRegion(add.text, pilot.slug);
      const famRow = trickRowRegion(fam.text, pilot.slug);
      // ADD view groups by ADD bucket; family groups by family section. Both
      // carry the ADD value on the row's line-2 ADD slot, never a green chip.
      expect(add.text).toContain(`id="add-${pilot.adds}"`);
      expect(addRow!).toContain('class="dict-trick-row-add"');
      expect(famRow!).toContain('class="dict-trick-row-add"');
      expect(addRow!).not.toMatch(/class="dict-card-add[ "]/);
      expect(famRow!).not.toMatch(/class="dict-card-add[ "]/);
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
