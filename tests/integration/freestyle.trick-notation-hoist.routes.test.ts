/**
 * Trick-detail notation hoisting (presentation-only IA).
 *
 * Family/branch anchors that are NOT first-class render the existing
 * Movement-notation block ABOVE Movement Intuition / About so the trick's
 * structure reads near the top, at the same visibility as a first-class
 * page's notation summary. The block is moved, never duplicated:
 *   - anchor, non-first-class  -> notation appears before "About this trick"
 *   - first-class (osis)       -> unchanged: notation stays below About
 *   - non-anchor non-first-class -> unchanged: notation stays below About
 *   - every page renders exactly one notation block
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3611');
let createApp: Awaited<ReturnType<typeof importApp>>;

const NOTATION = 'aria-label="Trick notation"';
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
  // Family-roster anchor (non-first-class) -> hoisted.
  t('torque', 'torque', 'osis');
  // Major-compound anchor (mobius is in the curated hero-notation set) -> hoisted.
  t('mobius', 'mobius', 'torque');
  // First-class roster anchor -> NOT hoisted (must stay unchanged).
  t('osis', 'osis', 'osis');
  // Non-anchor, non-first-class compound -> NOT hoisted (unchanged).
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

describe('Notation hoisting for non-first-class family/branch anchors', () => {
  it('torque renders the notation block before About (hoisted)', async () => {
    const html = await page('torque');
    expect(idx(html, NOTATION)).toBeGreaterThan(-1);
    expect(idx(html, NOTATION)).toBeLessThan(idx(html, ABOUT));
  });

  it('mobius renders the notation block before About (hoisted)', async () => {
    const html = await page('mobius');
    expect(idx(html, NOTATION)).toBeGreaterThan(-1);
    expect(idx(html, NOTATION)).toBeLessThan(idx(html, ABOUT));
  });
});

describe('Unchanged pages', () => {
  it('osis (first-class) is not hoisted — notation never appears before About', async () => {
    const html = await page('osis');
    const ni = idx(html, NOTATION), ai = idx(html, ABOUT);
    // Unchanged = the notation block is not lifted above About. (osis's
    // hero summary is the first-class comparativeNotation card, unaffected.)
    expect(ni === -1 || ni > ai).toBe(true);
  });

  it('a non-anchor non-first-class trick keeps notation below About', async () => {
    const html = await page('paradox-whirl');
    expect(idx(html, NOTATION)).toBeGreaterThan(idx(html, ABOUT));
  });
});

describe('No duplicate notation block', () => {
  it('renders exactly one notation block on a hoisted page', async () => {
    expect(count(await page('torque'), NOTATION)).toBe(1);
  });
  it('renders exactly one notation block on an unchanged page', async () => {
    expect(count(await page('paradox-whirl'), NOTATION)).toBe(1);
  });
});
