/**
 * Trick-detail notation ordering (presentation-only information architecture).
 *
 * A trick page orients before it analyses: plain words saying what the trick is
 * come first, and the notation follows. Opening on a symbol string made a
 * reader scroll past the technical layer to find out what they were looking at.
 *
 * The block renders exactly once per page. A Movement notation block is
 * suppressed where the stored string merely restates the trick's own name, so
 * the fixtures below carry notation their names do not state; otherwise this
 * file would pass or fail for the wrong reason.
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
  const t = (slug: string, name: string, family: string, notation: string) =>
    insertFreestyleTrick(db, {
      slug, canonical_name: name, adds: '4', base_trick: family, trick_family: family,
      category: 'compound', description: `${name} description prose.`,
      notation, operational_notation: 'CLIP > OP IN [DEX] > OP CLIP [XBD] [DEL]',
      review_status: 'curated', is_active: 1,
    });
  // Family-roster anchor (non-first-class).
  t('torque', 'torque', 'osis', 'SET > SPIN [BOD] > SAME IN [DEX] > OP OSIS [DEL]');
  // Major-compound anchor (mobius is in the curated hero-notation set).
  t('mobius', 'mobius', 'torque', 'SET > GYRO > SAME IN [DEX] > OP OSIS [DEL]');
  // First-class roster anchor.
  t('osis', 'osis', 'osis', 'SET > SPIN [BOD] > SAME CLIP [XBD] [DEL]');
  // Non-anchor, non-first-class compound.
  t('paradox-whirl', 'paradox whirl', 'whirl', 'SET > SAME IN [PDX] [DEX] > OP CLIP [XBD] [DEL]');
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

describe('About reads before the notation on every trick page', () => {
  for (const slug of ['torque', 'mobius', 'osis', 'paradox-whirl']) {
    it(`${slug} renders About before the notation block`, async () => {
      const html = await page(slug);
      expect(idx(html, NOTATION)).toBeGreaterThan(-1);
      expect(idx(html, ABOUT)).toBeGreaterThan(-1);
      expect(idx(html, ABOUT)).toBeLessThan(idx(html, NOTATION));
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
