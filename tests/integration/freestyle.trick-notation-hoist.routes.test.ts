/**
 * Trick-detail notation ordering (presentation-only IA).
 *
 * The Movement-notation block renders first on every trick page — above
 * Movement Intuition and About — so the trick's structure reads before the
 * prose, regardless of whether the trick is a family/branch anchor, a
 * first-class roster anchor, or an ordinary compound. The block renders
 * exactly once per page:
 *   - any page with notation -> notation appears before "About this trick"
 *   - every page renders at most one notation block
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3611');
let createApp: Awaited<ReturnType<typeof importApp>>;

const NOTATION = 'aria-label="Movement notation"';
const ABOUT = 'About this trick';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  const t = (slug: string, name: string, family: string) =>
    insertFreestyleTrick(db, {
      slug, canonical_name: name, adds: '4', base_trick: family, trick_family: family,
      category: 'compound', description: `${name} description prose.`,
      notation: name.toUpperCase(), operational_notation: 'CLIP > OP IN [DEX] > OP CLIP [XBD] [DEL]',
      review_status: 'curated', is_active: 1,
    });
  // Family-roster anchor (non-first-class).
  t('torque', 'torque', 'osis');
  // Major-compound anchor (mobius is in the curated hero-notation set).
  t('mobius', 'mobius', 'torque');
  // First-class roster anchor.
  t('osis', 'osis', 'osis');
  // Non-anchor, non-first-class compound.
  t('paradox-whirl', 'paradox whirl', 'whirl');
  db.close();
  createApp = await importApp();
});
afterAll(() => cleanupTestDb(dbPath));

async function page(slug: string): Promise<string> {
  const res = await request(await createApp()).get(`/freestyle/tricks/${slug}`);
  expect(res.status).toBe(200);
  return res.text;
}
const idx = (html: string, marker: string) => html.indexOf(marker);
const count = (html: string, marker: string) =>
  html.split(marker).length - 1;

describe('Notation renders first on every trick page', () => {
  for (const slug of ['torque', 'mobius', 'osis', 'paradox-whirl']) {
    it(`${slug} renders the notation block before About`, async () => {
      const html = await page(slug);
      expect(idx(html, NOTATION)).toBeGreaterThan(-1);
      expect(idx(html, NOTATION)).toBeLessThan(idx(html, ABOUT));
    });
  }
});

describe('No duplicate notation block', () => {
  it('renders exactly one notation block on an anchor page', async () => {
    expect(count(await page('torque'), NOTATION)).toBe(1);
  });
  it('renders exactly one notation block on an ordinary compound page', async () => {
    expect(count(await page('paradox-whirl'), NOTATION)).toBe(1);
  });
});
