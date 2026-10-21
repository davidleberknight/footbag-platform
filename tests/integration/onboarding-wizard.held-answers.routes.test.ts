/**
 * Held onboarding answers through the wizard's HTTP routes. A prospective
 * member's claim and club answers wait on their task rows until the last task
 * is answered, so opening a wizard page must persist none of them, however
 * many times it replays them to draw the page; and the answer that completes
 * onboarding, submitted twice, writes everything once.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertLegacyMember,
  insertOnboardingTask,
  insertClub,
  insertClubBootstrapLeader,
  insertLegacyClubCandidate,
  insertLegacyPersonClubAffiliation,
  setOnboardingHeldAnswer,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3249');

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;

beforeAll(async () => {
  db = createTestDb(dbPath);
  createApp = await importApp();
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

function cookieFor(memberId: string): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId })}`;
}

function get(path: string, memberId: string) {
  return request(createApp()).get(path).set('Cookie', cookieFor(memberId));
}

function post(path: string, memberId: string, body: Record<string, string>) {
  return request(createApp()).post(path).set('Cookie', cookieFor(memberId)).type('form').send(body);
}

function count(sql: string, ...params: unknown[]): number {
  return (db.prepare(sql).get(...params) as { n: number }).n;
}

// A surname no other case uses: letters only, so the name fold keeps it whole.
let seq = 0;
function surname(): string {
  seq += 1;
  let n = seq;
  let s = '';
  while (n > 0) { s = String.fromCharCode(97 + (n % 26)) + s; n = Math.floor(n / 26); }
  return `Wq${s}rt`;
}

/** A registrant whose sign-in address sits on an old account, personal details on file. */
function registrantWithAccount(): { memberId: string; legacyId: string } {
  const sn = surname();
  const email = `held-routes-${sn}@example.com`.toLowerCase();
  const legacyId = insertLegacyMember(db, { real_name: `Uma ${sn}`, legacy_email: email });
  const memberId = insertMember(db, {
    onboarding: 'none', real_name: `Uma ${sn}`, login_email: email, birth_date: '1975-06-12',
  });
  insertOnboardingTask(db, memberId, 'personal_details', 'completed');
  return { memberId, legacyId };
}

function membershipCard(legacyId: string, city: string): string {
  const club = insertClub(db, { city, name: `${city} Footbag` });
  const candidate = insertLegacyClubCandidate(db, { classification: 'pre_populate', mapped_club_id: club });
  return insertLegacyPersonClubAffiliation(db, {
    legacy_member_id: legacyId, legacy_club_candidate_id: candidate, inferred_role: 'member',
  });
}

function auditRows(memberId: string, actionType: string): Array<{ metadata_json: string }> {
  return db.prepare('SELECT metadata_json FROM audit_entries WHERE entity_id = ? AND action_type = ?')
    .all(memberId, actionType) as Array<{ metadata_json: string }>;
}

describe('opening a wizard page with answers held', () => {
  it('persists none of them, on the claim step, the club step or the completion page', async () => {
    // Defect caught: drawing a page replays the held claim and club answers
    // and commits them, so a prospective member who only looked at the club
    // step is linked to an old account, granted its tier and placed in its
    // clubs and leadership before they ever finish signing up.
    const { memberId, legacyId } = registrantWithAccount();
    const confirmed = membershipCard(legacyId, 'Kappaville');
    const leaderClub = insertClub(db, { city: 'Lambdaville', name: 'Lambdaville Kickers' });
    const leader = insertClubBootstrapLeader(db, { club_id: leaderClub, legacy_member_id: legacyId });
    const open = membershipCard(legacyId, 'Muville');
    insertOnboardingTask(db, memberId, 'legacy_claim', 'completed');
    insertOnboardingTask(db, memberId, 'club_affiliations', 'pending');
    const heldAt = '2026-01-01T00:00:00.000Z';
    setOnboardingHeldAnswer(db, memberId, 'legacy_claim', {
      claim: { target: { accountId: legacyId, recordId: null }, withSurname: false, heldAt },
    });
    setOnboardingHeldAnswer(db, memberId, 'club_affiliations', {
      answers: [
        { kind: 'card', card: 'membership', candidateId: confirmed, userDecision: 'confirm',
          activitySignal: 'active', insightNote: 'Still meets on Tuesdays.', promotion: null, heldAt },
        { kind: 'card', card: 'leadership', candidateId: leader, userDecision: 'confirm',
          activitySignal: 'active', insightNote: null, promotion: null, heldAt },
      ],
    });

    const snapshot = () => ({
      links: db.prepare('SELECT legacy_member_id, historical_person_id FROM members WHERE id = ?').get(memberId),
      accountClaimed: count(
        'SELECT COUNT(*) AS n FROM legacy_members WHERE legacy_member_id = ? AND claimed_by_member_id IS NOT NULL',
        legacyId,
      ),
      tierGrants: count('SELECT COUNT(*) AS n FROM member_tier_grants WHERE member_id = ?', memberId),
      auditRows: count('SELECT COUNT(*) AS n FROM audit_entries'),
      affiliations: count('SELECT COUNT(*) AS n FROM member_club_affiliations WHERE member_id = ?', memberId),
      leaders: count('SELECT COUNT(*) AS n FROM club_leaders WHERE member_id = ?', memberId),
      viabilitySignals: count('SELECT COUNT(*) AS n FROM club_viability_signals WHERE member_id = ?', memberId),
      insightNotes: count('SELECT COUNT(*) AS n FROM club_insight_notes WHERE member_id = ?', memberId),
      cards: db.prepare(
        'SELECT id, resolution_status FROM legacy_person_club_affiliations WHERE id IN (?, ?) ORDER BY id',
      ).all(confirmed, open),
      leaderCard: db.prepare('SELECT status FROM club_bootstrap_leaders WHERE id = ?').get(leader),
      tasks: db.prepare(
        'SELECT task_type, state, answer_json FROM member_onboarding_tasks WHERE member_id = ? ORDER BY task_type',
      ).all(memberId),
    });
    const before = snapshot();
    // Nothing has landed yet, so the snapshot is the not-yet-a-member state.
    expect(before).toMatchObject({
      links: { legacy_member_id: null, historical_person_id: null },
      accountClaimed: 0, tierGrants: 0, affiliations: 0, leaders: 0,
    });

    const club = await get('/register/wizard/club_affiliations', memberId);
    // The page was drawn from the replayed answers: the card still open shows,
    // and the two already answered do not.
    expect(club.status).toBe(200);
    expect(club.text).toContain(`value="${open}"`);
    expect(club.text).not.toContain(`value="${confirmed}"`);
    expect(club.text).not.toContain(`value="${leader}"`);

    const claim = await get('/register/wizard/legacy_claim', memberId);
    expect([200, 303]).toContain(claim.status);
    const complete = await get('/register/wizard/complete', memberId);
    expect(complete.status).toBe(303);
    expect(complete.headers.location).toBe('/register/wizard/club_affiliations');

    expect(snapshot()).toEqual(before);
  });
});

