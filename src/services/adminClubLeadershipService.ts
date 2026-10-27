/**
 * AdminClubLeadershipService -- admin remediation of club leadership rosters.
 *
 * Owns: the per-club leadership page, admin assignment of a co-leader from the
 * member base (creating or reactivating the affiliation when absent), removal
 * of a co-leader back to ordinary member or full affiliation removal
 * (mandatory reason), and the five-co-leader cap, which is a hard limit with
 * no override. Resolving leadership for a bootstrapped club supersedes its
 * remaining provisional club_bootstrap_leaders rows. Assigning a co-leader to
 * an inactive club revives it to 'active' in the same transaction (staffing a
 * club makes it a live club); an archived club is final and refuses the
 * assignment.
 *
 * Does not own: member-facing leadership flows (ClubService,
 * MemberOnboardingService path 1 / path 2) or club viability cleanup
 * (ClubCleanupService), whose queue is the one list of clubs that could use a
 * leader.
 *
 * Non-negotiable invariants:
 *   - Schema invariants stand: a member co-leads at most one club
 *     (ux_one_club_leader_per_member); a member appears at most once per club
 *     (ux_club_leaders). Assigning a member who already co-leads another club
 *     is refused: a club is a local group, so a member leads the club they are
 *     local to and is a guest at any other. Changing which club a member
 *     co-leads is that member's own action, taken by stepping down first.
 *   - A member holds at most two current clubs, so assigning a member who
 *     already holds two others is refused.
 *   - A member holding any current club affiliation holds exactly one primary.
 *     An affiliation this service creates or reactivates is primary when the
 *     member held no other current club, and removing one promotes a lone
 *     survivor, so neither admin path can leave a member with a club but no
 *     primary club. A member left holding two picks the primary themselves.
 *   - Every action writes one audit row with actor_type='admin',
 *     before/after values, and reason text; an assignment that revives a club
 *     writes a second row recording the revival. The audit trail is the
 *     canonical history.
 *   - Assigning a member who already co-leads this club is a repeat and writes
 *     nothing: this admin's own standing assignment of them ends as the first
 *     submit did, and one someone else made ends informational. Assign and
 *     demote each return their ending and the sentence that reports it.
 *   - The reason is cleaned with the shared sanitizer before validation, so
 *     markup alone is no reason.
 *
 * Transaction discipline: every multi-row mutation (assign + affiliation +
 * supersede) is one transaction(() => ...).
 *
 * Persistence: clubs, club_leaders, member_club_affiliations,
 * club_bootstrap_leaders, members (read), audit_entries.
 *
 * Side effects: audit_entries append only.
 *
 * Service shape: singleton object.
 */
import { randomUUID } from 'crypto';
import { account, clubLeaders, clubs as clubsDb, memberClubAffiliations, transaction } from '../db/db';
import { appendAuditEntry, findStandingOwnAct } from './auditService';
import { NotFoundError, ValidationError } from './serviceErrors';
import { cleanUserText } from '../lib/textSanitizer';
import { PageViewModel } from '../types/page';
import type { OutcomeNoticeView } from '../lib/outcomeNotice';
import type { ActionEnding } from '../lib/actionOutcome';

const LEADERSHIP_CAP = 5;
const CURRENT_CLUB_CAP = 2;

export interface ClubLeadershipContent {
  clubId: string;
  clubKey: string;
  name: string;
  needsLeader: boolean;
  leaders: Array<{ memberId: string; displayName: string; slug: string; role: string; roleLabel: string }>;
  /** Members of this club who are not co-leaders, each with the id the assign
   *  form takes and the way through to their record. */
  affiliatedMembers: Array<{
    memberId: string; displayName: string; slug: string; recordHref: string;
  }>;
  leadershipCount: number;
  /** The result of the last assign or demote, carried across its redirect. */
  notice: OutcomeNoticeView | null;
  errorMessage: string | null;
}

/** How an assign or a demote ended, and the sentence that reports it. */
export interface LeadershipChangeOutcome {
  ending: Exclude<ActionEnding, 'refused'>;
  text: string;
}

