/**
 * Club leadership lifecycle contract: a willing leader makes it a live club.
 *
 *   - A successful leadership claim returns a club of any status (inactive
 *     or archived) to 'active', audit-logged as a revival; claiming an
 *     already-active club writes no revival audit.
 *   - A new current affiliation (self-service join) revives an inactive
 *     club; archived clubs are not joinable and revive only via a claim.
 *   - Co-leader contact is member-visible by role: the club page shows
 *     current co-leaders' emails to authenticated viewers only; provisional
 *     (unclaimed) entries never expose contact to anyone.
 *   - The admin could-use-a-co-leader queue lists only leaderless active
 *     clubs: a club is reachable through its co-leaders.
 *   - The wizard's step-up offer routes through the shared volunteer write,
 *     which stamps the club_service provenance and revives the club.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertClub,
  insertTag,
  insertClubBootstrapLeader,
  insertClubLeader,
  insertMemberClubAffiliation,
  completeOnboarding,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3991');

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let onboardingSvc: typeof import('../../src/services/memberOnboardingService').memberOnboardingService;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let clubSvc: typeof import('../../src/services/clubService').clubService;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let leadershipSvc: typeof import('../../src/services/adminClubLeadershipService').adminClubLeadershipService;

beforeAll(async () => {
  db = createTestDb(dbPath);
  createApp = await importApp();
  onboardingSvc = (await import('../../src/services/memberOnboardingService')).memberOnboardingService;
  clubSvc = (await import('../../src/services/clubService')).clubService;
  leadershipSvc = (await import('../../src/services/adminClubLeadershipService')).adminClubLeadershipService;
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

function cookieFor(memberId: string): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId })}`;
}

let _n = 0;
function seedMember(): string {
  _n += 1;
  const memberId = `cll-mem-${_n}`;
  insertMember(db, { id: memberId, slug: `cll_mem_${_n}`, login_email: `${memberId}@example.com` });
  // Settled onboarding keeps authenticated page reads from redirecting into
  // the wizard.
  completeOnboarding(db, memberId);
  return memberId;
}

function seedClub(status: 'active' | 'inactive' | 'archived'): string {
  _n += 1;
  return insertClub(db, { id: `cll-club-${_n}`, name: `Lifecycle Club ${_n}`, status });
}

function clubStatus(clubId: string): string {
  return (db.prepare('SELECT status FROM clubs WHERE id = ?').get(clubId) as { status: string }).status;
}

function revivalAudits(clubId: string): Array<{ action_type: string; metadata_json: string }> {
  return db.prepare(`
    SELECT action_type, metadata_json FROM audit_entries
    WHERE entity_id = ? AND action_type LIKE 'club.revived%' ORDER BY rowid
  `).all(clubId) as Array<{ action_type: string; metadata_json: string }>;
}

describe('revival on leadership claim', () => {
  it('claiming an inactive club returns it to active with a revival audit row', () => {
    const memberId = seedMember();
    const clubId = seedClub('inactive');
    const candidateId = insertClubBootstrapLeader(db, {
      club_id: clubId, legacy_member_id: `lm-cll-${_n}`, role: 'leader', status: 'provisional',
    });

    const result = onboardingSvc.submitClubAffiliationsResponse(memberId, {
      candidateId, userDecision: 'confirm', activitySignal: 'active',
    });
    expect(result.branch).toBe('promoted_co_leader');
    expect(clubStatus(clubId)).toBe('active');
    const audits = revivalAudits(clubId);
    expect(audits).toHaveLength(1);
    expect(audits[0].action_type).toBe('club.revived_by_leadership_claim');
    expect(JSON.parse(audits[0].metadata_json).prior_status).toBe('inactive');
  });

  it('claiming an archived club returns it to active', () => {
    const memberId = seedMember();
    const clubId = seedClub('archived');
    const candidateId = insertClubBootstrapLeader(db, {
      club_id: clubId, legacy_member_id: `lm-cll-${_n}`, role: 'leader', status: 'provisional',
    });

    const result = onboardingSvc.submitClubAffiliationsResponse(memberId, {
      candidateId, userDecision: 'confirm', activitySignal: 'active',
    });
    expect(result.branch).toBe('promoted_co_leader');
    expect(clubStatus(clubId)).toBe('active');
    expect(JSON.parse(revivalAudits(clubId)[0].metadata_json).prior_status).toBe('archived');
  });

  it('claiming an active club writes no revival audit', () => {
    const memberId = seedMember();
    const clubId = seedClub('active');
    const candidateId = insertClubBootstrapLeader(db, {
      club_id: clubId, legacy_member_id: `lm-cll-${_n}`, role: 'leader', status: 'provisional',
    });

    onboardingSvc.submitClubAffiliationsResponse(memberId, { candidateId, userDecision: 'confirm', activitySignal: 'active' });
    expect(clubStatus(clubId)).toBe('active');
    expect(revivalAudits(clubId)).toHaveLength(0);
  });

  it('declining a claim revives nothing', () => {
    const memberId = seedMember();
    const clubId = seedClub('inactive');
    const candidateId = insertClubBootstrapLeader(db, {
      club_id: clubId, legacy_member_id: `lm-cll-${_n}`, role: 'leader', status: 'provisional',
    });

    onboardingSvc.submitClubAffiliationsResponse(memberId, { candidateId, userDecision: 'decline', activitySignal: 'not_active' });
    expect(clubStatus(clubId)).toBe('inactive');
    expect(revivalAudits(clubId)).toHaveLength(0);
  });
});

describe('revival on affiliation (self-service join)', () => {
  it('joining an inactive club returns it to active with a revival audit row', () => {
    const memberId = seedMember();
    const clubId = seedClub('inactive');

    const result = clubSvc.joinClub(memberId, clubId);
    expect(result.branch).toBe('joined_primary');
    expect(clubStatus(clubId)).toBe('active');
    const audits = revivalAudits(clubId);
    expect(audits).toHaveLength(1);
    expect(audits[0].action_type).toBe('club.revived_by_affiliation');
  });

  it('an archived club is not joinable and stays archived', () => {
    const memberId = seedMember();
    const clubId = seedClub('archived');

    const result = clubSvc.joinClub(memberId, clubId);
    expect(result.branch).toBe('club_not_found');
    expect(clubStatus(clubId)).toBe('archived');
    expect(revivalAudits(clubId)).toHaveLength(0);
  });

  it('joining an active club writes no revival audit', () => {
    const memberId = seedMember();
    const clubId = seedClub('active');

    const result = clubSvc.joinClub(memberId, clubId);
    expect(result.branch).toBe('joined_primary');
    expect(revivalAudits(clubId)).toHaveLength(0);
  });
});

describe('join/leave notification emails', () => {
  function seedLeader(clubId: string): string {
    _n += 1;
    const leaderId = `cll-leader-${_n}`;
    insertMember(db, { id: leaderId, slug: `cll_leader_${_n}`, login_email: `${leaderId}@example.com` });
    db.prepare(`
      INSERT INTO club_leaders (id, created_at, created_by, updated_at, updated_by, club_id, member_id, role, added_at)
      VALUES (?, '2026-01-01T00:00:00.000Z', 'test', '2026-01-01T00:00:00.000Z', 'test', ?, ?, 'co-leader', '2026-01-01T00:00:00.000Z')
    `).run(`cll-cl-${_n}`, clubId, leaderId);
    return leaderId;
  }

  function outboxFor(recipientMemberId: string): Array<{ subject: string; idempotency_key: string }> {
    return db.prepare(`
      SELECT subject, idempotency_key FROM outbox_emails
      WHERE recipient_member_id = ? ORDER BY rowid
    `).all(recipientMemberId) as Array<{ subject: string; idempotency_key: string }>;
  }

  it('joining enqueues a notification to the member and every current club leader', () => {
    const clubId = seedClub('active');
    const leaderId = seedLeader(clubId);
    const memberId = seedMember();

    const result = clubSvc.joinClub(memberId, clubId);
    expect(result.branch).toBe('joined_primary');

    const memberMail = outboxFor(memberId);
    expect(memberMail).toHaveLength(1);
    expect(memberMail[0].subject).toContain('You joined');
    expect(memberMail[0].idempotency_key).toBe(`club-join:${result.affiliationId}:v1:member`);

    const leaderMail = outboxFor(leaderId);
    expect(leaderMail).toHaveLength(1);
    expect(leaderMail[0].subject).toContain('joined');
    expect(leaderMail[0].idempotency_key).toBe(`club-join:${result.affiliationId}:v1:leader:${leaderId}`);
  });

  it('leaving enqueues a notification to the leaving member and the current leaders, and a later re-join produces fresh notifications', () => {
    const clubId = seedClub('active');
    const leaderId = seedLeader(clubId);
    const memberId = seedMember();

    const joined = clubSvc.joinClub(memberId, clubId);
    const left = clubSvc.leaveClub(memberId, clubId, { confirmed: true });
    expect(left.branch).toBe('left');

    const memberMail = outboxFor(memberId);
    expect(memberMail).toHaveLength(2);
    expect(memberMail[1].subject).toContain('You left');
    expect(outboxFor(leaderId)).toHaveLength(2);

    // Re-join: the affiliation table holds one row per member-club pair for
    // life, so rejoining reactivates the SAME row; the bumped row version in
    // the idempotency key is what keeps the new notifications from being
    // swallowed as duplicates of the first join's.
    const rejoined = clubSvc.joinClub(memberId, clubId);
    expect(rejoined.branch).toBe('joined_primary');
    expect(rejoined.affiliationId).toBe(joined.affiliationId);
    expect(outboxFor(memberId)).toHaveLength(3);
    expect(outboxFor(leaderId)).toHaveLength(3);
  });

  it('rejoining after a leave reactivates the affiliation (never the misleading two-club cap message)', () => {
    const clubId = seedClub('active');
    const memberId = seedMember();

    const joined = clubSvc.joinClub(memberId, clubId);
    expect(joined.branch).toBe('joined_primary');
    expect(clubSvc.leaveClub(memberId, clubId, { confirmed: true }).branch).toBe('left');

    const rejoined = clubSvc.joinClub(memberId, clubId);
    expect(rejoined.branch).toBe('joined_primary');
    expect(rejoined.affiliationId).toBe(joined.affiliationId);

    const row = db.prepare(
      'SELECT is_current, is_primary, source FROM member_club_affiliations WHERE id = ?',
    ).get(joined.affiliationId) as { is_current: number; is_primary: number; source: string };
    expect(row.is_current).toBe(1);
    expect(row.is_primary).toBe(1);
    expect(row.source).toBe('member_self_service');
  });

  it('a failed join (cap reached) enqueues nothing', () => {
    const clubA = seedClub('active');
    const clubB = seedClub('active');
    const clubC = seedClub('active');
    const memberId = seedMember();
    clubSvc.joinClub(memberId, clubA);
    clubSvc.joinClub(memberId, clubB);
    const before = outboxFor(memberId).length;
    const result = clubSvc.joinClub(memberId, clubC);
    expect(result.branch).toBe('cap_reached');
    expect(outboxFor(memberId)).toHaveLength(before);
  });
});

describe('leader contact is member-visible by role', () => {
  let clubKey: string;
  let leaderEmail: string;
  let optedOutKey: string;

  beforeAll(() => {
    _n += 1;
    const leaderId = `cll-leader-${_n}`;
    leaderEmail = `${leaderId}@example.com`;
    insertMember(db, {
      id: leaderId, slug: `cll_leader_${_n}`, display_name: 'Visible Leader',
      login_email: leaderEmail, whatsapp: '+64 21 555 0134', whatsapp_visible: 1,
    });
    clubKey = `club_visibility_${_n}`;
    const tagId = insertTag(db, { standard_type: 'club', tag_normalized: `#${clubKey}` });
    const clubId = insertClub(db, { id: `cll-vis-${_n}`, name: 'Visibility Club', hashtag_tag_id: tagId });
    db.prepare(`
      INSERT INTO club_leaders (id, created_at, created_by, updated_at, updated_by, club_id, member_id, role, added_at)
      VALUES (?, '2026-01-01T00:00:00.000Z', 'test', '2026-01-01T00:00:00.000Z', 'test', ?, ?, 'co-leader', '2026-01-01T00:00:00.000Z')
    `).run(`cll-cl-${_n}`, clubId, leaderId);
    insertClubBootstrapLeader(db, {
      club_id: clubId, legacy_member_id: `lm-vis-${_n}`, role: 'co-leader', status: 'provisional',
    });

    // A second club whose co-leader has a number on file but has not opted in.
    _n += 1;
    const optedOutId = `cll-leader-${_n}`;
    insertMember(db, {
      id: optedOutId, slug: `cll_leader_${_n}`, display_name: 'Private Leader',
      login_email: `${optedOutId}@example.com`, whatsapp: '+64 21 555 0999', whatsapp_visible: 0,
    });
    optedOutKey = `club_visibility_${_n}`;
    const optedOutTag = insertTag(db, { standard_type: 'club', tag_normalized: `#${optedOutKey}` });
    const optedOutClub = insertClub(db, { id: `cll-vis-${_n}`, name: 'Private Club', hashtag_tag_id: optedOutTag });
    insertClubLeader(db, { club_id: optedOutClub, member_id: optedOutId });
  });

  it('authenticated viewers see the co-leader email', async () => {
    const viewerId = seedMember();
    const res = await request(createApp())
      .get(`/clubs/${clubKey}`)
      .set('Cookie', cookieFor(viewerId));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Visible Leader');
    expect(res.text).toContain(`mailto:${leaderEmail}`);
  });

  it('the anonymous public sees no leader names and no contact', async () => {
    const res = await request(createApp()).get(`/clubs/${clubKey}`);
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Visible Leader');
    expect(res.text).not.toContain(leaderEmail);
  });

  // WhatsApp carries the same member-visible-by-role gate as the email, plus
  // the co-leader's own opt-in on top of it.
  it('authenticated viewers see an opted-in co-leader\'s WhatsApp', async () => {
    const viewerId = seedMember();
    const res = await request(createApp())
      .get(`/clubs/${clubKey}`)
      .set('Cookie', cookieFor(viewerId));
    expect(res.status).toBe(200);
    expect(res.text).toContain('https://wa.me/64215550134');
  });

  it('the anonymous public sees no WhatsApp at all', async () => {
    const res = await request(createApp()).get(`/clubs/${clubKey}`);
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('wa.me');
    expect(res.text).not.toContain('555 0134');
  });

  it('a co-leader who has not opted in exposes no number to anyone', async () => {
    const viewerId = seedMember();
    const res = await request(createApp())
      .get(`/clubs/${optedOutKey}`)
      .set('Cookie', cookieFor(viewerId));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Private Leader');
    expect(res.text).not.toContain('wa.me');
    expect(res.text).not.toContain('555 0999');
  });

  it('provisional entries never expose contact, even to authenticated viewers', async () => {
    const viewerId = seedMember();
    const res = await request(createApp())
      .get(`/clubs/${clubKey}`)
      .set('Cookie', cookieFor(viewerId));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Provisional leader');
    // The only mailto link on the page belongs to the live co-leader, never to
    // a provisional entry.
    const mailtos = res.text.match(/mailto:[^"]+/g) ?? [];
    expect(mailtos.every((m) => m.includes(leaderEmail))).toBe(true);
  });
});

describe('the could-use-a-co-leader queue lists only leaderless active clubs', () => {
  it('a club with a co-leader is reachable and absent; a leaderless one is listed', () => {
    const ledClubId = seedClub('active');
    const leaderId = seedMember();
    db.prepare(`
      INSERT INTO club_leaders (id, created_at, created_by, updated_at, updated_by, club_id, member_id, role, added_at)
      VALUES (?, '2026-01-01T00:00:00.000Z', 'test', '2026-01-01T00:00:00.000Z', 'test', ?, ?, 'co-leader', '2026-01-01T00:00:00.000Z')
    `).run(`cll-nc-${_n}`, ledClubId, leaderId);
    const leaderlessClubId = seedClub('active');

    const queue = leadershipSvc.getLeadershipQueuePage().content.needsLeader.map((c) => c.clubId);
    expect(queue).not.toContain(ledClubId);
    expect(queue).toContain(leaderlessClubId);
  });
});

describe('revival on admin leader assignment', () => {
  it('assigning a leader to an inactive club returns it to active with a revival audit row', () => {
    const adminId = seedMember();
    const memberId = seedMember();
    const clubId = seedClub('inactive');

    leadershipSvc.assignLeader(adminId, clubId, memberId, 'Staffing a dormant club');
    expect(clubStatus(clubId)).toBe('active');
    const audits = revivalAudits(clubId);
    expect(audits).toHaveLength(1);
    const meta = JSON.parse(audits[0].metadata_json);
    expect(meta.prior_status).toBe('inactive');
    expect(meta.path).toBe('admin_assign');
  });

  it('assigning to an already-active club writes no revival audit', () => {
    const adminId = seedMember();
    const memberId = seedMember();
    const clubId = seedClub('active');

    leadershipSvc.assignLeader(adminId, clubId, memberId, 'Routine assignment');
    expect(revivalAudits(clubId)).toHaveLength(0);
  });
});

// A member holding any current club affiliation holds exactly one primary. Both
// admin paths write affiliations, so both have to keep that true; a member left
// holding one club marked secondary sees it on their own profile and has no
// control that repairs it, because the swap appears only with two clubs.
describe('admin leadership writes keep the one-primary rule', () => {
  function affiliations(memberId: string): Array<{ club_id: string; is_current: number; is_primary: number }> {
    return db.prepare(
      'SELECT club_id, is_current, is_primary FROM member_club_affiliations WHERE member_id = ? ORDER BY club_id',
    ).all(memberId) as Array<{ club_id: string; is_current: number; is_primary: number }>;
  }

  it('a member with no club assigned as co-leader holds that club as primary', () => {
    const adminId = seedMember();
    const memberId = seedMember();
    const clubId = seedClub('active');

    leadershipSvc.assignLeader(adminId, clubId, memberId, 'Staffing a leaderless club');

    const rows = affiliations(memberId);
    expect(rows).toHaveLength(1);
    expect(rows[0].club_id).toBe(clubId);
    expect(rows[0].is_current).toBe(1);
    expect(rows[0].is_primary).toBe(1);
  });

  it('a member who already has a primary club takes the assigned club as secondary', () => {
    const adminId = seedMember();
    const memberId = seedMember();
    const firstClub = seedClub('active');
    const secondClub = seedClub('active');
    insertMemberClubAffiliation(db, memberId, firstClub, { is_current: 1, is_primary: 1 });

    leadershipSvc.assignLeader(adminId, secondClub, memberId, 'Second club co-leadership');

    const rows = affiliations(memberId);
    expect(rows.filter((r) => r.is_current === 1)).toHaveLength(2);
    expect(rows.find((r) => r.club_id === firstClub)?.is_primary).toBe(1);
    expect(rows.find((r) => r.club_id === secondClub)?.is_primary).toBe(0);
  });

  it('reactivating a lapsed affiliation restores it as primary when it is the member\'s only club', () => {
    const adminId = seedMember();
    const memberId = seedMember();
    const clubId = seedClub('active');
    insertMemberClubAffiliation(db, memberId, clubId, { is_current: 0, is_primary: 0 });

    leadershipSvc.assignLeader(adminId, clubId, memberId, 'Bringing a former member back to lead');

    const rows = affiliations(memberId);
    expect(rows).toHaveLength(1);
    expect(rows[0].is_current).toBe(1);
    expect(rows[0].is_primary).toBe(1);
  });

  it('removing an affiliation promotes the surviving club to primary', () => {
    const adminId = seedMember();
    const memberId = seedMember();
    const ledClub = seedClub('active');
    const otherClub = seedClub('active');
    insertMemberClubAffiliation(db, memberId, ledClub, { is_current: 1, is_primary: 1 });
    insertMemberClubAffiliation(db, memberId, otherClub, { is_current: 1, is_primary: 0 });
    insertClubLeader(db, { club_id: ledClub, member_id: memberId });

    leadershipSvc.demoteLeader(adminId, ledClub, memberId, 'remove_affiliation', 'Left the area');

    const rows = affiliations(memberId);
    expect(rows.find((r) => r.club_id === ledClub)?.is_current).toBe(0);
    expect(rows.find((r) => r.club_id === ledClub)?.is_primary).toBe(0);
    const survivor = rows.find((r) => r.club_id === otherClub);
    expect(survivor?.is_current).toBe(1);
    expect(survivor?.is_primary).toBe(1);
  });

  it('removing an affiliation when no club survives promotes nothing', () => {
    const adminId = seedMember();
    const memberId = seedMember();
    const ledClub = seedClub('active');
    insertMemberClubAffiliation(db, memberId, ledClub, { is_current: 1, is_primary: 1 });
    insertClubLeader(db, { club_id: ledClub, member_id: memberId });

    leadershipSvc.demoteLeader(adminId, ledClub, memberId, 'remove_affiliation', 'Left the sport');

    const rows = affiliations(memberId);
    expect(rows.every((r) => r.is_current === 0)).toBe(true);
    expect(rows.every((r) => r.is_primary === 0)).toBe(true);
  });

  it('demoting to ordinary member leaves the affiliation and its primary flag alone', () => {
    const adminId = seedMember();
    const memberId = seedMember();
    const ledClub = seedClub('active');
    insertMemberClubAffiliation(db, memberId, ledClub, { is_current: 1, is_primary: 1 });
    insertClubLeader(db, { club_id: ledClub, member_id: memberId });

    leadershipSvc.demoteLeader(adminId, ledClub, memberId, 'to_member', 'Stepping back from leading');

    const rows = affiliations(memberId);
    expect(rows).toHaveLength(1);
    expect(rows[0].is_current).toBe(1);
    expect(rows[0].is_primary).toBe(1);
  });
});

