import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3975');

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import {
  insertMember,
  insertClub,
  insertClubViabilitySignal,
  insertLegacyClubCandidate,
  insertLegacyPersonClubAffiliation,
  createTestSessionJwt,
} from '../fixtures/factories';

const ADMIN_ID  = 'backlog-admin-001';
const MEMBER_ID = 'backlog-member-001';

let createApp: Awaited<ReturnType<typeof importApp>>;

function adminCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}
function memberCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID, role: 'member' })}`;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID,  slug: 'backlog_admin',  display_name: 'Backlog Admin', login_email: 'backlog-admin@example.com', is_admin: 1 });
  insertMember(db, { id: MEMBER_ID, slug: 'backlog_member', display_name: 'Backlog Member', login_email: 'backlog-member@example.com' });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('admin-home backlog badge', () => {
  it('unauthenticated -> 302', async () => {
    const res = await request(createApp()).get('/admin');
    expect(res.status).toBe(302);
  });

  it('non-admin -> 403', async () => {
    const res = await request(createApp())
      .get('/admin')
      .set('Cookie', memberCookie());
    expect(res.status).toBe(403);
  });

  it('with no open queue items the dashboard shows the queue at zero and no age', async () => {
    const res = await request(createApp())
      .get('/admin')
      .set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    // The row itself always renders, because an administrator learns the queue
    // inventory once rather than inferring it from which rows happen to show.
    // What an empty queue drops is the age and the opportunity split, which
    // have nothing to say.
    expect(res.text).toContain('Club Cleanup');
    expect(res.text).toContain('0 open');
    expect(res.text).not.toContain('oldest ');
    expect(res.text).not.toContain('could use a leader');
  });

  it('counts predicate items, residue clubs, and promotable candidates together', async () => {
    const db = new BetterSqlite3(dbPath);
    // Club A: two concordant negative signals, no leaders -> one crowdsource
    // item plus one leaderless item.
    const clubA = insertClub(db, { id: 'backlog-club-a', name: 'Backlog Club A' });
    insertClubViabilitySignal(db, { member_id: ADMIN_ID,  club_id: clubA, activity_signal: 'not_active' });
    insertClubViabilitySignal(db, { member_id: MEMBER_ID, club_id: clubA, activity_signal: 'not_active' });
    // Club B: a promoted candidate still carrying one pending affiliation ->
    // one residue club; the club is also active with no leaders -> one
    // leaderless item.
    const clubB = insertClub(db, { id: 'backlog-club-b', name: 'Backlog Club B' });
    const mappedCandidate = insertLegacyClubCandidate(db, { mapped_club_id: clubB, classification: 'pre_populate' });
    insertLegacyPersonClubAffiliation(db, {
      legacy_club_candidate_id: mappedCandidate,
      legacy_member_id: 'lm-backlog-1',
      resolution_status: 'pending',
    });
    // One unpromoted candidate -> one promotable item.
    insertLegacyClubCandidate(db, { display_name: 'Backlog Candidate', classification: 'onboarding_visible' });
    db.close();

    const res = await request(createApp())
      .get('/admin')
      .set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    // Club A is settled by the rules, which demote it and retire its residue,
    // so it is nobody's work and the badge does not offer it as any. That
    // leaves club B's missing leader, club B's residue, and the unpromoted
    // candidate.
    //
    // The badge counts the two halves apart. Club B's residue and the
    // unpromoted candidate want a decision; club B's missing leader is a
    // tolerated state and an opportunity, and blending it into the same figure
    // would report three items of work when there are two.
    expect(res.text).toContain('2 open');
    expect(res.text).toContain('1 club could use a leader');
    expect(res.text).toContain('oldest ');
    expect(res.text).not.toContain('Backlog Club A');
  });

  it('badge count matches what the cleanup queue renders', async () => {
    const res = await request(createApp())
      .get('/admin/club-cleanup')
      .set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    // 1 predicate item (queue header count) + 1 residue club + 1 candidate
    // = the 3 the badge reported. The badge is read before the rules run and
    // the queue after, so a mismatch here means the badge counted work that
    // resolved itself on the way through.
    expect(res.text).toContain('1 item(s) requiring attention');
    expect(res.text).toContain('Backlog Club B');
    expect(res.text).toContain('Backlog Candidate');
  });
});
