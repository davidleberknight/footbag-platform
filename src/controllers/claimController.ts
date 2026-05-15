import { Request, Response, NextFunction } from 'express';
import {
  identityAccessService,
  ClaimHpConfirmContent,
} from '../services/identityAccessService';
import { ValidationError } from '../services/serviceErrors';
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
// the application log at the caller.
function renderHpClaimUnavailable(res: Response, personId: string): void {
  res.status(200).render('history/claim-unavailable', {
    seo:  { title: 'Claim unavailable' },
    page: { sectionKey: 'members', pageKey: 'hp_claim_unavailable', title: 'Claim unavailable' },
    content: {
      cancelHref: personId
        ? `/history/${encodeURIComponent(personId)}`
        : '/members',
    },
  });
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
      const result = identityAccessService.lookupHistoricalPersonForClaim(req.user!.userId, personId);
      if (!result) {
        // HP not found (or requesting member not found). Render the uniform
        // claim-unavailable page rather than redirecting to /history/:personId
        // (which would 404 for a non-existent HP and distinguish the case
        // from the ValidationError branch below — enumeration leak).
        logger.info('hp claim unavailable: lookup returned null', {
          personId,
          memberId: req.user!.userId,
        });
        renderHpClaimUnavailable(res, personId);
        return;
      }
      res.render('history/claim-hp-confirm', {
        ...HP_FORM_VM,
        content: {
          personId:         result.personId,
          personName:       result.personName,
          country:          result.country,
          isHof:            result.isHof,
          isBap:            result.isBap,
          firstNameWarning: result.firstNameWarning,
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
        renderHpClaimUnavailable(res, personId);
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
    if (!personId) {
      res.status(422).render('history/claim-hp-confirm', {
        ...HP_FORM_VM,
        content: { error: 'Invalid claim request.', cancelHref: '/members' },
      } satisfies PageViewModel<ClaimHpConfirmContent>);
      return;
    }
    try {
      identityAccessService.claimHistoricalPerson(req.user!.userId, personId);
      res.redirect(303, `/members/${req.user!.slug}`);
    } catch (err) {
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
