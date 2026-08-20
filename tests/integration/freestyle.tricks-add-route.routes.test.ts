/**
 * Canonical per-ADD-tier dictionary routing (/freestyle/tricks/:add) and the
 * dictionary header count.
 *
 * Long-term contract pinned:
 *
 *   1. /freestyle/tricks/5 is the canonical URL for the 5-ADD dictionary
 *      view: it renders only that tier, so reload and back/forward preserve
 *      the selection. An undocumented tier is a 404. ?view=add remains the
 *      all-tier view for existing bookmarks.
 *
 *   2. ADD navigation chips link to the canonical per-tier URLs on every ADD
 *      surface; a tier page leads with an all-tier chip and drops its own.
 *
 *   3. The numeric segment never shadows trick slugs: ordinary slugs and
 *      digit-led slugs (2_bag_juggling) still resolve to the trick-detail
 *      page.
 *
 *   4. A dictionary size line renders under the hero on every state:
 *      'N documented tricks' unfiltered, 'M of N tricks' under a family
 *      filter, and 'X ADD · M tricks' on a tier page.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('4068');
let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  const t = (slug: string, adds: string, family: string, category: string) =>
    insertFreestyleTrick(db, {
      slug, canonical_name: slug.replace(/_/g, ' '), adds,
      base_trick: family, trick_family: family, category,
      review_status: 'curated', is_active: 1,
    });
  t('toe_stall', '1', 'toe_stall', 'dex');
  t('whirl', '3', 'whirl', 'dex');
  t('blurry_whirl', '5', 'whirl', 'compound');
  t('spinning_whirl', '5', 'whirl', 'compound');
  // Digit-led slug: must resolve to trick detail, never the numeric ADD route.
  t('2_bag_juggling', '2', 'toe_stall', 'compound');
  db.close();
  createApp = await importApp();
});
afterAll(() => cleanupTestDb(dbPath));

async function page(url: string): Promise<string> {
  const res = await request(createApp()).get(url);
  expect(res.status).toBe(200);
  return res.text;
}

describe('GET /freestyle/tricks/:add — canonical per-tier view', () => {
  it('renders only the requested tier', async () => {
    const html = await page('/freestyle/tricks/5');
    expect(html).toContain('id="add-5"');
    expect(html).toContain('data-trick-slug="blurry_whirl"');
    expect(html).toContain('data-trick-slug="spinning_whirl"');
    // No other tier sections on the page.
    expect(html).not.toContain('id="add-1"');
    expect(html).not.toContain('id="add-3"');
    expect(html).not.toContain('data-trick-slug="whirl"');
  });

  it('404s for a tier with no documented tricks', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/9');
    expect(res.status).toBe(404);
  });

  it('leads its chip row with the all-tier view and drops its own tier', async () => {
    const html = await page('/freestyle/tricks/5');
    expect(html).toContain('aria-label="Browse by ADD level"');
    expect(html).toContain('<a href="/freestyle/tricks?view=add">All ADD Levels</a>');
    expect(html).toContain('<a href="/freestyle/tricks/1">1 ADD</a>');
    expect(html).toContain('<a href="/freestyle/tricks/3">3 ADD</a>');
    expect(html).not.toContain('<a href="/freestyle/tricks/5">5 ADD</a>');
  });

  it('keeps the sort toggle on the canonical tier path', async () => {
    const alpha = await page('/freestyle/tricks/5');
    expect(alpha).toContain('href="/freestyle/tricks/5?sort=family"');
    const byFamily = await page('/freestyle/tricks/5?sort=family');
    expect(byFamily).toContain('href="/freestyle/tricks/5?sort=alpha"');
  });

  it('carries the tier breadcrumb back to the full dictionary', async () => {
    const html = await page('/freestyle/tricks/5');
    expect(html).toContain('<a href="/freestyle/tricks">Trick Dictionary</a>');
    expect(html).toContain('5 ADD');
  });

  it('keeps the landing orientation tiles off the tier page', async () => {
    const html = await page('/freestyle/tricks/5');
    expect(html).not.toContain('aria-label="About the dictionary"');
    const landing = await page('/freestyle/tricks');
    expect(landing).toContain('aria-label="About the dictionary"');
  });
});

describe('ADD view back-compat and chip navigation', () => {
  it('?view=add still renders every tier on one page', async () => {
    const html = await page('/freestyle/tricks?view=add');
    expect(html).toContain('id="add-1"');
    expect(html).toContain('id="add-3"');
    expect(html).toContain('id="add-5"');
  });

  it('the all-tier chip row navigates to the canonical per-tier URLs', async () => {
    const html = await page('/freestyle/tricks?view=add');
    expect(html).toContain('<a href="/freestyle/tricks/1">1 ADD</a>');
    expect(html).toContain('<a href="/freestyle/tricks/5">5 ADD</a>');
    expect(html).not.toContain('href="#add-');
  });
});

describe('Trick-detail regression — numeric route never shadows slugs', () => {
  it('an ordinary slug still renders the trick-detail page', async () => {
    const html = await page('/freestyle/tricks/whirl');
    expect(html).not.toContain('aria-label="Browse by ADD level"');
    expect(html).toContain('whirl');
  });

  it('a digit-led slug still renders the trick-detail page', async () => {
    const html = await page('/freestyle/tricks/2_bag_juggling');
    expect(html).not.toContain('aria-label="Browse by ADD level"');
    expect(html).toContain('2 Bag Juggling');
  });
});

describe('Dictionary header count', () => {
  it('states the unfiltered documented-trick total', async () => {
    const html = await page('/freestyle/tricks');
    const m = html.match(/<p class="dict-header-count">(\d+) documented tricks<\/p>/);
    expect(m, 'header count line').not.toBeNull();
    // Matches the seeded active trick universe.
    expect(Number(m![1])).toBe(5);
  });

  it('states M of N under a family filter', async () => {
    const html = await page('/freestyle/tricks?family=whirl');
    expect(html).toMatch(/<p class="dict-header-count">3 of 5 tricks<\/p>/);
  });

  it('states the tier and its own count on a tier page', async () => {
    const html = await page('/freestyle/tricks/5');
    expect(html).toMatch(/<p class="dict-header-count">5 ADD · 2 tricks<\/p>/);
  });

  it('uses the singular form for a one-trick tier', async () => {
    const html = await page('/freestyle/tricks/3');
    expect(html).toMatch(/<p class="dict-header-count">3 ADD · 1 trick<\/p>/);
  });
});
