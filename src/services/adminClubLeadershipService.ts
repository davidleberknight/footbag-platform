/**
 * AdminClubLeadershipService -- admin remediation of club leadership rosters.
 *
 * Owns: the single "could use a leader" remediation queue (clubs with no
 * co-leaders, computed fresh on open, never by a background process), admin
 * assignment of a co-leader from the member base (creating or reactivating the
 * affiliation when absent), removal of a co-leader back to ordinary member or
 * full affiliation removal (mandatory reason), and the five-co-leader cap with
 * an explicit cap-override reason. Resolving leadership for a bootstrapped club
 * supersedes its remaining provisional club_bootstrap_leaders rows. Assigning a
 * co-leader to an inactive or archived club revives it to 'active' in the same
 * transaction (staffing a club makes it a live club).
 *
 * Does not own: member-facing leadership flows (ClubService,
 * MemberOnboardingService path 1 / path 2) or club viability cleanup
 * (ClubCleanupService).
 *
 * Non-negotiable invariants:
 *   - Schema invariants stand: a member co-leads at most one club
 *     (ux_one_club_leader_per_member); a member appears at most once per club
 *     (ux_club_leaders). Assigning a member who already co-leads another club
 *     is refused with direction (remove them there first).
 *   - Every action writes one audit row with actor_type='admin',
 *     before/after values, and reason text. The audit trail is the
 *     canonical history.
 *
 * Transaction discipline: every multi-row mutation (assign + affiliation +
 * supersede) is one transaction(() => ...).
 *
 * Persistence: clubs, club_leaders, member_club_affiliations,
 * club_bootstrap_leaders, audit_entries.
 *
 * Side effects: audit_entries append only.
 *
 * Service shape: singleton object.
 */
import { randomUUID } from 'crypto';
import { clubLeaders, clubs as clubsDb, transaction } from '../db/db';
import { appendAuditEntry } from './auditService';
import { NotFoundError, ValidationError } from './serviceErrors';
import { PageViewModel } from '../types/page';

const LEADERSHIP_CAP = 5;

interface QueueClubRow {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
}

export interface LeadershipQueueContent {
  needsLeader: Array<{ clubId: string; name: string; location: string; manageHref: string }>;
  notice: string | null;
  errorMessage: string | null;
}

export interface ClubLeadershipContent {
  clubId: string;
  clubKey: string;
  name: string;
  needsLeader: boolean;
  leaders: Array<{ memberId: string; displayName: string; slug: string; role: string; roleLabel: string }>;
  affiliatedMembers: Array<{ memberId: string; displayName: string; slug: string }>;
  leadershipCount: number;
  capReached: boolean;
  notice: string | null;
  errorMessage: string | null;
}

function locationOf(r: QueueClubRow): string {
  return [r.city, r.country].filter(Boolean).join(', ') || 'Unknown location';
}

function getLeadershipQueuePage(opts: { notice?: string; errorMessage?: string } = {}): PageViewModel<LeadershipQueueContent> {
  const needsLeader = (clubLeaders.listClubsNeedingLeader.all() as QueueClubRow[]).map((r) => ({
    clubId: r.id, name: r.name, location: locationOf(r), manageHref: `/admin/clubs/${r.id}/leadership`,
  }));
  return {
    seo:  { title: 'Club leadership remediation' },
    page: { sectionKey: '', pageKey: 'admin_club_leadership_queue', title: 'Club leadership remediation' },
    content: {
      needsLeader,
      notice: opts.notice ?? null,
      errorMessage: opts.errorMessage ?? null,
    },
  };
}

function loadClub(clubId: string): { id: string; name: string; status: string } {
  const row = clubLeaders.findClubForAdminLeadership.get(clubId) as
    | { id: string; name: string; status: string }
    | undefined;
  if (!row) throw new NotFoundError('Club not found.');
  return row;
}

function getClubLeadershipPage(
  clubId: string,
  opts: { notice?: string; errorMessage?: string } = {},
): PageViewModel<{ club: ClubLeadershipContent }> {
  const club = loadClub(clubId);
  const leaders = (clubLeaders.listLeadersWithNames.all(clubId) as Array<{
    member_id: string; role: string; display_name: string; slug: string;
  }>).map((l) => ({
    memberId: l.member_id,
    displayName: l.display_name,
    slug: l.slug,
    role: l.role,
    roleLabel: 'Co-leader',
  }));
  const affiliated = (clubLeaders.listAffiliatedMembersForAdmin.all(clubId) as Array<{
    member_id: string; display_name: string; slug: string; is_leader: number;
  }>)
    .filter((m) => !m.is_leader)
    .map((m) => ({ memberId: m.member_id, displayName: m.display_name, slug: m.slug }));
  return {
    seo:  { title: `Leadership: ${club.name}` },
    page: { sectionKey: '', pageKey: 'admin_club_leadership', title: `Leadership: ${club.name}` },
    content: {
      club: {
        clubId: club.id,
        clubKey: club.id,
        name: club.name,
        needsLeader: leaders.length === 0,
        leaders,
        affiliatedMembers: affiliated,
        leadershipCount: leaders.length,
        capReached: leaders.length >= LEADERSHIP_CAP,
        notice: opts.notice ?? null,
        errorMessage: opts.errorMessage ?? null,
      },
    },
  };
}

