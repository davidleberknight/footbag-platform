/**
 * Family displayed counts are live rendered membership, not a hardcoded map, and
 * family eligibility is a curated roster independent of those counts. These tests
 * seed known family populations and assert the number shown equals the tricks
 * rendered, including the umbrella-vs-branch overlap that must stay a real sum
 * rather than being deduplicated into a false unique total.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3531');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  const rows: Array<Parameters<typeof insertFreestyleTrick>[1]> = [
    // drifter: a first-class family with exactly 4 live members
    { slug: 'drifter',           canonical_name: 'drifter',           adds: '2', base_trick: 'drifter',           trick_family: 'drifter',           category: 'dex',      review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'spinning_drifter',  canonical_name: 'spinning drifter',  adds: '3', base_trick: 'drifter',           trick_family: 'drifter',           category: 'compound', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'toe_drifter',       canonical_name: 'toe drifter',       adds: '3', base_trick: 'drifter',           trick_family: 'drifter',           category: 'compound', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'fairy_drifter',     canonical_name: 'fairy drifter',     adds: '4', base_trick: 'drifter',           trick_family: 'drifter',           category: 'compound', review_status: 'expert_reviewed', is_active: 1 },
    // eclipse: a minor lineage with exactly 3 live members
    { slug: 'eclipse',           canonical_name: 'eclipse',           adds: '3', base_trick: 'eclipse',           trick_family: 'eclipse',           category: 'dex',      review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'spinning_eclipse',  canonical_name: 'spinning eclipse',  adds: '4', base_trick: 'eclipse',           trick_family: 'eclipse',           category: 'compound', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'blurry_eclipse',    canonical_name: 'blurry eclipse',    adds: '5', base_trick: 'eclipse',           trick_family: 'eclipse',           category: 'compound', review_status: 'expert_reviewed', is_active: 1 },
    // down umbrella branches: barfly (2) + double_over_down (2) => down shows 4
    { slug: 'barfly',            canonical_name: 'barfly',            adds: '3', base_trick: 'barfly',            trick_family: 'barfly',            category: 'compound', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'spinning_barfly',   canonical_name: 'spinning barfly',   adds: '4', base_trick: 'barfly',            trick_family: 'barfly',            category: 'compound', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'double_over_down',  canonical_name: 'double over down',  adds: '3', base_trick: 'double_over_down',  trick_family: 'double_over_down',  category: 'compound', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'spinning_dod',      canonical_name: 'spinning dod',      adds: '4', base_trick: 'double_over_down',  trick_family: 'double_over_down',  category: 'compound', review_status: 'expert_reviewed', is_active: 1 },
  ];
  for (const r of rows) insertFreestyleTrick(db, r);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

const memberSectionCount = (html: string) =>
  html.match(/Member tricks<\/h2>\s*<span class="section-count">(\d+)<\/span>/)?.[1];

// The trick-detail links inside the rendered member list on a family page.
const renderedMemberSlugs = (html: string): string[] =>
  [...html.matchAll(/<li class="set-detail-trick">\s*<a href="\/freestyle\/tricks\/([a-z0-9_]+)"/g)]
    .map(m => m[1]);

describe('family-detail displayed count equals the trick cards rendered on that exact page', () => {
  it('a first-class family count equals its live, distinct member cards (no duplicates)', async () => {
    const res = await request(await createApp()).get('/freestyle/families/drifter');
    expect(res.status).toBe(200);
    const slugs = renderedMemberSlugs(res.text);
    expect(slugs).toHaveLength(4);
    expect(new Set(slugs).size).toBe(4);              // no duplicate card
    expect(memberSectionCount(res.text)).toBe(String(slugs.length));
    for (const member of ['spinning drifter', 'toe drifter', 'fairy drifter']) {
      expect(res.text.toLowerCase()).toContain(member);
    }
  });
});

describe('minor-lineage band count equals live rendered membership', () => {
  it('the eclipse lineage count equals its live members', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=family');
    expect(res.status).toBe(200);
    const m = res.text.match(
      /family=eclipse"[^<]*>[^<]*<\/a>\s*<span class="trick-minor-lineage-count">(\d+)<\/span>/,
    );
    expect(m?.[1]).toBe('3');
  });
});

describe('umbrella and branch overlap is a real sum, not a deduplicated unique total', () => {
  it('the down umbrella count is the sum of its branch memberships, with no card rendered twice', async () => {
    const res = await request(await createApp()).get('/freestyle/families/down');
    expect(res.status).toBe(200);
    // down aggregates barfly (2) + double_over_down (2) = 4 distinct cards, none
    // rendered twice on the page. The same barfly members are also counted under
    // the barfly family, so the cross-family total is a real sum, not deduped.
    const slugs = renderedMemberSlugs(res.text);
    expect(slugs).toHaveLength(4);
    expect(new Set(slugs).size).toBe(4);              // no card appears twice on the umbrella page
    expect(memberSectionCount(res.text)).toBe(String(slugs.length));
    expect(res.text.toLowerCase()).toContain('spinning barfly');
    expect(res.text.toLowerCase()).toContain('spinning dod');
  });

  it('a branch family reports its own membership independently (overlap, not dedup)', async () => {
    const res = await request(await createApp()).get('/freestyle/families/barfly');
    expect(res.status).toBe(200);
    expect(memberSectionCount(res.text)).toBe('2');
  });
});
