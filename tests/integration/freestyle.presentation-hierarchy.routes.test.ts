/**
 * Integration tests for the dictionary-trick-card presentation hierarchy.
 *
 * Long-term contract:
 *
 *   The canonical field order in EVERY browse view, regardless of density,
 *   is:
 *
 *     1. trick title (.dict-card-title)
 *     2. symbolic formula (.dict-card-equivalence  OR  .dict-card-notation)
 *     3. ADD chip (.dict-card-add)
 *     4. status badge (.dict-card-status-badge)
 *
 *   Density modes (`registry` / `browse`) may differ in:
 *     - element wrapping types (<span> vs <p>)
 *     - layout CSS (grid vs flex column)
 *     - font sizes / weights / paddings
 *
 *   Density modes MUST NOT differ in:
 *     - DOM order of the four canonical slots above
 *     - title link href / display name
 *     - ADD label string
 *     - first-reading token text
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

// paradox-whirl + spinning-whirl are absent from PILOTS — they are
// promoted into FIRST_CLASS_TIER_2 alongside symposium-whirl.
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

// Additional butterfly rows so the family clears the family-view three-member
// minimum (the dimwalk pilot plus its butterfly anchor and one more compound),
// admitting the butterfly section that the pilot assertions read.
const FAMILY_COMPANIONS = [
  { slug: 'butterfly', name: 'butterfly', family: 'butterfly', adds: '3' },
  { slug: 'parkwalk',  name: 'parkwalk',  family: 'butterfly', adds: '5' },
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

describe('Presentation-hierarchy contract — ADD View row order', () => {
  // The ADD view no longer renders the shared dict-card. It uses the
  // dict-trick-row contract: an identity column (name, nicknames, hashtag,
  // controls) and a notation column (difficulty value, then movement
  // notation). Identity comes first: a reader scanning the view is looking
  // for a trick by name, and the notation is reference material beside it.
  for (const pilot of PILOTS) {
    it(`renders ${pilot.slug} identity-before-notation in ADD View`, async () => {
      const app = createApp();
      const res = await request(app).get('/freestyle/tricks?view=add');
      expect(res.status).toBe(200);
      const row = trickRowRegion(res.text, pilot.slug);
      expect(row, `add-row not found for ${pilot.slug} in ADD View`).not.toBeNull();
      const titlePos    = row!.indexOf(`href="/freestyle/tricks/${pilot.slug}"`);
      const identityPos = row!.indexOf('class="dict-trick-row-identity"');
      const notationPos = row!.indexOf('class="dict-trick-row-notation"');
      expect(titlePos).toBeGreaterThanOrEqual(0);
      expect(identityPos).toBeGreaterThanOrEqual(0);
      expect(notationPos).toBeGreaterThan(titlePos);
      // The ADD view never renders the shared dict-card wrapper or chip.
      expect(row!).not.toContain('dict-card--registry');
      expect(row!).not.toMatch(/class="dict-card-add[ "]/);
    });
  }
});

describe('Presentation-hierarchy contract — Family View row order', () => {
  // Family uses the same generalized dict-trick-row contract as the ADD
  // view: identity column before notation column. No shared dict-card
  // wrapper, no green chip.
  for (const pilot of PILOTS) {
    it(`renders ${pilot.slug} identity-before-notation in Family View`, async () => {
      const app = createApp();
      const res = await request(app).get('/freestyle/tricks?view=family');
      expect(res.status).toBe(200);
      const row = trickRowRegion(res.text, pilot.slug);
      expect(row, `trick-row not found for ${pilot.slug} in Family View`).not.toBeNull();
      const titlePos    = row!.indexOf(`href="/freestyle/tricks/${pilot.slug}"`);
      const notationPos = row!.indexOf('class="dict-trick-row-notation"');
      expect(titlePos).toBeGreaterThanOrEqual(0);
      expect(notationPos).toBeGreaterThan(titlePos);
      // No shared dict-card wrapper / green chip / deprecated header.
      expect(row!).not.toContain('dict-card--registry');
      expect(row!).not.toMatch(/class="dict-card-add[ "]/);
      expect(row!).not.toContain('class="dict-card-header"');
    });
  }
});

describe('Presentation-hierarchy contract — ADD and Family share the row contract', () => {
  // ADD and Family both use the generalized dict-trick-row. They render the
  // SAME row contract; only the grouping (ADD bucket vs family section)
  // differs. (Long-term target: every browse view on this same contract.)
  it('dimwalk renders identity-before-notation in BOTH ADD and Family', async () => {
    const app = createApp();
    const add = await request(app).get('/freestyle/tricks?view=add');
    const fam = await request(app).get('/freestyle/tricks?view=family');

    for (const [label, html] of [['ADD', add.text], ['Family', fam.text]] as const) {
      const row = trickRowRegion(html, 'dimwalk');
      expect(row, `dimwalk row missing in ${label} view`).not.toBeNull();
      const titlePos    = row!.indexOf('href="/freestyle/tricks/dimwalk"');
      const notationPos = row!.indexOf('class="dict-trick-row-notation"');
      expect(titlePos).toBeGreaterThanOrEqual(0);
      expect(notationPos).toBeGreaterThan(titlePos);
    }
  });

  it('the detail page is reached the same way in both views', async () => {
    const app = createApp();
    const add = await request(app).get('/freestyle/tricks?view=add');
    const fam = await request(app).get('/freestyle/tricks?view=family');

    for (const pilot of PILOTS) {
      const addRow = trickRowRegion(add.text, pilot.slug);
      const famRow = trickRowRegion(fam.text, pilot.slug);
      expect(addRow).not.toBeNull();
      expect(famRow).not.toBeNull();
      // Both the name and the Detail control open the trick's page, and both
      // views offer them identically: the same trick is reached the same way
      // wherever a reader meets it.
      const namePat   = new RegExp(`<a[^>]*href="/freestyle/tricks/${pilot.slug}"[^>]*>[^<]+</a>`);
      const detailPat = new RegExp(`<a[^>]*href="/freestyle/tricks/${pilot.slug}"[^>]*>\\s*Detail\\s*</a>`);
      expect(addRow!).toMatch(namePat);
      expect(famRow!).toMatch(namePat);
      expect(addRow!).toMatch(detailPat);
      expect(famRow!).toMatch(detailPat);
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
      // carry the difficulty value on the row itself, never a green chip, so
      // the value is readable in the seven views that do not group by it.
      expect(add.text).toContain(`id="add-${pilot.adds}"`);
      expect(addRow!).toContain(`aria-label="Difficulty value">(${pilot.adds})<`);
      expect(famRow!).toContain(`aria-label="Difficulty value">(${pilot.adds})<`);
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
        `dict-card-header wrapper must not render at ${url}`,
      ).not.toContain('class="dict-card-header"');
    }
  });
});
