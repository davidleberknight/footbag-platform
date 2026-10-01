/**
 * GET /freestyle/by-the-numbers: the histogram cards summarizing how the trick
 * dictionary distributes, each card a gateway into the browse view it counts.
 * The page orients before it counts, and its shared denominator note names the
 * counted population as the browsable dictionary-trick subset.
 */
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3217');

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cachedGet } from '../fixtures/cachedGet';
import { insertFreestyleTrick } from '../fixtures/factories';

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertFreestyleTrick(db, {
    slug: 'zeta_notated', canonical_name: 'Zeta Notated',
    operational_notation: 'TOE > SAME IN [DEX] > SAME TOE', adds: '3', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'zeta_clipper', canonical_name: 'Zeta Clipper',
    operational_notation: 'CLIP > SAME IN [DEX] > SAME CLIP', adds: '4', is_active: 1,
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/by-the-numbers', () => {
  it('renders every histogram card', async () => {
    const res = await page('/freestyle/by-the-numbers');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Freestyle by the Numbers');
    expect(res.text).toContain('by-numbers-grid');
    for (const title of ['ADD', 'Dexterity', 'Entry elements', 'Family endings', 'Body movements']) {
      expect(res.text).toContain(title);
    }
    expect(res.text).toContain('Clipper Stall');
    expect(res.text).toContain('Toe Stall');
  });

  it('opens each card on the browse view it counts, and leaves the dexterity card unlinked', async () => {
    const res = await page('/freestyle/by-the-numbers');
    for (const view of ['view=add', 'view=family', 'view=modifier']) {
      expect(res.text).toContain(`href="/freestyle/tricks?${view}"`);
    }
    // No dictionary view groups by dex count, so that card is a plain panel.
    expect(res.text).toMatch(/<div class="by-numbers-card">\s*<span class="by-numbers-eyebrow">How many dexes define tricks\?<\/span>/);
    expect(res.text).not.toMatch(/view=(dex-count|movement-system|topology|component|category)/);
  });

  it('orients first and carries the count as supporting metadata', async () => {
    const res = await page('/freestyle/by-the-numbers');
    const introAt = res.text.indexOf('How the trick dictionary breaks down');
    const countAt = res.text.indexOf('Counts cover');
    expect(introAt).toBeGreaterThan(-1);
    expect(countAt).toBeGreaterThan(introAt);
    expect(res.text).toContain('2 dictionary tricks');
    expect(res.text).not.toContain('active canonical tricks');
  });

  it('offers a breadcrumb back to the freestyle landing page', async () => {
    const res = await page('/freestyle/by-the-numbers');
    const crumbAt = res.text.indexOf('class="breadcrumb"');
    expect(crumbAt).toBeGreaterThan(-1);
    const crumbs = res.text.slice(crumbAt, crumbAt + 400);
    expect(crumbs).toContain('href="/freestyle"');
    expect(crumbs).toContain('Freestyle by the Numbers');
  });

  it('serves the page to an anonymous visitor and lists it for crawlers', async () => {
    const res = await page('/freestyle/by-the-numbers');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('noindex');
    const sitemap = await page('/sitemap.xml');
    expect(sitemap.text).toContain('/freestyle/by-the-numbers</loc>');
  });
});
