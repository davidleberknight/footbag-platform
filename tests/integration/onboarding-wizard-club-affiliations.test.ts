/**
 * Integration tests for the wizard's `club_affiliations` task handler.
 *
 * Design (post-refactor): members are encouraged to step up to club leadership.
 *   - 'confirm' OR 'correct' → auto-promote (admin involvement is not normal flow)
 *   - 'decline' → rejected
 *
 *   Role assignment is automatic:
 *     - Bootstrap row's role (usually 'leader') is attempted first
 *     - If the leader slot is taken OR member is already lead of another club,
 *       downgrade to 'co-leader'
 *     - If the 5-leader cap is reached, skip the club_leaders insert but
 *       still affiliate the member (admin can promote later via A_* powers)
 *     - If the member is already in this club's leadership, idempotent no-op
 *
 * Classification (strong/weak/none) is recorded in audit metadata for
 * post-cutover analytics but no longer drives branch choice; the decision
 * alone determines the branch. Signal rows are fixture-inserted directly;
 * production pre-compute lands via James's pipeline (see legacy IP).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import {
  insertMember,
  insertClub,
  insertClubBootstrapLeader,
  insertClubBootstrapLeaderSignal,
  type ClubBootstrapLeaderSignalType,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3160');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let svc: typeof import('../../src/services/memberOnboardingService').memberOnboardingService;

interface BootstrapLeaderRow {
  status: string;
  claimed_member_id: string | null;
}

interface ClubLeaderRow {
  club_id: string;
  member_id: string;
  role: string;
}

interface AffiliationRow {
  member_id: string;
  club_id: string;
  is_current: number;
  source: string;
}

interface AuditRow {
  action_type: string;
  actor_member_id: string | null;
  entity_type: string;
  entity_id: string;
  metadata_json: string;
}

interface TaskRow {
  state: string;
  completed_at: string | null;
}

function readBootstrapLeader(id: string): BootstrapLeaderRow {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const row = db
    .prepare(`SELECT status, claimed_member_id FROM club_bootstrap_leaders WHERE id = ?`)
    .get(id) as BootstrapLeaderRow;
  db.close();
  return row;
}

function readClubLeaders(clubId: string): ClubLeaderRow[] {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const rows = db
    .prepare(`SELECT club_id, member_id, role FROM club_leaders WHERE club_id = ? ORDER BY rowid`)
    .all(clubId) as ClubLeaderRow[];
  db.close();
  return rows;
}

function readAffiliations(memberId: string): AffiliationRow[] {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const rows = db
    .prepare(
      `SELECT member_id, club_id, is_current, source
         FROM member_club_affiliations
        WHERE member_id = ?`,
    )
    .all(memberId) as AffiliationRow[];
  db.close();
  return rows;
}

function readClubAffiliationsAudits(memberId: string): AuditRow[] {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const rows = db
    .prepare(
      `SELECT action_type, actor_member_id, entity_type, entity_id, metadata_json
         FROM audit_entries
        WHERE actor_member_id = ?
          AND action_type LIKE 'wizard.club_affiliations.%'
        ORDER BY rowid`,
    )
    .all(memberId) as AuditRow[];
  db.close();
  return rows;
}

function readOnboardingTask(memberId: string, taskType: string): TaskRow | undefined {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const row = db
    .prepare(
      `SELECT state, completed_at FROM member_onboarding_tasks
        WHERE member_id = ? AND task_type = ?`,
    )
    .get(memberId, taskType) as TaskRow | undefined;
  db.close();
  return row;
}

/**
 * Seed a bootstrap leader candidate with the signal set required to land
 * the requested classification.
 *
 * strong = (listed_contact AND affiliation), per the matched gate
 *          classifyBootstrapLeader exercises first.
 * weak   = exactly one structural signal (mirror_text).
 * none   = zero structural signals.
 */
