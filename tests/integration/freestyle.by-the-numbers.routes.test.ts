/**
 * GET /freestyle/by-the-numbers: the histogram cards summarizing how the trick
 * dictionary distributes. A card whose dimension a dictionary view groups by
 * links to that view; the dexterity card is summary-only, since no view groups
 * tricks by dex count. The page orients before it counts, and its shared
 * denominator note names the counted population as the browsable
 * dictionary-trick subset.
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
  // No [DEX] token: a zero-dex trick.
  insertFreestyleTrick(db, {
    slug: 'zeta_spin_stall', canonical_name: 'Zeta Spin Stall',
    operational_notation: 'TOE > SPIN [BOD] > SAME TOE', adds: '2', is_active: 1,
  });
  // Two set dexes ahead of a one-dex base: three dexes in all, because the
  // count is every [DEX] in the notation, the set's own included.
  insertFreestyleTrick(db, {
    slug: 'zeta_furious', canonical_name: 'Zeta Furious',
    operational_notation: 'CLIP > OP IN [DEX] > SAME IN [DEX] > SAME OUT [DEX] > SAME TOE', adds: '5', is_active: 1,
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

  it('links each drill-down card to its view and leaves only the dexterity card unlinked', async () => {
    const res = await page('/freestyle/by-the-numbers');
    for (const view of ['view=add', 'view=family', 'view=modifier']) {
      expect(res.text).toContain(`href="/freestyle/tricks?${view}"`);
    }
    // Four cards offer a drill-down and one, dexterity, is summary-only. A
    // linked card losing its link, or a second card going unlinked, changes
    // these counts.
    const linked = res.text.match(/<a class="by-numbers-card" href="\/freestyle\/tricks\?view=[a-z]+">/g) ?? [];
    const unlinked = res.text.match(/<div class="by-numbers-card">/g) ?? [];
    expect(linked.length).toBe(4);
    expect(unlinked.length).toBe(1);
    expect(res.text).not.toMatch(/view=(dex-count|movement-system|topology|component|category)/);
  });

  it('renders the dexterity card from the seeded notation, with no Browse label', async () => {
    const res = await page('/freestyle/by-the-numbers');
    const start = res.text.indexOf('<div class="by-numbers-card">');
    const card = res.text.slice(start, res.text.indexOf('</div>', start));
    expect(card).toContain('How many dexes define tricks?');
    // A summary-only card advertising "Browse" would promise a click that
    // opens nothing.
    expect(card).not.toContain('by-numbers-cta');
    // Seeded: one trick with no [DEX], two with one, one with three (two of
    // them set dexes). A wrong token count or a misfiled trick shows up here as
    // a different bar count, and the empty two-dex bucket must not render.
    const bars = [...card.matchAll(/by-numbers-bar-label">([^<]+)<[\s\S]*?by-numbers-bar-count">(\d+)</g)]
      .map(m => `${m[1]}=${m[2]}`);
    expect(bars).toEqual(['0=1', '1=2', '3+=1']);
    expect(card).toContain('Dex counts include dexes contributed by the set, as written in the trick notation.');
  });

  it('orients first and carries the count as supporting metadata', async () => {
    const res = await page('/freestyle/by-the-numbers');
    const introAt = res.text.indexOf('How the trick dictionary breaks down');
    const countAt = res.text.indexOf('Counts cover');
    expect(introAt).toBeGreaterThan(-1);
    expect(countAt).toBeGreaterThan(introAt);
    // One card links nowhere, so the intro must not promise that every card
    // opens a browse view.
    expect(res.text).not.toContain('Each card opens the browse view it counts');
    expect(res.text).toContain('4 dictionary tricks');
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
