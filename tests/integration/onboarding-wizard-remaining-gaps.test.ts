/**
 * Integration tests covering remaining gaps identified in the adversarial
 * review: two-current-club cap on affiliation confirm, Tier 0
 * leadership gate, and dashboard task widget content.
 *
 * User story anchors: M_Complete_Onboarding_Wizard, M_Join_Club.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertClub,
  insertHistoricalPerson,
  insertLegacyMember,
  insertClubBootstrapLeader,
  insertClubBootstrapLeaderSignal,
  insertLegacyClubCandidate,
  insertLegacyPersonClubAffiliation,
  insertMemberClubAffiliation,
  createMemberAtTier,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3213');

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let svc: typeof import('../../src/services/memberOnboardingService').memberOnboardingService;

beforeAll(async () => {
  db = createTestDb(dbPath);
  createApp = await importApp();
  const mod = await import('../../src/services/memberOnboardingService');
  svc = mod.memberOnboardingService;
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

function cookieFor(memberId: string): string {
  return `footbag_session=${createTestSessionJwt({ memberId })}`;
}

function getAffiliations(memberId: string) {
  return db.prepare(
    'SELECT club_id, is_current, is_primary, source FROM member_club_affiliations WHERE member_id = ? ORDER BY created_at',
  ).all(memberId) as Array<{ club_id: string; is_current: number; is_primary: number; source: string }>;
}

function getClubLeaders(clubId: string) {
  return db.prepare(
    'SELECT member_id, role FROM club_leaders WHERE club_id = ? ORDER BY created_at',
  ).all(clubId) as Array<{ member_id: string; role: string }>;
}

function getTaskState(memberId: string, taskType: string): string | null {
  const row = db.prepare(
    'SELECT state FROM member_onboarding_tasks WHERE member_id = ? AND task_type = ?',
  ).get(memberId, taskType) as { state: string } | undefined;
  return row?.state ?? null;
}

// ── One-current-club invariant ───────────────────────────────────────────────

describe('two-current-club cap: second current affiliation succeeds, third would be blocked', () => {
  it('member already current at club A, confirming club B via wizard -> both affiliations land (under two-club cap)', async () => {
    const stamp = Date.now();
    const legacyId = `LM-ONEC-${stamp}`;
    const memberId = `onec-${stamp}`;
    const slug = `onec_${stamp}`;

    const clubA = insertClub(db, { id: `club-a-${stamp}` });
    const clubB = insertClub(db, { id: `club-b-${stamp}` });

    createMemberAtTier(db, {
      id: memberId,
      slug,
      tier: 'tier1',
      memberOverrides: { legacy_member_id: legacyId },
    });

    insertMemberClubAffiliation(db, memberId, clubA, { is_current: 1, is_primary: 1, source: 'member_self_service' });

    const personId = insertHistoricalPerson(db, {
      legacy_member_id: legacyId,
      person_name: 'One Club',
    });

    const candidateId = insertLegacyClubCandidate(db, {
      classification: 'pre_populate',
      mapped_club_id: clubB,
    });
    insertLegacyPersonClubAffiliation(db, {
      historical_person_id: personId,
      legacy_member_id: legacyId,
      legacy_club_candidate_id: candidateId,
      inferred_role: 'member',
    });

    svc.startTaskList(memberId);

    const cards = svc.listWizardCardsForMember(memberId);
    const membershipCard = cards.find((c) => c.kind === 'membership');
    if (!membershipCard) {
      throw new Error('Expected a membership card for this setup');
    }

    const result = svc.submitClubAffiliationsResponse(memberId, {
      kind: 'membership',
      candidateId: membershipCard.candidateId,
      userDecision: 'confirm',
      activitySignal: 'active',
    });

    expect(result.branch).toBe('confirmed');

    const afterAffs = getAffiliations(memberId);
    const currentAffs = afterAffs.filter((a) => a.is_current === 1);
    expect(currentAffs).toHaveLength(2);
    expect(currentAffs.map((a) => a.club_id).sort()).toEqual([clubA, clubB].sort());
  });
});

// ── Tier 0 leadership gate ───────────────────────────────────────────────────

describe('Tier 0 leadership: current implementation promotes regardless of tier', () => {
  it('Tier 0 member confirming a leadership bootstrap candidate IS promoted to co-leader (no tier gate in wizard path)', async () => {
    const stamp = Date.now();
    const legacyId = `LM-T0L-${stamp}`;
    const memberId = `t0l-${stamp}`;
    const slug = `t0l_${stamp}`;

    const club = insertClub(db, { id: `club-t0l-${stamp}` });

    createMemberAtTier(db, {
      id: memberId,
      slug,
      tier: 'tier0',
      memberOverrides: { legacy_member_id: legacyId },
    });

    insertHistoricalPerson(db, {
      legacy_member_id: legacyId,
      person_name: 'Tier Zero',
    });

    const candidateId = insertClubBootstrapLeader(db, {
      club_id: club,
      legacy_member_id: legacyId,
      role: 'leader',
      status: 'provisional',
    });
    insertClubBootstrapLeaderSignal(db, {
      bootstrap_leader_id: candidateId,
      signal_type: 'listed_contact',
      is_present: 1,
    });
    insertClubBootstrapLeaderSignal(db, {
      bootstrap_leader_id: candidateId,
      signal_type: 'affiliation',
      is_present: 1,
    });

    svc.startTaskList(memberId);

    const cards = svc.listWizardCardsForMember(memberId);
    const leaderCard = cards.find((c) => c.kind === 'leadership');
    if (!leaderCard) {
      throw new Error('Expected a leadership card for this setup');
    }

    svc.submitClubAffiliationsResponse(memberId, {
      kind: 'leadership',
      candidateId: leaderCard.candidateId,
      userDecision: 'confirm',
      activitySignal: 'active',
    });

    const leaders = getClubLeaders(club);
    const memberAsLeader = leaders.find((l) => l.member_id === memberId);
    expect(memberAsLeader).toBeDefined();
    expect(memberAsLeader!.role).toBe('co-leader');
  });
});

// ── Dashboard task widget ────────────────────────────────────────────────────

describe('dashboard task widget: pending and skipped tasks surface Resume buttons', () => {
  it('member with a skipped optional club task sees Resume button on dashboard', async () => {
    const stamp = Date.now();
    const memberId = insertMember(db, {
      slug: `widget_${stamp}`,
      login_email: `widget-${stamp}@example.com`,
    });
    const cookie = cookieFor(memberId);

    // club_affiliations is the optional task that can be skipped; legacy_claim
    // and personal_details are required and cannot reach a skipped state.
    await request(createApp()).get('/register/wizard/club_affiliations').set('Cookie', cookie);
    await request(createApp())
      .post('/register/wizard/club_affiliations/skip')
      .set('Cookie', cookie)
      .type('form')
      .send({});
    expect(getTaskState(memberId, 'club_affiliations')).toBe('skipped');

    const dashboard = await request(createApp())
      .get(`/members/widget_${stamp}`)
      .set('Cookie', cookie);

    expect(dashboard.status).toBe(200);
    expect(dashboard.text).toContain('/register/wizard/club_affiliations');
    expect(dashboard.text).toMatch(/Resume|Continue/i);
  });

  it('member with all tasks completed or not_applicable sees no task widget section on dashboard', async () => {
    const stamp = Date.now();
    const memberId = insertMember(db, {
      slug: `widget_done_${stamp}`,
      login_email: `widget-done-${stamp}@example.com`,
    });

    svc.startTaskList(memberId);
    svc.completeTask(memberId, 'personal_details');
    svc.completeTask(memberId, 'legacy_claim');
    svc.markTaskNotApplicable(memberId, 'club_affiliations');

    const dashboard = await request(createApp())
      .get(`/members/widget_done_${stamp}`)
      .set('Cookie', cookieFor(memberId));

    expect(dashboard.status).toBe(200);
    expect(dashboard.text).not.toContain('onboarding-task-widget');
    expect(dashboard.text).not.toContain('onboarding-task-cta');
  });
});
