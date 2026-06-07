/**
 * Integration tests for the cleanup queue's group-level bulk actions.
 *
 * Bulk defer covers the three club-predicate groups and the candidate-flag
 * group: every item currently in the group gets its own deferred resolution
 * and audit row under one shared reason. Bulk de-list runs the existing
 * per-club residue de-list across every club currently carrying residue.
 * Promotable and junk candidates have no bulk action; their resolutions are
 * per-item judgment calls.
 */
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3997');

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import {
  insertMember,
  insertClub,
  insertClubBootstrapLeader,
  insertClubViabilitySignal,
  insertHistoricalPerson,
  insertLegacyClubCandidate,
  insertLegacyPersonClubAffiliation,
  createTestSessionJwt,
} from '../fixtures/factories';

const ADMIN_ID  = 'bulk-admin-001';
const MEMBER_ID = 'bulk-member-001';
const VOTER_ONE = 'bulk-voter-001';
const VOTER_TWO = 'bulk-voter-002';

const CV_CLUB_CONCORDANT = 'bulk-club-cv1';
const CV_CLUB_WEAK       = 'bulk-club-cv2';
const STALE_CLUB         = 'bulk-club-stale';
const RES_CLUB_A         = 'bulk-club-res-a';
const RES_CLUB_B         = 'bulk-club-res-b';

const FLAG_CAND_A = 'lcc-bulk-flag-a';
const FLAG_CAND_B = 'lcc-bulk-flag-b';
const FLAG_CAND_LATE = 'lcc-bulk-flag-late';

let createApp: Awaited<ReturnType<typeof importApp>>;

function adminCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}
function memberCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID, role: 'member' })}`;
}

function insertCandidateFlag(db: BetterSqlite3.Database, memberId: string, candidateId: string): void {
  insertClubViabilitySignal(db, {
    member_id: memberId,
    club_id: null,
    activity_signal: 'not_active',
    source_entity_type: 'legacy_club_candidate',
    source_entity_id: candidateId,
  });
}

function seedResidueClub(db: BetterSqlite3.Database, clubId: string, name: string, pendingCount: number): void {
  insertClub(db, { id: clubId, name, city: 'Bulkville', country: 'USA' });
  const cand = insertLegacyClubCandidate(db, {
    legacy_club_key: `legacy_${clubId}`,
    display_name: name,
    mapped_club_id: clubId,
  });
  for (let i = 0; i < pendingCount; i += 1) {
    const person = insertHistoricalPerson(db, { person_id: `${clubId}-p${i}`, person_name: `Pending ${name} ${i}`, country: 'US' });
    insertLegacyPersonClubAffiliation(db, {
      historical_person_id: person,
      legacy_club_candidate_id: cand,
      resolution_status: 'pending',
    });
  }
}

beforeAll(async () => {
  const db = createTestDb(dbPath);

  insertMember(db, { id: ADMIN_ID,  slug: 'bulk_admin',  display_name: 'Bulk Admin',  login_email: 'bulk-admin@example.com', is_admin: 1 });
  insertMember(db, { id: MEMBER_ID, slug: 'bulk_member', display_name: 'Bulk Member', login_email: 'bulk-member@example.com' });
  insertMember(db, { id: VOTER_ONE, slug: 'bulk_voter1', display_name: 'Bulk Voter One', login_email: 'bulk-voter1@example.com' });
  insertMember(db, { id: VOTER_TWO, slug: 'bulk_voter2', display_name: 'Bulk Voter Two', login_email: 'bulk-voter2@example.com' });

  // Crowdsource group: one concordant-inactive club, one weak-inactive club.
  insertClub(db, { id: CV_CLUB_CONCORDANT, name: 'Bulk Concordant Club' });
  insertClubViabilitySignal(db, { member_id: VOTER_ONE, club_id: CV_CLUB_CONCORDANT, activity_signal: 'not_active' });
  insertClubViabilitySignal(db, { member_id: VOTER_TWO, club_id: CV_CLUB_CONCORDANT, activity_signal: 'not_active' });
  insertClub(db, { id: CV_CLUB_WEAK, name: 'Bulk Weak Club' });
  insertClubViabilitySignal(db, { member_id: VOTER_ONE, club_id: CV_CLUB_WEAK, activity_signal: 'not_active' });

  // Stale-provisional group: one club with a provisional bootstrap leader.
  insertClub(db, { id: STALE_CLUB, name: 'Bulk Stale Club' });
  insertClubBootstrapLeader(db, { club_id: STALE_CLUB, legacy_member_id: 'lm-bulk-stale', role: 'leader', status: 'provisional' });

  // Candidate-flag group: two flagged unpromoted candidates.
  insertLegacyClubCandidate(db, { id: FLAG_CAND_A, display_name: 'Bulk Flagged Alpha', classification: 'onboarding_visible' });
  insertCandidateFlag(db, VOTER_ONE, FLAG_CAND_A);
  insertLegacyClubCandidate(db, { id: FLAG_CAND_B, display_name: 'Bulk Flagged Beta', classification: 'dormant' });
  insertCandidateFlag(db, VOTER_TWO, FLAG_CAND_B);

  // Residue group: two clubs carrying pending residue.
  seedResidueClub(db, RES_CLUB_A, 'Bulk Residue Alpha', 2);
  seedResidueClub(db, RES_CLUB_B, 'Bulk Residue Beta', 1);

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

function countAudits(actionType: string, bulkOnly = false): number {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  try {
    const rows = db.prepare('SELECT metadata_json FROM audit_entries WHERE action_type = ?')
      .all(actionType) as Array<{ metadata_json: string }>;
    if (!bulkOnly) return rows.length;
    return rows.filter((r) => JSON.parse(r.metadata_json).bulk === true).length;
  } finally {
    db.close();
  }
}

function readClubResolution(clubId: string, predicate: string): Record<string, unknown> | undefined {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  try {
    return db.prepare('SELECT * FROM club_cleanup_resolutions WHERE club_id = ? AND predicate_name = ?')
      .get(clubId, predicate) as Record<string, unknown> | undefined;
  } finally {
    db.close();
  }
}

function readCandidateResolution(candidateId: string, predicate: string): Record<string, unknown> | undefined {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  try {
    return db.prepare('SELECT * FROM candidate_cleanup_resolutions WHERE candidate_id = ? AND predicate_name = ?')
      .get(candidateId, predicate) as Record<string, unknown> | undefined;
  } finally {
    db.close();
  }
}

describe('POST /admin/club-cleanup/bulk-resolve — gates and validation', () => {
  it('unauthenticated -> 302; non-admin -> 403', async () => {
    const anon = await request(createApp())
      .post('/admin/club-cleanup/bulk-resolve')
      .send({ group: 'crowdsource_viability', action: 'defer_30' });
    expect(anon.status).toBe(302);

    const member = await request(createApp())
      .post('/admin/club-cleanup/bulk-resolve')
      .set('Cookie', memberCookie())
      .send({ group: 'crowdsource_viability', action: 'defer_30' });
    expect(member.status).toBe(403);
  });

  it('unknown group or action -> 422', async () => {
    const badGroup = await request(createApp())
      .post('/admin/club-cleanup/bulk-resolve')
      .set('Cookie', adminCookie())
      .send({ group: 'bogus', action: 'defer_30' });
    expect(badGroup.status).toBe(422);

    const badAction = await request(createApp())
      .post('/admin/club-cleanup/bulk-resolve')
      .set('Cookie', adminCookie())
      .send({ group: 'crowdsource_viability', action: 'dismiss' });
    expect(badAction.status).toBe(422);
  });

  it('promotable, junk, and residue groups have no bulk defer', async () => {
    for (const group of ['candidate', 'junk_candidate', 'residue']) {
      const res = await request(createApp())
        .post('/admin/club-cleanup/bulk-resolve')
        .set('Cookie', adminCookie())
        .send({ group, action: 'defer_30' });
      expect(res.status).toBe(422);
    }
  });
});

describe('bulk defer per group', () => {
  it('candidate_flag: every flagged candidate gets its own resolution and audit row under the shared reason, and claims release', async () => {
    const claim = await request(createApp())
      .post('/admin/club-cleanup/claim')
      .set('Cookie', adminCookie())
      .send({ itemType: 'candidate', itemId: FLAG_CAND_A });
    expect(claim.status).toBe(303);

    const res = await request(createApp())
      .post('/admin/club-cleanup/bulk-resolve')
      .set('Cookie', adminCookie())
      .send({ group: 'candidate_flag', action: 'defer_30', reasonText: 'Batch parked pending cutover' });
    expect(res.status).toBe(303);

    for (const cand of [FLAG_CAND_A, FLAG_CAND_B]) {
      const row = readCandidateResolution(cand, 'candidate_flags');
      expect(row?.resolution).toBe('deferred');
      expect(row?.reason_text).toBe('Batch parked pending cutover');
    }
    expect(countAudits('admin.club_cleanup.candidate_defer', true)).toBe(2);

    const db = new BetterSqlite3(dbPath, { readonly: true });
    try {
      const claims = db.prepare("SELECT COUNT(*) AS c FROM club_cleanup_claims WHERE item_id = ?").get(FLAG_CAND_A) as { c: number };
      expect(claims.c).toBe(0);
    } finally {
      db.close();
    }

    const queue = await request(createApp())
      .get('/admin/club-cleanup?category=candidate_flag')
      .set('Cookie', adminCookie());
    expect(queue.text).not.toContain('Bulk Flagged Alpha');
    expect(queue.text).not.toContain('Bulk Flagged Beta');
    // The promotable items are independent of the flag-group defer.
    const promotable = await request(createApp())
      .get('/admin/club-cleanup?category=candidate')
      .set('Cookie', adminCookie());
    expect(promotable.text).toContain('Bulk Flagged Alpha');
  });

  it('bulk defer covers items currently in the group: a later flag surfaces and a re-run defers only it', async () => {
    const db = new BetterSqlite3(dbPath);
    insertLegacyClubCandidate(db, { id: FLAG_CAND_LATE, display_name: 'Bulk Flagged Latecomer', classification: 'onboarding_visible' });
    insertCandidateFlag(db, VOTER_ONE, FLAG_CAND_LATE);
    db.close();

    const before = await request(createApp())
      .get('/admin/club-cleanup?category=candidate_flag')
      .set('Cookie', adminCookie());
    expect(before.text).toContain('Bulk Flagged Latecomer');

    const res = await request(createApp())
      .post('/admin/club-cleanup/bulk-resolve')
      .set('Cookie', adminCookie())
      .send({ group: 'candidate_flag', action: 'defer_90', reasonText: 'Second sweep' });
    expect(res.status).toBe(303);

    expect(readCandidateResolution(FLAG_CAND_LATE, 'candidate_flags')?.resolution).toBe('deferred');
    // The already-parked candidates were not in the group, so their rows
    // keep the first sweep's reason.
    expect(readCandidateResolution(FLAG_CAND_A, 'candidate_flags')?.reason_text).toBe('Batch parked pending cutover');
    expect(countAudits('admin.club_cleanup.candidate_defer', true)).toBe(3);
  });

  it('crowdsource_viability: both flagged clubs defer with their own audit rows; other groups stay open', async () => {
    const res = await request(createApp())
      .post('/admin/club-cleanup/bulk-resolve')
      .set('Cookie', adminCookie())
      .send({ group: 'crowdsource_viability', action: 'defer_180', reasonText: 'Re-check after season' });
    expect(res.status).toBe(303);

    for (const club of [CV_CLUB_CONCORDANT, CV_CLUB_WEAK]) {
      const row = readClubResolution(club, 'crowdsource_viability');
      expect(row?.resolution).toBe('deferred');
      expect(row?.reason_text).toBe('Re-check after season');
    }
    expect(countAudits('admin.club_cleanup.defer_180', true)).toBe(2);

    const queue = await request(createApp())
      .get('/admin/club-cleanup')
      .set('Cookie', adminCookie());
    expect(queue.text).not.toContain('Crowdsource viability (');
    // The same clubs' leaderless items are a different group and stay open.
    expect(queue.text).toContain('Leaderless active club (');
  });

  it('stale_provisional: the grouped club defers under its own predicate', async () => {
    const res = await request(createApp())
      .post('/admin/club-cleanup/bulk-resolve')
      .set('Cookie', adminCookie())
      .send({ group: 'stale_provisional', action: 'defer_30' });
    expect(res.status).toBe(303);
    expect(readClubResolution(STALE_CLUB, 'stale_provisional')?.resolution).toBe('deferred');

    const queue = await request(createApp())
      .get('/admin/club-cleanup')
      .set('Cookie', adminCookie());
    expect(queue.text).not.toContain('Stale provisional leader (');
  });

  it('leaderless_active: every leaderless club defers in one action', async () => {
    const res = await request(createApp())
      .post('/admin/club-cleanup/bulk-resolve')
      .set('Cookie', adminCookie())
      .send({ group: 'leaderless_active', action: 'defer_30', reasonText: 'Leader drive planned' });
    expect(res.status).toBe(303);

    // Every active fixture club is leaderless, so each carries a resolution.
    for (const club of [CV_CLUB_CONCORDANT, CV_CLUB_WEAK, STALE_CLUB, RES_CLUB_A, RES_CLUB_B]) {
      expect(readClubResolution(club, 'leaderless_active')?.resolution).toBe('deferred');
    }

    const queue = await request(createApp())
      .get('/admin/club-cleanup')
      .set('Cookie', adminCookie());
    expect(queue.text).not.toContain('Leaderless active club (');
  });
});

describe('POST /admin/club-cleanup/bulk-delist-residue', () => {
  it('unauthenticated -> 302; non-admin -> 403', async () => {
    const anon = await request(createApp()).post('/admin/club-cleanup/bulk-delist-residue');
    expect(anon.status).toBe(302);
    const member = await request(createApp())
      .post('/admin/club-cleanup/bulk-delist-residue')
      .set('Cookie', memberCookie());
    expect(member.status).toBe(403);
  });

  it('de-lists every residue club, one transaction and audit row per club', async () => {
    const res = await request(createApp())
      .post('/admin/club-cleanup/bulk-delist-residue')
      .set('Cookie', adminCookie())
      .send({ reasonText: 'Cutover residue sweep' });
    expect(res.status).toBe(303);

    const db = new BetterSqlite3(dbPath, { readonly: true });
    try {
      const pending = db.prepare(
        "SELECT COUNT(*) AS c FROM legacy_person_club_affiliations WHERE resolution_status = 'pending'",
      ).get() as { c: number };
      expect(pending.c).toBe(0);
      const former = db.prepare(
        "SELECT COUNT(*) AS c FROM legacy_person_club_affiliations WHERE resolution_status = 'former_only'",
      ).get() as { c: number };
      expect(former.c).toBe(3);
    } finally {
      db.close();
    }
    expect(countAudits('admin.club_cleanup.delist_residue')).toBe(2);

    const queue = await request(createApp())
      .get('/admin/club-cleanup')
      .set('Cookie', adminCookie());
    expect(queue.text).not.toContain('Unconfirmed legacy residue');
  });

  it('a re-run is a no-op: nothing left to de-list, no new audit rows', async () => {
    const res = await request(createApp())
      .post('/admin/club-cleanup/bulk-delist-residue')
      .set('Cookie', adminCookie())
      .send({ reasonText: 'Repeat sweep' });
    expect(res.status).toBe(303);
    expect(countAudits('admin.club_cleanup.delist_residue')).toBe(2);
  });
});
