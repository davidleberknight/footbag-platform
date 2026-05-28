/** Pre-handover probe: verify spin/juggling rows render with structured JOB + op_notation. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3970');
let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertFreestyleTrick(db, { slug: 'spin', canonical_name: 'spin', adds: '1', notation: 'SPIN', operational_notation: 'SPIN [BOD]', category: 'body' });
  insertFreestyleTrick(db, { slug: 'double-spin', canonical_name: 'double spin', adds: '2', notation: 'SPIN > SPIN', operational_notation: 'SPIN [BOD] > SPIN [BOD]', category: 'body' });
  insertFreestyleTrick(db, { slug: '2-bag-juggling', canonical_name: '2-bag-juggling', adds: '2', notation: 'TOE > TOE', operational_notation: 'TOE [DEL] > TOE [DEL]', category: 'multi-bag' });
  insertFreestyleTrick(db, { slug: '3-bag-juggling', canonical_name: '3-bag-juggling', adds: '3', notation: 'TOE > TOE > TOE', operational_notation: 'TOE [DEL] > TOE [DEL] > TOE [DEL]', category: 'multi-bag' });
  db.close();
  createApp = await importApp();
});
afterAll(() => cleanupTestDb(dbPath));

describe('spin/juggling rendering probe', () => {
  it.each([['spin'], ['double-spin'], ['2-bag-juggling'], ['3-bag-juggling']])('GET /freestyle/tricks/%s returns 200', async (slug) => {
    const res = await request(await createApp()).get(`/freestyle/tricks/${slug}`);
    expect(res.status).toBe(200);
  });

  it('spin renders Movement notation block tokenized SPIN', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/spin');
    expect(res.text).toContain('notation-display');
    expect(res.text).toMatch(/notation-token[^>]*>SPIN</);
  });

  it('double-spin renders both SPIN tokens in JOB block', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/double-spin');
    expect(res.text).toContain('notation-display');
    const spinMatches = res.text.match(/notation-token[^>]*>SPIN</g) ?? [];
    expect(spinMatches.length).toBeGreaterThanOrEqual(2);
  });

  it('2-bag-juggling renders TOE > TOE tokens', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/2-bag-juggling');
    expect(res.text).toContain('notation-display');
    const toeMatches = res.text.match(/notation-token[^>]*>TOE</g) ?? [];
    expect(toeMatches.length).toBeGreaterThanOrEqual(2);
  });

  it('3-bag-juggling renders three TOE tokens', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/3-bag-juggling');
    const toeMatches = res.text.match(/notation-token[^>]*>TOE</g) ?? [];
    expect(toeMatches.length).toBeGreaterThanOrEqual(3);
  });

  // Kick-doctrine reclassification: spin + double-spin are first-class tricks
  // (not modifiers), so they must be findable in the trick-browse views.
  it.each([['spin'], ['double-spin']])('%s is findable in the ADD browse view (kick-doctrine trick)', async (slug) => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    expect(res.text).toContain(`data-trick-slug="${slug}"`);
  });

  it('spin + double-spin also appear in the dex-count browse view', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    expect(res.text).toContain('data-trick-slug="spin"');
    expect(res.text).toContain('data-trick-slug="double-spin"');
  });
});