function seedCandidate(
  db: BetterSqlite3.Database,
  args: {
    clubId: string;
    legacyMemberId: string;
    classification: 'strong' | 'weak' | 'none';
    role?: 'leader' | 'co-leader';
  },
): string {
  const candidateId = insertClubBootstrapLeader(db, {
    club_id: args.clubId,
    legacy_member_id: args.legacyMemberId,
    role: args.role ?? 'leader',
    status: 'provisional',
  });
  if (args.classification === 'strong') {
    const present: ClubBootstrapLeaderSignalType[] = ['listed_contact', 'affiliation'];
    for (const sig of present) {
      insertClubBootstrapLeaderSignal(db, {
        bootstrap_leader_id: candidateId,
        signal_type: sig,
        is_present: 1,
      });
    }
  } else if (args.classification === 'weak') {
    insertClubBootstrapLeaderSignal(db, {
      bootstrap_leader_id: candidateId,
      signal_type: 'mirror_text',
      is_present: 1,
    });
  }
  return candidateId;
}

// 9-cell matrix: classification × decision. After the refactor, the BRANCH
// depends only on the decision, but the classification is preserved in audit
// metadata so we still exercise all 9 combinations to lock the audit contract.
const MATRIX_CELLS: Array<{
  key: string;
  classification: 'strong' | 'weak' | 'none';
  userDecision: 'confirm' | 'correct' | 'decline';
  expectedBranch: 'promoted_leader' | 'declined';
}> = [
  { key: 'strong_confirm', classification: 'strong', userDecision: 'confirm', expectedBranch: 'promoted_leader' },
  { key: 'strong_correct', classification: 'strong', userDecision: 'correct', expectedBranch: 'promoted_leader' },
  { key: 'strong_decline', classification: 'strong', userDecision: 'decline', expectedBranch: 'declined'         },
  { key: 'weak_confirm',   classification: 'weak',   userDecision: 'confirm', expectedBranch: 'promoted_leader' },
  { key: 'weak_correct',   classification: 'weak',   userDecision: 'correct', expectedBranch: 'promoted_leader' },
  { key: 'weak_decline',   classification: 'weak',   userDecision: 'decline', expectedBranch: 'declined'         },
  { key: 'none_confirm',   classification: 'none',   userDecision: 'confirm', expectedBranch: 'promoted_leader' },
  { key: 'none_correct',   classification: 'none',   userDecision: 'correct', expectedBranch: 'promoted_leader' },
  { key: 'none_decline',   classification: 'none',   userDecision: 'decline', expectedBranch: 'declined'         },
];

const cellState = new Map<
  string,
  { memberId: string; clubId: string; candidateId: string }
>();

// Five-member cohort sharing one club, exercising role-downgrade + cap.
const COHORT_MEMBERS = ['m-cohort-1', 'm-cohort-2', 'm-cohort-3', 'm-cohort-4', 'm-cohort-5', 'm-cohort-6'];
let cohortClubId = '';
const cohortCandidateByMember = new Map<string, string>();

// Idempotency.
const IDEMPOTENT_MEMBER = 'member-idempotent';
let idempotentClubId = '';
let idempotentCandidateId = '';

