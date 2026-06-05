/**
 * Club leadership lifecycle contract: a willing leader makes it a live club.
 *
 *   - A successful leadership claim returns a club of any status (inactive
 *     or archived) to 'active', audit-logged as a revival; claiming an
 *     already-active club writes no revival audit.
 *   - A new current affiliation (self-service join) revives an inactive
 *     club; archived clubs are not joinable and revive only via a claim.
 *   - Leader contact is member-visible by role: the club page shows current
 *     leaders' emails and the club's contact email and WhatsApp to
 *     authenticated viewers only; provisional (unclaimed) entries never
 *     expose contact to anyone.
 *   - The admin Needs Contact queue lists only leaderless clubs without a
 *     club contact email: a led club is reachable through its leaders.
 *   - Leadership rows written by the wizard's step-up offer carry the
 *     onboarding-service provenance stamp, matching the claim path.
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
  return `footbag_session=${createTestSessionJwt({ memberId })}`;
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
      candidateId, userDecision: 'confirm',
    });
    expect(result.branch).toBe('promoted_leader');
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
      candidateId, userDecision: 'confirm',
    });
    expect(result.branch).toBe('promoted_leader');
    expect(clubStatus(clubId)).toBe('active');
    expect(JSON.parse(revivalAudits(clubId)[0].metadata_json).prior_status).toBe('archived');
  });

  it('claiming an active club writes no revival audit', () => {
    const memberId = seedMember();
    const clubId = seedClub('active');
    const candidateId = insertClubBootstrapLeader(db, {
      club_id: clubId, legacy_member_id: `lm-cll-${_n}`, role: 'leader', status: 'provisional',
    });

    onboardingSvc.submitClubAffiliationsResponse(memberId, { candidateId, userDecision: 'confirm' });
    expect(clubStatus(clubId)).toBe('active');
    expect(revivalAudits(clubId)).toHaveLength(0);
  });

  it('declining a claim revives nothing', () => {
    const memberId = seedMember();
    const clubId = seedClub('inactive');
    const candidateId = insertClubBootstrapLeader(db, {
      club_id: clubId, legacy_member_id: `lm-cll-${_n}`, role: 'leader', status: 'provisional',
    });

    onboardingSvc.submitClubAffiliationsResponse(memberId, { candidateId, userDecision: 'decline' });
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

describe('leader contact is member-visible by role', () => {
  let clubKey: string;
  let leaderEmail: string;

  beforeAll(() => {
    _n += 1;
    const leaderId = `cll-leader-${_n}`;
    leaderEmail = `${leaderId}@example.com`;
    insertMember(db, { id: leaderId, slug: `cll_leader_${_n}`, display_name: 'Visible Leader', login_email: leaderEmail });
    clubKey = `club_visibility_${_n}`;
    const tagId = insertTag(db, { standard_type: 'club', tag_normalized: `#${clubKey}` });
    const clubId = insertClub(db, { id: `cll-vis-${_n}`, name: 'Visibility Club', hashtag_tag_id: tagId });
    db.prepare(`UPDATE clubs SET contact_email = 'club@example.com', whatsapp = '+1 555 000 1111' WHERE id = ?`).run(clubId);
    db.prepare(`
      INSERT INTO club_leaders (id, created_at, created_by, updated_at, updated_by, club_id, member_id, role, added_at)
      VALUES (?, '2026-01-01T00:00:00.000Z', 'test', '2026-01-01T00:00:00.000Z', 'test', ?, ?, 'leader', '2026-01-01T00:00:00.000Z')
    `).run(`cll-cl-${_n}`, clubId, leaderId);
    insertClubBootstrapLeader(db, {
      club_id: clubId, legacy_member_id: `lm-vis-${_n}`, role: 'co-leader', status: 'provisional',
    });
  });

  it('authenticated viewers see the leader email and the club contact channels', async () => {
    const viewerId = seedMember();
    const res = await request(createApp())
      .get(`/clubs/${clubKey}`)
      .set('Cookie', cookieFor(viewerId));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Visible Leader');
    expect(res.text).toContain(`mailto:${leaderEmail}`);
    expect(res.text).toContain('club@example.com');
    expect(res.text).toContain('+1 555 000 1111');
  });

  it('the anonymous public sees no leader names and no contact channels', async () => {
    const res = await request(createApp()).get(`/clubs/${clubKey}`);
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Visible Leader');
    expect(res.text).not.toContain(leaderEmail);
    expect(res.text).not.toContain('club@example.com');
    expect(res.text).not.toContain('+1 555 000 1111');
  });

  it('provisional entries never expose contact, even to authenticated viewers', async () => {
    const viewerId = seedMember();
    const res = await request(createApp())
      .get(`/clubs/${clubKey}`)
      .set('Cookie', cookieFor(viewerId));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Provisional leader');
    // The only mailto links on the page belong to the live leader and the
    // club contact, never to a provisional entry.
    const mailtos = res.text.match(/mailto:[^"]+/g) ?? [];
    expect(mailtos.every((m) => m.includes(leaderEmail) || m.includes('club@example.com'))).toBe(true);
  });
});

describe('Needs Contact queue lists only leaderless clubs without a club email', () => {
  it('a led club with no club email is reachable and absent; a leaderless one is listed', () => {
    const ledClubId = seedClub('active');
    const leaderId = seedMember();
    db.prepare(`
      INSERT INTO club_leaders (id, created_at, created_by, updated_at, updated_by, club_id, member_id, role, added_at)
      VALUES (?, '2026-01-01T00:00:00.000Z', 'test', '2026-01-01T00:00:00.000Z', 'test', ?, ?, 'leader', '2026-01-01T00:00:00.000Z')
    `).run(`cll-nc-${_n}`, ledClubId, leaderId);
    const leaderlessClubId = seedClub('active');

    const queue = leadershipSvc.getLeadershipQueuePage().content.needsContact.map((c) => c.clubId);
    expect(queue).not.toContain(ledClubId);
    expect(queue).toContain(leaderlessClubId);
  });
});

describe('revival on admin leader assignment', () => {
  it('assigning a leader to an inactive club returns it to active with a revival audit row', () => {
    const adminId = seedMember();
    const memberId = seedMember();
    const clubId = seedClub('inactive');

    leadershipSvc.assignLeader(adminId, clubId, memberId, 'leader', 'Staffing a dormant club');
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

    leadershipSvc.assignLeader(adminId, clubId, memberId, 'leader', 'Routine assignment');
    expect(revivalAudits(clubId)).toHaveLength(0);
  });
});

describe('wizard step-up offer provenance', () => {
  it('the accepted co-leader row is stamped by the onboarding service, matching the claim path', async () => {
    _n += 1;
    const memberId = `cll-p2-${_n}`;
    insertMember(db, { id: memberId, slug: `cll_p2_${_n}`, login_email: `${memberId}@example.com` });
    const clubId = seedClub('inactive');
    db.prepare(`
      INSERT INTO member_club_affiliations
        (id, created_at, created_by, updated_at, updated_by, member_id, club_id, is_current, is_primary, source)
      VALUES (?, '2026-01-01T00:00:00.000Z', 'test', '2026-01-01T00:00:00.000Z', 'test', ?, ?, 1, 1, 'legacy_claim')
    `).run(`cll-aff-${_n}`, memberId, clubId);
    db.prepare(`
      INSERT INTO member_tier_grants
        (id, created_at, created_by, member_id, actor_member_id, change_type,
         old_tier_status, new_tier_status, old_underlying_tier_status, new_underlying_tier_status, reason_code)
      VALUES (?, '2026-01-01T00:00:00.000Z', 'test', ?, NULL, 'grant',
              'tier0', 'tier1', NULL, NULL, 'legacy.claim_tier_grant')
    `).run(`cll-tier-${_n}`, memberId);

    const res = await request(createApp())
      .post('/register/wizard/club_affiliations/leadership-offer')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ clubId, decision: 'accept' });
    expect(res.status).toBe(303);

    const row = db.prepare('SELECT created_by, updated_by, role FROM club_leaders WHERE club_id = ? AND member_id = ?')
      .get(clubId, memberId) as { created_by: string; updated_by: string; role: string };
    expect(row.role).toBe('co-leader');
    expect(row.created_by).toBe('onboarding_service');
    expect(row.updated_by).toBe('onboarding_service');

    // Stepping up revives the inactive club in the same transaction.
    expect(clubStatus(clubId)).toBe('active');
    expect(revivalAudits(clubId).map((a) => a.action_type)).toContain('club.revived_by_leadership_claim');
  });
});
