/**
 * GET /freestyle/search and GET /freestyle/search/suggest — alias-aware trick
 * search. The page is the no-JS fallback; the suggest endpoint backs the
 * typeahead. Both match on canonical name, slug, and alias text, exclude
 * inactive tricks, and surface the matched alias when the name was not the hit.
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
  insertFreestyleTrick(db, { slug: 'paradox-whirl', canonical_name: 'Paradox Whirl', adds: '4', category: 'compound', sort_order: 2 });
  insertFreestyleTrick(db, { slug: 'mirage',        canonical_name: 'Mirage',        adds: '2', category: 'dex',      sort_order: 3 });
  insertFreestyleTrick(db, { slug: 'retired-trick', canonical_name: 'Retired Trick', adds: '3', sort_order: 4, is_active: 0 });
  // Folk-name alias pointing at an active canonical trick.
  insertFreestyleTrickAlias(db, 'tomahawk', 'paradox-whirl', 'tomahawk');
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
    expect(text).toContain('href="/freestyle/tricks/paradox-whirl"');
  });

  it('matches by hyphen-as-space slug', async () => {
    const { text } = await searchPage('paradox whirl');
    expect(text).toContain('href="/freestyle/tricks/paradox-whirl"');
  });

  it('matches by alias and surfaces the matched alias', async () => {
    const { status, text } = await searchPage('tomahawk');
    expect(status).toBe(200);
    expect(text).toContain('href="/freestyle/tricks/paradox-whirl"');
    expect(text).toContain('also: tomahawk');
  });

  it('rejects a one-character query with a min-length notice', async () => {
    const { status, text } = await searchPage('a');
    expect(status).toBe(200);
    expect(text).toContain('at least 2 characters');
  });

  it('reports no matches for an unknown query', async () => {
    const { text } = await searchPage('zzzznotatrick');
    expect(text).toContain('No tricks found');
  });

  it('excludes inactive tricks', async () => {
    const { text } = await searchPage('retired');
    expect(text).toContain('No tricks found');
    expect(text).not.toContain('href="/freestyle/tricks/retired-trick"');
  });
});

describe('GET /freestyle/search/suggest (JSON typeahead)', () => {
  it('returns matching tricks as JSON', async () => {
    const res = await request(await createApp()).get('/freestyle/search/suggest').query({ q: 'whirl' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const slugs = res.body.map((r: { slug: string }) => r.slug);
    expect(slugs).toContain('whirl');
    expect(slugs).toContain('paradox-whirl');
    const paradox = res.body.find((r: { slug: string }) => r.slug === 'paradox-whirl');
    expect(paradox.href).toBe('/freestyle/tricks/paradox-whirl');
    expect(paradox.matchedAlias).toBeNull();
  });

  it('resolves an alias to its canonical trick with matchedAlias set', async () => {
    const res = await request(await createApp()).get('/freestyle/search/suggest').query({ q: 'tomahawk' });
    expect(res.body).toHaveLength(1);
    expect(res.body[0].slug).toBe('paradox-whirl');
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
