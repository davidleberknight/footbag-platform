/**
 * Pronunciation fact chip on the trick-detail page.
 *
 * A trick with a non-obvious pronunciation renders a compact pronunciation chip
 * in the fact ribbon (not a separate section). A trick without one renders no
 * such chip.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3419');
let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertFreestyleTrick(db, {
    slug: 'guay', canonical_name: 'guay', adds: '2', base_trick: 'guay',
    trick_family: 'inside-stall', category: 'dex',
    operational_notation: 'SET > OP IN [DEX] > OP INSIDE [DEL]',
    review_status: 'expert_reviewed', is_active: 1, pronunciation: 'gwhy',
  });
  insertFreestyleTrick(db, {
    slug: 'dyno', canonical_name: 'dyno', adds: '3', base_trick: 'dyno',
    trick_family: 'dyno', category: 'dex',
    operational_notation: 'SET > OP IN [DEX] > SAME CLIP [XBD] [DEL]',
    review_status: 'expert_reviewed', is_active: 1, pronunciation: null,
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('Pronunciation fact chip', () => {
  it('renders a compact pronunciation chip in the fact ribbon when present', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/guay');
    expect(res.status).toBe(200);
    expect(res.text).toContain('trick-hero-meta-chip-pronunciation');
    expect(res.text).toContain('gwhy');
    expect(res.text).toContain('aria-label="Pronunciation: gwhy"');
    // it is a chip in the ribbon, not a standalone section/heading
    expect(res.text).not.toMatch(/<h2[^>]*>\s*Pronunciation/i);
  });

  it('renders no pronunciation chip when the trick has none', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/dyno');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('trick-hero-meta-chip-pronunciation');
  });
});