// Cross-club leader: member already leader of one club; second club's claim downgrades.
const CROSS_CLUB_MEMBER = 'member-cross-club';
let crossClubA = '';
let crossClubB = '';
let crossCandidateA = '';
let crossCandidateB = '';

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // 9-cell matrix: distinct member + club per cell.
  for (const cell of MATRIX_CELLS) {
    const memberId = `member-${cell.key}`;
    insertMember(db, { id: memberId, slug: memberId.replace(/-/g, '_'), login_email: `${memberId}@example.com` });
    const clubId = insertClub(db, { name: `Club ${cell.key}` });
    const candidateId = seedCandidate(db, {
      clubId,
      legacyMemberId: `lm-${cell.key}`,
      classification: cell.classification,
    });
    cellState.set(cell.key, { memberId, clubId, candidateId });
  }

  // Cohort: one club, six bootstrap_leader rows (all role='leader' from
  // pipeline perspective). Service downgrades after the first; cap kicks in
  // for the sixth.
  cohortClubId = insertClub(db, { name: 'Cohort Club' });
  for (const mid of COHORT_MEMBERS) {
    insertMember(db, { id: mid, slug: mid.replace(/-/g, '_'), login_email: `${mid}@example.com` });
    const candidateId = seedCandidate(db, {
      clubId: cohortClubId,
      legacyMemberId: `lm-${mid}`,
      classification: 'strong',
      role: 'leader',
    });
    cohortCandidateByMember.set(mid, candidateId);
  }

  // Idempotency: one strong candidate, submitted twice.
  insertMember(db, {
    id: IDEMPOTENT_MEMBER,
    slug: 'member_idempotent',
    login_email: 'idempotent@example.com',
  });
  idempotentClubId = insertClub(db, { name: 'Idempotent Club' });
  idempotentCandidateId = seedCandidate(db, {
    clubId: idempotentClubId,
    legacyMemberId: 'lm-idempotent',
    classification: 'strong',
  });

  // Cross-club: member becomes leader of club A, then claims club B (downgrades to co-leader).
  insertMember(db, {
    id: CROSS_CLUB_MEMBER,
    slug: 'member_cross_club',
    login_email: 'cross_club@example.com',
  });
  crossClubA = insertClub(db, { name: 'Cross Club A' });
  crossClubB = insertClub(db, { name: 'Cross Club B' });
  crossCandidateA = seedCandidate(db, {
    clubId: crossClubA,
    legacyMemberId: 'lm-cross-a',
    classification: 'strong',
  });
  crossCandidateB = seedCandidate(db, {
    clubId: crossClubB,
    legacyMemberId: 'lm-cross-b',
    classification: 'strong',
  });

  db.close();

  const mod = await import('../../src/services/memberOnboardingService');
  svc = mod.memberOnboardingService;
});

afterAll(() => cleanupTestDb(dbPath));

describe('memberOnboardingService.submitClubAffiliationsResponse — 9-cell matrix', () => {
  for (const cell of MATRIX_CELLS) {
    it(`${cell.classification} × ${cell.userDecision} → ${cell.expectedBranch}`, () => {
      const state = cellState.get(cell.key)!;
      const result = svc.submitClubAffiliationsResponse(state.memberId, {
        candidateId: state.candidateId,
        userDecision: cell.userDecision,
      });

      expect(result.branch).toBe(cell.expectedBranch);
      expect(result.classification).toBe(cell.classification);

      const task = readOnboardingTask(state.memberId, 'club_affiliations');
      expect(task?.state).toBe('completed');
      expect(task?.completed_at).toBeTruthy();

      const leader = readBootstrapLeader(state.candidateId);
      if (cell.expectedBranch === 'promoted_leader') {
        expect(leader.status).toBe('claimed');
        expect(leader.claimed_member_id).toBe(state.memberId);
        expect(result.actualRole).toBe('leader');
        const cls = readClubLeaders(state.clubId);
        expect(cls).toHaveLength(1);
        expect(cls[0]).toEqual({ club_id: state.clubId, member_id: state.memberId, role: 'leader' });
        const affs = readAffiliations(state.memberId);
        expect(affs).toHaveLength(1);
        expect(affs[0]).toMatchObject({
          club_id: state.clubId,
          is_current: 1,
          source: 'legacy_claim',
        });
      } else {
        // declined
        expect(leader.status).toBe('rejected');
        expect(leader.claimed_member_id).toBeNull();
        expect(result.actualRole).toBeNull();
        expect(readClubLeaders(state.clubId)).toHaveLength(0);
        expect(readAffiliations(state.memberId)).toHaveLength(0);
      }

      const audits = readClubAffiliationsAudits(state.memberId);
      expect(audits).toHaveLength(1);
      const expectedAction =
        cell.expectedBranch === 'declined'
          ? 'wizard.club_affiliations.declined'
          : 'wizard.club_affiliations.promoted';
      expect(audits[0].action_type).toBe(expectedAction);
      expect(audits[0].entity_id).toBe(state.candidateId);
      const meta = JSON.parse(audits[0].metadata_json);
      expect(meta.classification).toBe(cell.classification);
    });
  }
});

