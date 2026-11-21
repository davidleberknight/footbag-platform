/**
 * AdminRoleService -- the admin-facing admin-roles management surface
 * (story A_Manage_Admin_Role).
 *
 * Owns: the /admin/admin-roles page view-model (the current-admins list plus the
 * grant form and its member picker), and the grant/revoke confirmation
 * page-models that name the member and the change before it commits. The
 * member to grant is chosen in the picker, which searches the administrator's
 * member lookup (AdminMemberService), so it reaches members who opted out of
 * member search, and offers only onboarded members who are not already
 * administrators. The choice is posted by member id; a slug or profile address
 * is never accepted in its place. The privileged role writes (the `is_admin` flag,
 * the admin-alerts subscription, the audit row, and the affected-member email)
 * live in MembershipTieringService, which this service delegates to so the
 * grant/revoke invariants have a single home; it also exposes validate-only
 * checks this service calls to build the confirmation step without writing.
 *
 * Persistence: reads members_onboarded (the admin list and the chosen member).
 * All writes go through MembershipTieringService.
 *
 * Side effects: none directly (delegated to MembershipTieringService).
 *
 * Service shape: singleton object.
 */
import { account } from '../db/db';
import {
  grantAdminRole,
  revokeAdminRole,
  assertGrantAdminRoleAllowed,
  assertRevokeAdminRoleAllowed,
  TIER_NAMES,
  type MemberTier,
} from './membershipTieringService';
import { ValidationError } from './serviceErrors';
import { PageViewModel } from '../types/page';
import { adminMemberService } from './adminMemberService';
import { personLocation } from './countryUtils';
import { PICKER_LIMIT, buildMemberPicker, type MemberPickerView, type PickIntent } from './memberPicker';
import type { ActionEnding } from '../lib/actionOutcome';
import type { OutcomeNoticeView } from '../lib/outcomeNotice';

// The grant form, and the one picker on it.
const GRANT_FORM_ID = 'grant-admin-form';
const GRANT_HREF = '/admin/admin-roles/grant';
const PICKER_KEY = 'admin';
const NOT_CHOSEN = 'Search for the member by name and choose them.';

interface ChosenRow {
  id: string; slug: string; display_name: string;
  city: string | null; region: string | null; country: string | null;
}

function findChosen(memberId: string): ChosenRow | undefined {
  const id = memberId.trim();
  return id === '' ? undefined : account.findActiveMemberById.get(id) as ChosenRow | undefined;
}

/** What the grant form submitted: the chosen member, the reason, and a picker
 *  control's request, which draws the page again with nothing written. */
export interface AdminRoleGrantForm {
  memberId: string;
  reason: string;
  intent: PickIntent | null;
  query: string;
}

function tierLabel(tierStatus: string): string {
  return TIER_NAMES[tierStatus as MemberTier] ?? tierStatus;
}

export interface AdminRoleViewModel {
  memberId: string;
  displayName: string;
  slug: string;
  profileHref: string;
  /** True for the viewing admin's own row, which renders no revoke control
   *  (an admin cannot revoke their own role). */
  isSelf: boolean;
}

export interface AdminRolesContent {
  admins: AdminRoleViewModel[];
  errorMessage: string | null;
  grantHref: string;
  grantFormId: string;
  /** The picker choosing the member to grant. */
  memberPicker: MemberPickerView;
  /** The reason as typed, kept while the picker draws the page again. */
  reasonValue: string;
}

/** How a committed grant or revoke ended. The first submit and this admin's own
 *  repeat redirect silently; a change another act already made carries the
 *  informational sentence the list page shows. */
export interface AdminRoleChangeOutcome {
  ending: Exclude<ActionEnding, 'refused'>;
  notice: string | null;
}

const ALREADY_GRANTED_NOTICE = 'That member is already an administrator, so nothing was changed.';
const ALREADY_REVOKED_NOTICE = 'That member is no longer an administrator, so nothing was changed.';

/** The grant/revoke confirmation step's view-model: it names the member and the
 *  change, carries the inputs forward as hidden fields, and points its form at
 *  the matching commit route. */
export interface AdminRoleConfirmContent {
  action: 'grant' | 'revoke';
  /** The chosen member's id, re-submitted on confirm; the commit route
   *  re-resolves and re-validates it. */
  memberId: string;
  displayName: string;
  profileHref: string;
  /** The target's current membership tier on a grant; null on a revoke. */
  tierLabel: string | null;
  reason: string;
  confirmHref: string;
  cancelHref: string;
}

