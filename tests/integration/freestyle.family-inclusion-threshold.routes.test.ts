/**
 * The by-family browse renders a curated family as its own section only when the
 * family reaches the documented minimum of three active members (the >2 hard
 * rule). The count is the final aggregated membership the page uses: inactive
 * rows do not count, and a memberless umbrella root reaches the floor through its
 * branches. A curated family below the floor renders no section, but its member
 * tricks stay reachable through every other surface (trick pages, ADD browse,
 * search).
 *
 * These seed synthetic membership counts against curated family slugs, so the
 * 2-versus-3 contract is proven deterministically, not from today's database.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3785');
let createApp: Awaited<ReturnType<typeof importApp>>;

// Seed `n` active compound tricks whose trick_family is the given curated family.
function seedFamily(
  db: ReturnType<typeof createTestDb>,
  family: string,
  n: number,
  opts: { active?: boolean; keyPrefix?: string } = {},
): void {
  const active = opts.active ?? true;
  const prefix = opts.keyPrefix ?? family;
  for (let i = 0; i < n; i++) {
    insertFreestyleTrick(db, {
      slug: `${prefix}_m${i}`, canonical_name: `${prefix} m${i}`, adds: '3',
      base_trick: family, trick_family: family, category: 'compound',
      review_status: 'expert_reviewed', is_active: active ? 1 : 0,
      operational_notation: 'SET > OP IN [DEX] > SAME TOE [DEL]',
    });
  }
}

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Root families at controlled counts.
  seedFamily(db, 'whirl', 2);                              // 2 members -> excluded
  seedFamily(db, 'butterfly', 3);                          // exactly 3 -> included
  seedFamily(db, 'mirage', 4);                             // more than 3 -> included
  seedFamily(db, 'pickup', 2);                             // 2 active ...
  seedFamily(db, 'pickup', 1, { active: false, keyPrefix: 'pickup_inactive' }); // ... + 1 inactive -> still excluded

  // Umbrella aggregation: the 'down' root has no direct members, but one member
  // in each of three of its branches lifts the aggregated 'down' count to 3, so
  // 'down' renders while no single 1-member branch does.
  seedFamily(db, 'barfly', 1);
  seedFamily(db, 'double_over_down', 1);
  seedFamily(db, 'paradon', 1);

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

async function familyView(): Promise<string> {
  const res = await request(await createApp()).get('/freestyle/tricks?view=family');
  expect(res.status).toBe(200);
  return res.text;
}

describe('by-family browse — three-member inclusion threshold', () => {
  it('excludes a curated family with only two active members', async () => {
    expect(await familyView()).not.toContain('id="family-whirl"');
  });

  it('includes a curated family with exactly three active members', async () => {
    expect(await familyView()).toContain('id="family-butterfly"');
  });

  it('includes a curated family with more than three active members', async () => {
    expect(await familyView()).toContain('id="family-mirage"');
  });

  it('does not count inactive rows toward the threshold', async () => {
    // pickup has 2 active + 1 inactive; the inactive row must not lift it to 3.
    expect(await familyView()).not.toContain('id="family-pickup"');
  });

  it('uses the final aggregated membership: the down umbrella reaches three via its branches', async () => {
    const text = await familyView();
    // Aggregated down count is 3 (one per branch), so down renders ...
    expect(text).toContain('id="family-down"');
    // ... while each single-member branch stays below the floor.
    expect(text).not.toContain('id="family-barfly"');
    expect(text).not.toContain('id="family-double_over_down"');
    expect(text).not.toContain('id="family-paradon"');
  });
});

describe('by-family browse — members of a below-floor family stay reachable', () => {
  // whirl has two members, so its family section does not render, but the member
  // tricks must remain reachable through every other surface.
  it('keeps a below-floor family member on its own trick page', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/whirl_m0');
    expect(res.status).toBe(200);
  });

  it('keeps a below-floor family member in ADD browsing and search', async () => {
    const app = await createApp();
    const add = await request(app).get('/freestyle/tricks?view=add');
    expect(add.status).toBe(200);
    expect(add.text).toContain('#whirl_m0');
    const search = await request(app).get('/freestyle/search').query({ q: 'whirl m0' });
    expect(search.status).toBe(200);
    expect(search.text).toContain('/freestyle/tricks/whirl_m0');
  });
});
