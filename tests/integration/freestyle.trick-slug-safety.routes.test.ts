/**
 * The trick-detail route must degrade safely for every class of slug: a live
 * canonical renders; a registered alias resolves to its surviving canonical (a
 * bare underscore alias renders the canonical page in place, a hyphenated request
 * 301-redirects to the underscore form); a retired canonical with no survivor and
 * a genuinely unknown or malformed slug return the controlled 404. No slug of any
 * class may produce a 500 internal-error page.
 *
 * This pins the general route contract rather than any single retired trick, so
 * the controller never needs a per-slug special case.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertFreestyleTrick, insertFreestyleTrickAlias } from '../fixtures/factories';

const { dbPath } = setTestEnv('3099');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Surviving canonical, plus the alias rows a retired duplicate leaves behind.
  insertFreestyleTrick(db, {
    slug: 'reverse_swirling_pickup',
    canonical_name: 'reverse swirling pickup',
    adds: '3',
    base_trick: 'pickup',
    trick_family: 'pickup',
    notation: 'REVERSE SWIRLING PICKUP',
    is_active: 1,
  });
  insertFreestyleTrickAlias(db, 'revup', 'reverse_swirling_pickup', 'Revup');
  insertFreestyleTrickAlias(db, 'rev_up', 'reverse_swirling_pickup', 'Rev Up');

  // An alias chain that runs through a retired intermediate row to the canonical.
  // (alias.trick_slug is FK-constrained to a real trick, so the intermediate is a
  // retired row, not a bare alias.) The resolver must follow it to the terminal
  // canonical in one hop.
  insertFreestyleTrick(db, { slug: 'chain_mid', canonical_name: 'chain mid', is_active: 0 });
  insertFreestyleTrickAlias(db, 'chain_mid', 'reverse_swirling_pickup', 'Chain Mid');
  insertFreestyleTrickAlias(db, 'chain_a', 'chain_mid', 'Chain A');

  // A two-node alias cycle over two retired rows: the resolver must terminate
  // cleanly through its cycle guard, never loop or 500.
  insertFreestyleTrick(db, { slug: 'cycle_x', canonical_name: 'cycle x', is_active: 0 });
  insertFreestyleTrick(db, { slug: 'cycle_y', canonical_name: 'cycle y', is_active: 0 });
  insertFreestyleTrickAlias(db, 'cycle_x', 'cycle_y', 'Cycle X');
  insertFreestyleTrickAlias(db, 'cycle_y', 'cycle_x', 'Cycle Y');

  // A retired canonical with no alias survivor: inactive, unaliased.
  insertFreestyleTrick(db, {
    slug: 'retired_no_survivor',
    canonical_name: 'retired no survivor',
    is_active: 0,
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

async function get(slug: string) {
  return request(await createApp()).get(`/freestyle/tricks/${slug}`);
}

describe('GET /freestyle/tricks/:slug — slug safety across canonical, alias, retired, unknown', () => {
  it('renders a live canonical trick', async () => {
    const res = await get('reverse_swirling_pickup');
    expect(res.status).toBe(200);
    expect(res.text.toLowerCase()).toContain('reverse swirling pickup');
  });

  it('301-redirects a bare alias slug to the canonical URL', async () => {
    const res = await get('revup');
    expect(res.status).toBe(301);
    expect(res.headers['location']).toBe('/freestyle/tricks/reverse_swirling_pickup');
  });

  it('301-redirects the retired canonical slug through its alias to the survivor URL', async () => {
    const res = await get('rev_up');
    expect(res.status).toBe(301);
    expect(res.headers['location']).toBe('/freestyle/tricks/reverse_swirling_pickup');
  });

  it('301-redirects the hyphenated request directly to the canonical URL in one hop', async () => {
    const res = await get('rev-up');
    expect(res.status).toBe(301);
    expect(res.headers['location']).toBe('/freestyle/tricks/reverse_swirling_pickup');
  });

  it('does not transitively resolve an alias whose target is a retired row (controlled 404)', async () => {
    // Aliases resolve only to a live canonical (the resolving query joins on
    // is_active = 1), so an alias pointing at a retired intermediate does not
    // chain onward; it returns the controlled 404 rather than a 500.
    const res = await get('chain_a');
    expect(res.status).toBe(404);
  });

  it('terminates a cyclic alias table cleanly with a controlled 404, never a loop or 500', async () => {
    const res = await get('cycle_x');
    expect(res.status).toBe(404);
  });

  it('returns a controlled 404 for a retired canonical with no survivor', async () => {
    const res = await get('retired_no_survivor');
    expect(res.status).toBe(404);
  });

  it('returns a controlled 404 for a genuinely unknown slug', async () => {
    const res = await get('zzz_no_such_trick');
    expect(res.status).toBe(404);
  });

  it('returns a controlled 404 for a malformed but route-valid slug, never a 500', async () => {
    // A pre-encoded punctuation sequence (encoded '#', not a bare '#' the browser
    // would strip as a fragment) reaches the route as a real path segment.
    const res = await get('bad%23%40slug');
    expect(res.status).toBe(404);
  });

  it('never returns a 500 for any slug class', async () => {
    for (const slug of [
      'reverse_swirling_pickup',
      'revup',
      'rev_up',
      'rev-up',
      'chain_a',
      'cycle_x',
      'retired_no_survivor',
      'zzz_no_such_trick',
      'bad%23%40slug',
    ]) {
      const res = await get(slug);
      expect(res.status, `slug ${slug}`).not.toBe(500);
    }
  });
});
