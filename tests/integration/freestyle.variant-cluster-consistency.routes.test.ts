/**
 * Rendered-surface consistency for the variant clusters. Verifies on the live
 * routes that osis shows one either-side catch model on both its trick page and
 * its family card, that around-the-world and orbit prose keep the inward/reverse
 * direction distinction, that furious is not called the barraging pattern, and
 * that the glossary does not describe barrage and furious as one structure named
 * twice.
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

const { dbPath } = setTestEnv('3620');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // osis is a core atom rendered from the curator core-atom spec; the stored
  // notation is present but the spec is what the notation card shows.
  insertFreestyleTrick(db, {
    slug: 'osis', canonical_name: 'osis', adds: '3',
    base_trick: 'osis', trick_family: 'osis', category: 'compound',
    operational_notation: 'SET > (back or front) SPIN [BOD] > SAME/OP CLIP [XBD] [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'around_the_world', canonical_name: 'around the world', adds: '2',
    base_trick: 'around_the_world', trick_family: 'around_the_world', category: 'dex',
    operational_notation: 'TOE > SAME IN [DEX] > SAME TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'orbit', canonical_name: 'orbit', adds: '2',
    base_trick: 'orbit', trick_family: 'orbit', category: 'dex',
    operational_notation: 'TOE > SAME OUT [DEX] > SAME TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'furious', canonical_name: 'furious', adds: '2',
    base_trick: 'furious', trick_family: 'furious', category: 'compound',
    operational_notation: 'CLIP > OP IN [DEX] > SAME IN [DEX] > OP TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/tricks/osis and /freestyle/families/osis — one either-side catch', () => {
  it('the osis trick page notation shows both a same-side and an opposite-side catch token', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/osis');
    expect(res.status).toBe(200);
    expect(res.text).toContain('operational-notation-tokens');
    expect(res.text).toContain('>SAME</span>');
    expect(res.text).toContain('>OP</span>');
  });

  it('the osis family card renders the same either-side SAME/OP clipper catch', async () => {
    const res = await request(await createApp()).get('/freestyle/families/osis');
    expect(res.status).toBe(200);
    expect(res.text).toContain('SAME/OP CLIP');
  });
});

describe('GET /freestyle/tricks/around_the_world and /orbit — direction distinction kept', () => {
  it('the around-the-world page does not claim both directions are around the world', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/around_the_world');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('both directions are worth the same');
  });

  it('the orbit page does not claim orbit and around-the-world are the same movement', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/orbit');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('the same movement');
    expect(res.text).not.toContain('describe the same');
  });
});

describe('GET /freestyle/tricks/furious and /freestyle/glossary — furious distinct from barraging', () => {
  it('the furious trick page does not call it the barraging pattern or the same operator', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/furious');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('barraging pattern');
    expect(res.text).not.toContain('same operator');
  });

  it('the glossary does not call barrage and furious one structure named twice', async () => {
    const res = await request(await createApp()).get('/freestyle/glossary');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('named twice');
    expect(res.text).not.toContain('same two-dex structure');
  });
});
