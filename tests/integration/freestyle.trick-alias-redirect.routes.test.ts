/**
 * Integration tests for alias-slug canonicalization on GET /freestyle/tricks/:slug.
 *
 * The dictionary stores alias names (historical names, abbreviations like atw)
 * mapped to canonical tricks. One canonical URL per trick: a pure alias slug
 * permanently redirects (301) to the canonical trick page rather than rendering
 * a duplicate copy of the page under the alias URL. An active canonical slug
 * always renders its own page and wins even when an alias row shadows the slug;
 * an inactive archived row whose slug is also an alias 301s to its canonical
 * trick; an inactive slug with no alias is a 404, as is an unknown slug; modifier
 * and operator slugs keep their existing 301 to the modifier page. A hyphenated
 * slug 301s to its underscore form when that form is a known trick, alias, or set,
 * since a trick slug is a single lowercase underscore token; a hyphenated slug with
 * no resolving underscore form is a 404, not a redirect to a dead URL.
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
  // An inactive archived row whose slug is also an alias slug: the inactive row
  // never renders, so the alias URL 301s to its canonical trick.
  insertFreestyleTrick(db, {
    slug: 'legbeater',
    canonical_name: 'legbeater',
    adds: '3',
    base_trick: 'legbeater',
    trick_family: 'legbeater',
    category: 'dex',
    review_status: 'expert_reviewed',
    is_active: 0,
  });
  insertFreestyleTrickAlias(db, 'legbeater', 'around_the_world', 'legbeater');
  // An inactive row with no alias: unreachable, a 404 like an unknown slug.
  insertFreestyleTrick(db, {
    slug: 'ghost_inactive',
    canonical_name: 'ghost inactive',
    adds: '2',
    base_trick: 'ghost_inactive',
    trick_family: 'ghost_inactive',
    category: 'dex',
    review_status: 'expert_reviewed',
    is_active: 0,
  });
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

  it('renders the active canonical trick, not the alias target, when an alias row shares its slug', async () => {
    // The alias table maps 'orbit' -> around_the_world, but 'orbit' is itself an
    // active canonical trick: the canonical row wins, so orbit's own page renders
    // and around-the-world's does not.
    const res = await request(await createApp()).get('/freestyle/tricks/orbit');
    expect(res.status).toBe(200);
    expect(res.headers.location).toBeUndefined();
    expect(res.text).toContain('orbit');
    expect(res.text).not.toContain('around the world');
  });

  it('301-redirects an inactive archived slug that is also an alias to its canonical trick', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/legbeater');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('/freestyle/tricks/around_the_world');
  });

  it('404s an inactive slug with no alias (unreachable, like an unknown slug)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/ghost_inactive');
    expect(res.status).toBe(404);
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

  it('301-redirects a hyphenated slug to its underscore canonical URL', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/around-the-world');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('/freestyle/tricks/around_the_world');
  });

  it('404s a hyphenated slug whose underscore form is not a known trick', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/not-a-real-trick');
    expect(res.status).toBe(404);
  });
});
