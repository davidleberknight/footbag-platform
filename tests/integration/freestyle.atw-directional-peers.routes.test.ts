/**
 * ATW directional variants are related peers, not a decomposition chain.
 *
 * Around the World, Inside Around the World, and Outside Around the World are
 * independent 2-ADD atoms in their own families (none is the base or family
 * parent of the others). The curated movement-neighborhood overlay connects the
 * three so each surfaces the other two as related directional peers on its
 * detail page.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3328');
let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  for (const dir of ['', 'inside', 'outside']) {
    const slug = dir ? `${dir}_around_the_world` : 'around_the_world';
    insertFreestyleTrick(db, {
      slug, canonical_name: slug.replace(/_/g, ' '), adds: '2',
      base_trick: null, trick_family: slug, category: 'dex',
      review_status: 'expert_reviewed', is_active: 1,
      notation: slug.replace(/_/g, ' ').toUpperCase(),
      operational_notation: `${dir ? dir.toUpperCase() : 'TOE'} > SAME IN [DEX] > SAME TOE [DEL]`,
    });
  }
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('ATW directional variants surface as related peers', () => {
  it('inside variant lists around-the-world and outside-around-the-world as related', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/inside_around_the_world');
    expect(res.status).toBe(200);
    expect(res.text).toContain('href="/freestyle/tricks/around_the_world"');
    expect(res.text).toContain('href="/freestyle/tricks/outside_around_the_world"');
  });

  it('around-the-world lists both directional variants as related', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/around_the_world');
    expect(res.status).toBe(200);
    expect(res.text).toContain('href="/freestyle/tricks/inside_around_the_world"');
    expect(res.text).toContain('href="/freestyle/tricks/outside_around_the_world"');
  });
});