function requireReason(reason: string): string {
  const trimmed = reason.trim();
  if (!trimmed) throw new ValidationError('A reason is required.');
  return trimmed;
}

// Every leadership write here is an admin action: the routes that call into
// this service sit behind requireAdmin, so the actor is always the
// authenticated admin and the audit row records actor_type 'admin'.
function audit(
  adminMemberId: string,
  actionType: string,
  clubId: string,
  reason: string | null,
  metadata: Record<string, unknown>,
): void {
  appendAuditEntry({
    actionType,
    category:      'club',
    actorType:     'admin',
    actorMemberId: adminMemberId,
    entityType:    'club',
    entityId:      clubId,
    reasonText:    reason,
    metadata,
  });
}

/**
 * Assign a member from the member base as a co-leader. Creates or reactivates
 * the affiliation when absent. A member co-leads at most one club, so a member
 * who already co-leads another club is refused with direction (remove them
 * there first). Exceeding the five-co-leader cap requires an explicit
 * cap-override reason.
 */
function assignLeader(
  adminMemberId: string,
  clubId: string,
  memberKey: string,
  reason: string,
  capOverrideReason?: string,
): void {
  const trimmedReason = requireReason(reason);
  const club = loadClub(clubId);
  const member = clubLeaders.findMemberByKeyForAdmin.get(memberKey.trim(), memberKey.trim()) as
    | { id: string; display_name: string; slug: string }
    | undefined;
  if (!member) throw new NotFoundError('No active member with that id or slug.');

  const existingRow = clubLeaders.findLeaderRow.get(clubId, member.id) as
    | { id: string; role: string }
    | undefined;
  if (existingRow) {
    throw new ValidationError('That member already co-leads this club.');
  }

  // A member co-leads at most one club; the existingRow check above already
  // cleared this club, so any co-leadership is elsewhere.
  const coLeadsElsewhere = clubLeaders.memberCoLeadsAnyClub.get(member.id) as { x: number } | undefined;
  if (coLeadsElsewhere) {
    throw new ValidationError(
      'That member already co-leads another club. A member co-leads at most one club; remove them there before adding them here.',
    );
  }

  const count = (clubLeaders.countByClubId.get(clubId) as { c: number }).c;
  const capOverride = (capOverrideReason ?? '').trim();
  if (count >= LEADERSHIP_CAP && !capOverride) {
    throw new ValidationError(
      `This club already has ${count} co-leaders (cap ${LEADERSHIP_CAP}). Provide a cap-override reason to proceed.`,
    );
  }

  const now = new Date().toISOString();
  transaction(() => {
    clubLeaders.insertClubLeader.run(
      `cl_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
      now, adminMemberId, now, adminMemberId,
      clubId, member.id, 'co-leader', now,
    );

    // Ensure the assigned co-leader is on the roster.
    const aff = clubLeaders.findCurrentAffiliation.get(member.id, clubId) as
      | { id: string; is_current: number }
      | undefined;
    if (!aff) {
      clubLeaders.insertAdminAffiliation.run(
        `mca_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
        now, adminMemberId, now, adminMemberId,
        member.id, clubId,
      );
    } else if (!aff.is_current) {
      clubLeaders.reactivateAffiliation.run(now, adminMemberId, aff.id);
    }

    clubLeaders.supersedeProvisionalForClub.run(now, adminMemberId, clubId);

    // Revival: staffing a club makes it a live club; an inactive or archived
    // club returns to 'active' in the same transaction so the new co-leader's
    // club is visible in listings.
    if (club.status !== 'active') {
      clubsDb.updateStatus.run('active', now, adminMemberId, clubId);
      audit(adminMemberId, 'club.revived_by_leadership_claim', clubId, trimmedReason, {
        prior_status: club.status,
        path:         'admin_assign',
      });
    }

    audit(adminMemberId, 'club.admin_leader_assigned', clubId, trimmedReason, {
      member_id:               member.id,
      role:                    'co-leader',
      cap_override_reason:     capOverride || null,
      leadership_count_before: count,
    });
  });
}

/** Remove a co-leader row back to ordinary member, or remove the member's
 * affiliation entirely. Reason is mandatory. */
function demoteLeader(
  adminMemberId: string,
  clubId: string,
  memberId: string,
  mode: 'to_member' | 'remove_affiliation',
  reason: string,
): void {
  const trimmedReason = requireReason(reason);
  loadClub(clubId);
  const row = clubLeaders.findLeaderRow.get(clubId, memberId) as { id: string; role: string } | undefined;
  if (!row) throw new NotFoundError('That member holds no leadership row at this club.');

  const now = new Date().toISOString();
  transaction(() => {
    clubLeaders.deleteLeaderRow.run(clubId, memberId);
    if (mode === 'remove_affiliation') {
      clubLeaders.endAffiliation.run(now, adminMemberId, memberId, clubId);
    }
    audit(adminMemberId, 'club.admin_leader_demoted', clubId, trimmedReason, {
      member_id:     memberId,
      previous_role: row.role,
      mode,
    });
  });
}

export const adminClubLeadershipService = {
  getLeadershipQueuePage,
  getClubLeadershipPage,
  assignLeader,
  demoteLeader,
};