describe('memberOnboardingService.submitClubAffiliationsResponse — multi-member cohort', () => {
  it('first claimant becomes leader; subsequent claims become co-leaders up to cap; 6th is affiliated only', () => {
    // Member 1: gets role='leader'.
    const r1 = svc.submitClubAffiliationsResponse(COHORT_MEMBERS[0], {
      candidateId: cohortCandidateByMember.get(COHORT_MEMBERS[0])!,
      userDecision: 'confirm',
    });
    expect(r1.branch).toBe('promoted_leader');
    expect(r1.actualRole).toBe('leader');

    // Members 2-5: downgraded to co-leader.
    for (const mid of COHORT_MEMBERS.slice(1, 5)) {
      const r = svc.submitClubAffiliationsResponse(mid, {
        candidateId: cohortCandidateByMember.get(mid)!,
        userDecision: 'confirm',
      });
      expect(r.branch).toBe('promoted_co_leader');
      expect(r.actualRole).toBe('co-leader');
    }

    // After 5 claims: club has 1 leader + 4 co-leaders.
    const leaders = readClubLeaders(cohortClubId);
    expect(leaders).toHaveLength(5);
    expect(leaders.filter((l) => l.role === 'leader')).toHaveLength(1);
    expect(leaders.filter((l) => l.role === 'co-leader')).toHaveLength(4);

    // Member 6: cap hit. Bootstrap row is marked claimed; affiliation lands;
    // no club_leaders row is added. Admins can later promote via A_* powers.
    const r6 = svc.submitClubAffiliationsResponse(COHORT_MEMBERS[5], {
      candidateId: cohortCandidateByMember.get(COHORT_MEMBERS[5])!,
      userDecision: 'confirm',
    });
    expect(r6.branch).toBe('affiliated_only');
    expect(r6.actualRole).toBeNull();

    // Leadership unchanged at 5.
    expect(readClubLeaders(cohortClubId)).toHaveLength(5);
    // Member 6 has an affiliation but no leadership row.
    const m6Affs = readAffiliations(COHORT_MEMBERS[5]);
    expect(m6Affs).toHaveLength(1);
    expect(m6Affs[0].club_id).toBe(cohortClubId);
    expect(readBootstrapLeader(cohortCandidateByMember.get(COHORT_MEMBERS[5])!).status).toBe('claimed');
  });
});

describe('memberOnboardingService.submitClubAffiliationsResponse — cross-club downgrade', () => {
  it('member already leader of club A claims club B → co-leader of B (ux_one_club_leader_per_member fence)', () => {
    // Claim club A as leader.
    const a = svc.submitClubAffiliationsResponse(CROSS_CLUB_MEMBER, {
      candidateId: crossCandidateA,
      userDecision: 'confirm',
    });
    expect(a.branch).toBe('promoted_leader');
    expect(a.actualRole).toBe('leader');

    // Claim club B; service detects member already leads club A, downgrades to co-leader.
    const b = svc.submitClubAffiliationsResponse(CROSS_CLUB_MEMBER, {
      candidateId: crossCandidateB,
      userDecision: 'confirm',
    });
    expect(b.branch).toBe('promoted_co_leader');
    expect(b.actualRole).toBe('co-leader');

    const aLeaders = readClubLeaders(crossClubA);
    const bLeaders = readClubLeaders(crossClubB);
    expect(aLeaders).toHaveLength(1);
    expect(aLeaders[0].role).toBe('leader');
    expect(bLeaders).toHaveLength(1);
    expect(bLeaders[0].role).toBe('co-leader');
  });
});

describe('memberOnboardingService.submitClubAffiliationsResponse — idempotency', () => {
  it('re-submitting confirm on an already-claimed candidate is a no-op', () => {
    const first = svc.submitClubAffiliationsResponse(IDEMPOTENT_MEMBER, {
      candidateId: idempotentCandidateId,
      userDecision: 'confirm',
    });
    expect(first.branch).toBe('promoted_leader');

    expect(readClubLeaders(idempotentClubId)).toHaveLength(1);
    expect(readAffiliations(IDEMPOTENT_MEMBER)).toHaveLength(1);
    expect(readBootstrapLeader(idempotentCandidateId).status).toBe('claimed');

    // Second submit: status !== 'provisional' → short-circuit idempotent path.
    const second = svc.submitClubAffiliationsResponse(IDEMPOTENT_MEMBER, {
      candidateId: idempotentCandidateId,
      userDecision: 'confirm',
    });
    expect(second.branch).toBe('idempotent');

    expect(readClubLeaders(idempotentClubId)).toHaveLength(1);
    expect(readAffiliations(IDEMPOTENT_MEMBER)).toHaveLength(1);
    expect(readBootstrapLeader(idempotentCandidateId).status).toBe('claimed');
  });
});

