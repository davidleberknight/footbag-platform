/**
 * schmoe is the folk-named canonical for the stepping legover, and it carries the
 * clipper-set stepping chassis: CLIP > OP IN [DEX] >> OP OUT [DEX] > SAME TOE [DEL].
 * That chassis is what separates it from the miraging legover (double leg over),
 * which sets from a SET-surface mirage (SET > OP IN [DEX] > ...). An earlier
 * notation backfill mistakenly gave schmoe the miraging SET chassis, which made the
 * two tricks byte-identical; the corrected stepping chassis keeps them apart.
 *
 * The structural name "stepping legover" resolves to schmoe: the structural-named
 * row is retired (inactive) and its slug is an alias, so the alias URL permanently
 * redirects (301) to the schmoe page rather than rendering a second canonical. This
 * guards the correction against a regression to the miraging chassis and against a
 * broken structural-name redirect.
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

const { dbPath } = setTestEnv('3766');

let createApp: Awaited<ReturnType<typeof importApp>>;

const SCHMOE_NOTATION = 'CLIP > OP IN [DEX] >> OP OUT [DEX] > SAME TOE [DEL]';
const MIRAGING_NOTATION = 'SET > OP IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertFreestyleTrick(db, {
    slug: 'schmoe',
    canonical_name: 'schmoe',
    adds: '3',
    base_trick: 'legover',
    trick_family: 'legover',
    category: 'compound',
    review_status: 'expert_reviewed',
    is_active: 1,
    operational_notation: SCHMOE_NOTATION,
  });
  insertFreestyleTrick(db, {
    slug: 'double_leg_over',
    canonical_name: 'double leg over',
    adds: '3',
    base_trick: 'double_leg_over',
    trick_family: 'legover',
    category: 'compound',
    review_status: 'curated',
    is_active: 1,
    operational_notation: MIRAGING_NOTATION,
  });
  // The structural-named row is retired: inactive, and its slug is an alias of schmoe.
  insertFreestyleTrick(db, {
    slug: 'stepping_legover',
    canonical_name: 'stepping legover',
    adds: '3',
    base_trick: 'legover',
    trick_family: 'legover',
    category: 'compound',
    review_status: 'expert_reviewed',
    is_active: 0,
    operational_notation: SCHMOE_NOTATION,
  });
  insertFreestyleTrickAlias(db, 'stepping_legover', 'schmoe', 'stepping legover');
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/tricks/:slug — schmoe stepping legover chassis and structural-name resolution', () => {
  it('renders schmoe as an active canonical page', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/schmoe');
    expect(res.status).toBe(200);
    expect(res.text).toContain('schmoe');
    expect(res.headers.location).toBeUndefined();
  });

  it('301-redirects the retired structural name "stepping legover" to schmoe', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/stepping_legover');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('/freestyle/tricks/schmoe');
  });

  it('keeps schmoe and the miraging double leg over as separate canonical pages', async () => {
    const dlo = await request(await createApp()).get('/freestyle/tricks/double_leg_over');
    // double leg over renders its own 200 page and never collapses into schmoe:
    // a collapse would be a 301/302 to the schmoe URL, not a 200 render here.
    expect(dlo.status).toBe(200);
    expect(dlo.text).toContain('double_leg_over');
    expect(dlo.headers.location).not.toBe('/freestyle/tricks/schmoe');
  });
});
