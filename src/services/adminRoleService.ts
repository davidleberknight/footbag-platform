/**
 * AdminRoleService -- the admin-facing admin-roles management surface
 * (story A_Manage_Admin_Role).
 *
 * Owns: the /admin/admin-roles page view-model (the current-admins list plus the
 * grant form), the grant/revoke confirmation page-models that name the member
 * and the change before it commits, and resolving the grant form's member key
 * (slug or id) to a member id. The privileged role writes (the `is_admin` flag,
 * the admin-alerts subscription, the audit row, and the affected-member email)
 * live in MembershipTieringService, which this service delegates to so the
 * grant/revoke invariants have a single home; it also exposes validate-only
 * checks this service calls to build the confirmation step without writing.
 *
 * Persistence: reads members_active (admin list and member-key resolution). All
 * writes go through MembershipTieringService.
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
} from './membershipTieringService';
import { ValidationError } from './serviceErrors';
import { PageViewModel } from '../types/page';

function tierLabel(tierStatus: string): string {
  if (tierStatus === 'tier3') return 'Tier 3';
  if (tierStatus === 'tier2') return 'Tier 2';
  return tierStatus;
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
  notice: string | null;
  errorMessage: string | null;
}

/** The grant/revoke confirmation step's view-model: it names the member and the
 *  change, carries the inputs forward as hidden fields, and points its form at
 *  the matching commit route. */
export interface AdminRoleConfirmContent {
  action: 'grant' | 'revoke';
  /** Re-submitted on confirm: the typed member key for grant, the member id for
   *  revoke. The commit route re-resolves and re-validates it. */
  memberKey: string;
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
    opts: { notice?: string; errorMessage?: string } = {},
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
    return {
      seo: { title: 'Admin roles' },
      page: { sectionKey: '', pageKey: 'admin_admin_roles', title: 'Admin roles' },
      content: {
        admins,
        notice: opts.notice ?? null,
        errorMessage: opts.errorMessage ?? null,
      },
    };
  },

  /** Resolve the grant form's member key, then delegate the grant. A key that
   *  matches no active member is a fixable input error (the admin can re-enter
   *  it), so it re-renders the form with a message rather than 404ing. */
  grantByKey(adminMemberId: string, memberKey: string, reason: string): void {
    const member = account.findActiveMemberByKey.get(memberKey.trim(), memberKey.trim()) as
      | { id: string; display_name: string; slug: string }
      | undefined;
    if (!member) throw new ValidationError('No active member with that id or slug.');
    grantAdminRole(adminMemberId, member.id, reason);
  },

  /** Delegate the revoke for an admin row addressed by member id. */
  revoke(adminMemberId: string, targetMemberId: string, reason: string): void {
    revokeAdminRole(adminMemberId, targetMemberId, reason);
  },

  /** Resolve and validate a grant the same way grantByKey would, but write
   *  nothing, returning the confirmation page-model. Throws the same fixable-
   *  input errors (unknown key, wrong tier, already admin, missing reason) so
   *  the controller re-renders the form before any confirmation is shown. */
  previewGrant(
    _adminMemberId: string,
    memberKey: string,
    reason: string,
  ): PageViewModel<AdminRoleConfirmContent> {
    const key = memberKey.trim();
    const member = account.findActiveMemberByKey.get(key, key) as
      | { id: string; display_name: string; slug: string }
      | undefined;
    if (!member) throw new ValidationError('No active member with that id or slug.');
    const { trimmedReason, tierStatus } = assertGrantAdminRoleAllowed(member.id, reason);
    return {
      seo: { title: 'Grant admin role', noindex: true },
      page: { sectionKey: '', pageKey: 'admin_admin_roles_grant_confirm', title: 'Confirm: grant admin role' },
      content: {
        action: 'grant',
        memberKey: key,
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
    const member = account.findActiveMemberByKey.get(targetMemberId, targetMemberId) as
      | { id: string; display_name: string; slug: string }
      | undefined;
    return {
      seo: { title: 'Revoke admin role', noindex: true },
      page: { sectionKey: '', pageKey: 'admin_admin_roles_revoke_confirm', title: 'Confirm: revoke admin role' },
      content: {
        action: 'revoke',
        memberKey: targetMemberId,
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
