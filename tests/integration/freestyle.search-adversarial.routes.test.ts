/**
 * GET /freestyle/search and /freestyle/search/suggest — hostile-input hardening.
 *
 * The freestyle trick search is a public free-text surface, so it must stay safe
 * under injection-style strings, Unicode mischief, and oversized queries. The
 * query binds as a positional parameter and its LIKE metacharacters are escaped,
 * so injection cannot execute and a wildcard cannot match everything; this suite
 * proves those properties through the route rather than trusting the mechanism.
 * Every case asserts the request returns a normal empty-result page or JSON array
 * (never a 500), that a wildcard or homoglyph does not falsely match, and that the
 * dictionary tables are untouched after a destructive-looking query.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertFreestyleTrick, insertFreestyleTrickAlias } from '../fixtures/factories';

const { dbPath } = setTestEnv('3607');
let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertFreestyleTrick(db, { slug: 'whirl',         canonical_name: 'Whirl',         adds: '3', category: 'dex',      sort_order: 1 });
  insertFreestyleTrick(db, { slug: 'paradox_whirl', canonical_name: 'Paradox Whirl', adds: '4', category: 'compound', sort_order: 2 });
  insertFreestyleTrick(db, { slug: 'mirage',        canonical_name: 'Mirage',        adds: '2', category: 'dex',      sort_order: 3 });
  insertFreestyleTrickAlias(db, 'tomahawk', 'paradox_whirl', 'tomahawk');
  db.close();
  createApp = await importApp();
});
afterAll(() => cleanupTestDb(dbPath));

async function searchPage(q: string): Promise<{ status: number; text: string }> {
  const res = await request(await createApp()).get('/freestyle/search').query({ q });
  return { status: res.status, text: res.text };
}

async function suggest(q: string): Promise<{ status: number; body: Array<{ slug?: string }> }> {
  const res = await request(await createApp()).get('/freestyle/search/suggest').query({ q });
  return { status: res.status, body: res.body };
}

const INJECTION_PAYLOADS = [
  `'; DROP TABLE freestyle_tricks; --`,
  `" OR "1"="1`,
  `whirl' OR '1'='1' --`,
  `1); DELETE FROM freestyle_tricks; --`,
  `paradox_whirl'); UPDATE freestyle_tricks SET is_active=0; --`,
  `\\'; DROP TABLE freestyle_trick_aliases; --`,
];

describe('adversarial: SQL-injection-like input', () => {
  it('renders the search page without executing the payload and shows no false matches', async () => {
    for (const payload of INJECTION_PAYLOADS) {
      const { status, text } = await searchPage(payload);
      expect(status, `payload should render, not error: ${payload}`).toBe(200);
      // A parameterized query treats the payload as a literal search string, so it
      // matches no seeded trick and links to none of them.
      expect(text).toContain('No tricks or family pages found');
      expect(text).not.toContain('href="/freestyle/tricks/whirl"');
      expect(text).not.toContain('href="/freestyle/tricks/paradox_whirl"');
    }
  });

  it('leaves the dictionary tables intact after every destructive-looking query', async () => {
    for (const payload of INJECTION_PAYLOADS) {
      await searchPage(payload);
      await suggest(payload);
    }
    // The tricks and aliases would be gone or deactivated if any payload had run;
    // a normal search still resolving both the trick and its alias proves they did not.
    const { text } = await searchPage('whirl');
    expect(text).toContain('href="/freestyle/tricks/whirl"');
    expect(text).toContain('href="/freestyle/tricks/paradox_whirl"');
    const aliasHit = await searchPage('tomahawk');
    expect(aliasHit.text).toContain('href="/freestyle/tricks/paradox_whirl"');
  });

  it('answers injection payloads on the suggest endpoint with a plain empty array', async () => {
    for (const payload of INJECTION_PAYLOADS) {
      const { status, body } = await suggest(payload);
      expect(status, `payload should return JSON, not error: ${payload}`).toBe(200);
      expect(Array.isArray(body)).toBe(true);
      expect(body.map(r => r.slug)).not.toContain('whirl');
      expect(body.map(r => r.slug)).not.toContain('paradox_whirl');
    }
  });

  it('treats LIKE wildcards as literal characters, so a wildcard query matches nothing', async () => {
    // If the metacharacter escaping were removed, '%%' would compile to a
    // match-everything LIKE and surface every seeded trick.
    for (const wildcard of ['%%', '__', '%_', '%w%']) {
      const { status, text } = await searchPage(wildcard);
      expect(status).toBe(200);
      expect(text).toContain('No tricks or family pages found');
      expect(text).not.toContain('href="/freestyle/tricks/whirl"');
      expect(text).not.toContain('href="/freestyle/tricks/mirage"');
    }
  });
});

describe('adversarial: Unicode edge cases', () => {
  const UNICODE_QUERIES = [
    'whirl‮',        // right-to-left override appended
    'wh​irl',        // zero-width space inside
    'wh‍irl',        // zero-width joiner inside
    'wͦhͦiͦrͦlͦ',              // combining diacritics on each letter
    '💥footbag🦶',         // emoji / 4-byte code points
    '﻿﻿xy',     // leading byte-order marks
  ];

  it('renders the search page for every Unicode query without a 500', async () => {
    for (const q of UNICODE_QUERIES) {
      const { status } = await searchPage(q);
      expect(status, `unicode query should render: ${JSON.stringify(q)}`).toBe(200);
    }
  });

  it('answers the suggest endpoint for every Unicode query with a JSON array', async () => {
    for (const q of UNICODE_QUERIES) {
      const { status, body } = await suggest(q);
      expect(status, `unicode query should return JSON: ${JSON.stringify(q)}`).toBe(200);
      expect(Array.isArray(body)).toBe(true);
    }
  });

  it('does not confuse a Cyrillic homoglyph for its Latin lookalike', async () => {
    // 'pАradox' with a Cyrillic А (U+0410) must not resolve to the Latin
    // 'Paradox Whirl'; byte-distinct code points are distinct search terms.
    const homoglyph = 'pАradox';
    const { status, text } = await searchPage(homoglyph);
    expect(status).toBe(200);
    expect(text).not.toContain('href="/freestyle/tricks/paradox_whirl"');
    const { body } = await suggest(homoglyph);
    expect(body.map(r => r.slug)).not.toContain('paradox_whirl');
  });
});

describe('adversarial: oversized queries', () => {
  // An oversized query has two safe outcomes by size. A query still under the
  // HTTP request-line limit reaches the app and is handled gracefully (the page
  // matches nothing while binding the long LIKE parameter; the suggest controller
  // caps anything over 100 characters to an empty array). A query that overflows
  // the request-line limit is rejected by the HTTP layer with 431 before it ever
  // reaches the route. Neither outcome may be a 5xx, and neither may touch data.

  it('handles a large under-limit query at the app layer with an empty result', async () => {
    const { status, text } = await searchPage('x'.repeat(1_000));
    expect(status).toBe(200);
    expect(text).toContain('No tricks or family pages found');

    const sug = await suggest('a'.repeat(1_000));
    expect(sug.status).toBe(200);
    expect(sug.body).toEqual([]);
  });

  it('caps the suggest endpoint just past its length limit', async () => {
    const { status, body } = await suggest('a'.repeat(101));
    expect(status).toBe(200);
    expect(body).toEqual([]);
  });

  it('caps the suggest endpoint even when the query starts with a real match', async () => {
    const { status, body } = await suggest('whirl' + 'z'.repeat(200));
    expect(status).toBe(200);
    expect(body).toEqual([]);
  });

  it('rejects a request-line-overflowing query at the HTTP layer, never with a 5xx', async () => {
    for (const q of ['x'.repeat(100_000), 'whirl' + 'z'.repeat(100_000)]) {
      const page = await searchPage(q);
      expect(page.status, `page must not 5xx on ${q.length} chars`).toBeLessThan(500);
      expect([200, 431]).toContain(page.status);

      const sug = await suggest(q);
      expect(sug.status, `suggest must not 5xx on ${q.length} chars`).toBeLessThan(500);
      expect([200, 431]).toContain(sug.status);
    }
  });

  it('leaves the tables intact after oversized queries', async () => {
    await searchPage('x'.repeat(100_000));
    await suggest('a'.repeat(100_000));
    const { text } = await searchPage('whirl');
    expect(text).toContain('href="/freestyle/tricks/whirl"');
  });
});
