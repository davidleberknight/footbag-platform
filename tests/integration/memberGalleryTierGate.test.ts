/**
 * Integration tests for the requireTier1Benefits gate on the three
 * member-owned gallery POST routes:
 *   POST /members/:memberKey/galleries
 *   POST /members/:memberKey/galleries/:id/edit
 *   POST /members/:memberKey/galleries/:id/delete
 *
 * Scope: prove the gate is mounted, fires before the controller's
 * owner check, and matches the hasTier1Benefits truth table end-to-end.
 * The predicate's semantic correctness is exhaustively covered by
 * tests/integration/tierPredicates.service.test.ts (Phase 1) and the
 * middleware decision logic by tests/unit/requireTier.test.ts (Phase 2).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import BetterSqlite3 from 'better-sqlite3';
import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import {
  insertMember,
  insertMemberTierGrant,
  insertActivePlayerGrant,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3075');

let createApp: Awaited<ReturnType<typeof importApp>>;

const ADMIN_ID = 'admin-tg-001';
const FUTURE_AP = '2099-01-01T00:00:00.000Z';

interface TierFixture {
  label: string;
  id: string;
  slug: string;
  expectGated: boolean;
}

const FIXTURES: TierFixture[] = [
  { label: 'tier0_no_ap',    id: 'mtg-t0-noap',  slug: 'tg_t0_noap',  expectGated: true  },
  { label: 'tier0_with_ap',  id: 'mtg-t0-ap',    slug: 'tg_t0_ap',    expectGated: false },
  { label: 'tier1',          id: 'mtg-t1',       slug: 'tg_t1',       expectGated: false },
  { label: 'tier2',          id: 'mtg-t2',       slug: 'tg_t2',       expectGated: false },
  { label: 'tier3',          id: 'mtg-t3',       slug: 'tg_t3',       expectGated: false },
];

const NON_OWNER: TierFixture = {
  label: 'tier1_non_owner', id: 'mtg-t1-other', slug: 'tg_t1_other', expectGated: false,
};

function cookieFor(memberId: string): string {
  return `footbag_session=${createTestSessionJwt({ memberId, role: 'member' })}`;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID, slug: 'tg_admin', is_admin: 1 });
  for (const f of FIXTURES) {
    insertMember(db, { id: f.id, slug: f.slug });
  }
  insertMember(db, { id: NON_OWNER.id, slug: NON_OWNER.slug });

  // tier0_with_ap: AP grant only.
  insertActivePlayerGrant(db, {
    member_id: 'mtg-t0-ap',
    change_type: 'grant',
    new_active_player_expires_at: FUTURE_AP,
    reason_code: 'official_event_attendance',
  });
  // tier1, tier2: simple grant rows.
  insertMemberTierGrant(db, { member_id: 'mtg-t1', new_tier_status: 'tier1' });
  insertMemberTierGrant(db, { member_id: 'mtg-t2', new_tier_status: 'tier2' });
  // tier3: governance_set requires new_underlying_tier_status (CHECK).
  insertMemberTierGrant(db, {
    member_id: 'mtg-t3',
    actor_member_id: ADMIN_ID,
    change_type: 'governance_set',
    new_tier_status: 'tier3',
    new_underlying_tier_status: 'tier1',
    reason_code: 'governance.tier3_set',
  });
  // Non-owner Tier 1.
  insertMemberTierGrant(db, { member_id: NON_OWNER.id, new_tier_status: 'tier1' });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('POST /members/:memberKey/galleries — tier gate', () => {
  it.each(FIXTURES)('$label → gated: $expectGated', async (f) => {
    const res = await request(createApp())
      .post(`/members/${f.slug}/galleries`)
      .set('Cookie', cookieFor(f.id))
      .type('form')
      .send({ name: 'Try', description: '', sortOrder: 'upload_desc', criteriaTags: '#x', excludeTags: '' });
    if (f.expectGated) {
      expect(res.status).toBe(403);
      expect(res.text).toContain('403');
    } else {
      expect(res.status).not.toBe(403);
    }
  });
});

describe('POST /members/:memberKey/galleries/:id/edit — tier gate', () => {
  it('tier0 no-AP owner → 403 (gate fires before missing-gallery 404)', async () => {
    const res = await request(createApp())
      .post(`/members/tg_t0_noap/galleries/gallery_does_not_exist/edit`)
      .set('Cookie', cookieFor('mtg-t0-noap'))
      .type('form')
      .send({ name: 'X', description: '', sortOrder: 'upload_desc', criteriaTags: '#x', excludeTags: '' });
    expect(res.status).toBe(403);
  });

  it('tier1 owner → not 403 (gate passes; controller 404 for missing gallery)', async () => {
    const res = await request(createApp())
      .post(`/members/tg_t1/galleries/gallery_does_not_exist/edit`)
      .set('Cookie', cookieFor('mtg-t1'))
      .type('form')
      .send({ name: 'X', description: '', sortOrder: 'upload_desc', criteriaTags: '#x', excludeTags: '' });
    expect(res.status).not.toBe(403);
  });
});

describe('POST /members/:memberKey/galleries/:id/delete — tier gate', () => {
  it('tier0 no-AP owner → 403', async () => {
    const res = await request(createApp())
      .post(`/members/tg_t0_noap/galleries/gallery_does_not_exist/delete`)
      .set('Cookie', cookieFor('mtg-t0-noap'));
    expect(res.status).toBe(403);
  });

  it('tier1 owner → not 403', async () => {
    const res = await request(createApp())
      .post(`/members/tg_t1/galleries/gallery_does_not_exist/delete`)
      .set('Cookie', cookieFor('mtg-t1'));
    expect(res.status).not.toBe(403);
  });
});

describe('Owner-check still fires after the gate', () => {
  it('Tier 1 non-owner posting to a different member\'s gallery route → 404 (anti-enumeration), not 403', async () => {
    // tier1 non-owner sessioned, posting to tier1 owner's create route.
    // The gate passes (predicate true), so the controller's slug-mismatch
    // 404 anti-enumeration branch must fire.
    const res = await request(createApp())
      .post(`/members/tg_t1/galleries`)
      .set('Cookie', cookieFor(NON_OWNER.id))
      .type('form')
      .send({ name: 'Y', description: '', sortOrder: 'upload_desc', criteriaTags: '#y', excludeTags: '' });
    expect(res.status).toBe(404);
  });
});

describe('GET routes stay open to Tier 0 owners (read-only paths preserved)', () => {
  it('GET /members/:memberKey/galleries renders for tier0 no-AP owner', async () => {
    const res = await request(createApp())
      .get(`/members/tg_t0_noap/galleries`)
      .set('Cookie', cookieFor('mtg-t0-noap'));
    expect(res.status).toBe(200);
  });

  it('GET /members/:memberKey/galleries/new renders for tier0 no-AP owner', async () => {
    const res = await request(createApp())
      .get(`/members/tg_t0_noap/galleries/new`)
      .set('Cookie', cookieFor('mtg-t0-noap'));
    expect(res.status).toBe(200);
  });
});

describe('Defensive: requireAuth fires before requireTier1Benefits', () => {
  it('unauthenticated POST → 302 to /login (no 403)', async () => {
    const res = await request(createApp())
      .post(`/members/tg_t1/galleries`)
      .type('form')
      .send({ name: 'Z', description: '', sortOrder: 'upload_desc', criteriaTags: '#z', excludeTags: '' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/\/login/);
  });
});
