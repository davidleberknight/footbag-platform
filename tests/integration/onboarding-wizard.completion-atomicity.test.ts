/**
 * Each onboarding step completes in the same transaction as the answer that
 * settles it, because no page load completes anything afterwards: an answer
 * that committed without its completion would leave the member stuck on a step
 * they had already answered, and a completion without its answer would let
 * them past it with nothing recorded. Also holds the claim step's date-of-birth
 * change cap when the step's row is missing.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import {
  insertMember,
  insertClub,
  insertHistoricalPerson,
  insertOnboardingTask,
  insertLegacyClubCandidate,
  insertLegacyPersonClubAffiliation,
  insertClubBootstrapLeader,
  insertClubBootstrapLeaderSignal,
  insertSystemConfig,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3231');

let db: BetterSqlite3.Database;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let svc: typeof import('../../src/services/memberOnboardingService').memberOnboardingService;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let dbMod: typeof import('../../src/db/db');

beforeAll(async () => {
  db = createTestDb(dbPath);
  insertSystemConfig(db, { config_key: 'onboarding_birth_date_change_max', value_json: '1' });
  svc = (await import('../../src/services/memberOnboardingService')).memberOnboardingService;
  dbMod = await import('../../src/db/db');
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

function taskState(memberId: string, taskType: string): string {
  const row = db.prepare(
    'SELECT state FROM member_onboarding_tasks WHERE member_id = ? AND task_type = ?',
  ).get(memberId, taskType) as { state: string } | undefined;
  return row?.state ?? 'pending';
}

function currentClubs(memberId: string): number {
  return (db.prepare(
    'SELECT COUNT(*) AS c FROM member_club_affiliations WHERE member_id = ? AND is_current = 1',
  ).get(memberId) as { c: number }).c;
}

// The completion's own write fails; everything the answer wrote must go with it.
function failCompletion(): () => void {
  const spy = vi.spyOn(dbMod.memberOnboarding, 'updateState', 'get').mockReturnValue({
    run: () => { throw new Error('forced completion failure'); },
  } as never);
  return () => spy.mockRestore();
}

// A member on the club step: personal details and the claim are answered.
function clubStepMember(tag: string): { memberId: string; legacyId: string } {
  const stamp = `${tag}_${Date.now()}`;
  const legacyId = `LM-ATOM-${stamp}`;
  const memberId = insertMember(db, {
    onboarding: 'none',
    slug: `atom_${stamp}`,
    login_email: `atom-${stamp}@example.com`,
    legacy_member_id: legacyId,
  });
  insertOnboardingTask(db, memberId, 'personal_details', 'completed');
  insertOnboardingTask(db, memberId, 'legacy_claim', 'completed');
  insertOnboardingTask(db, memberId, 'club_affiliations', 'pending');
  insertHistoricalPerson(db, { legacy_member_id: legacyId, person_name: `Atom ${tag}` });
  return { memberId, legacyId };
}

describe('the personal-details answer and its completion commit together', () => {
  it('a failed completion leaves the details unsaved, and the retry saves both', () => {
    const stamp = Date.now();
    const memberId = insertMember(db, {
      onboarding: 'none', slug: `atom_pd_${stamp}`, login_email: `atom-pd-${stamp}@example.com`,
      city: null, country: null, birth_date: null,
    });
    insertOnboardingTask(db, memberId, 'personal_details', 'pending');
    const answer = (): unknown => svc.processPersonalDetailsSubmit(
      memberId, 'Portland', 'OR', 'United States',
      { day: '15', month: '5', year: '1990' }, 'undisclosed', '', true,
    );

    const restore = failCompletion();
    expect(answer).toThrow('forced completion failure');
    restore();
    const row = db.prepare('SELECT city, birth_date FROM members WHERE id = ?').get(memberId) as
      { city: string | null; birth_date: string | null };
    expect(row).toEqual({ city: null, birth_date: null });
    expect(taskState(memberId, 'personal_details')).toBe('pending');

    expect(answer()).toEqual({ kind: 'advance', nextTaskType: 'legacy_claim' });
    expect(taskState(memberId, 'personal_details')).toBe('completed');
  });
});

describe('a club card answer and the step completion commit together', () => {
  it('the last membership card: a failed completion leaves the card open and no club added', () => {
    const { memberId, legacyId } = clubStepMember('mem');
    const club = insertClub(db);
    const candidate = insertLegacyClubCandidate(db, { classification: 'pre_populate', mapped_club_id: club });
    const cardId = insertLegacyPersonClubAffiliation(db, {
      legacy_member_id: legacyId, legacy_club_candidate_id: candidate, inferred_role: 'member',
    });
    const answer = () => svc.submitClubAffiliationsResponse(memberId, {
      kind: 'membership', candidateId: cardId, userDecision: 'confirm', activitySignal: 'active',
    });

    const restore = failCompletion();
    expect(answer).toThrow('forced completion failure');
    restore();
    expect(currentClubs(memberId)).toBe(0);
    expect(svc.listWizardCardsForMember(memberId).map((c) => c.kind)).toEqual(['membership']);
    expect(taskState(memberId, 'club_affiliations')).toBe('pending');

    expect(answer().taskState).toBe('completed');
    expect(currentClubs(memberId)).toBe(1);
    expect(taskState(memberId, 'club_affiliations')).toBe('completed');
  });

  it('the last leadership card: a failed completion leaves the club unclaimed', () => {
    const { memberId, legacyId } = clubStepMember('lead');
    const club = insertClub(db);
    const cardId = insertClubBootstrapLeader(db, {
      club_id: club, legacy_member_id: legacyId, role: 'leader', status: 'provisional',
    });
    insertClubBootstrapLeaderSignal(db, { bootstrap_leader_id: cardId, signal_type: 'listed_contact', is_present: 1 });
    const answer = () => svc.submitClubAffiliationsResponse(memberId, {
      kind: 'leadership', candidateId: cardId, userDecision: 'confirm', activitySignal: 'active',
    });
    const leaderRows = (): number => (db.prepare(
      'SELECT COUNT(*) AS c FROM club_leaders WHERE club_id = ? AND member_id = ?',
    ).get(club, memberId) as { c: number }).c;

    const restore = failCompletion();
    expect(answer).toThrow('forced completion failure');
    restore();
    expect(leaderRows()).toBe(0);
    expect(currentClubs(memberId)).toBe(0);
    expect(taskState(memberId, 'club_affiliations')).toBe('pending');

    expect(answer().taskState).toBe('completed');
    expect(leaderRows()).toBe(1);
    expect(taskState(memberId, 'club_affiliations')).toBe('completed');
  });
});

describe('a club card answer and its optional insight note commit together', () => {
  it('a failed note write leaves the card unanswered, and the retry records both', async () => {
    // Defect caught: the answer committing while the note it carried is lost
    // behind an error page, so the member is moved on and what they wrote for
    // the cleanup queue is silently dropped.
    const { memberId, legacyId } = clubStepMember('note');
    const club = insertClub(db);
    const candidate = insertLegacyClubCandidate(db, { classification: 'pre_populate', mapped_club_id: club });
    const cardId = insertLegacyPersonClubAffiliation(db, {
      legacy_member_id: legacyId, legacy_club_candidate_id: candidate, inferred_role: 'member',
    });
    const answer = () => svc.processClubAffiliationsSubmit(memberId, {
      kind: 'membership', candidateId: cardId, userDecision: 'confirm', activitySignal: 'active',
      insightNote: 'Still meets on Thursdays.',
    });
    const notes = (): number => (db.prepare(
      'SELECT COUNT(*) AS c FROM club_insight_notes WHERE member_id = ?',
    ).get(memberId) as { c: number }).c;

    const spy = vi.spyOn(dbMod.clubInsightNotes, 'insertNote', 'get').mockReturnValue({
      run: () => { throw new Error('forced note failure'); },
    } as never);
    await expect(answer()).rejects.toThrow('forced note failure');
    spy.mockRestore();
    expect(currentClubs(memberId)).toBe(0);
    expect(svc.listWizardCardsForMember(memberId).map((c) => c.kind)).toEqual(['membership']);
    expect(taskState(memberId, 'club_affiliations')).toBe('pending');

    expect((await answer()).kind).toBe('advance');
    expect(currentClubs(memberId)).toBe(1);
    expect(notes()).toBe(1);
    expect(taskState(memberId, 'club_affiliations')).toBe('completed');
  });
});

describe('the claim step date-of-birth cap holds with no claim-step row', () => {
  it('a member with no claim-step row is refused once the cap is spent', () => {
    // With the row missing, the change counter had nothing to count on and
    // the cap could never be reached, so the date could be changed without
    // limit to probe the old records.
    const stamp = Date.now();
    const slug = `atom_dob_${stamp}`;
    const memberId = insertMember(db, {
      onboarding: 'none', slug, login_email: `atom-dob-${stamp}@example.com`, birth_date: '1980-01-01',
    });
    insertOnboardingTask(db, memberId, 'personal_details', 'completed');

    expect(svc.processLegacyClaimBirthDate(memberId, slug, { day: '2', month: '1', year: '1980' }))
      .toEqual({ kind: 'retry_same', flash: null, query: 'birth_date=saved' });
    const refused = svc.processLegacyClaimBirthDate(memberId, slug, { day: '3', month: '1', year: '1980' });
    expect(refused.kind).toBe('validation_error');
    const row = db.prepare('SELECT birth_date FROM members WHERE id = ?').get(memberId) as { birth_date: string };
    expect(row.birth_date).toBe('1980-01-02');
  });
});
