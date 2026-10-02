/**
 * The family-endings chart measures the dictionary as it stands.
 *
 * By the Numbers and the Concepts page both draw a bar per public browse
 * family, sized by that family's membership as the family browse renders it:
 * a branch's tricks count toward its parent root too, and a family below the
 * browse's three-member floor gets no bar. The counts are measured when the page
 * is requested, so a trick added to a family moves its bar on the next request,
 * with no regeneration step that could be forgotten.
 *
 * The suite writes between requests, so each request is made fresh rather than
 * through the shared one-response-per-path fixture.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3221');

let createApp: Awaited<ReturnType<typeof importApp>>;

function seedTrick(db: BetterSqlite3.Database, slug: string, family: string): void {
  insertFreestyleTrick(db, {
    slug, canonical_name: slug.replace(/_/g, ' '), adds: '3',
    base_trick: family, trick_family: family, category: 'compound', is_active: 1,
  });
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  // Osis is a root family and Torque a branch nested under it: three Osis
  // tricks and two Torque tricks make Osis five strong once its branch folds in,
  // and leave Torque one short of the floor.
  for (const slug of ['zeta_osis_a', 'zeta_osis_b', 'zeta_osis_c']) seedTrick(db, slug, 'osis');
  for (const slug of ['zeta_torque_a', 'zeta_torque_b']) seedTrick(db, slug, 'torque');
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

/** The By the Numbers family-endings card, as label → count. */
async function byNumbersFamilyBars(): Promise<Map<string, number>> {
  const res = await request(await createApp()).get('/freestyle/by-the-numbers');
  expect(res.status).toBe(200);
  const start = res.text.indexOf('>Family endings<');
  expect(start, 'the family-endings card renders').toBeGreaterThan(-1);
  const card = res.text.slice(start, res.text.indexOf('by-numbers-cta', start));
  return new Map([...card.matchAll(
    /by-numbers-bar-label">([^<]+)<[\s\S]*?by-numbers-bar-count">(\d+)</g,
  )].map(m => [m[1]!, Number(m[2])]));
}

/** The Concepts page's family chart, as label → count. */
async function conceptsFamilyBars(): Promise<Map<string, number>> {
  const res = await request(await createApp()).get('/freestyle/concepts');
  expect(res.status).toBe(200);
  return new Map([...res.text.matchAll(
    /gloss-histogram-row--family[^>]*>\s*<dt>([^<]+)<\/dt>[\s\S]*?gloss-bar-count">(\d+)</g,
  )].map(m => [m[1]!, Number(m[2])]));
}

describe('family-endings chart', () => {
  it('sizes a root family by its folded membership and gives a family below the floor no bar', async () => {
    // A plain family-column tally would read Osis 3; a bar for Torque would
    // chart a family the browse does not show.
    for (const bars of [await byNumbersFamilyBars(), await conceptsFamilyBars()]) {
      expect(bars.get('Osis')).toBe(5);
      expect(bars.has('Torque')).toBe(false);
    }
  });

  it('keeps the hand-authored surface bars leading the family bars on By the Numbers', async () => {
    const labels = [...(await byNumbersFamilyBars()).keys()];
    expect(labels.slice(0, 2)).toEqual(['Clipper Stall', 'Toe Stall']);
  });

  it('moves a bar on the next request after a trick joins the family', async () => {
    // The defect this replaces: counts baked into a committed file, unchanged
    // by anything published in the app until someone regenerated them.
    const db = new BetterSqlite3(dbPath);
    seedTrick(db, 'zeta_torque_c', 'torque');
    db.close();
    for (const bars of [await byNumbersFamilyBars(), await conceptsFamilyBars()]) {
      expect(bars.get('Torque')).toBe(3);
      expect(bars.get('Osis')).toBe(6);
    }
  });
});