const ASSIGNED_NOTICE = 'Co-leader added.';
const ALREADY_LEADS_NOTICE = 'That member already co-leads this club.';
const DEMOTED_TO_MEMBER_NOTICE = 'Leader stepped down to member.';
const REMOVED_FROM_CLUB_NOTICE = 'Leader removed from the club.';

function loadClub(clubId: string): { id: string; name: string; status: string } {
  const row = clubLeaders.findClubForAdminLeadership.get(clubId) as
    | { id: string; name: string; status: string }
    | undefined;
  if (!row) throw new NotFoundError('Club not found.');
  return row;
}

function getClubLeadershipPage(
  clubId: string,
  opts: { notice?: OutcomeNoticeView | null; errorMessage?: string } = {},
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
    .map((m) => ({
      memberId:    m.member_id,
      displayName: m.display_name,
      slug:        m.slug,
      recordHref:  `/admin/members/${m.member_id}`,
    }));
  // The list keeps every leadership row so an admin can remove one, but the
  // count is the one the five-leader limit reads: a leader who has died or
  // deleted their account no longer counts.
  const currentLeaderCount = (clubLeaders.countByClubId.get(clubId) as { c: number }).c;
  return {
    seo:  { title: `Leadership: ${club.name}` },
    page: {
      sectionKey: '', pageKey: 'admin_club_leadership', title: `Leadership: ${club.name}`,
      instructions: {
        what: 'Shows a club\'s co-leaders, and assigns or removes one.',
        how: 'Enter any member\'s id or profile address and a reason to assign them, or remove a co-leader with a reason.',
        headsUp: [
          'A club has at most five co-leaders, and a member co-leads at most one club.',
          'Assigning a co-leader to an inactive club makes it active again. An archived club accepts no assignment, and a member who already holds two clubs cannot be assigned.',
          'Assigning and removing both take a reason and are recorded in the audit log.',
          'Nobody is emailed.',
        ],
      },
    },
    content: {
      club: {
        clubId: club.id,
        clubKey: club.id,
        name: club.name,
        needsLeader: currentLeaderCount === 0,
        leaders,
        affiliatedMembers: affiliated,
        leadershipCount: currentLeaderCount,
        notice: opts.notice ?? null,
        errorMessage: opts.errorMessage ?? null,
      },
    },
  };
}

function requireReason(reason: string): string {
  // Cleaned first, so markup alone is no reason.
  const trimmed = cleanUserText(reason, 'single_line', 'reason');
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
 * there first). A club at five co-leaders refuses a sixth, a member who
 * already holds two other current clubs is refused a third, and an archived
 * club refuses any assignment.
 *
 * A member who already co-leads this club is a repeat, not an error: this
 * admin's own standing assignment of them reports the first submit's success,
 * and a row someone else made reports that nothing changed. Neither writes.
 */
