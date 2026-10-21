/**
 * The club answers the wizard holds for a prospective member, and the ones it
 * must not hold. A member's club answer is written at once, because nothing
 * will ever complete onboarding for them again. A held answer that can no
 * longer be replayed is dropped alone and recorded, so it never locks the
 * member in the wizard; a busy database aborts the request instead, because
 * that says nothing about the answer. The same answer submitted twice is held
 * once.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import {
  insertMember,
  insertClub,
  insertOnboardingTask,
  insertLegacyClubCandidate,
  insertLegacyPersonClubAffiliation,
  insertLegacyMember,
  insertClubBootstrapLeader,
  setOnboardingHeldAnswer,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3247');

let db: BetterSqlite3.Database;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let svc: typeof import('../../src/services/memberOnboardingService').memberOnboardingService;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let dbMod: typeof import('../../src/db/db');
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let logger: typeof import('../../src/config/logger').logger;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let identity: typeof import('../../src/services/identityAccessService').identityAccessService;

beforeAll(async () => {
  db = createTestDb(dbPath);
  svc = (await import('../../src/services/memberOnboardingService')).memberOnboardingService;
  dbMod = await import('../../src/db/db');
  logger = (await import('../../src/config/logger')).logger;
  identity = (await import('../../src/services/identityAccessService')).identityAccessService;
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

let seq = 0;

// A legacy-linked account, onboarded or on the club step, with `cards`
// pending membership cards on live clubs.
function memberWithCards(onboarded: boolean, cards: number): { memberId: string; cardIds: string[] } {
  seq += 1;
  const legacyId = `LM-HELD-${seq}`;
  const memberId = insertMember(db, {
    onboarding: onboarded ? 'complete' : 'none',
    slug: `held_${seq}`,
    login_email: `held-${seq}@example.com`,
    legacy_member_id: legacyId,
  });
  if (!onboarded) {
    insertOnboardingTask(db, memberId, 'personal_details', 'completed');
    insertOnboardingTask(db, memberId, 'legacy_claim', 'completed');
    insertOnboardingTask(db, memberId, 'club_affiliations', 'pending');
  }
  const cardIds = Array.from({ length: cards }, () => {
    const club = insertClub(db);
    const candidate = insertLegacyClubCandidate(db, { classification: 'pre_populate', mapped_club_id: club });
    return insertLegacyPersonClubAffiliation(db, {
      legacy_member_id: legacyId, legacy_club_candidate_id: candidate, inferred_role: 'member',
    });
  });
  return { memberId, cardIds };
}

function heldClubAnswers(memberId: string): unknown[] {
  const row = db.prepare(
    "SELECT answer_json FROM member_onboarding_tasks WHERE member_id = ? AND task_type = 'club_affiliations'",
  ).get(memberId) as { answer_json: string | null } | undefined;
  return row?.answer_json ? (JSON.parse(row.answer_json) as { answers: unknown[] }).answers : [];
}

function currentClubs(memberId: string): number {
  return (db.prepare(
    'SELECT COUNT(*) AS c FROM member_club_affiliations WHERE member_id = ? AND is_current = 1',
  ).get(memberId) as { c: number }).c;
}

function cardStatus(cardId: string): string {
  return (db.prepare(
    'SELECT resolution_status FROM legacy_person_club_affiliations WHERE id = ?',
  ).get(cardId) as { resolution_status: string }).resolution_status;
}

interface DroppedAnswer { task_type: string; answer_kind: string; reason: string }

function droppedFor(memberId: string): DroppedAnswer[] {
  return (db.prepare(
    "SELECT metadata_json FROM audit_entries WHERE action_type = 'wizard.held_answer.dropped' AND entity_id = ?",
  ).all(memberId) as { metadata_json: string }[]).map((r) => JSON.parse(r.metadata_json) as DroppedAnswer);
}

function taskState(memberId: string): string {
  return (db.prepare(
    "SELECT state FROM member_onboarding_tasks WHERE member_id = ? AND task_type = 'club_affiliations'",
  ).get(memberId) as { state: string }).state;
}

describe("a member's club answer is written at once", () => {
  it('a confirmed card adds the club immediately and holds nothing', async () => {
    // Defect caught: a member confirms a club after onboarding, is told it was
    // added, and the answer sits held forever because nothing will complete
    // onboarding for them again.
    const { memberId, cardIds } = memberWithCards(true, 2);
    const result = await svc.processClubAffiliationsSubmit(memberId, {
      kind: 'membership', candidateId: cardIds[0], userDecision: 'confirm', activitySignal: 'active',
    });
    expect(result.kind).toBe('retry_same');
    expect(currentClubs(memberId)).toBe(1);
    expect(cardStatus(cardIds[0]!)).not.toBe('pending');
    expect(heldClubAnswers(memberId)).toEqual([]);
  });

  it('a grouped card answered with none declines every club immediately and holds nothing', async () => {
    // Defect caught: the same held-forever answer on the grouped card, so the
    // member keeps seeing a card they already answered.
    const { memberId, cardIds } = memberWithCards(true, 2);
    await svc.processClubAffiliationsSubmit(memberId, {
      kind: 'disambiguation', allCandidateIds: cardIds, selectedCandidateIds: [],
    });
    expect(cardIds.map(cardStatus)).not.toContain('pending');
    expect(heldClubAnswers(memberId)).toEqual([]);
  });

  it("a prospective member's same confirm is held and adds no club yet", async () => {
    // The other side of the branch: a prospective member is not a member, so
    // their answer must not reach a shared table before onboarding completes.
    const { memberId, cardIds } = memberWithCards(false, 2);
    await svc.processClubAffiliationsSubmit(memberId, {
      kind: 'membership', candidateId: cardIds[0], userDecision: 'confirm', activitySignal: 'active',
    });
    expect(currentClubs(memberId)).toBe(0);
    expect(cardStatus(cardIds[0]!)).toBe('pending');
    expect(heldClubAnswers(memberId)).toHaveLength(1);
  });
});

describe('a held answer that can no longer be replayed', () => {
  it('is dropped and recorded, and the wizard still renders and completes', () => {
    // Defect caught: one held answer whose replay faults turns every wizard
    // page and the completion itself into an error, and since held answers
    // are only ever appended the member can never finish signing up.
    const { memberId, cardIds } = memberWithCards(false, 1);
    setOnboardingHeldAnswer(db, memberId, 'club_affiliations', {
      answers: [{ kind: 'disambiguation', selectedId: null, allIds: null, heldAt: '2026-01-01T00:00:00.000Z' }],
    });
    const warn = vi.spyOn(logger, 'warn');

    expect(svc.listWizardCardsForMember(memberId).map((c) => c.kind)).toEqual(['membership']);
    expect(svc.processNoClubsAnswer(memberId).kind).toBe('advance');

    expect(svc.isOnboardingComplete(memberId)).toBe(true);
    expect(cardStatus(cardIds[0]!)).not.toBe('pending');
    // The reason names the fault, whatever its class; an operator needs one to
    // read, and which class a malformed answer raises is not the contract.
    const dropped = droppedFor(memberId);
    expect(dropped).toEqual([
      { task_type: 'club_affiliations', answer_kind: 'disambiguation', reason: expect.any(String) },
    ]);
    expect(dropped[0]!.reason).not.toBe('');
    // Visible to an operator at the level production logs.
    expect(warn).toHaveBeenCalledWith(
      'held onboarding answer dropped at completion',
      expect.objectContaining({ member_id: memberId, reason: dropped[0]!.reason }),
    );
    warn.mockRestore();
  });

  it('a held claim no longer available is dropped, flagged for the notice, and released with every other hold', () => {
    // Defect caught: completion leaves the claim held on a finished member,
    // so a later replay or an erasure check finds answers that should be gone,
    // or the member is never told their chosen record could not be linked.
    const { memberId } = memberWithCards(false, 0);
    setOnboardingHeldAnswer(db, memberId, 'legacy_claim', {
      claim: { target: { accountId: 'LM-GONE', recordId: null }, withSurname: false, heldAt: '2026-01-01T00:00:00.000Z' },
    });
    expect(svc.processNoClubsAnswer(memberId).kind).toBe('advance');

    const held = db.prepare(
      'SELECT task_type, answer_json FROM member_onboarding_tasks WHERE member_id = ? ORDER BY task_type',
    ).all(memberId) as { task_type: string; answer_json: string | null }[];
    expect(held.filter((r) => r.answer_json !== null)).toEqual([]);
    expect(svc.claimNotAppliedAtCompletion(memberId)).toBe(true);
    const dropped = db.prepare(
      "SELECT metadata_json FROM audit_entries WHERE action_type = 'wizard.held_answer.dropped' AND entity_id = ?",
    ).all(memberId) as { metadata_json: string }[];
    expect(dropped.map((r) => (JSON.parse(r.metadata_json) as { task_type: string }).task_type))
      .toEqual(['legacy_claim']);
  });

  it('a busy database aborts the completing answer instead of dropping it', () => {
    // Defect caught: a momentary lock contention silently discarding what the
    // member answered, when a retry of the same request would have kept it.
    const { memberId } = memberWithCards(false, 0);
    const spy = vi.spyOn(dbMod.clubInsightNotes, 'insertNote', 'get').mockReturnValue({
      run: () => { throw Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' }); },
    } as never);
    try {
      expect(() => svc.processNoClubsAnswer(memberId, 'We play in the park.')).toThrow('database is locked');
    } finally {
      spy.mockRestore();
    }
    expect(taskState(memberId)).toBe('pending');
    expect(heldClubAnswers(memberId)).toEqual([]);

    expect(svc.processNoClubsAnswer(memberId, 'We play in the park.').kind).toBe('advance');
    expect(svc.isOnboardingComplete(memberId)).toBe(true);
  });
});

describe('the same grouped-card answer submitted twice', () => {
  it('is held once', async () => {
    // Defect caught: a double click holds the answer twice, so completion
    // replays it twice and the audit trail records two answers the member
    // gave once.
    const { memberId, cardIds } = memberWithCards(false, 3);
    const body = {
      kind: 'disambiguation', allCandidateIds: cardIds, selectedCandidateIds: [cardIds[0]],
    };
    const first = await svc.processClubAffiliationsSubmit(memberId, body);
    const second = await svc.processClubAffiliationsSubmit(memberId, { ...body });
    expect(second).toEqual(first);
    expect(heldClubAnswers(memberId)).toHaveLength(1);
  });

  it('a different answer on the same card is not treated as the repeat', async () => {
    // The sibling: a changed resubmission must not be swallowed as a repeat.
    const { memberId, cardIds } = memberWithCards(false, 3);
    await svc.processClubAffiliationsSubmit(memberId, {
      kind: 'disambiguation', allCandidateIds: cardIds, selectedCandidateIds: [cardIds[0]],
    });
    await svc.processClubAffiliationsSubmit(memberId, {
      kind: 'disambiguation', allCandidateIds: cardIds.slice(1), selectedCandidateIds: [],
    });
    expect(heldClubAnswers(memberId)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// A prospective member who claimed an old account and answered the club cards
// that account carries. Everything is held through the entries the wizard's
// controllers call; the claim is what makes the cards theirs, so each card is
// answered on top of the held claim.
// ---------------------------------------------------------------------------

// A surname no other case uses: letters only, so the name fold keeps it whole.
let nameSeq = 0;
function surname(): string {
  nameSeq += 1;
  let n = nameSeq;
  let s = '';
  while (n > 0) { s = String.fromCharCode(97 + (n % 26)) + s; n = Math.floor(n / 26); }
  return `Hq${s}ld`;
}

function claimant(): { memberId: string; legacyId: string; name: string } {
  const sn = surname();
  const email = `held-claim-${sn}@example.com`.toLowerCase();
  const legacyId = insertLegacyMember(db, { real_name: `Ada ${sn}`, legacy_email: email });
  const memberId = insertMember(db, {
    onboarding: 'none', real_name: `Ada ${sn}`, login_email: email, birth_date: '1975-06-12',
  });
  insertOnboardingTask(db, memberId, 'personal_details', 'completed');
  const claimed = svc.processClaimCandidate(
    memberId, { accountId: legacyId, recordId: null }, `10.9.0.${nameSeq}`, false,
  );
  expect(claimed.kind).toBe('advance');
  return { memberId, legacyId, name: `Ada ${sn}` };
}

function membershipCard(legacyId: string, city: string): string {
  const club = insertClub(db, { city, name: `${city} Footbag` });
  const candidate = insertLegacyClubCandidate(db, { classification: 'pre_populate', mapped_club_id: club });
  return insertLegacyPersonClubAffiliation(db, {
    legacy_member_id: legacyId, legacy_club_candidate_id: candidate, inferred_role: 'member',
  });
}

function leadershipCard(legacyId: string, city: string): string {
  const club = insertClub(db, { city, name: `${city} Kickers` });
  return insertClubBootstrapLeader(db, { club_id: club, legacy_member_id: legacyId });
}

function answerCard(memberId: string, kind: 'membership' | 'leadership', candidateId: string, userDecision = 'confirm') {
  return svc.processClubAffiliationsSubmit(memberId, {
    kind, candidateId, userDecision, activitySignal: 'active',
  });
}

function links(memberId: string): { legacy_member_id: string | null; historical_person_id: string | null } {
  return db.prepare('SELECT legacy_member_id, historical_person_id FROM members WHERE id = ?')
    .get(memberId) as { legacy_member_id: string | null; historical_person_id: string | null };
}

function count(sql: string, ...params: unknown[]): number {
  return (db.prepare(sql).get(...params) as { n: number }).n;
}

function completions(memberId: string): Array<{ claim_not_applied: boolean }> {
  return (db.prepare(
    "SELECT metadata_json FROM audit_entries WHERE action_type = 'wizard.complete' AND entity_id = ?",
  ).all(memberId) as { metadata_json: string }[])
    .map((r) => JSON.parse(r.metadata_json) as { claim_not_applied: boolean });
}

function heldRows(memberId: string): number {
  return count('SELECT COUNT(*) AS n FROM member_onboarding_tasks WHERE member_id = ? AND answer_json IS NOT NULL', memberId);
}

// Everything completion writes for a claimant, read together so a partial
// write shows as one diff.
function landed(memberId: string, legacyId: string) {
  return {
    links: links(memberId),
    accountClaimed: count(
      'SELECT COUNT(*) AS n FROM legacy_members WHERE legacy_member_id = ? AND claimed_by_member_id = ?',
      legacyId, memberId,
    ),
    tierGrants: count(
      "SELECT COUNT(*) AS n FROM member_tier_grants WHERE member_id = ? AND reason_code = 'legacy.claim_tier_grant'",
      memberId,
    ),
    claimRows: count(
      "SELECT COUNT(*) AS n FROM audit_entries WHERE entity_id = ? AND action_type = 'claim.legacy_account'",
      memberId,
    ),
    clubs: currentClubs(memberId),
    insightNotes: count('SELECT COUNT(*) AS n FROM club_insight_notes WHERE member_id = ?', memberId),
    completions: completions(memberId).length,
    dropped: droppedFor(memberId).length,
    clubStep: taskState(memberId),
  };
}

describe('a held claim that can no longer be applied at completion', () => {
  it('takes every club answer with it except the no-club answer, and records each drop', async () => {
    // Defect caught: a member whose chosen old account went to someone else
    // while they were signing up still lands that account's clubs and its
    // leadership, so a person with no claim to the old identity joins its
    // clubs and leads one; or the no-club answer goes with the claim and the
    // member's note about their area is lost; or the drops go unrecorded so
    // nobody can tell the member why their clubs never appeared.
    const { memberId, legacyId, name } = claimant();
    const member = membershipCard(legacyId, 'Alphaville');
    const leader = leadershipCard(legacyId, 'Betaville');
    const grouped = [membershipCard(legacyId, 'Gammaville'), membershipCard(legacyId, 'Gammaville')];
    const open = membershipCard(legacyId, 'Deltaville');

    expect((await answerCard(memberId, 'membership', member)).kind).not.toBe('validation_error');
    expect((await answerCard(memberId, 'leadership', leader)).kind).not.toBe('validation_error');
    await svc.processClubAffiliationsSubmit(memberId, {
      kind: 'disambiguation', allCandidateIds: grouped, selectedCandidateIds: [],
    });
    // Three answers held on top of the claim, and one card still open, so the
    // club step is still waiting for the member.
    expect(heldClubAnswers(memberId)).toHaveLength(3);
    expect(taskState(memberId)).toBe('pending');

    // The account goes to someone who finished signing up first.
    const rival = insertMember(db, { real_name: name });
    identity.claimLegacyAccount(rival, legacyId);

    expect(svc.processNoClubsAnswer(memberId, 'We kick in the town square.').kind).toBe('advance');

    expect(svc.isOnboardingComplete(memberId)).toBe(true);
    expect(completions(memberId)).toEqual([expect.objectContaining({ claim_not_applied: true })]);
    expect(links(memberId)).toEqual({ legacy_member_id: null, historical_person_id: null });
    expect(currentClubs(memberId)).toBe(0);
    expect(count('SELECT COUNT(*) AS n FROM member_club_affiliations WHERE member_id = ?', memberId)).toBe(0);
    expect(count('SELECT COUNT(*) AS n FROM club_leaders WHERE member_id = ?', memberId)).toBe(0);
    expect(count(
      "SELECT COUNT(*) AS n FROM club_bootstrap_leaders WHERE id = ? AND status = 'provisional'", leader,
    )).toBe(1);
    // Answers about an identity the member did not get touch nothing of it.
    for (const card of [member, ...grouped, open]) {
      expect(cardStatus(card), card).toBe('pending');
    }
    // The no-club answer was applied: its note is stored as the wrap-up note.
    expect(count(
      "SELECT COUNT(*) AS n FROM club_insight_notes WHERE member_id = ? AND source_stage = 'onboarding_club_wrapup'",
      memberId,
    )).toBe(1);
    // Every answer that did not land is on the record, the claim first.
    expect(droppedFor(memberId)).toEqual([
      { task_type: 'legacy_claim', answer_kind: 'claim', reason: 'claim_refused' },
      { task_type: 'club_affiliations', answer_kind: 'card', reason: 'claim_not_applied' },
      { task_type: 'club_affiliations', answer_kind: 'card', reason: 'claim_not_applied' },
      { task_type: 'club_affiliations', answer_kind: 'disambiguation', reason: 'claim_not_applied' },
    ]);
    expect(heldRows(memberId)).toBe(0);
  });
});

describe('one held club answer that can no longer be applied at completion', () => {
  it('is dropped alone: the claim and the other club answers still land', async () => {
    // Defect caught: one card whose suggestion disappeared while the member
    // was signing up takes the claim or the member's other clubs down with
    // it, or silently vanishes with no record of the answer the member gave.
    const { memberId, legacyId } = claimant();
    const gone = membershipCard(legacyId, 'Epsilonville');
    const kept = membershipCard(legacyId, 'Zetaville');

    await answerCard(memberId, 'membership', gone);
    expect(taskState(memberId)).toBe('pending');
    // The suggestion row is withdrawn while the answer is held, as a data
    // reload removing a suggestion would.
    db.prepare('DELETE FROM legacy_person_club_affiliations WHERE id = ?').run(gone);

    // The last card completes the club step and with it onboarding.
    await answerCard(memberId, 'membership', kept);

    expect(svc.isOnboardingComplete(memberId)).toBe(true);
    expect(completions(memberId)).toEqual([expect.objectContaining({ claim_not_applied: false })]);
    expect(landed(memberId, legacyId)).toMatchObject({
      links: { legacy_member_id: legacyId, historical_person_id: null },
      accountClaimed: 1, tierGrants: 1, claimRows: 1, clubs: 1,
    });
    expect(cardStatus(kept)).not.toBe('pending');
    const dropped = droppedFor(memberId);
    expect(dropped).toEqual([
      { task_type: 'club_affiliations', answer_kind: 'card', reason: expect.any(String) },
    ]);
    expect(dropped[0]!.reason).not.toBe('');
    expect(heldRows(memberId)).toBe(0);
  });
});

describe('a completion that fails after the held claim was applied', () => {
  it('rolls back the claim, the clubs, the audit rows and the task together, and a retry lands everything once', async () => {
    // Defect caught: the database fails partway through completion, after the
    // claim was written, and the claim, its tier grant and the claimed marker
    // on the old account survive while the member is still not a member; the
    // retry then claims a second time or finds the account already taken by
    // its own half-finished claim.
    const { memberId, legacyId } = claimant();
    const confirmed = membershipCard(legacyId, 'Etaville');
    const open = membershipCard(legacyId, 'Thetaville');
    await answerCard(memberId, 'membership', confirmed);
    const auditBefore = count('SELECT COUNT(*) AS n FROM audit_entries WHERE entity_id = ? OR actor_member_id = ?', memberId, memberId);
    const heldBefore = db.prepare(
      'SELECT task_type, answer_json FROM member_onboarding_tasks WHERE member_id = ? ORDER BY task_type',
    ).all(memberId);

    const nothingLanded = {
      links: { legacy_member_id: null, historical_person_id: null },
      accountClaimed: 0, tierGrants: 0, claimRows: 0, clubs: 0, insightNotes: 0,
      completions: 0, dropped: 0, clubStep: 'pending',
    };
    expect(landed(memberId, legacyId)).toEqual(nothingLanded);

    // The no-club answer's note is the last write completion makes, after
    // the claim and the confirmed card have been applied.
    const spy = vi.spyOn(dbMod.clubInsightNotes, 'insertNote', 'get').mockReturnValue({
      run: () => { throw Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' }); },
    } as never);
    try {
      expect(() => svc.processNoClubsAnswer(memberId, 'Pickup games on Sundays.')).toThrow('database is locked');
    } finally {
      spy.mockRestore();
    }

    expect(landed(memberId, legacyId)).toEqual(nothingLanded);
    expect(cardStatus(confirmed)).toBe('pending');
    expect(cardStatus(open)).toBe('pending');
    expect(count(
      'SELECT COUNT(*) AS n FROM audit_entries WHERE entity_id = ? OR actor_member_id = ?', memberId, memberId,
    )).toBe(auditBefore);
    // The held answers are exactly as they were, so nothing was released or
    // added by the failed attempt.
    expect(db.prepare(
      'SELECT task_type, answer_json FROM member_onboarding_tasks WHERE member_id = ? ORDER BY task_type',
    ).all(memberId)).toEqual(heldBefore);

    expect(svc.processNoClubsAnswer(memberId, 'Pickup games on Sundays.').kind).toBe('advance');
    expect(landed(memberId, legacyId)).toEqual({
      links: { legacy_member_id: legacyId, historical_person_id: null },
      accountClaimed: 1, tierGrants: 1, claimRows: 1, clubs: 1, insightNotes: 1,
      completions: 1, dropped: 0, clubStep: 'completed',
    });
    // The no-club answer declined the card still open.
    expect(cardStatus(open)).not.toBe('pending');
    expect(heldRows(memberId)).toBe(0);
  });
});
