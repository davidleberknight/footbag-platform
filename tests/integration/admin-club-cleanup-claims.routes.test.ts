import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3977');

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import {
  insertMember,
  insertClub,
  insertClubViabilitySignal,
  insertLegacyClubCandidate,
  createTestSessionJwt,
} from '../fixtures/factories';

const ADMIN_ONE = 'claims-admin-001';
const ADMIN_TWO = 'claims-admin-002';
const MEMBER_ID = 'claims-member-001';
const CLUB_ID   = 'claims-club-001';
const CAND_ID   = 'claims-cand-001';

let createApp: Awaited<ReturnType<typeof importApp>>;

function cookieFor(memberId: string, role: 'admin' | 'member' = 'admin'): string {
  return `footbag_session=${createTestSessionJwt({ memberId, role })}`;
}

function countClaims(itemType: string, itemId: string): number {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  try {
    const row = db.prepare(
      'SELECT COUNT(*) AS c FROM club_cleanup_claims WHERE item_type = ? AND item_id = ?',
    ).get(itemType, itemId) as { c: number };
    return row.c;
  } finally {
    db.close();
  }
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ONE, slug: 'claims_admin_one', display_name: 'Admin One', login_email: 'claims-admin-1@example.com', is_admin: 1 });
  insertMember(db, { id: ADMIN_TWO, slug: 'claims_admin_two', display_name: 'Admin Two', login_email: 'claims-admin-2@example.com', is_admin: 1 });
  insertMember(db, { id: MEMBER_ID, slug: 'claims_member', display_name: 'Claims Member', login_email: 'claims-member@example.com' });
  insertClub(db, { id: CLUB_ID, name: 'Claimed Club' });
  insertClubViabilitySignal(db, { member_id: MEMBER_ID, club_id: CLUB_ID, activity_signal: 'not_active' });
  insertClubViabilitySignal(db, { member_id: ADMIN_TWO, club_id: CLUB_ID, activity_signal: 'not_active' });
  insertLegacyClubCandidate(db, { id: CAND_ID, display_name: 'Claimed Candidate', classification: 'onboarding_visible' });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('POST /admin/club-cleanup/claim', () => {
  it('unauthenticated -> 302', async () => {
    const res = await request(createApp())
      .post('/admin/club-cleanup/claim')
      .send({ itemType: 'club', itemId: CLUB_ID });
    expect(res.status).toBe(302);
  });

  it('non-admin -> 403', async () => {
    const res = await request(createApp())
      .post('/admin/club-cleanup/claim')
      .set('Cookie', cookieFor(MEMBER_ID, 'member'))
      .send({ itemType: 'club', itemId: CLUB_ID });
    expect(res.status).toBe(403);
  });

  it('invalid item type -> 422; unknown item -> 404', async () => {
    const bad = await request(createApp())
      .post('/admin/club-cleanup/claim')
      .set('Cookie', cookieFor(ADMIN_ONE))
      .send({ itemType: 'bogus', itemId: CLUB_ID });
    expect(bad.status).toBe(422);

    const missing = await request(createApp())
      .post('/admin/club-cleanup/claim')
      .set('Cookie', cookieFor(ADMIN_ONE))
      .send({ itemType: 'club', itemId: 'no-such-club' });
    expect(missing.status).toBe(404);
  });

  it('a claim renders to other admins as a claimed-by marker', async () => {
    const res = await request(createApp())
      .post('/admin/club-cleanup/claim')
      .set('Cookie', cookieFor(ADMIN_ONE))
      .send({ itemType: 'club', itemId: CLUB_ID });
    expect(res.status).toBe(303);

    const queue = await request(createApp())
      .get('/admin/club-cleanup')
      .set('Cookie', cookieFor(ADMIN_TWO));
    expect(queue.status).toBe(200);
    expect(queue.text).toContain('claimed by Admin One');
  });

  it('a re-claim by another admin refreshes the single marker row', async () => {
    const res = await request(createApp())
      .post('/admin/club-cleanup/claim')
      .set('Cookie', cookieFor(ADMIN_TWO))
      .send({ itemType: 'club', itemId: CLUB_ID });
    expect(res.status).toBe(303);
    expect(countClaims('club', CLUB_ID)).toBe(1);

    const db = new BetterSqlite3(dbPath, { readonly: true });
    try {
      const row = db.prepare(
        'SELECT claimed_by_member_id FROM club_cleanup_claims WHERE item_type = ? AND item_id = ?',
      ).get('club', CLUB_ID) as { claimed_by_member_id: string };
      expect(row.claimed_by_member_id).toBe(ADMIN_TWO);
    } finally {
      db.close();
    }
  });

  it('a claim never blocks another admin; resolving auto-releases the marker', async () => {
    // Admin Two holds the claim; Admin One resolves anyway.
    const res = await request(createApp())
      .post(`/admin/club-cleanup/${CLUB_ID}/resolve`)
      .set('Cookie', cookieFor(ADMIN_ONE))
      .send({ action: 'defer_30', predicate: 'crowdsource_viability', reasonText: 'Check later' });
    expect(res.status).toBe(303);
    expect(countClaims('club', CLUB_ID)).toBe(0);

    const queue = await request(createApp())
      .get('/admin/club-cleanup')
      .set('Cookie', cookieFor(ADMIN_TWO));
    expect(queue.text).not.toContain('claimed by');
  });

  it('candidate claims release on defer and stale markers stop rendering', async () => {
    const claim = await request(createApp())
      .post('/admin/club-cleanup/claim')
      .set('Cookie', cookieFor(ADMIN_ONE))
      .send({ itemType: 'candidate', itemId: CAND_ID });
    expect(claim.status).toBe(303);

    const before = await request(createApp())
      .get('/admin/club-cleanup')
      .set('Cookie', cookieFor(ADMIN_TWO));
    expect(before.text).toContain('claimed by Admin One');

    const defer = await request(createApp())
      .post(`/admin/club-cleanup/candidates/${CAND_ID}/resolve`)
      .set('Cookie', cookieFor(ADMIN_TWO))
      .send({ action: 'defer_30' });
    expect(defer.status).toBe(303);
    expect(countClaims('candidate', CAND_ID)).toBe(0);

    // Expire the defer window so the candidate is back in the queue, then
    // re-claim: the fresh marker renders on the re-surfaced row.
    const db = new BetterSqlite3(dbPath);
    db.prepare(`
      UPDATE candidate_cleanup_resolutions
         SET deferred_until = '2020-01-01T00:00:00.000Z'
       WHERE candidate_id = ?
    `).run(CAND_ID);
    db.close();

    const reclaim = await request(createApp())
      .post('/admin/club-cleanup/claim')
      .set('Cookie', cookieFor(ADMIN_ONE))
      .send({ itemType: 'candidate', itemId: CAND_ID });
    expect(reclaim.status).toBe(303);

    const fresh = await request(createApp())
      .get('/admin/club-cleanup')
      .set('Cookie', cookieFor(ADMIN_TWO));
    expect(fresh.text).toContain('Claimed Candidate');
    expect(fresh.text).toContain('claimed by Admin One');

    // Age the marker past the 30-minute staleness window: the row persists
    // but the queue stops rendering it while the candidate itself remains.
    const db2 = new BetterSqlite3(dbPath);
    db2.prepare(`
      UPDATE club_cleanup_claims
         SET claimed_at = '2020-01-01T00:00:00.000Z'
       WHERE item_type = 'candidate' AND item_id = ?
    `).run(CAND_ID);
    db2.close();

    const after = await request(createApp())
      .get('/admin/club-cleanup')
      .set('Cookie', cookieFor(ADMIN_TWO));
    expect(after.text).toContain('Claimed Candidate');
    expect(after.text).not.toContain('claimed by Admin One');
    expect(countClaims('candidate', CAND_ID)).toBe(1);
  });
});
