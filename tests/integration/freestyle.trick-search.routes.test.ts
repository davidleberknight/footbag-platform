/**
 * GET /freestyle/search and GET /freestyle/search/suggest — alias-aware trick
 * search plus family-page results. The page is the no-JS fallback; the suggest
 * endpoint backs the typeahead. Trick matching covers canonical name, slug, and
 * alias text, excludes inactive tricks, and surfaces the matched alias when the
 * name was not the hit. Family results come from the gated public-family roster
 * (the same servability rule as the family detail route, so a result never
 * links to a page that would 404): they render in their own band above the
 * trick results with a Family label, and prepend to the suggest JSON with a
 * typeLabel field while trick items keep their exact prior shape.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertFreestyleTrick, insertFreestyleTrickAlias } from '../fixtures/factories';

const { dbPath } = setTestEnv('3601');
let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertFreestyleTrick(db, { slug: 'whirl',         canonical_name: 'Whirl',         adds: '3', category: 'dex',      sort_order: 1 });
  insertFreestyleTrick(db, { slug: 'paradox_whirl', canonical_name: 'Paradox Whirl', adds: '4', category: 'compound', sort_order: 2 });
  insertFreestyleTrick(db, { slug: 'mirage',        canonical_name: 'Mirage',        adds: '2', category: 'dex',      sort_order: 3 });
  insertFreestyleTrick(db, { slug: 'retired_trick', canonical_name: 'Retired Trick', adds: '3', sort_order: 4, is_active: 0 });
  // Folk-name alias pointing at an active canonical trick.
  insertFreestyleTrickAlias(db, 'tomahawk', 'paradox_whirl', 'tomahawk');
  db.close();
  createApp = await importApp();
});
afterAll(() => cleanupTestDb(dbPath));

async function searchPage(q: string): Promise<{ status: number; text: string }> {
  const res = await request(await createApp()).get('/freestyle/search').query({ q });
  return { status: res.status, text: res.text };
}

describe('GET /freestyle/search (server-rendered)', () => {
  it('returns a usable page with no query', async () => {
    const res = await request(await createApp()).get('/freestyle/search');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Search Tricks');
  });

  it('matches by canonical name', async () => {
    const { status, text } = await searchPage('paradox');
    expect(status).toBe(200);
    expect(text).toContain('href="/freestyle/tricks/paradox_whirl"');
  });

  it('matches a spaced query against the underscore slug', async () => {
    const { text } = await searchPage('paradox whirl');
    expect(text).toContain('href="/freestyle/tricks/paradox_whirl"');
  });

  it('matches by alias and surfaces the matched alias', async () => {
    const { status, text } = await searchPage('tomahawk');
    expect(status).toBe(200);
    expect(text).toContain('href="/freestyle/tricks/paradox_whirl"');
    expect(text).toContain('also: tomahawk');
  });

  it('rejects a one-character query with a min-length notice', async () => {
    const { status, text } = await searchPage('a');
    expect(status).toBe(200);
    expect(text).toContain('at least 2 characters');
  });

  it('reports no matches for an unknown query', async () => {
    const { text } = await searchPage('zzzznotatrick');
    expect(text).toContain('No tricks or family pages found');
  });

  it('excludes inactive tricks', async () => {
    const { text } = await searchPage('retired');
    expect(text).toContain('No tricks or family pages found');
    expect(text).not.toContain('href="/freestyle/tricks/retired_trick"');
  });
});

describe('GET /freestyle/search — family-page results', () => {
  it('shows the family band with a link to the family page for a direct family-name query', async () => {
    const { status, text } = await searchPage('butterfly');
    expect(status).toBe(200);
    expect(text).toContain('Family pages');
    expect(text).toContain('href="/freestyle/families/butterfly"');
    expect(text).toContain('>Family<'); // the type badge
  });

  it('renders family and trick results together for a query matching both', async () => {
    const { text } = await searchPage('whirl');
    expect(text).toContain('href="/freestyle/families/whirl"');   // family band
    expect(text).toContain('href="/freestyle/tricks/whirl"');     // trick list unchanged
    expect(text).toContain('href="/freestyle/tricks/paradox_whirl"');
  });

  it('finds a family by name for osis', async () => {
    const { text } = await searchPage('osis');
    expect(text).toContain('href="/freestyle/families/osis"');
  });

  it('folds spaces, hyphens, and underscores when matching family names', async () => {
    const { text } = await searchPage('double legover');
    expect(text).toContain('href="/freestyle/families/double_leg_over"');
  });

  it('offers no family link for a lineage below the family-page threshold', async () => {
    // flurry is on the public roster but is not an official Family Parent, so
    // its detail page does not render and search must not link to it.
    const { text } = await searchPage('flurry');
    expect(text).not.toContain('href="/freestyle/families/flurry"');
    expect(text).toContain('No tricks or family pages found');
  });

  it('links only to family pages that actually render', async () => {
    const res = await request(await createApp()).get('/freestyle/families/butterfly');
    expect(res.status).toBe(200);
  });

  it('carries the updated intro wording', async () => {
    const res = await request(await createApp()).get('/freestyle/search');
    expect(res.text).toContain('Find a trick or family page by name.');
  });
});

describe('GET /freestyle/search/suggest (JSON typeahead)', () => {
  it('returns matching tricks as JSON', async () => {
    const res = await request(await createApp()).get('/freestyle/search/suggest').query({ q: 'whirl' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const slugs = res.body.map((r: { slug: string }) => r.slug);
    expect(slugs).toContain('whirl');
    expect(slugs).toContain('paradox_whirl');
    const paradox = res.body.find((r: { slug: string }) => r.slug === 'paradox_whirl');
    expect(paradox.href).toBe('/freestyle/tricks/paradox_whirl');
    expect(paradox.matchedAlias).toBeNull();
  });

  it('resolves an alias to its canonical trick with matchedAlias set', async () => {
    const res = await request(await createApp()).get('/freestyle/search/suggest').query({ q: 'tomahawk' });
    expect(res.body).toHaveLength(1);
    expect(res.body[0].slug).toBe('paradox_whirl');
    expect(res.body[0].matchedAlias).toBe('tomahawk');
  });

  it('returns an empty array for an empty query', async () => {
    const res = await request(await createApp()).get('/freestyle/search/suggest').query({ q: '' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns an empty array for an over-long query', async () => {
    const res = await request(await createApp()).get('/freestyle/search/suggest').query({ q: 'x'.repeat(101) });
    expect(res.body).toEqual([]);
  });

  it('excludes inactive tricks from suggestions', async () => {
    const res = await request(await createApp()).get('/freestyle/search/suggest').query({ q: 'retired' });
    expect(res.body).toEqual([]);
  });

  it('prepends a family suggestion with its type label ahead of trick items', async () => {
    const res = await request(await createApp()).get('/freestyle/search/suggest').query({ q: 'whirl' });
    expect(res.status).toBe(200);
    const first = res.body[0];
    expect(first.typeLabel).toBe('Family');
    expect(first.href).toBe('/freestyle/families/whirl');
    expect(first.name).toBe('Whirl');

    // Trick items keep their exact prior shape: no typeLabel field.
    const paradox = res.body.find((r: { slug: string; typeLabel?: string }) => r.slug === 'paradox_whirl');
    expect(paradox).toBeDefined();
    expect(paradox.typeLabel).toBeUndefined();
    expect(paradox.href).toBe('/freestyle/tricks/paradox_whirl');
  });

  it('suggests a family even when no trick matches', async () => {
    const res = await request(await createApp()).get('/freestyle/search/suggest').query({ q: 'butterfly' });
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].typeLabel).toBe('Family');
    expect(res.body[0].href).toBe('/freestyle/families/butterfly');
  });

  it('offers no family suggestion for a below-threshold lineage', async () => {
    const res = await request(await createApp()).get('/freestyle/search/suggest').query({ q: 'flurry' });
    expect(res.body).toEqual([]);
  });
});

describe('route ordering', () => {
  it('serves /freestyle/search as the search page, not a trick slug', async () => {
    const res = await request(await createApp()).get('/freestyle/search');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Search Tricks');
  });

  it('still resolves a real trick detail slug', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/whirl');
    expect(res.status).toBe(200);
  });
});