function assignLeader(
  adminMemberId: string,
  clubId: string,
  memberKey: string,
  reason: string,
): LeadershipChangeOutcome {
  const trimmedReason = requireReason(reason);
  const club = loadClub(clubId);
  // Archiving is final: anyone wanting the club again creates a new one.
  if (club.status === 'archived') {
    throw new ValidationError('This club is archived, which is final, so it takes no new co-leader.');
  }
  const member = clubLeaders.findMemberByKeyForAdmin.get(memberKey.trim(), memberKey.trim()) as
    | { id: string; display_name: string; slug: string }
    | undefined;
  if (!member) throw new NotFoundError('No active member with that id or slug.');

  const existingRow = clubLeaders.findLeaderRow.get(clubId, member.id) as
    | { id: string; role: string }
    | undefined;
  if (existingRow) {
    const ownIsThisMember = findStandingOwnAct(
      adminMemberId, 'club.admin_leader_assigned', 'club.admin_leader_demoted', 'club', clubId,
      { metadataKey: 'member_id', id: member.id },
    ) !== null;
    return ownIsThisMember
      ? { ending: 'own_repeat', text: ASSIGNED_NOTICE }
      : { ending: 'already_held', text: ALREADY_LEADS_NOTICE };
  }

  const now = new Date().toISOString();
  // The limits are read inside the write's transaction, so the counts they
  // check are the ones the insert lands against.
  transaction(() => {
    // A member co-leads at most one club; the existingRow check above already
    // cleared this club, so any co-leadership is elsewhere.
    const coLeadsElsewhere = clubLeaders.memberCoLeadsAnyClub.get(member.id) as { x: number } | undefined;
    if (coLeadsElsewhere) {
      throw new ValidationError(
        'That member already co-leads another club. Clubs are local groups, so a member leads their own club and is a guest at any other. They step down at their club first if they want to lead this one.',
      );
    }

    const count = (clubLeaders.countByClubId.get(clubId) as { c: number }).c;
    if (count >= LEADERSHIP_CAP) {
      throw new ValidationError(
        `This club already has ${LEADERSHIP_CAP} co-leaders, the most a club can have.`,
      );
    }

    // Leading a club puts the member on its roster, so a member who is not
    // already a current member here and holds two other clubs would reach three.
    const aff = clubLeaders.findCurrentAffiliation.get(member.id, clubId) as
      | { id: string; is_current: number }
      | undefined;
    const currentCount = (memberClubAffiliations.countCurrentByMemberId.get(member.id) as { c: number }).c;
    if (!aff?.is_current && currentCount >= CURRENT_CLUB_CAP) {
      throw new ValidationError(
        'That member already belongs to two clubs, the most a member can hold. They leave one first if they want to lead this one.',
      );
    }

    clubLeaders.insertClubLeader.run(
      `cl_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
      now, adminMemberId, now, adminMemberId,
      clubId, member.id, 'co-leader', now,
    );

    // Ensure the assigned co-leader is on the roster. The primary flag is
    // computed the same way the member's own join computes it: a member with no
    // other current club must come out of this holding their one club as
    // primary, or their profile shows a secondary club and no primary and they
    // have no control that repairs it.
    const isPrimary = currentCount === 0 ? 1 : 0;
    if (!aff) {
      clubLeaders.insertAdminAffiliation.run(
        `mca_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
        now, adminMemberId, now, adminMemberId,
        member.id, clubId, isPrimary,
      );
    } else if (!aff.is_current) {
      clubLeaders.reactivateAffiliation.run(isPrimary, now, adminMemberId, aff.id);
    }

    clubLeaders.supersedeProvisionalForClub.run(now, adminMemberId, clubId);

    // Revival: staffing a club makes it a live club; an inactive club returns
    // to 'active' in the same transaction so the new co-leader's club is
    // visible in listings. An archived club never reaches here.
    if (club.status === 'inactive') {
      clubsDb.updateStatus.run('active', now, adminMemberId, clubId);
      audit(adminMemberId, 'club.revived_by_leadership_claim', clubId, trimmedReason, {
        prior_status: club.status,
        path:         'admin_assign',
      });
    }

    audit(adminMemberId, 'club.admin_leader_assigned', clubId, trimmedReason, {
      member_id:               member.id,
      role:                    'co-leader',
      leadership_count_before: count,
    });
  });
  return { ending: 'advance', text: ASSIGNED_NOTICE };
}

/** The two records a demotion is about, and what it will do, before it does it. */
export interface ClubDemoteConfirmContent {
  clubId: string;
  clubName: string;
  memberId: string;
  memberName: string;
  memberRecordHref: string;
  mode: 'to_member' | 'remove_affiliation';
  reason: string;
  summary: string;
  confirmAction: string;
  confirmLabel: string;
  cancelHref: string;
}

/**
 * What the demotion is about to do, read before anything is written.
 *
 * Removing an affiliation ends a member's membership of a club, which nothing
 * on the page said and no other admin write on a person does without showing it
 * first. Both modes preview, because they are one control with a mode select and
 * an asymmetry there would be its own trap.
 */
