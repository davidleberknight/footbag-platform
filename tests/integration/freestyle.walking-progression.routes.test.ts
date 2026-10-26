/**
 * GET /freestyle/progression/walking-family — retired.
 *
 * The Butterfly family page owns that family's progression, so the old address
 * redirects permanently there, and no page links to the retired address.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cachedGet } from '../fixtures/cachedGet';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3092');

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

beforeAll(async () => {
  const db = createTestDb(dbPath);
  // Butterfly-based tricks, so their pages render the family call to action.
  insertFreestyleTrick(db, { slug: 'butterfly', canonical_name: 'butterfly', adds: '3', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'ripwalk',   canonical_name: 'ripwalk',   adds: '4', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/progression/walking-family — retired', () => {
  it('redirects permanently to the Butterfly family page', async () => {
    const res = await page('/freestyle/progression/walking-family');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('/freestyle/families/butterfly');
  });

  it('is linked from no page that used to point at it', async () => {
    // A link to a retired address sends every reader through a redirect.
    for (const path of ['/freestyle/tricks/ripwalk', '/freestyle/modifier/paradox', '/freestyle/concepts', '/freestyle/tricks?view=family']) {
      const res = await page(path);
      expect(res.status, path).toBe(200);
      expect(res.text, path).not.toContain('href="/freestyle/progression/walking-family"');
    }
  });
});
