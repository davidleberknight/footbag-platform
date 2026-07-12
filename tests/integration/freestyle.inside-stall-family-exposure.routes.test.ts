/**
 * inside_stall is a first-class public family (the terminal surface identity the
 * guay lineage lands into), exposed on the Family view through the public-family
 * allow-list. This is the sole authority for family exposure; there is no
 * competing family-retirement deny-list. Pins that an inside_stall family with
 * active members renders its own Family-view section.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3524');
let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  // Three active members put the family above the singleton drop and the
  // public-family minimum-member rule.
  for (const t of [
    { slug: 'guay',         canonical_name: 'guay' },
    { slug: 'reverse_guay', canonical_name: 'reverse guay' },
    { slug: 'nuclear_guay', canonical_name: 'nuclear guay' },
  ]) {
    insertFreestyleTrick(db, {
      slug: t.slug, canonical_name: t.canonical_name, adds: '2',
      trick_family: 'inside_stall', category: 'compound',
      review_status: 'expert_reviewed', is_active: 1,
    });
  }
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('Family view — inside_stall is exposed as a public family', () => {
  it('renders an inside_stall family section with its members', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=family');
    expect(res.status).toBe(200);
    expect(res.text).toContain('id="family-inside_stall"');
    expect(res.text).toContain('Inside Stall');
    expect(res.text).toContain('data-trick-slug="guay"');
  });
});
