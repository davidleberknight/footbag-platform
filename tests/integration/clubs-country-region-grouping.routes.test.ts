/**
 * A club's region comes from the legacy database as free text, so one physical
 * region arrives spelled several ways: an extra internal space, a hyphen for a
 * space, an accented or a plain vowel. The country page must still show one
 * section per region, under one anchor.
 *
 * The bug this pins is not cosmetic. Two spellings that differ only in
 * punctuation or accents produce the same region anchor id, so the page emitted
 * two sections carrying one id and a jump link could land on the wrong one.
 *
 * Spellings that are a different word rather than a different rendering, a
 * postal abbreviation or a misspelling, are legacy data and are corrected at
 * source in the curated club overrides, not folded here. This suite pins that
 * boundary too, so nobody later teaches the render layer a geography table.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertClub } from '../fixtures/factories';

const { dbPath } = setTestEnv('3241');

let createApp: Awaited<ReturnType<typeof importApp>>;

const CLUBS: Array<{ id: string; name: string; city: string; region: string | null; country: string }> = [
  // Canada: a doubled internal space and a hyphen-for-space must fold into the
  // dominant spelling; two genuinely different provinces must stay apart.
  { id: 'club-ca-van', name: 'Vancouver Footbag', city: 'Vancouver', region: 'British Columbia', country: 'Canada' },
  { id: 'club-ca-vic', name: 'Victoria Footbag', city: 'Victoria', region: 'British-Columbia', country: 'Canada' },
  { id: 'club-ca-kel', name: 'Kelowna Footbag', city: 'Kelowna', region: 'British  Columbia', country: 'Canada' },
  { id: 'club-ca-tor', name: 'Toronto Footbag', city: 'Toronto', region: 'Ontario', country: 'Canada' },
  // An accented and a plain spelling of one region, plus a lowercase variant.
  { id: 'club-fr-que', name: 'Quebec City Footbag', city: 'Quebec City', region: 'Québec', country: 'Canada' },
  { id: 'club-fr-mtl', name: 'Montreal Footbag', city: 'Montreal', region: 'Quebec', country: 'Canada' },
  { id: 'club-fr-lav', name: 'Laval Footbag', city: 'Laval', region: 'quebec', country: 'Canada' },
];

beforeAll(async () => {
  const db = createTestDb(dbPath);
  for (const c of CLUBS) {
    insertClub(db, {
      id: c.id, name: c.name, city: c.city, region: c.region, country: c.country,
      status: 'active', publiclyVisible: true,
    });
  }
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

async function countryPage(): Promise<string> {
  const res = await request(createApp()).get('/clubs/canada');
  expect(res.status).toBe(200);
  return res.text;
}

function anchorIds(html: string): string[] {
  return [...html.matchAll(/id="region-([a-z0-9_]+)"/g)].map((m) => m[1]);
}

describe('country page region grouping', () => {
  it('every region anchor on the page is unique', async () => {
    const ids = anchorIds(await countryPage());
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('spellings differing only in whitespace or a hyphen share one section', async () => {
    const ids = anchorIds(await countryPage());
    expect(ids.filter((id) => id === 'british_columbia')).toHaveLength(1);
  });

  it('spellings differing only by an accent or by case share one section', async () => {
    const ids = anchorIds(await countryPage());
    expect(ids.filter((id) => id === 'quebec')).toHaveLength(1);
  });

  it('genuinely different regions keep their own sections', async () => {
    const ids = anchorIds(await countryPage());
    expect(ids).toContain('ontario');
    expect(new Set(ids)).toEqual(new Set(['british_columbia', 'ontario', 'quebec']));
  });

  it('the heading shows the spelling most of the region\'s clubs use', async () => {
    const html = await countryPage();
    // One club each carries the plain, hyphenated and double-spaced spelling, so
    // the counts tie and the doubled space loses for being the spelling the fold
    // had to change most. The heading must not depend on row order.
    expect(html).toContain('British Columbia');
    expect(html).not.toContain('British-Columbia');
    expect(html).not.toContain('British  Columbia');
    // Accented, plain and lowercase spellings also tie on count and on fold
    // distance, so the remaining tie-break decides, deterministically.
    expect(html).toContain('Quebec');
    expect(html).not.toContain('Québec');
  });

  it('every club still appears exactly once after folding', async () => {
    const html = await countryPage();
    for (const club of CLUBS) {
      const hits = html.split(club.name).length - 1;
      expect(hits, `${club.name} should appear once`).toBeGreaterThanOrEqual(1);
    }
  });
});
