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
 *   - A member appears at most once per club (ux_club_leaders). A member
 *     co-leads at most three clubs, counted before insert, so assigning a
 *     member who already co-leads three is refused with direction.
 *   - A member holds at most three current clubs, so assigning a member who
 *     already holds three others is refused.
 *   - A member holding any current club affiliation holds exactly one primary.
 *     An affiliation this service creates or reactivates is primary when the
 *     member held no other current club, and removing the primary promotes
 *     the earliest-joined survivor, so neither admin path can leave a member
 *     with a club but no primary club.
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
 *   - The member assigned is chosen in the page's member picker, which
 *     searches the administrator's member lookup (AdminMemberService), so it
 *     reaches members who opted out of member search, and offers only
 *     onboarded, living members who do not already co-lead the club; the
 *     club's own members who are not co-leaders are offered as ready choices
 *     before any search. The choice is posted by member id, and a slug or
 *     profile address is never accepted in its place.
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
import { MAX_COLEADERS_PER_CLUB, MAX_CURRENT_CLUBS_PER_MEMBER, memberAtColeadCap } from './clubCaps';
import { promotePrimarySuccessorInTx } from './clubService';
import { NotFoundError, ValidationError } from './serviceErrors';
import { cleanUserText } from '../lib/textSanitizer';
import { PageViewModel } from '../types/page';
import { adminMemberService } from './adminMemberService';
import { personLocation } from './countryUtils';
import { PICKER_LIMIT, buildMemberPicker, type MemberPickerView, type PickIntent } from './memberPicker';
import type { OutcomeNoticeView } from '../lib/outcomeNotice';
import type { ActionEnding } from '../lib/actionOutcome';

// The assign form, and the one picker on it.
const ASSIGN_FORM_ID = 'assign-coleader-form';
const PICKER_KEY = 'leader';

interface AppointableRow {
  id: string; display_name: string; slug: string;
  city: string | null; region: string | null; country: string | null;
}

function findAppointable(memberId: string): AppointableRow | undefined {
  const id = memberId.trim();
  return id === '' ? undefined : clubLeaders.findAppointableMemberById.get(id) as AppointableRow | undefined;
}

/** What the assign form submitted: the chosen member, the reason, and a picker
 *  control's request, which draws the page again with nothing written. */
export interface ClubLeadershipAssignForm {
  memberId: string;
  reason: string;
  intent: PickIntent | null;
  query: string;
}

