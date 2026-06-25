/**
 * AdminRoleService -- the admin-facing admin-roles management surface
 * (story A_Manage_Admin_Role).
 *
 * Owns: the /admin/admin-roles page view-model (the current-admins list plus the
 * grant form) and resolving the grant form's member key (slug or id) to a member
 * id. The privileged role writes (the `is_admin` flag, the admin-alerts
 * subscription, the audit row, and the affected-member email) live in
 * MembershipTieringService, which this service delegates to so the grant/revoke
 * invariants have a single home.
 *
 * Persistence: reads members_active (admin list and member-key resolution). All
 * writes go through MembershipTieringService.
 *
 * Side effects: none directly (delegated to MembershipTieringService).
 *
 * Service shape: singleton object.
 */
import { account } from '../db/db';
import { grantAdminRole, revokeAdminRole } from './membershipTieringService';
import { ValidationError } from './serviceErrors';
import { PageViewModel } from '../types/page';

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
};
