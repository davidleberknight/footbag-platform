/**
 * Barraging is a historical name for the Furious set, not a set or modifier of
 * its own. Its old standalone URLs redirect permanently, one hop, to the Furious
 * set page; the Furious page renders as the +2 set; and no public copy presents
 * barraging as a scored +1 operator or as decomposing to "high stepping".
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import {
  insertFreestyleTrick,
  insertFreestyleTrickModifier,
  insertFreestyleTrickModifierLink,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3782');
let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  // Furious is the canonical two-dex, +2 set. Seed the modifier and one
  // representative Furious-based trick so the set page renders populated.
  insertFreestyleTrickModifier(db, {
    slug: 'furious', modifier_name: 'furious', add_bonus: 2, add_bonus_rotational: 2,
    modifier_type: 'set', notes: 'Furious is the canonical two-dex uptime set (+2).',
  });
  insertFreestyleTrick(db, {
    slug: 'baroque', canonical_name: 'baroque', adds: '5',
    base_trick: 'osis', trick_family: 'osis', category: 'compound',
    operational_notation: 'CLIP > OP IN [DEX] > SAME IN [DEX] > OP TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrickModifierLink(db, 'baroque', 'furious');
  // A barraging-named Furious compound: the active dictionary keeps these names
  // for continuity, and they are what text-search surfaces for "barraging".
  insertFreestyleTrick(db, {
    slug: 'barraging_mirage', canonical_name: 'barraging mirage', adds: '4',
    base_trick: 'mirage', trick_family: 'mirage', category: 'compound',
    operational_notation: 'CLIP > OP IN [DEX] > SAME IN [DEX] > OP TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrickModifierLink(db, 'barraging_mirage', 'furious');
  // Deliberately DO NOT seed a standalone 'barraging' trick or modifier row:
  // the pipeline retires it, so the redirect must fire without any such row.
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

const FURIOUS = '/freestyle/sets/furious';

describe('Barraging retirement — redirect to the Furious set', () => {
  it('permanently redirects the old modifier route to the Furious set page', async () => {
    const res = await request(await createApp()).get('/freestyle/modifier/barraging');
    expect(res.status).toBe(301);
    expect(res.headers['location']).toBe(FURIOUS);
  });

  it('permanently redirects the old trick route to the Furious set page', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/barraging');
    expect(res.status).toBe(301);
    expect(res.headers['location']).toBe(FURIOUS);
  });

  it('redirects in exactly one hop: the destination returns 200, not another redirect', async () => {
    const first = await request(await createApp()).get('/freestyle/modifier/barraging');
    expect(first.status).toBe(301);
    const dest = await request(await createApp()).get(first.headers['location']!);
    expect(dest.status).toBe(200);
  });

  it('the Furious set page renders as the +2 set', async () => {
    const res = await request(await createApp()).get(FURIOUS);
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Furious/);
    // The Furious set page describes the two-dex set as worth +2.
    expect(res.text).toContain('+2');
  });
});

describe('Barraging retirement — no standalone identity or stale copy', () => {
  it('no standalone barraging trick page renders (the route redirects instead)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/barraging');
    // A redirect, never a 200 trick-detail render.
    expect(res.status).toBe(301);
  });

  it('the operators page shows no "Decomposes as: high stepping" and no +1 barraging rule', async () => {
    const res = await request(await createApp()).get('/freestyle/operators');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Decomposes as: high stepping');
    expect(res.text).not.toMatch(/[Bb]arraging[\s\S]{0,40}\+1/);
  });

  // Barraging names exactly one canonical set (Furious), so its set route
  // redirects to the Furious set page too — not to the glossary. (Miraging, with
  // no single canonical set, keeps its glossary redirect; consistency means each
  // retired nickname reaches its own correct canonical home.)
  it('permanently redirects the old set route to the Furious set page, not the glossary', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/barraging');
    expect(res.status).toBe(301);
    expect(res.headers['location']).toBe(FURIOUS);
    expect(res.headers['location']).not.toMatch(/glossary/);
  });

  it('every resolvable barraging route reaches Furious in one hop and none reaches the glossary', async () => {
    for (const route of ['/freestyle/modifier/barraging', '/freestyle/tricks/barraging', '/freestyle/sets/barraging']) {
      const res = await request(await createApp()).get(route);
      expect(res.status, `${route} status`).toBe(301);
      expect(res.headers['location'], `${route} target`).toBe(FURIOUS);
      const dest = await request(await createApp()).get(res.headers['location']!);
      expect(dest.status, `${route} destination one-hop 200`).toBe(200);
    }
  });

  // The operators sub-route was never a route family, so it stays a 404; no route
  // family is invented for it.
  it('the operators sub-route for barraging is not exposed', async () => {
    const res = await request(await createApp()).get('/freestyle/operators/barraging');
    expect(res.status).toBe(404);
  });
});

describe('Barraging retirement — search behavior (active tricks only)', () => {
  // The freestyle search product indexes active tricks (plus displayed aliases
  // and family pages), never sets. Furious is an intentionally-inactive set row,
  // so search cannot return it; searching "barraging" surfaces the active
  // Furious-based barraging-named compounds instead, and never a standalone
  // barraging identity.
  it('surfaces a Furious-based barraging-named compound, not a standalone barraging', async () => {
    const res = await request(await createApp()).get('/freestyle/search').query({ q: 'barraging' });
    expect(res.status).toBe(200);
    // The barraging-named Furious compound is findable.
    expect(res.text).toContain('/freestyle/tricks/barraging_mirage');
    // No standalone barraging trick result (the closing quote pins the exact slug).
    expect(res.text).not.toContain('href="/freestyle/tricks/barraging"');
  });
});