export interface ClubLeadershipContent {
  clubId: string;
  clubKey: string;
  name: string;
  needsLeader: boolean;
  leaders: Array<{ memberId: string; displayName: string; slug: string; role: string; roleLabel: string }>;
  /** Members of this club who are not co-leaders, each a ready choice for the
   *  assign form's picker, with the way through to their record. */
  affiliatedMembers: Array<{
    memberId: string; displayName: string; slug: string; recordHref: string;
    chooseValue: string; chooseAriaLabel: string;
  }>;
  assignHref: string;
  assignFormId: string;
  /** The picker choosing the member to assign. */
  leaderPicker: MemberPickerView;
  /** The reason as typed, kept while the picker draws the page again. */
  reasonValue: string;
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
  opts: { notice?: OutcomeNoticeView | null; errorMessage?: string; form?: ClubLeadershipAssignForm } = {},
): PageViewModel<{ club: ClubLeadershipContent }> {
  const club = loadClub(clubId);
  const assignHref = `/admin/clubs/${club.id}/leadership/assign`;
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
      chooseValue: `choose:${PICKER_KEY}:${m.member_id}`,
      chooseAriaLabel: `Choose ${m.display_name} as co-leader`,
    }));
  const leaderIds = new Set(leaders.map((l) => l.memberId));
  const intent = opts.form?.intent ?? null;
  const chosenId = intent?.kind === 'choose' && intent.key === PICKER_KEY ? intent.memberId : opts.form?.memberId ?? '';
  const chosen = findAppointable(chosenId);
  // The administrator's lookup population, which member search hides some
  // of, narrowed to living members who do not already co-lead the club.
  const search = intent?.kind === 'search' && intent.key === PICKER_KEY
    ? adminMemberService.lookupMembersForPicker(opts.form?.query ?? '', {
      limit: PICKER_LIMIT,
      accept: (id) => !leaderIds.has(id) && findAppointable(id) !== undefined,
    })
    : null;
  const leaderPicker = buildMemberPicker({
    formId: ASSIGN_FORM_ID,
    formAction: assignHref,
    fieldName: 'member_id',
    fieldKey: PICKER_KEY,
    label: 'Member',
    searchLabel: 'Name or login email',
    openLabel: 'Choose Member',
    rowAction: { label: 'Choose', completes: false, ariaLabel: (name) => `Choose ${name} as co-leader` },
    chosen: chosen
      ? { memberId: chosen.id, displayName: chosen.display_name, location: personLocation(chosen.city, chosen.region, chosen.country)?.text ?? null }
      : null,
    intent,
    openOnLoad: true,
    query: opts.form?.query ?? '',
    search: search && { ...search, rateLimited: false },
    notFoundHint: null,
  });
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
        how: 'Search for a member or choose one of the club\'s members, give a reason to assign them, or remove a co-leader with a reason.',
        headsUp: [
          'A club has at most five co-leaders, and a member co-leads at most three clubs.',
          'Assigning a co-leader to an inactive club makes it active again. An archived club accepts no assignment, and a member who already holds three clubs cannot be assigned.',
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
        assignHref,
        assignFormId: ASSIGN_FORM_ID,
        leaderPicker,
        reasonValue: opts.form?.reason ?? '',
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
 * the affiliation when absent. A member co-leads at most three clubs, so a
 * member who already co-leads three is refused with direction (step down at
 * one first). A club at five co-leaders refuses a sixth, a member who already
 * holds three other current clubs is refused a fourth, and an archived club
 * refuses any assignment.
 *
 * A member who already co-leads this club is a repeat, not an error: this
 * admin's own standing assignment of them reports the first submit's success,
 * and a row someone else made reports that nothing changed. Neither writes.
 */
function assignLeader(
  adminMemberId: string,
  clubId: string,
  memberId: string,
  reason: string,
): LeadershipChangeOutcome {
  const trimmedReason = requireReason(reason);
  const club = loadClub(clubId);
  // Archiving is final: anyone wanting the club again creates a new one.
  if (club.status === 'archived') {
    throw new ValidationError('This club is archived, which is final, so it takes no new co-leader.');
  }
  // The member chosen in the picker, by id: only a living, onboarded member can
  // co-lead. An id that names nobody is a fixable input error.
  const member = findAppointable(memberId);
  if (!member) throw new ValidationError('Search for the member by name and choose them.');

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
    // A member co-leads at most three clubs; the existingRow check above
    // already cleared this club, so every co-leadership counted is elsewhere.
    if (memberAtColeadCap(member.id)) {
      throw new ValidationError(
        'That member already co-leads three clubs, the most a member can lead. They step down at one of them first if they want to lead this one.',
      );
    }

    const count = (clubLeaders.countByClubId.get(clubId) as { c: number }).c;
    if (count >= MAX_COLEADERS_PER_CLUB) {
      throw new ValidationError(
        `This club already has ${MAX_COLEADERS_PER_CLUB} co-leaders, the most a club can have.`,
      );
    }

    // Leading a club puts the member on its roster, so a member who is not
    // already a current member here and holds three other clubs would reach four.
    const aff = clubLeaders.findCurrentAffiliation.get(member.id, clubId) as
      | { id: string; is_current: number }
      | undefined;
    const currentCount = (memberClubAffiliations.countCurrentByMemberId.get(member.id) as { c: number }).c;
    if (!aff?.is_current && currentCount >= MAX_CURRENT_CLUBS_PER_MEMBER) {
      throw new ValidationError(
        'That member already belongs to three clubs, the most a member can hold. They leave one first if they want to lead this one.',
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

      // Ending an affiliation clears its primary flag. When it was the
      // member's primary, the surviving club joined earliest becomes primary,
      // exactly as the member's own leave does.
      promotePrimarySuccessorInTx(memberId, now, adminMemberId);
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
