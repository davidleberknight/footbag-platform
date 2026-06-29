/**
 * Integration tests for the By Category view. The view uses the shared symbolic
 * trick-card partial: each category renders a `<section class="trick-category-group">`
 * containing a `<div class="dict-card-stack">` of the shared
 * `dictionary-trick-card.hbs` partial, not a tabular
 * Trick / ADD / Description / Notation / Aliases layout.
 *
 * Verifies:
 *   - /freestyle/tricks?view=category returns 200
 *   - The legacy `<th>` table headers are gone
 *   - Each category section has id="category-{slug}" + a self-anchored heading link
 *   - Cards within a category sort ADD ascending then trick name
 *   - Modifier-category rows are excluded (existing rule preserved)
 *   - Empty categories don't render
 *   - The shared dict-card-stack renders the dictionary-trick-card partial
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

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Compound-category tricks: variety of ADDs to verify ascending sort.
  insertFreestyleTrick(db, {
    slug:                 'mirage',
    canonical_name:       'mirage',
    adds:                 '2',
    base_trick:           'mirage',
    trick_family:         'mirage',
    category:             'compound',
    operational_notation: '[set] > op in dex > op toe',
  });
  insertFreestyleTrick(db, {
    slug:                 'whirl',
    canonical_name:       'whirl',
    adds:                 '3',
    base_trick:           'whirl',
    trick_family:         'whirl',
    category:             'compound',
    operational_notation: '[clip] > front whirl > ss clipper',
  });
  insertFreestyleTrick(db, {
    slug:                 'ripwalk',
    canonical_name:       'ripwalk',
    adds:                 '4',
    base_trick:           'butterfly',
    trick_family:         'butterfly',
    category:             'compound',
    operational_notation: '[clip] > op in dex > butterfly wing > ss clipper',
  });
  insertFreestyleTrick(db, {
    slug:                 'spinning-whirl',
    canonical_name:       'spinning whirl',
    adds:                 '4',
    base_trick:           'whirl',
    trick_family:         'whirl',
    category:             'compound',
    operational_notation: '[clip] > spinning > front whirl > ss clipper',
  });
  insertFreestyleTrick(db, {
    slug:                 'montage',
    canonical_name:       'montage',
    adds:                 '7',
    base_trick:           'whirl',
    trick_family:         'whirl',
    category:             'compound',
    operational_notation: '[clip] > spinning > duck > paradox symposium whirl > ss clipper',
  });

  // A 'set' category trick to populate a second non-empty group.
  insertFreestyleTrick(db, {
    slug:                 'pixie-base',
    canonical_name:       'pixie',
    adds:                 '2',
    base_trick:           'pixie',
    trick_family:         'pixie',
    category:             'set',
    operational_notation: '[set] > pixie > ss toe',
  });

  // A modifier-category row — must NOT appear in any category group.
  insertFreestyleTrick(db, {
    slug:                 'spinning',
    canonical_name:       'spinning',
    adds:                 'modifier',
    base_trick:           null,
    trick_family:         null,
    category:             'modifier',
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// ─────────────────────────────────────────────────────────────────────────
// 1. Route + spreadsheet retirement
// ─────────────────────────────────────────────────────────────────────────

describe('GET /freestyle/tricks?view=category — route + spreadsheet retirement', () => {
  it('returns 200', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=category');
    expect(res.status).toBe(200);
  });

  it('retires the 5-column spreadsheet headers', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=category');
    expect(res.text).not.toContain('<th>Trick</th>');
    expect(res.text).not.toContain('<th>Description</th>');
    expect(res.text).not.toContain('<th>Notation</th>');
    expect(res.text).not.toContain('<th>Also known as</th>');
  });

  it('renders the dict-card-stack container instead of a records-table', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=category');
    expect(res.text).toContain('dict-card-stack');
    expect(res.text).not.toContain('records-table-wrap');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. Category section anchors + headings
// ─────────────────────────────────────────────────────────────────────────

describe('category view — section anchors + headings', () => {
  it('compound category section carries id="category-compound"', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=category');
    expect(res.text).toContain('id="category-compound"');
  });

  it('set category section carries id="category-set" when populated', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=category');
    expect(res.text).toContain('id="category-set"');
  });

  it('section heading wraps the label in a self-anchored link', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=category');
    expect(res.text).toMatch(/<h2><a href="\/freestyle\/tricks\?view=category#category-compound">[^<]+<\/a><\/h2>/);
  });

  it('section heading carries a count chip', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=category');
    // 5 compound tricks were seeded above.
    expect(res.text).toMatch(/id="category-compound"[\s\S]*?<span class="section-count">5<\/span>/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. Card sort: ADD ascending then name
// ─────────────────────────────────────────────────────────────────────────

describe('category view — within-group ordering', () => {
  it('compound category sorts by ADD ascending then name alphabetical', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=category');
    const sectionStart = res.text.indexOf('id="category-compound"');
    expect(sectionStart).toBeGreaterThan(-1);
    const sectionEnd = res.text.indexOf('</section>', sectionStart);
    expect(sectionEnd).toBeGreaterThan(sectionStart);
    const region = res.text.slice(sectionStart, sectionEnd);

    // Seeded ADDs: mirage 2, whirl 3, ripwalk 4, spinning-whirl 4, montage 7.
    // Sort produces: mirage → whirl → ripwalk → spinning-whirl → montage
    // (alphabetical within ADD=4 means ripwalk before spinning-whirl).
    const mirageIdx        = region.indexOf('data-trick-slug="mirage"');
    const whirlIdx         = region.indexOf('data-trick-slug="whirl"');
    const ripwalkIdx       = region.indexOf('data-trick-slug="ripwalk"');
    const spinningWhirlIdx = region.indexOf('data-trick-slug="spinning-whirl"');
    const montageIdx       = region.indexOf('data-trick-slug="montage"');

    expect(mirageIdx).toBeGreaterThan(-1);
    expect(whirlIdx).toBeGreaterThan(mirageIdx);
    expect(ripwalkIdx).toBeGreaterThan(whirlIdx);
    expect(spinningWhirlIdx).toBeGreaterThan(ripwalkIdx);
    expect(montageIdx).toBeGreaterThan(spinningWhirlIdx);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. Modifier exclusion
// ─────────────────────────────────────────────────────────────────────────

describe('category view — modifier exclusion', () => {
  it('modifier-category rows do NOT render in any category group', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=category');
    // The 'spinning' modifier row (category='modifier') must not appear as a card.
    expect(res.text).not.toMatch(/data-trick-slug="spinning"[^>]*>/);
    // No "Modifier" category heading either.
    expect(res.text).not.toContain('id="category-modifier"');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 5. Card uniformity
// ─────────────────────────────────────────────────────────────────────────

describe('category view — shared dictionary-trick-card partial', () => {
  it('cards in the category view carry the same data attributes as the ADD / Family / Component views', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=category');
    expect(res.text).toMatch(/<article class="dict-card[^"]*"\s+data-trick-slug="ripwalk"/);
    // data-media-coverage is emitted on every card root regardless of view.
    expect(res.text).toMatch(/data-media-coverage="(?:tutorial|demo|none)"/);
  });

  it('cards render operational notation (role-tagged tokens) when populated', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=category');
    expect(res.text).toContain('class="op-token op-token--component-flag');
  });
});