describe('memberOnboardingService.submitClubAffiliationsResponse — affiliation already current elsewhere (D1)', () => {
  it('member already current at club X claims leadership of club Y: club_leaders row lands; is_current stays at X', () => {
    // Seed: member, two clubs, pre-existing is_current=1 affiliation at club X,
    // bootstrap leader candidate for club Y.
    const db = new BetterSqlite3(dbPath);
    const memberId = 'member-d1-current-elsewhere';
    insertMember(db, { id: memberId, slug: memberId.replace(/-/g, '_'), login_email: `${memberId}@example.com` });
    const clubX = insertClub(db, { name: 'D1 Club X (pre-existing current)' });
    const clubY = insertClub(db, { name: 'D1 Club Y (new claim)' });
    // Direct insert of the pre-existing is_current=1 affiliation at clubX.
    db.prepare(`
      INSERT INTO member_club_affiliations (
        id, created_at, created_by, updated_at, updated_by, version,
        member_id, club_id, is_current, is_contact, source
      ) VALUES ('mca-d1-pre', '2025-01-01T00:00:00.000Z', 'test', '2025-01-01T00:00:00.000Z', 'test', 1,
                ?, ?, 1, 0, 'admin')
    `).run(memberId, clubX);
    const candidateY = seedCandidate(db, {
      clubId: clubY,
      legacyMemberId: 'lm-d1',
      classification: 'strong',
    });
    db.close();

    const result = svc.submitClubAffiliationsResponse(memberId, {
      candidateId: candidateY,
      userDecision: 'confirm',
    });

    // Leadership claim succeeded at club Y.
    expect(result.branch).toBe('promoted_leader');
    expect(result.actualRole).toBe('leader');
    expect(readClubLeaders(clubY)).toHaveLength(1);
    expect(readClubLeaders(clubX)).toHaveLength(0);

    // Member's affiliation state: original is_current=1 at clubX preserved;
    // no new is_current=1 row at clubY (insertAffiliation hits the partial
    // unique on member_club_affiliations.ux_member_club_affiliations_one_current,
    // service catches isUniqueViolation and continues idempotently).
    const affs = readAffiliations(memberId);
    expect(affs).toHaveLength(1);
    expect(affs[0].club_id).toBe(clubX);
    expect(affs[0].is_current).toBe(1);
    expect(affs[0].source).toBe('admin');
  });
});

describe('memberOnboardingService.submitClubAffiliationsResponse — validation', () => {
  it('throws ValidationError when candidateId is missing', async () => {
    const { ValidationError } = await import('../../src/services/serviceErrors');
    const state = cellState.get('strong_confirm')!;
    expect(() =>
      svc.submitClubAffiliationsResponse(state.memberId, { userDecision: 'confirm' }),
    ).toThrow(ValidationError);
  });

  it('throws ValidationError when userDecision is invalid', async () => {
    const { ValidationError } = await import('../../src/services/serviceErrors');
    const state = cellState.get('strong_confirm')!;
    expect(() =>
      svc.submitClubAffiliationsResponse(state.memberId, {
        candidateId: state.candidateId,
        userDecision: 'maybe',
      }),
    ).toThrow(ValidationError);
  });

  it('throws NotFoundError when candidateId does not exist', async () => {
    const { NotFoundError } = await import('../../src/services/serviceErrors');
    const state = cellState.get('strong_confirm')!;
    expect(() =>
      svc.submitClubAffiliationsResponse(state.memberId, {
        candidateId: 'cbl-does-not-exist',
        userDecision: 'confirm',
      }),
    ).toThrow(NotFoundError);
  });
});
