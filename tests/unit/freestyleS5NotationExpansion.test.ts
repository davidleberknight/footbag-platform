/**
 * Pre-Adrian polish slice #1 (2026-05-26) — S5 chain reading
 * abbreviation expansion. The tokenizer expands `ss → same-side` and
 * `op → opposite` at render time so equivalence readings don't
 * present a different vocabulary register than JOB notation tokens
 * on the same detail page.
 *
 * Test the behavior via the public route — easier than exposing the
 * tokenizer directly.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3181');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  // Mobius has the deepest S5 ladder that exercises both `ss` and `op`
  // in the same reading. Seed the canonical row to enable detail-page
  // render.
  insertFreestyleTrick(db, {
    slug: 'mobius',
    canonical_name: 'mobius',
    adds: '5', base_trick: 'torque', trick_family: 'torque',
    category: 'compound', review_status: 'expert_reviewed', is_active: 1,
    operational_notation: 'CLIP > (back) SPIN [BOD] > SAME IN [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]',
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('S5 chain reading abbreviation expansion', () => {
  it('mobius S5 ladder renders "same-side" + "opposite" instead of "ss" + "op"', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/mobius');
    expect(res.status).toBe(200);
    // The chain readings ['gyro torque', 'spinning ss torque',
    // 'spinning ss miraging op osis'] should render as expanded forms.
    // Tokens render as individual <span>s, so check token-text presence.
    expect(res.text).toMatch(/>same-side</);
    expect(res.text).toMatch(/>opposite</);
    expect(res.text).toMatch(/>spinning</);
    expect(res.text).toMatch(/>miraging</);
  });

  it('the equivalent-readings list does NOT contain standalone "ss" or "op" tokens', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/mobius');
    // Find the equivalent-readings list slice
    const start = res.text.indexOf('class="equivalent-readings-list"');
    const end = res.text.indexOf('</ol>', start);
    expect(start).toBeGreaterThan(0);
    const slice = res.text.slice(start, end);
    // No standalone <span>ss</span> or <span>op</span> tokens
    expect(slice).not.toMatch(/>ss</);
    expect(slice).not.toMatch(/>op</);
  });

  it('does NOT touch words that merely contain "ss" or "op" as substrings (no spurious expansion)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/mobius');
    // "osis" contains "os" + "is" — must not be transformed into something with "opposite"
    expect(res.text).toContain('osis');
    expect(res.text).not.toContain('osopposite');  // sanity
  });
});
