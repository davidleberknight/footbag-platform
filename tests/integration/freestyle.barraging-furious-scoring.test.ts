/**
 * Barraging is retired as a scored operator: where a trick's structure is ruled
 * Furious, its prose and ADD decomposition resolve to Furious, not to a scored
 * barraging operator. Historical barraging trick names and the preserved
 * "barraging legover" / "barraging osis" readings are unaffected.
 *
 * Pins: Nemesis renders as a Furious Barfly (never a barraging barfly), and the
 * curated source stores the ruled Furious readings rather than a scored
 * barraging decomposition.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3141');
let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertFreestyleTrick(db, {
    slug: 'nemesis', canonical_name: 'Nemesis', adds: '6',
    trick_family: 'barfly', category: 'compound', is_active: 1,
    description: 'A furious barfly. For example, from a right clipper set circle the bag twice with each leg to a left clipper delay.',
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/tricks/nemesis — renders as a Furious Barfly', () => {
  it('shows "furious barfly" and never "barraging barfly"', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/nemesis');
    expect(res.status).toBe(200);
    expect(res.text.toLowerCase()).toContain('furious barfly');
    expect(res.text.toLowerCase()).not.toContain('barraging barfly');
  });
});

describe('curated source resolves barraging scoring to Furious', () => {
  const root = process.cwd();

  it('the Nemesis correction stores a furious barfly reading, not a barraging one', () => {
    const csv = readFileSync(join(root, 'freestyle/inputs/curated/tricks/red_corrections_2026_04_20.csv'), 'utf8');
    const row = csv.split('\n').find(l => l.startsWith('nemesis,description,'));
    expect(row, 'nemesis description correction row').toBeDefined();
    expect(row!.toLowerCase()).toContain('a furious barfly');
    expect(row!.toLowerCase()).not.toContain('a barraging barfly');
  });

  it('the Barraging Double Leg Over decomposition scores furious(+2), not barraging(+2)', () => {
    const csv = readFileSync(join(root, 'freestyle/inputs/curated/tricks/red_additions_2026_04_20.csv'), 'utf8');
    const row = csv.split('\n').find(l => l.startsWith('barraging double leg over,'));
    expect(row, 'barraging double leg over row').toBeDefined();
    expect(row!).toContain('furious(+2) + double-leg-over(3)');
    expect(row!).not.toContain('barraging(+2)');
  });
});