export const adminRoleService = {
  /** GET /admin/admin-roles page model. `viewerMemberId` flags the admin's own
   *  row so the template hides its revoke control. */
  getAdminRolesPage(
    viewerMemberId: string,
    opts: { outcome?: OutcomeNoticeView | null; errorMessage?: string; form?: AdminRoleGrantForm } = {},
  ): PageViewModel<AdminRolesContent> {
    const admins = (account.listAdminsForDisplay.all() as Array<{
      id: string;
      slug: string;
      display_name: string;
    }>).map((r) => ({
      memberId: r.id,
      displayName: r.display_name,
      slug: r.slug,
      profileHref: `/members/${r.slug}`,
      isSelf: r.id === viewerMemberId,
    }));
    const adminIds = new Set(admins.map((a) => a.memberId));
    const intent = opts.form?.intent ?? null;
    const chosenId = intent?.kind === 'choose' && intent.key === PICKER_KEY ? intent.memberId : opts.form?.memberId ?? '';
    const chosen = findChosen(chosenId);
    // The administrator's lookup population, which member search hides some
    // of, narrowed to onboarded members who are not administrators already.
    const search = intent?.kind === 'search' && intent.key === PICKER_KEY
      ? adminMemberService.lookupMembersForPicker(opts.form?.query ?? '', {
        limit: PICKER_LIMIT,
        accept: (id) => !adminIds.has(id) && findChosen(id) !== undefined,
      })
      : null;
    const memberPicker = buildMemberPicker({
      formId: GRANT_FORM_ID,
      formAction: GRANT_HREF,
      fieldName: 'member_id',
      fieldKey: PICKER_KEY,
      label: 'Member',
      searchLabel: 'Name or login email',
      openLabel: 'Choose Member',
      rowAction: { label: 'Choose', completes: false, ariaLabel: (name) => `Choose ${name} as administrator` },
      chosen: chosen
        ? { memberId: chosen.id, displayName: chosen.display_name, location: personLocation(chosen.city, chosen.region, chosen.country)?.text ?? null }
        : null,
      intent,
      openOnLoad: true,
      query: opts.form?.query ?? '',
      search: search && { ...search, rateLimited: false },
      notFoundHint: null,
    });
    return {
      seo: { title: 'Admin Roles' },
      page: {
        sectionKey: '',
        pageKey: 'admin_admin_roles',
        title: 'Admin Roles',
        instructions: {
          what: 'Lists the administrators, and grants or revokes the administrator role.',
          why: 'To keep the administrator team current.',
          how: 'To grant, search for the member by name, choose them and give a reason. To revoke, give a reason beside the administrator. Either way you review it on a confirm page before it is written.',
          headsUp: [
            'Both actions email the member and are recorded in the audit log.',
            'Granting also gives the member Tier 2 if they lack it and subscribes them to administrator alerts. Revoking unsubscribes them.',
            'Revoking also raises a queue item to recruit a replacement.',
            'You cannot revoke your own role.',
          ],
        },
        notice: opts.outcome?.text,
        noticeTone: opts.outcome?.tone,
      },
      content: {
        admins,
        errorMessage: opts.errorMessage ?? null,
        grantHref: GRANT_HREF,
        grantFormId: GRANT_FORM_ID,
        memberPicker,
        reasonValue: opts.form?.reason ?? '',
      },
    };
  },

  /** Delegate the grant for the member chosen in the picker, by id. An id that
   *  names no onboarded member is a fixable input error (the admin can search
   *  again), so it re-renders the form with a message rather than 404ing. */
  grant(adminMemberId: string, memberId: string, reason: string): AdminRoleChangeOutcome {
    const member = findChosen(memberId);
    if (!member) throw new ValidationError(NOT_CHOSEN);
    const { status } = grantAdminRole(adminMemberId, member.id, reason);
    return { ending: status, notice: status === 'already_held' ? ALREADY_GRANTED_NOTICE : null };
  },

  /** Delegate the revoke for an admin row addressed by member id. */
  revoke(adminMemberId: string, targetMemberId: string, reason: string): AdminRoleChangeOutcome {
    const { status } = revokeAdminRole(adminMemberId, targetMemberId, reason);
    return { ending: status, notice: status === 'already_held' ? ALREADY_REVOKED_NOTICE : null };
  },

  /** Resolve and validate a grant the same way grant would, but write nothing,
   *  returning the confirmation page-model. Throws the same fixable-input
   *  errors (no member chosen, already admin, missing reason) so the controller
   *  re-renders the form before any confirmation is shown. */
  previewGrant(
    _adminMemberId: string,
    memberId: string,
    reason: string,
  ): PageViewModel<AdminRoleConfirmContent> {
    const member = findChosen(memberId);
    if (!member) throw new ValidationError(NOT_CHOSEN);
    const { trimmedReason, tierStatus } = assertGrantAdminRoleAllowed(member.id, reason);
    return {
      seo: { title: 'Grant Admin Role', noindex: true },
      page: {
        sectionKey: '', pageKey: 'admin_admin_roles_grant_confirm', title: 'Confirm: Grant Admin Role',
        instructions: { what: 'Review granting the administrator role before it is written.' },
      },
      content: {
        action: 'grant',
        memberId: member.id,
        displayName: member.display_name,
        profileHref: `/members/${member.slug}`,
        tierLabel: tierLabel(tierStatus),
        reason: trimmedReason,
        confirmHref: '/admin/admin-roles/grant/confirm',
        cancelHref: '/admin/admin-roles',
      },
    };
  },

  /** Validate a revoke the same way revoke would, but write nothing, returning
   *  the confirmation page-model. Throws the same errors (self-revoke, unknown
   *  member, not an admin, missing reason) so the controller re-renders first. */
  previewRevoke(
    adminMemberId: string,
    targetMemberId: string,
    reason: string,
  ): PageViewModel<AdminRoleConfirmContent> {
    const { trimmedReason } = assertRevokeAdminRoleAllowed(adminMemberId, targetMemberId, reason);
    // assert guarantees the member exists and is an admin; resolve the display name.
    const member = findChosen(targetMemberId);
    return {
      seo: { title: 'Revoke Admin Role', noindex: true },
      page: {
        sectionKey: '', pageKey: 'admin_admin_roles_revoke_confirm', title: 'Confirm: Revoke Admin Role',
        instructions: { what: 'Review revoking the administrator role before it is written.' },
      },
      content: {
        action: 'revoke',
        memberId: targetMemberId,
        displayName: member?.display_name ?? targetMemberId,
        profileHref: member ? `/members/${member.slug}` : '',
        tierLabel: null,
        reason: trimmedReason,
        confirmHref: `/admin/admin-roles/${targetMemberId}/revoke/confirm`,
        cancelHref: '/admin/admin-roles',
      },
    };
  },
};
