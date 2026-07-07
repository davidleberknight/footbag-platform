/**
 * Integration tests for alias-slug canonicalization on GET /freestyle/tricks/:slug.
 *
 * The dictionary stores alias names (historical names, abbreviations like atw)
 * mapped to canonical tricks. One canonical URL per trick: a pure alias slug
 * permanently redirects (301) to the canonical trick page rather than rendering
 * a duplicate copy of the page under the alias URL. A canonical slug always
 * renders; modifier and operator slugs keep their existing 301 to the modifier
 * page; an unknown slug is a 404.
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
  insertFreestyleTrickAlias,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3998');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertFreestyleTrick(db, {
    slug: 'around_the_world',
    canonical_name: 'around the world',
    adds: '2',
    base_trick: 'around_the_world',
    trick_family: 'around_the_world',
    category: 'dex',
    review_status: 'expert_reviewed',
    is_active: 1,
    operational_notation: 'SET > OP OUT [DEX] > SAME TOE [DEL]',
  });
  insertFreestyleTrick(db, {
    slug: 'spinning',
    canonical_name: 'spinning',
    adds: '',
    base_trick: 'spinning',
    trick_family: 'spinning',
    category: 'modifier',
    review_status: 'expert_reviewed',
    is_active: 1,
  });
  // A second canonical trick whose slug also appears as an alias_slug row:
  // the canonical row must win (render, never redirect).
  insertFreestyleTrick(db, {
    slug: 'orbit',
    canonical_name: 'orbit',
    adds: '2',
    base_trick: 'orbit',
    trick_family: 'orbit',
    category: 'dex',
    review_status: 'expert_reviewed',
    is_active: 1,
    operational_notation: 'SET > OP IN [DEX] > SAME TOE [DEL]',
  });
  insertFreestyleTrickAlias(db, 'atw', 'around_the_world', 'ATW');
  insertFreestyleTrickAlias(db, 'orbit', 'around_the_world', 'orbit (collision)');
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/tricks/:slug — alias canonicalization', () => {
  it('301-redirects a pure alias slug to the canonical trick URL', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/atw');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('/freestyle/tricks/around_the_world');
  });

  it('renders the canonical slug at 200 (no redirect)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/around_the_world');
    expect(res.status).toBe(200);
    expect(res.text).toContain('around the world');
  });

  it('renders a canonical trick even when an alias row shares its slug', async () => {
    // The alias table maps 'orbit' -> around_the_world, but 'orbit' is itself a
    // canonical trick: the canonical row wins and the page renders.
    const res = await request(await createApp()).get('/freestyle/tricks/orbit');
    expect(res.status).toBe(200);
    expect(res.headers.location).toBeUndefined();
  });

  it('still 301-redirects a modifier slug to its modifier page', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/spinning');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('/freestyle/modifier/spinning');
  });

  it('404s an unknown slug that is neither canonical nor alias', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/zzz_not_a_trick');
    expect(res.status).toBe(404);
  });
});
