import { Request, Response, NextFunction } from 'express';
import {
  identityAccessService,
  ClaimHpConfirmContent,
} from '../services/identityAccessService';
import { memberOnboardingService } from '../services/memberOnboardingService';
import { RateLimitedError, ValidationError } from '../services/serviceErrors';
import { logger } from '../config/logger';
import { PageViewModel } from '../types/page';

const HP_FORM_VM = {
  seo:  { title: 'Claim Historical Record' },
  page: { sectionKey: 'members', pageKey: 'claim_hp_verify', title: 'Claim Historical Record' },
};

// Uniform render for any failed HP claim attempt, regardless of underlying
// reason (HP not found, already claimed, surname mismatch, incompatible
// legacy linkage, ...). Anti-enumeration: a single observable response
// shape across every failure mode, with the specific reason captured in
// the application log at the caller. The contact-admin link is part of that
// single shape (identical on every failure), so the page's own instruction
// to contact an administrator carries a working control.
function renderHpClaimUnavailable(res: Response, personId: string, memberSlug: string): void {
  res.status(200).render('history/claim-unavailable', {
    seo:  { title: 'Claim unavailable' },
    page: { sectionKey: 'members', pageKey: 'hp_claim_unavailable', title: 'Claim unavailable' },
    content: {
      cancelHref: personId
        ? `/history/${encodeURIComponent(personId)}`
        : '/members',
      contactAdminHref: `/members/${encodeURIComponent(memberSlug)}/contact-admin?category=identity_link_issue`,
    },
  });
}

// Direct historical-record claims are wizard-window-bounded: once onboarding
// is complete this route redirects to the admin request form. The wizard's
// claim task remains the member's self-serve surface afterward for declaring
// anchors and confirming platform-offered candidate cards; what closes here
// is only the browse-a-record-and-claim-it path.
function claimingIsClosed(req: Request): boolean {
  return memberOnboardingService.isOnboardingComplete(req.user!.userId);
}
function redirectToAdminLinkRequest(req: Request, res: Response): void {
  const memberSlug = req.user!.slug ?? req.user!.userId;
  res.redirect(303, `/members/${encodeURIComponent(memberSlug)}/contact-admin?category=identity_link_issue`);
}

export const claimController = {
  /**
   * GET /history/:personId/claim, render the HP-claim confirmation page
   * (scenarios D and E). Reachable as a deep-link from the onboarding wizard's
   * legacy_claim view (hp_review_page card action) and from the historical-
   * record detail page's "Claim this identity" CTA.
   */
  getClaimHp(req: Request, res: Response, next: NextFunction): void {
    const personId = req.params.personId ?? '';
    try {
      if (claimingIsClosed(req)) {
        redirectToAdminLinkRequest(req, res);
        return;
      }
      const lookupResult = identityAccessService.lookupHistoricalPersonForClaim(req.user!.userId, personId);
      if (!lookupResult) {
        logger.info('hp claim unavailable: lookup returned null', {
          personId,
          memberId: req.user!.userId,
        });
        renderHpClaimUnavailable(res, personId, req.user!.slug ?? req.user!.userId);
        return;
      }
      if (lookupResult.status === 'conflict') {
        const memberSlug = req.user!.slug ?? req.user!.userId;
        res.render('history/claim-hp-conflict', {
          seo:  { title: 'Claim unavailable' },
          page: { sectionKey: 'members', pageKey: 'hp_claim_conflict', title: 'Claim unavailable' },
          content: {
            memberSlug,
            contactAdminHref: `/members/${encodeURIComponent(memberSlug)}/contact-admin?category=identity_link_issue`,
          },
        } satisfies PageViewModel<{ memberSlug: string; contactAdminHref: string }>);
        return;
      }
      const result = lookupResult.data;
      res.render('history/claim-hp-confirm', {
        ...HP_FORM_VM,
        content: {
          personId:         result.personId,
          personName:       result.personName,
          country:          result.country,
          isHof:            result.isHof,
          isBap:            result.isBap,
          firstNameWarning: result.firstNameWarning,
          bioExcerpt:       result.bioExcerpt,
          clubAffiliations: result.clubAffiliations,
          eventsAttended:   result.eventsAttended,
          cancelHref:       `/history/${encodeURIComponent(result.personId)}`,
        },
      } satisfies PageViewModel<ClaimHpConfirmContent>);
    } catch (err) {
      if (err instanceof ValidationError) {
        // Render the same uniform claim-unavailable page as the null-return
        // branch above. The specific ValidationError message (already-claimed,
        // surname mismatch, incompatible legacy account, etc.) would let an
        // attacker enumerate HP claim-status; collapse to a single response
        // shape and log the specific reason for operator forensics.
        logger.info('hp claim unavailable: ValidationError', {
          personId,
          memberId: req.user!.userId,
          reason: err.message,
        });
        renderHpClaimUnavailable(res, personId, req.user!.slug ?? req.user!.userId);
        return;
      }
      logger.error('hp claim lookup error', { error: err instanceof Error ? err.message : String(err) });
      next(err);
    }
  },

  /**
   * POST /history/:personId/claim/confirm, execute the HP claim.
   */
  postClaimHpConfirm(req: Request, res: Response, next: NextFunction): void {
    const personId = req.params.personId ?? '';
    if (claimingIsClosed(req)) {
      redirectToAdminLinkRequest(req, res);
      return;
    }
    if (!personId) {
      res.status(422).render('history/claim-hp-confirm', {
        ...HP_FORM_VM,
        content: { error: 'Invalid claim request.', cancelHref: '/members' },
      } satisfies PageViewModel<ClaimHpConfirmContent>);
      return;
    }
    try {
      memberOnboardingService.claimHistoricalPersonAndCompleteTask(req.user!.userId, personId, req.ip ?? 'unknown');
      res.redirect(303, `/members/${req.user!.slug}`);
    } catch (err) {
      if (err instanceof RateLimitedError) {
        res.status(429)
          .set('Retry-After', String(err.retryAfterSeconds ?? 60))
          .render('history/claim-hp-confirm', {
            ...HP_FORM_VM,
            content: {
              personId,
              error: err.message,
              cancelHref: `/history/${encodeURIComponent(personId)}`,
            },
          } satisfies PageViewModel<ClaimHpConfirmContent>);
        return;
      }
      if (err instanceof ValidationError) {
        res.status(422).render('history/claim-hp-confirm', {
          ...HP_FORM_VM,
          content: {
            personId,
            error: err.message,
            cancelHref: `/history/${encodeURIComponent(personId)}`,
          },
        } satisfies PageViewModel<ClaimHpConfirmContent>);
        return;
      }
      logger.error('hp claim error', { error: err instanceof Error ? err.message : String(err) });
      next(err);
    }
  },
};
