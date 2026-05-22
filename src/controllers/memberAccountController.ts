import { Request, Response, NextFunction } from 'express';
import { identityAccessService } from '../services/identityAccessService';
import { logger } from '../config/logger';

/**
 * Authenticated POST endpoints for the silent auto-link first-login card
 * (Confirm / Dismiss / Report-incorrect) and the profile-settings
 * Report-incorrect affordance. All three redirect back to the member's
 * profile page so the dashboard re-renders with the card removed (or, for
 * Report-incorrect, with claim state cleared).
 *
 * The Report-incorrect path here is the authenticated sibling of the
 * tokened report-incorrect handler in authController.getReportIncorrectLink;
 * both ultimately invoke identityAccessService.revertAutoLink.
 */
function postAutoLinkConfirm(req: Request, res: Response, next: NextFunction): void {
  try {
    identityAccessService.confirmAutoLinkCard(req.user!.userId);
    res.redirect(303, `/members/${encodeURIComponent(req.user!.slug)}`);
  } catch (err) {
    logger.error('auto-link confirm error', { error: err instanceof Error ? err.message : String(err) });
    next(err);
  }
}

function postAutoLinkDismiss(req: Request, res: Response, next: NextFunction): void {
  try {
    identityAccessService.dismissAutoLinkCard(req.user!.userId);
    res.redirect(303, `/members/${encodeURIComponent(req.user!.slug)}`);
  } catch (err) {
    logger.error('auto-link dismiss error', { error: err instanceof Error ? err.message : String(err) });
    next(err);
  }
}

function postAutoLinkReportIncorrect(req: Request, res: Response, next: NextFunction): void {
  // claimAuditId is always derived server-side from the member's pending card;
  // any value in the request body is ignored to prevent forensic-record forgery
  // (a malicious body could otherwise plant another member's audit id into
  // the revert audit row and the resulting work-queue item).
  try {
    const card = identityAccessService.getPendingAutoLinkCard(req.user!.userId);
    if (card) {
      identityAccessService.revertAutoLink(req.user!.userId, card.claimAuditId, {
        actorType:     'member',
        actorMemberId: req.user!.userId,
      });
    }
    res.redirect(303, `/members/${encodeURIComponent(req.user!.slug)}`);
  } catch (err) {
    logger.error('auto-link report incorrect error', { error: err instanceof Error ? err.message : String(err) });
    next(err);
  }
}

export const memberAccountController = {
  postAutoLinkConfirm,
  postAutoLinkDismiss,
  postAutoLinkReportIncorrect,
};
