import { Request, Response, NextFunction } from 'express';
import { declaredAnchors, legacyMembers } from '../db/db';
import { LegacyMemberRow } from '../db/db';
import { PageViewModel } from '../types/page';

/**
 * Legacy-URL forwarding for in-flight emails: old footbag.org messages
 * (verification mails, forum-reply pointers, share links) keep circulating
 * for years after cutover, so their URL patterns must keep landing
 * somewhere meaningful.
 *
 *  - /members/profile/:legacyMemberId resolves in three branches: 301 to
 *    the live member's slug URL; a soft-landing claim page for an unclaimed
 *    legacy account (display name shown to signed-in visitors only); or the
 *    friendly not-routable page.
 *  - Legacy forum paths 301 to the member-gated archive mirror.
 */
const ARCHIVE_BASE_URL = 'https://archive.footbag.org';

interface LegacyLinkContent {
  branch: 'claimable' | 'not_routable';
  // Pre-shaped so the template branches on a boolean, not the branch code.
  isClaimable: boolean;
  /** Display name of the unclaimed account; null for unauthenticated
   * visitors, who are never shown any account detail. */
  displayName: string | null;
  claimHref: string | null;
  registerHref: string | null;
}

function renderLegacyLink(res: Response, content: LegacyLinkContent, status: number): void {
  res.status(status).render('legacy/legacy-link', {
    seo:  { title: 'Legacy footbag.org link' },
    page: { sectionKey: 'members', pageKey: 'legacy_link', title: 'Legacy footbag.org link' },
    content,
  } satisfies PageViewModel<LegacyLinkContent>);
}

export const legacyRedirectController = {
  /** GET /members/profile/:legacyMemberId */
  memberProfile(req: Request, res: Response, next: NextFunction): void {
    try {
      const legacyMemberId = req.params.legacyMemberId ?? '';

      const live = declaredAnchors.findLiveMemberSlugByLegacyId.get(legacyMemberId) as
        | { slug: string }
        | undefined;
      if (live) {
        res.redirect(301, `/members/${live.slug}`);
        return;
      }

      const legacyRow = legacyMembers.findByLegacyMemberId.get(legacyMemberId) as
        | LegacyMemberRow
        | undefined;
      if (legacyRow && !legacyRow.claimed_by_member_id) {
        renderLegacyLink(res, {
          branch:      'claimable',
          isClaimable: true,
          displayName: req.isAuthenticated ? (legacyRow.display_name ?? legacyRow.real_name) : null,
          claimHref:   req.isAuthenticated ? '/register/wizard/legacy_claim' : null,
          registerHref: req.isAuthenticated ? null : '/register',
        }, 200);
        return;
      }

      renderLegacyLink(res, {
        branch: 'not_routable', isClaimable: false, displayName: null, claimHref: null, registerHref: null,
      }, 404);
    } catch (err) {
      next(err);
    }
  },

  /** GET /forum/* and /forums/* — the posts live on the archive mirror. */
  forum(req: Request, res: Response): void {
    res.redirect(301, `${ARCHIVE_BASE_URL}${req.originalUrl}`);
  },
};

export { ARCHIVE_BASE_URL };
