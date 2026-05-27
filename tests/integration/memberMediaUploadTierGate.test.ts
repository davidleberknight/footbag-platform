/**
 * Integration tests for the requireTier1Benefits gate on the
 * member-owned media upload POST route:
 *   POST /members/:memberKey/media/upload
 *
 * Scope mirrors tests/integration/memberGalleryTierGate.test.ts: prove
 * the gate is mounted, fires before the controller's owner check and
 * before multipart parsing, and matches the hasTier1Benefits truth
 * table end-to-end. The predicate's semantic correctness is covered by
 * tests/integration/tierPredicates.service.test.ts (Phase 1).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import {
  insertMember,
  completeOnboarding,
  insertMemberTierGrant,
  insertActivePlayerGrant,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3076');

let createApp: Awaited<ReturnType<typeof importApp>>;

const ADMIN_ID = 'admin-mut-001';
const FUTURE_AP = '2099-01-01T00:00:00.000Z';

interface TierFixture {
  label: string;
  id: string;
  slug: string;
  expectGated: boolean;
}

const FIXTURES: TierFixture[] = [
  { label: 'tier0_no_ap',    id: 'mut-t0-noap',  slug: 'mut_t0_noap',  expectGated: true  },
  { label: 'tier0_with_ap',  id: 'mut-t0-ap',    slug: 'mut_t0_ap',    expectGated: false },
  { label: 'tier1',          id: 'mut-t1',       slug: 'mut_t1',       expectGated: false },
  { label: 'tier2',          id: 'mut-t2',       slug: 'mut_t2',       expectGated: false },
  { label: 'tier3',          id: 'mut-t3',       slug: 'mut_t3',       expectGated: false },
];

const NON_OWNER: TierFixture = {
  label: 'tier1_non_owner', id: 'mut-t1-other', slug: 'mut_t1_other', expectGated: false,
};

function cookieFor(memberId: string): string {
  return `footbag_session=${createTestSessionJwt({ memberId, role: 'member' })}`;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID, slug: 'mut_admin', is_admin: 1 });
  completeOnboarding(db, ADMIN_ID);
  for (const f of FIXTURES) {
    insertMember(db, { id: f.id, slug: f.slug });
    completeOnboarding(db, f.id);
  }
  insertMember(db, { id: NON_OWNER.id, slug: NON_OWNER.slug });
  completeOnboarding(db, NON_OWNER.id);

  insertActivePlayerGrant(db, {
    member_id: 'mut-t0-ap',
    change_type: 'grant',
    new_active_player_expires_at: FUTURE_AP,
    reason_code: 'official_event_attendance',
  });
  insertMemberTierGrant(db, { member_id: 'mut-t1', new_tier_status: 'tier1' });
  insertMemberTierGrant(db, { member_id: 'mut-t2', new_tier_status: 'tier2' });
  insertMemberTierGrant(db, {
    member_id: 'mut-t3',
    actor_member_id: ADMIN_ID,
    change_type: 'governance_set',
    new_tier_status: 'tier3',
    new_underlying_tier_status: 'tier1',
    reason_code: 'governance.tier3_set',
  });
  insertMemberTierGrant(db, { member_id: NON_OWNER.id, new_tier_status: 'tier1' });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('POST /members/:memberKey/media/upload — tier gate', () => {
  // The gate runs before busboy parsing, so a header-only POST is enough
  // to observe the gate decision: tier0 no-AP gets 403; tier1+ gets some
  // non-403 response from the multipart parser or the controller's
  // missing-field branch.
  it.each(FIXTURES)('$label → gated: $expectGated', async (f) => {
    const res = await request(createApp())
      .post(`/members/${f.slug}/media/upload`)
      .set('Cookie', cookieFor(f.id))
      .set('Content-Type', 'multipart/form-data; boundary=----test')
      .send('------test--');
    if (f.expectGated) {
      expect(res.status).toBe(403);
    } else {
      expect(res.status).not.toBe(403);
    }
  });
});

describe('Owner-check still fires after the gate', () => {
  it('Tier 1 non-owner posting to a different member\'s upload route → 404, not 403', async () => {
    const res = await request(createApp())
      .post(`/members/mut_t1/media/upload`)
      .set('Cookie', cookieFor(NON_OWNER.id))
      .set('Content-Type', 'multipart/form-data; boundary=----test')
      .send('------test--');
    expect(res.status).toBe(404);
  });
});

describe('GET upload form stays open to Tier 0 owners (read-only path preserved)', () => {
  it('GET /members/:memberKey/media/upload renders for tier0 no-AP owner', async () => {
    const res = await request(createApp())
      .get(`/members/mut_t0_noap/media/upload`)
      .set('Cookie', cookieFor('mut-t0-noap'));
    expect(res.status).toBe(200);
  });
});

describe('Defensive: requireAuth fires before requireTier1Benefits', () => {
  it('unauthenticated POST → 302 to /login (no 403)', async () => {
    const res = await request(createApp())
      .post(`/members/mut_t1/media/upload`)
      .set('Content-Type', 'multipart/form-data; boundary=----test')
      .send('------test--');
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/\/login/);
  });
});