describe('the answer that completes onboarding, submitted twice', () => {
  // Every row completion writes for a claimant, read together so a doubled
  // write shows as one diff.
  function written(memberId: string, legacyId: string) {
    return {
      completions: auditRows(memberId, 'wizard.complete').length,
      claimRows: auditRows(memberId, 'claim.legacy_account').length,
      accountClaimed: count(
        'SELECT COUNT(*) AS n FROM legacy_members WHERE legacy_member_id = ? AND claimed_by_member_id = ?',
        legacyId, memberId,
      ),
      tierGrants: count(
        "SELECT COUNT(*) AS n FROM member_tier_grants WHERE member_id = ? AND reason_code = 'legacy.claim_tier_grant'",
        memberId,
      ),
      affiliations: count('SELECT COUNT(*) AS n FROM member_club_affiliations WHERE member_id = ?', memberId),
      viabilitySignals: count('SELECT COUNT(*) AS n FROM club_viability_signals WHERE member_id = ?', memberId),
      held: count(
        'SELECT COUNT(*) AS n FROM member_onboarding_tasks WHERE member_id = ? AND answer_json IS NOT NULL', memberId,
      ),
    };
  }

  async function claimAccount(memberId: string, legacyId: string): Promise<void> {
    const res = await post('/register/wizard/legacy_claim/claim', memberId, { accountId: legacyId, recordId: '' });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/wizard/club_affiliations');
  }

  it('the no-club answer writes the claim, its tier grant and the completion once', async () => {
    // Defect caught: a double click on the no-club answer holds it again on a
    // member who has finished, where nothing will ever apply or release it,
    // or completes onboarding a second time and records a second completion,
    // claim or tier grant.
    const { memberId, legacyId } = registrantWithAccount();
    await claimAccount(memberId, legacyId);

    const first = await post('/register/wizard/club_affiliations/none', memberId, {});
    expect(first.status).toBe(303);
    expect(first.headers.location).toBe('/register/wizard/complete');
    const once = written(memberId, legacyId);
    expect(once).toEqual({
      completions: 1, claimRows: 1, accountClaimed: 1, tierGrants: 1,
      affiliations: 0, viabilitySignals: 0, held: 0,
    });
    const auditAfterFirst = count('SELECT COUNT(*) AS n FROM audit_entries WHERE actor_member_id = ? OR entity_id = ?', memberId, memberId);

    const second = await post('/register/wizard/club_affiliations/none', memberId, {});
    expect(second.status).toBe(303);
    expect(written(memberId, legacyId)).toEqual(once);
    expect(count(
      'SELECT COUNT(*) AS n FROM audit_entries WHERE actor_member_id = ? OR entity_id = ?', memberId, memberId,
    )).toBe(auditAfterFirst);
  });

  it('the last club card writes the claim, its tier grant, the club and the completion once', async () => {
    // Defect caught: a double click on the card that finishes signing up
    // applies it again on the new member, adding a second club row or a
    // second activity answer for the same club, or a second completion,
    // claim or tier grant.
    const { memberId, legacyId } = registrantWithAccount();
    const card = membershipCard(legacyId, 'Nuville');
    await claimAccount(memberId, legacyId);
    const body = { kind: 'membership', candidateId: card, userDecision: 'confirm', activitySignal: 'active' };

    const first = await post('/register/wizard/club_affiliations/submit', memberId, body);
    expect(first.status).toBe(303);
    expect(first.headers.location).toBe('/register/wizard/complete');
    const once = written(memberId, legacyId);
    expect(once).toEqual({
      completions: 1, claimRows: 1, accountClaimed: 1, tierGrants: 1,
      affiliations: 1, viabilitySignals: 1, held: 0,
    });

    const second = await post('/register/wizard/club_affiliations/submit', memberId, body);
    expect(second.status).toBe(303);
    expect(written(memberId, legacyId)).toEqual(once);
  });
});
