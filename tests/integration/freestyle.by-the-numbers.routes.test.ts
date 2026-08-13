/**
 * GET /freestyle/by-the-numbers: the histogram cards summarizing how the trick
 * dictionary distributes, each card a gateway into the browse view it counts.
 * The page orients before it counts, and its shared denominator note names the
 * counted population as the browsable dictionary-trick subset.
 */
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3217');

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import { insertFreestyleTrick } from '../fixtures/factories';

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertFreestyleTrick(db, {
    slug: 'zeta_notated', canonical_name: 'Zeta Notated',
    operational_notation: 'TOE > SAME IN [DEX] > SAME TOE', adds: 3, is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'zeta_clipper', canonical_name: 'Zeta Clipper',
    operational_notation: 'CLIP > SAME IN [DEX] > SAME CLIP', adds: 4, is_active: 1,
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/by-the-numbers', () => {
  it('renders every histogram card', async () => {
    const res = await request(createApp()).get('/freestyle/by-the-numbers');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Freestyle by the Numbers');
    expect(res.text).toContain('by-numbers-grid');
    for (const title of ['ADD', 'Dexterity', 'Entry sets', 'Family endings', 'Body movements']) {
      expect(res.text).toContain(title);
    }
    expect(res.text).toContain('Clipper Stall');
    expect(res.text).toContain('Toe Stall');
  });

  it('opens each card on the browse view it counts', async () => {
    const res = await request(createApp()).get('/freestyle/by-the-numbers');
    for (const view of ['view=add', 'view=dex-count', 'view=family', 'view=modifier', 'view=movement-system']) {
      expect(res.text).toContain(`/freestyle/tricks?${view}`);
    }
    // The Components card is a strict superset of Entry plus Body, and its only
    // destination is the soft-retired component view.
    expect(res.text).not.toContain('view=component');
  });

  it('orients first and carries the count as supporting metadata', async () => {
    const res = await request(createApp()).get('/freestyle/by-the-numbers');
    const introAt = res.text.indexOf('How the trick dictionary breaks down');
    const countAt = res.text.indexOf('Counts cover');
    expect(introAt).toBeGreaterThan(-1);
    expect(countAt).toBeGreaterThan(introAt);
    expect(res.text).toContain('2 dictionary tricks');
    expect(res.text).not.toContain('active canonical tricks');
  });

  it('offers a breadcrumb back to the freestyle landing page', async () => {
    const res = await request(createApp()).get('/freestyle/by-the-numbers');
    const crumbAt = res.text.indexOf('class="breadcrumb"');
    expect(crumbAt).toBeGreaterThan(-1);
    const crumbs = res.text.slice(crumbAt, crumbAt + 400);
    expect(crumbs).toContain('href="/freestyle"');
    expect(crumbs).toContain('Freestyle by the Numbers');
  });

  it('serves the page to an anonymous visitor and lists it for crawlers', async () => {
    const res = await request(createApp()).get('/freestyle/by-the-numbers');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('noindex');
    const sitemap = await request(createApp()).get('/sitemap.xml');
    expect(sitemap.text).toContain('/freestyle/by-the-numbers</loc>');
  });
});
