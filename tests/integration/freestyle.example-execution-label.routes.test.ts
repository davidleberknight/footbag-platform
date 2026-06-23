/**
 * Execution-notation heading: "Example execution" for the operator/set cohort.
 *
 * Bag-launch sets (pixie, fairy, atomic) and explicitly-compositional standalone
 * tricks (barrage, terrage) show one illustrative execution whose entry surface
 * can vary, so their Execution block is headed "Example execution" with a
 * clarifying caption. Concrete bases and ordinary compounds carry a canonical
 * execution and keep the default "Execution notation" heading.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3329');
let createApp: Awaited<ReturnType<typeof importApp>>;

const OP = 'CLIP > SAME IN [DEX] > SAME IN [DEX] > OP TOE [DEL]';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  // Cohort member (explicitly-compositional standalone).
  insertFreestyleTrick(db, {
    slug: 'barrage', canonical_name: 'barrage', adds: '3',
    trick_family: 'barrage', category: 'compound',
    review_status: 'expert_reviewed', is_active: 1,
    notation: 'BARRAGE', operational_notation: OP,
  });
  // Ordinary compound (not in cohort).
  insertFreestyleTrick(db, {
    slug: 'spinning-whirl', canonical_name: 'spinning whirl', adds: '4',
    base_trick: 'whirl', trick_family: 'whirl', category: 'compound',
    review_status: 'expert_reviewed', is_active: 1,
    notation: 'SPINNING WHIRL', operational_notation: OP,
  });
  // Concrete base (not in cohort) — must NOT be relabeled.
  insertFreestyleTrick(db, {
    slug: 'pendulum', canonical_name: 'pendulum', adds: '2',
    trick_family: 'pendulum', category: 'compound',
    review_status: 'expert_reviewed', is_active: 1,
    notation: 'PENDULUM', operational_notation: OP,
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('Execution notation heading label', () => {
  it('barrage (cohort) renders "Example execution" with the entry-surface caption', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/barrage');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Example execution');
    expect(res.text).toContain('One common execution; the entry surface can vary.');
  });

  it('an ordinary compound keeps "Execution notation"', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/spinning-whirl');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Execution notation');
    expect(res.text).not.toContain('Example execution');
  });

  it('a concrete base is not relabeled', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/pendulum');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Execution notation');
    expect(res.text).not.toContain('Example execution');
  });
});
