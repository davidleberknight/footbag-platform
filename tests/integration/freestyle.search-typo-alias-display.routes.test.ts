/**
 * GET /freestyle/search — the "also called" hint on a search result is populated
 * only from display-eligible aliases (alias_display = 1). Search still resolves
 * any alias to its trick, so a misspelling or an internal abbreviation still
 * finds the move; but a match on a non-display alias returns the trick with no
 * alias hint, so a misspelled or internal form is never shown back to the visitor
 * as an alternate name. A display-eligible (common) alias still shows its hint.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertFreestyleTrick, insertFreestyleTrickAlias } from '../fixtures/factories';

const { dbPath } = setTestEnv('3781');
let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertFreestyleTrick(db, {
    slug: 'mobius', canonical_name: 'Mobius', adds: '5', category: 'compound',
    review_status: 'expert_reviewed', is_active: 1, sort_order: 1,
  });
  // Misspelling: resolves in search but is never shown (alias_display = 0).
  insertFreestyleTrickAlias(db, 'moebius', 'mobius', 'moebius', { alias_type: 'typo', alias_display: 0 });
  // Internal abbreviation: also resolves but is not a display name.
  insertFreestyleTrickAlias(db, 'gtmob', 'mobius', 'gtmob', { alias_type: 'technical', alias_display: 0 });
  // Established alternate name: display-eligible, so its hint may show.
  insertFreestyleTrickAlias(db, 'moby', 'mobius', 'moby', { alias_type: 'common', alias_display: 1 });
  db.close();
  createApp = await importApp();
});
afterAll(() => cleanupTestDb(dbPath));

async function searchPage(q: string): Promise<{ status: number; text: string }> {
  const res = await request(await createApp()).get('/freestyle/search').query({ q });
  return { status: res.status, text: res.text };
}

describe('GET /freestyle/search — non-display aliases resolve but are not shown', () => {
  it('a misspelling finds the trick but is never rendered as an "also" hint', async () => {
    const { status, text } = await searchPage('moebius');
    expect(status).toBe(200);
    // Findability preserved: the misspelling resolves to the canonical trick.
    expect(text).toContain('href="/freestyle/tricks/mobius"');
    // The misspelled string is never surfaced back to the visitor.
    expect(text).not.toContain('also: moebius');
  });

  it('an internal abbreviation finds the trick but is never rendered as an "also" hint', async () => {
    const { status, text } = await searchPage('gtmob');
    expect(status).toBe(200);
    expect(text).toContain('href="/freestyle/tricks/mobius"');
    expect(text).not.toContain('also: gtmob');
  });

  it('a display-eligible common alias still shows its "also" hint', async () => {
    const { status, text } = await searchPage('moby');
    expect(status).toBe(200);
    expect(text).toContain('href="/freestyle/tricks/mobius"');
    expect(text).toContain('also: moby');
  });
});
