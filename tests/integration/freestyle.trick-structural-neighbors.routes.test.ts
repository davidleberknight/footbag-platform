/**
 * GET /freestyle/tricks/:slug — Structural Neighbors block.
 *
 * The operator-adjacency block is rendered from each trick's base_trick and its
 * modifier-link multiset, independent of the family-based Related Tricks block.
 *
 * The block renders only the same-operator-other-base kin and same-structure
 * twin buckets. Same-base relating (built-on / swap / extend) is owned by the
 * family ladder and is not rendered here.
 *
 * Behaviors pinned:
 *   1. A trick with operators renders the block with its same-operator-other-base
 *      kin entry; the same-base buckets are not rendered.
 *   2. A folk twin merges with its compositional name (≡) and carries a
 *      structural gloss in the same-structure bucket.
 *   3. A trick with no same-operator kin and no twin renders NO block.
 *   4. The empty-operator-set sibling rule is suppressed: a 0-operator trick
 *      renders no block and never lists other 0-operator members as siblings.
 *   5. A self-based, childless 0-operator trick renders NO block at all.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertFreestyleTrick,
  insertFreestyleTrickModifier,
  insertFreestyleTrickModifierLink,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3533');

let createApp: Awaited<ReturnType<typeof importApp>>;

const t = (
  slug: string,
  adds: string,
  base_trick: string,
  trick_family: string,
  category: 'dex' | 'compound' = 'compound',
) => ({ slug, canonical_name: slug.replace(/-/g, ' '), adds, base_trick, trick_family, category, is_active: 1 as const });

beforeAll(async () => {
  const db = createTestDb(dbPath);

  for (const m of ['gyro', 'atomic', 'diving', 'spinning']) {
    insertFreestyleTrickModifier(db, { slug: m, add_bonus: 1, modifier_type: 'body' });
  }

  const rows = [
    // osis -> torque -> mobius{gyro}; atomic-torque{atomic}; gyro-osis{gyro}
    t('osis', '3', 'osis', 'osis', 'dex'),
    t('torque', '4', 'osis', 'osis'),
    t('mobius', '5', 'torque', 'osis'),
    t('atomic-torque', '5', 'torque', 'osis'),
    t('gyro-osis', '4', 'osis', 'osis'),
    // whirl -> diving-whirl ≡ hatchet (twin); spinning-whirl -> double-spinning-whirl
    t('whirl', '3', 'whirl', 'whirl', 'dex'),
    t('diving-whirl', '4', 'whirl', 'whirl'),
    t('hatchet', '4', 'whirl', 'whirl'),
    t('spinning-whirl', '4', 'whirl', 'whirl'),
    t('double-spinning-whirl', '5', 'whirl', 'whirl'),
    // pixie -> pixie-kick (0-op) + trixie (0-op noise, must not be a sibling)
    t('pixie', '2', 'pixie', 'pixie', 'dex'),
    t('pixie-kick', '1', 'pixie', 'pixie', 'dex'),
    t('trixie', '5', 'pixie', 'pixie'),
    // self-based, childless 0-op -> no block
    t('atomic-kick', '1', 'atomic-kick', 'atomic-kick', 'dex'),
  ];
  for (const r of rows) insertFreestyleTrick(db, r);

  insertFreestyleTrickModifierLink(db, 'mobius', 'gyro');
  insertFreestyleTrickModifierLink(db, 'atomic-torque', 'atomic');
  insertFreestyleTrickModifierLink(db, 'gyro-osis', 'gyro');
  insertFreestyleTrickModifierLink(db, 'diving-whirl', 'diving');
  insertFreestyleTrickModifierLink(db, 'hatchet', 'diving');
  insertFreestyleTrickModifierLink(db, 'spinning-whirl', 'spinning');
  insertFreestyleTrickModifierLink(db, 'double-spinning-whirl', 'spinning', 1);
  insertFreestyleTrickModifierLink(db, 'double-spinning-whirl', 'spinning', 2);

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

async function page(slug: string): Promise<string> {
  const res = await request(await createApp()).get(`/freestyle/tricks/${slug}`);
  expect(res.status).toBe(200);
  return res.text;
}

// The structural-neighbors section, isolated from the rest of the page.
function neighborsSection(html: string): string | null {
  const start = html.indexOf('data-section="structural-neighbors"');
  if (start === -1) return null;
  const end = html.indexOf('</section>', start);
  return html.slice(start, end === -1 ? undefined : end);
}

// The contents of one bucket within the section.
function bucket(html: string, key: string): string {
  const section = neighborsSection(html)!;
  const start = section.indexOf(`data-bucket="${key}"`);
  if (start === -1) return '';
  const next = section.indexOf('data-bucket="', start + 1);
  return section.slice(start, next === -1 ? undefined : next);
}

describe('Trick-detail Structural Neighbors — operator adjacency renders', () => {
  it('mobius shows only same-operator-other-base kin; same-base buckets are owned by the family ladder', async () => {
    const html = await page('mobius');
    const section = neighborsSection(html)!;
    expect(section).not.toBeNull();
    // Same-operator-other-base kin (gyro on osis) renders.
    expect(bucket(html, 'operator_kin')).toContain('href="/freestyle/tricks/gyro-osis"');
    // The same-base buckets (built-on / swap / extend) are no longer rendered here.
    expect(section).not.toContain('data-bucket="base_of"');
    expect(section).not.toContain('data-bucket="siblings"');
    expect(section).not.toContain('data-bucket="extensions"');
  });

  it('diving-whirl lists its same-structure twin hatchet with a folk gloss', async () => {
    const html = await page('diving-whirl');
    const twins = bucket(html, 'twins');
    expect(twins).toContain('href="/freestyle/tricks/hatchet"');
    // hatchet is folk; its gloss reveals the operator the name hides.
    expect(twins).toContain('[= whirl + diving]');
  });

  it('double-spinning-whirl renders no Structural Neighbors block (no kin or twin; same-base relating owned by the family ladder)', async () => {
    const html = await page('double-spinning-whirl');
    expect(neighborsSection(html)).toBeNull();
  });
});

describe('Trick-detail Structural Neighbors — suppression and hidden block', () => {
  it('a 0-operator trick renders no Structural Neighbors block and never lists other 0-operator members as siblings', async () => {
    const html = await page('pixie-kick');
    // A 0-operator trick has no same-operator kin and no twin, so no block
    // renders; the empty-operator-set sibling noise (trixie) is never surfaced.
    expect(neighborsSection(html)).toBeNull();
    expect(html).not.toContain('href="/freestyle/tricks/trixie"');
  });

  it('a self-based childless 0-operator trick renders no Structural Neighbors block', async () => {
    const html = await page('atomic-kick');
    expect(neighborsSection(html)).toBeNull();
  });
});
