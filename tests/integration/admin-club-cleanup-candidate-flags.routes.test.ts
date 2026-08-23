import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3996');

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import {
  insertMember,
  insertLegacyClubCandidate,
  insertClubViabilitySignal,
  createTestSessionJwt,
} from '../fixtures/factories';

const ADMIN_ID  = 'flag-admin-001';
const MEMBER_ID = 'flag-member-001';
const VOTER_ID  = 'flag-voter-001';

const FLAGGED_CAND   = 'lcc-flag-main';
const DISMISS_CAND   = 'lcc-flag-dismiss';
const NOTSURE_CAND   = 'lcc-flag-notsure';

let createApp: Awaited<ReturnType<typeof importApp>>;

function adminCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}
function memberCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID, role: 'member' })}`;
}

function insertCandidateFlag(
  db: BetterSqlite3.Database,
  memberId: string,
  candidateId: string,
  activitySignal: string,
): void {
  insertClubViabilitySignal(db, {
    member_id: memberId,
    club_id: null,
    activity_signal: activitySignal,
    source_entity_type: 'legacy_club_candidate',
    source_entity_id: candidateId,
  });
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID,  slug: 'flag_admin',  display_name: 'Flag Admin',  login_email: 'flag-admin@example.com', is_admin: 1 });
  insertMember(db, { id: MEMBER_ID, slug: 'flag_member', display_name: 'Flag Member', login_email: 'flag-member@example.com' });
  insertMember(db, { id: VOTER_ID,  slug: 'flag_voter',  display_name: 'Flag Voter',  login_email: 'flag-voter@example.com' });

  insertLegacyClubCandidate(db, { id: FLAGGED_CAND, display_name: 'Main Flagged Candidate', classification: 'onboarding_visible' });
  insertCandidateFlag(db, VOTER_ID, FLAGGED_CAND, 'not_active');

  insertLegacyClubCandidate(db, { id: DISMISS_CAND, display_name: 'Dismissable Candidate', classification: 'dormant' });
  insertCandidateFlag(db, VOTER_ID, DISMISS_CAND, 'not_active');

  // A candidate with no signal rows at all carries no activity evidence and
  // never surfaces in the flag group.
  insertLegacyClubCandidate(db, { id: NOTSURE_CAND, display_name: 'Unflagged Candidate', classification: 'onboarding_visible' });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

function readResolution(candidateId: string, predicate: string): Record<string, unknown> | undefined {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  try {
    return db.prepare(
      'SELECT * FROM candidate_cleanup_resolutions WHERE candidate_id = ? AND predicate_name = ?',
    ).get(candidateId, predicate) as Record<string, unknown> | undefined;
  } finally {
    db.close();
  }
}

describe('candidate-flag group rendering', () => {
  it('unauthenticated -> 302; non-admin -> 403 (negative-voter names render to admins only)', async () => {
    const anon = await request(createApp()).get('/admin/club-cleanup');
    expect(anon.status).toBe(302);
    const member = await request(createApp())
      .get('/admin/club-cleanup')
      .set('Cookie', memberCookie());
    expect(member.status).toBe(403);
  });

  it('renders flagged candidates with signal counts and negative-voter names; unflagged candidates stay out of the flag group', async () => {
    const res = await request(createApp())
      .get('/admin/club-cleanup')
      .set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Wizard Flags by Candidate');
    expect(res.text).toContain('Main Flagged Candidate');
    expect(res.text).toContain('inactive per: Flag Voter');
    expect(res.text).toContain('Dismissable Candidate');
    // The signal-less candidate still lists as promotable, but carries no
    // flag item: with the queue narrowed to the flag group it disappears.
    const flagsOnly = await request(createApp())
      .get('/admin/club-cleanup?category=candidate_flag')
      .set('Cookie', adminCookie());
    expect(flagsOnly.text).not.toContain('Unflagged Candidate');
    expect(flagsOnly.text).toContain('Main Flagged Candidate');
  });

  it('the candidate_flag category filter narrows the queue to the flag group', async () => {
    const res = await request(createApp())
      .get('/admin/club-cleanup?category=candidate_flag')
      .set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Main Flagged Candidate');
    // The promotable-candidates section is filtered out, so its per-item
    // promote action is absent.
    expect(res.text).not.toContain('/promote');
  });

  it('a flagged candidate can be claimed as a coordination hint', async () => {
    const res = await request(createApp())
      .post('/admin/club-cleanup/claim')
      .set('Cookie', adminCookie())
      .send({ itemType: 'candidate', itemId: FLAGGED_CAND });
    expect(res.status).toBe(303);

    const queue = await request(createApp())
      .get('/admin/club-cleanup')
      .set('Cookie', adminCookie());
    expect(queue.text).toContain('claimed by Flag Admin');
  });

  it('counts flag items in the admin-home backlog badge', async () => {
    const res = await request(createApp())
      .get('/admin')
      .set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    // Two flagged candidates plus the three candidates' promotable items.
    expect(res.text).toContain('5 open');
  });
});

describe('flag-item resolution: dismiss and park under the candidate_flags predicate', () => {
  it('rejects dismiss without the candidate_flags predicate', async () => {
    const res = await request(createApp())
      .post(`/admin/club-cleanup/candidates/${DISMISS_CAND}/resolve`)
      .set('Cookie', adminCookie())
      .send({ action: 'dismiss' });
    expect(res.status).toBe(422);
  });

  it('rejects candidate-state actions under the candidate_flags predicate', async () => {
    for (const action of ['demote', 'archive', 'confirm_junk', 'promote_dormant']) {
      const res = await request(createApp())
        .post(`/admin/club-cleanup/candidates/${DISMISS_CAND}/resolve`)
        .set('Cookie', adminCookie())
        .send({ action, predicate: 'candidate_flags' });
      expect(res.status).toBe(422);
    }
  });

  it('rejects an unknown predicate', async () => {
    const res = await request(createApp())
      .post(`/admin/club-cleanup/candidates/${DISMISS_CAND}/resolve`)
      .set('Cookie', adminCookie())
      .send({ action: 'park', predicate: 'bogus_predicate' });
    expect(res.status).toBe(422);
  });

  it('dismiss is terminal: the flag item leaves the queue and stays gone', async () => {
    const res = await request(createApp())
      .post(`/admin/club-cleanup/candidates/${DISMISS_CAND}/resolve`)
      .set('Cookie', adminCookie())
      .send({ action: 'dismiss', predicate: 'candidate_flags', reasonText: 'Known defunct, nothing to judge' });
    expect(res.status).toBe(303);

    const row = readResolution(DISMISS_CAND, 'candidate_flags');
    expect(row?.resolution).toBe('dismissed');
    expect(row?.parked_by_member_id).toBeNull();

    const db = new BetterSqlite3(dbPath, { readonly: true });
    try {
      const audit = db.prepare(
        "SELECT * FROM audit_entries WHERE entity_id = ? AND action_type = 'admin.club_cleanup.candidate_dismiss'",
      ).get(DISMISS_CAND) as Record<string, unknown>;
      expect(audit).toBeTruthy();
      expect(audit.actor_member_id).toBe(ADMIN_ID);
    } finally {
      db.close();
    }

    const queue = await request(createApp())
      .get('/admin/club-cleanup?category=candidate_flag')
      .set('Cookie', adminCookie());
    expect(queue.text).not.toContain('Dismissable Candidate');
    // Dismissing the flag item does not touch the candidate itself: it
    // still renders in the promotable list.
    const full = await request(createApp())
      .get('/admin/club-cleanup?category=candidate')
      .set('Cookie', adminCookie());
    expect(full.text).toContain('Dismissable Candidate');
  });

  it('parking the flag item leaves the promotable item alone', async () => {
    const res = await request(createApp())
      .post(`/admin/club-cleanup/candidates/${FLAGGED_CAND}/resolve`)
      .set('Cookie', adminCookie())
      .send({ action: 'park', predicate: 'candidate_flags', reasonText: 'Wait for more votes' });
    expect(res.status).toBe(303);

    const flagRes = readResolution(FLAGGED_CAND, 'candidate_flags');
    expect(flagRes?.resolution).toBe('parked');
    expect(flagRes?.parked_by_member_id).toBeTruthy();
    expect(readResolution(FLAGGED_CAND, 'promotable_candidate')).toBeUndefined();

    const queue = await request(createApp())
      .get('/admin/club-cleanup?category=candidate_flag')
      .set('Cookie', adminCookie());
    // The flag group is gone from the working queue, and the candidate is in
    // the parked listing rather than nowhere at all.
    expect(queue.text).not.toContain('Wizard Flags by Candidate (');
    expect(queue.text).toContain('Wait for more votes');
    // The promotable item is untouched by the flag-item park.
    const promotable = await request(createApp())
      .get('/admin/club-cleanup?category=candidate')
      .set('Cookie', adminCookie());
    expect(promotable.text).toContain('Main Flagged Candidate');
  });

  it('a parked flag item stays parked and stays listed, with who parked it and why', async () => {
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const row = db.prepare(
      `SELECT resolution, parked_by_member_id, reason_text
         FROM candidate_cleanup_resolutions
        WHERE candidate_id = ? AND predicate_name = 'candidate_flags'`,
    ).get(FLAGGED_CAND) as Record<string, unknown>;
    db.close();
    expect(row.resolution).toBe('parked');
    expect(row.parked_by_member_id).toBeTruthy();
    expect(row.reason_text).toBe('Wait for more votes');

    const res = await request(createApp())
      .get('/admin/club-cleanup?category=candidate_flag')
      .set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    // Out of the working queue, still on the surface: a park is recoverable and
    // must stay distinguishable from a terminal dismissal without reading the
    // database.
    expect(res.text).not.toContain('Wizard Flags by Candidate (');
    expect(res.text).toContain('Main Flagged Candidate');
    expect(res.text).toContain('Wait for more votes');
  });
});
