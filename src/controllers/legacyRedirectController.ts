import { Request, Response, NextFunction } from 'express';
import { memberService } from '../services/memberService';
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
      const resolution = memberService.resolveLegacyMemberProfile(legacyMemberId);
      if (resolution.status === 'live') {
        res.redirect(301, `/members/${resolution.slug}`);
        return;
      }
      if (resolution.status === 'claimable') {
        renderLegacyLink(res, {
          branch:      'claimable',
          isClaimable: true,
          displayName: req.isAuthenticated ? resolution.displayName : null,
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