function previewDemote(
  clubId: string,
  memberId: string,
  mode: 'to_member' | 'remove_affiliation',
  reason: string,
): PageViewModel<ClubDemoteConfirmContent> {
  const trimmedReason = requireReason(reason);
  const club = loadClub(clubId);
  const row = clubLeaders.findLeaderRow.get(clubId, memberId) as { id: string; role: string } | undefined;
  if (!row) throw new NotFoundError('That member holds no leadership row at this club.');
  const member = account.findContactInfoById.get(memberId) as
    | { display_name: string }
    | undefined;
  const title = mode === 'remove_affiliation'
    ? 'Confirm: Remove Them From This Club'
    : 'Confirm: Demote to Ordinary Member';
  return {
    seo:  { title, noindex: true },
    page: {
      sectionKey: '', pageKey: 'admin_club_demote_confirm', title,
      instructions: { what: 'Review removing this co-leader before it is written.' },
    },
    content: {
      clubId:           club.id,
      clubName:         club.name,
      memberId,
      memberName:       member?.display_name ?? memberId,
      memberRecordHref: `/admin/members/${memberId}`,
      mode,
      reason:           trimmedReason,
      summary: mode === 'remove_affiliation'
        ? 'They stop being a co-leader and stop being a member of this club at all. '
          + 'If this was their primary club, another of their clubs becomes primary. '
          + 'They can join again themselves afterwards.'
        : 'They stop being a co-leader and stay a member of the club.',
      confirmAction: `/admin/clubs/${club.id}/leadership/demote/confirm`,
      confirmLabel: mode === 'remove_affiliation'
        ? 'Yes, Remove Them From the Club'
        : 'Yes, Demote Them',
      cancelHref: `/admin/clubs/${club.id}/leadership`,
    },
  };
}

/** Remove a co-leader row back to ordinary member, or remove the member's
 * affiliation entirely. Reason is mandatory. */
function demoteLeader(
  adminMemberId: string,
  clubId: string,
  memberId: string,
  mode: 'to_member' | 'remove_affiliation',
  reason: string,
): LeadershipChangeOutcome {
  const trimmedReason = requireReason(reason);
  loadClub(clubId);
  const row = clubLeaders.findLeaderRow.get(clubId, memberId) as { id: string; role: string } | undefined;
  if (!row) throw new NotFoundError('That member holds no leadership row at this club.');

  const now = new Date().toISOString();
  transaction(() => {
    clubLeaders.deleteLeaderRow.run(clubId, memberId);
    // A co-leader can hold the role with no current affiliation, which the
    // wizard's cap-hit branch deliberately produces, so the removal can match
    // no row. The audit records what happened rather than what was asked for:
    // an append-only ledger saying an affiliation was removed when none was is
    // a false entry, and it is the only record anyone reads afterwards.
    let affiliationEnded = false;
    if (mode === 'remove_affiliation') {
      affiliationEnded = clubLeaders.endAffiliation
        .run(now, adminMemberId, memberId, clubId).changes > 0;

      // Ending an affiliation clears its primary flag. A lone surviving club is
      // the member's only club, so it becomes primary, exactly as the member's
      // own leave does; a member left holding two picks which is primary
      // themselves, never automatically.
      const remaining = memberClubAffiliations.listCurrentWithClubName.all(memberId) as
        Array<{ club_id: string; is_primary: number }>;
      if (remaining.length === 1 && remaining[0].is_primary !== 1) {
        memberClubAffiliations.setPrimary.run(now, adminMemberId, memberId, remaining[0].club_id);
      }
    }
    audit(adminMemberId, 'club.admin_leader_demoted', clubId, trimmedReason, {
      member_id:     memberId,
      previous_role: row.role,
      mode,
      affiliation_ended: affiliationEnded,
    });
  });
  return {
    ending: 'advance',
    text: mode === 'remove_affiliation' ? REMOVED_FROM_CLUB_NOTICE : DEMOTED_TO_MEMBER_NOTICE,
  };
}

export const adminClubLeadershipService = {
  getClubLeadershipPage,
  assignLeader,
  previewDemote,
  demoteLeader,
};
