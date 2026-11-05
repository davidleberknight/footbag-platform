/**
 * Breadcrumbs sit in the hero only on a page two or more levels below its
 * section's landing page. A page one level below carries no trail and closes
 * instead with a back link to the landing page, so the visitor always has a
 * way up and the hero carries only its own parts.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cachedGet } from '../fixtures/cachedGet';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertClub, insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3999');

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

// Every page one level below its section's landing page, with that landing.
const ONE_LEVEL: ReadonlyArray<{ path: string; landing: string }> = [
  { path: '/freestyle/records', landing: '/freestyle' },
  { path: '/freestyle/leaders', landing: '/freestyle' },
  { path: '/freestyle/competition', landing: '/freestyle' },
  { path: '/freestyle/partnerships', landing: '/freestyle' },
  { path: '/freestyle/history', landing: '/freestyle' },
  { path: '/freestyle/tricks', landing: '/freestyle' },
  { path: '/freestyle/add-analysis', landing: '/freestyle' },
  { path: '/freestyle/combo-analysis', landing: '/freestyle' },
  { path: '/freestyle/start', landing: '/freestyle' },
  { path: '/freestyle/about', landing: '/freestyle' },
  { path: '/freestyle/concepts', landing: '/freestyle' },
  { path: '/freestyle/glossary', landing: '/freestyle' },
  { path: '/freestyle/observational', landing: '/freestyle' },
  { path: '/freestyle/operators', landing: '/freestyle' },
  { path: '/freestyle/sets', landing: '/freestyle' },
  { path: '/freestyle/by-the-numbers', landing: '/freestyle' },
  { path: '/clubs/argentina', landing: '/clubs' },
];

// The hero runs from its own opening to the first wrapper after it; the site
// header opens a wrapper of its own before the hero.
function hero(html: string): string {
  const start = html.indexOf('<div class="hero');
  return start === -1 ? '' : html.slice(start, html.indexOf('<div class="wrapper', start));
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertClub(db, {
    id: 'club-ar-bc', name: 'Buenos Aires Breadcrumb Club', city: 'Buenos Aires', region: null,
    country: 'Argentina', status: 'active', publiclyVisible: true,
  });
  insertFreestyleTrick(db, {
    slug: 'whirl', canonical_name: 'whirl', adds: '3', category: 'dex',
    review_status: 'expert_reviewed', is_active: 1,
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('breadcrumb depth', () => {
  it('a page one level below its landing has no breadcrumb trail and closes with a back link to the landing', async () => {
    // Defect caught: a shallow page repeats its own title in a trail above the
    // heading, or loses its only way up when the trail is removed.
    const problems: string[] = [];
    for (const { path, landing } of ONE_LEVEL) {
      const res = await page(path);
      if (res.status !== 200) { problems.push(`${path}: status ${res.status}`); continue; }
      const h = hero(res.text);
      if (!h.includes('<h1')) problems.push(`${path}: no hero found`);
      if (h.includes('class="breadcrumb"')) problems.push(`${path}: breadcrumb trail in the hero`);
      const body = res.text.slice(res.text.indexOf('<div class="wrapper', res.text.indexOf('<div class="hero')));
      if (!body.includes(`<a href="${landing}" class="action-link">`)) problems.push(`${path}: no back link to ${landing}`);
    }
    expect(problems).toEqual([]);
  });

  it('a page two levels below its landing keeps its breadcrumb trail', async () => {
    // Defect caught: the deep pages that need a trail lose it with the shallow ones.
    const res = await page('/freestyle/tricks/whirl');
    expect(res.status).toBe(200);
    expect(hero(res.text)).toContain('class="breadcrumb"');
  });
});
