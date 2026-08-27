import { Request, Response, NextFunction } from 'express';
import { adminWorkQueueService } from '../services/adminWorkQueueService';
import { identityAccessService } from '../services/identityAccessService';
import { workQueueService } from '../services/workQueueService';
import { memberMessageService } from '../services/memberMessageService';
import { ConflictError, NotFoundError, RateLimitedError, ValidationError } from '../services/serviceErrors';
import { handleControllerError } from '../lib/controllerErrors';
import { FLASH_KIND, writeFlash, readFlash, clearFlash } from '../lib/flashCookie';

// The resolve methods rate-limit in-service (shared per-admin bucket; admin
// role does not bypass). This controller only maps the error to HTTP.
function sendRateLimited(res: Response, err: RateLimitedError): void {
  if (err.retryAfterSeconds) res.setHeader('Retry-After', String(err.retryAfterSeconds));
  res.status(429).type('text/plain').send(err.message);
}

/**
 * Where a completed action returns to. An administrator working one category
 * stays in it: dropping the filter on every action would make it useless after
 * the first item. The service decides what an unrecognized value means, so the
 * raw query value is passed straight back rather than validated twice.
 */
function queueReturnPath(req: Request): string {
  const body = (req.body ?? {}) as { category?: unknown };
  const raw = typeof body.category === 'string' ? body.category : req.query['category'];
  if (typeof raw !== 'string' || raw === '') return '/admin/work-queue';
  return `/admin/work-queue?category=${encodeURIComponent(raw)}`;
}

export const adminWorkQueueController = {
  /** GET /admin/work-queue */
  index(req: Request, res: Response, next: NextFunction): void {
    try {
      const flash = readFlash(req);
      let resolvedFlag = false;
      let resolvedQuietFlag = false;
      let reviewedFlag = false;
      let claimedFlag = false;
      let claimNoopFlag = false;
      let memberAskedFlag = false;
      if (flash?.kind === FLASH_KIND.WORK_QUEUE_RESOLVED) {
        // A payments-task resolve (and a contact resolve with no member email)
        // notified nobody, so the page confirms it without the email banner.
        if (flash.payload === 'quiet') resolvedQuietFlag = true;
        else resolvedFlag = true;
        clearFlash(res, req);
      } else if (flash?.kind === FLASH_KIND.WORK_QUEUE_REVIEWED) {
        reviewedFlag = true;
        clearFlash(res, req);
      } else if (flash?.kind === FLASH_KIND.WORK_QUEUE_MEMBER_ASKED) {
        memberAskedFlag = true;
        clearFlash(res, req);
      } else if (flash?.kind === FLASH_KIND.WORK_QUEUE_CLAIMED) {
        // The claim POST carries its outcome in the flash payload so the queue
        // re-render can confirm the claim or report that another admin won it.
        claimedFlag = flash.payload === 'claimed';
        claimNoopFlag = flash.payload !== 'claimed';
        clearFlash(res, req);
      }
      res.render('admin/work-queue/index', adminWorkQueueService.getAdminWorkQueuePage({
        adminMemberId: req.user!.userId,
        resolvedFlag,
        resolvedQuietFlag,
        reviewedFlag,
        claimedFlag,
        claimNoopFlag,
        memberAskedFlag,
        // The deep link the story specifies: a matter that needs the member's
        // own answer names itself here, and its composer opens already drafted.
        askItemId: typeof req.query.ask === 'string' ? req.query.ask : null,
        category: typeof req.query.category === 'string' ? req.query.category : null,
      }));
    } catch (err) {
      if (err instanceof RateLimitedError) {
        sendRateLimited(res, err);
        return;
      }
      handleControllerError(err, res, next, 'admin work queue controller');
    }
  },

  /** POST /admin/work-queue/:id/claim
   *
   * Claim an open, unclaimed item for the acting admin, which drops it from
   * every other admin's digest. A second claim (already claimed, or no longer
   * open) is a harmless no-op reported back on the queue page. */
  claim(req: Request, res: Response, next: NextFunction): void {
    const queueItemId = req.params['id'] ?? '';
    try {
      const result = workQueueService.claim({ queueItemId, adminMemberId: req.user!.userId });
      writeFlash(res, req, FLASH_KIND.WORK_QUEUE_CLAIMED, result.status);
      res.redirect(303, queueReturnPath(req));
    } catch (err) {
      handleControllerError(err, res, next, 'admin work queue controller');
    }
  },

  /** POST /admin/work-queue/:id/resolve */
  async resolve(req: Request, res: Response, next: NextFunction): Promise<void> {
    const queueItemId = req.params['id'] ?? '';
    const decisionLabel = String(req.body?.decision_label ?? '');
    const resolutionNote = String(req.body?.resolution_note ?? '');
    try {
      const result = await adminWorkQueueService.resolve({
        queueItemId,
        adminMemberId: req.user!.userId,
        decisionLabel,
        resolutionNote,
      });
      writeFlash(res, req, FLASH_KIND.WORK_QUEUE_RESOLVED, result.memberNotified ? 'notified' : 'quiet');
      res.redirect(303, queueReturnPath(req));
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).render('admin/work-queue/index', adminWorkQueueService.getAdminWorkQueuePage({ adminMemberId: req.user!.userId, errorMessage: err.message }));
        return;
      }
      if (err instanceof NotFoundError) {
        res.status(404).render('admin/work-queue/index', adminWorkQueueService.getAdminWorkQueuePage({ adminMemberId: req.user!.userId, errorMessage: 'That queue item is no longer open.' }));
        return;
      }
      if (err instanceof RateLimitedError) {
        sendRateLimited(res, err);
        return;
      }
      handleControllerError(err, res, next, 'admin work queue controller');
    }
  },

  /** POST /admin/work-queue/:id/dismiss
   *
   * Close an internal-review item (a low-confidence auto-link match, or an
   * administrator-loss recruitment alert). No member email, and nothing is
   * reverted here. */
  dismiss(req: Request, res: Response, next: NextFunction): void {
    const queueItemId = req.params['id'] ?? '';
    const note = String(req.body?.note ?? '');
    try {
      adminWorkQueueService.dismiss({ queueItemId, adminMemberId: req.user!.userId, note });
      writeFlash(res, req, FLASH_KIND.WORK_QUEUE_REVIEWED, queueItemId);
      res.redirect(303, queueReturnPath(req));
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).render('admin/work-queue/index', adminWorkQueueService.getAdminWorkQueuePage({ adminMemberId: req.user!.userId, errorMessage: err.message }));
        return;
      }
      if (err instanceof NotFoundError) {
        res.status(404).render('admin/work-queue/index', adminWorkQueueService.getAdminWorkQueuePage({ adminMemberId: req.user!.userId, errorMessage: 'That review item is no longer open.' }));
        return;
      }
      if (err instanceof RateLimitedError) {
        sendRateLimited(res, err);
        return;
      }
      handleControllerError(err, res, next, 'admin work queue controller');
    }
  },

  /**
   * POST /admin/work-queue/:id/ask-member
   *
   * Put a direct question to the member this item is about. The item keeps its
   * status; what changes is that the card now shows a question waiting.
   */
  askMember(req: Request, res: Response, next: NextFunction): void {
    const queueItemId = req.params['id'] ?? '';
    try {
      memberMessageService.sendQuestion({
        queueItemId,
        adminMemberId:      req.user!.userId,
        subject:            req.body?.subject,
        body:               req.body?.body,
        expectedAnswerKind: req.body?.expectedAnswerKind,
      });
      writeFlash(res, req, FLASH_KIND.WORK_QUEUE_MEMBER_ASKED, queueItemId);
      res.redirect(303, queueReturnPath(req));
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).render('admin/work-queue/index', adminWorkQueueService.getAdminWorkQueuePage({ adminMemberId: req.user!.userId, errorMessage: err.message }));
        return;
      }
      if (err instanceof NotFoundError) {
        res.status(404).render('admin/work-queue/index', adminWorkQueueService.getAdminWorkQueuePage({ adminMemberId: req.user!.userId, errorMessage: 'That item is no longer open.' }));
        return;
      }
      handleControllerError(err, res, next, 'admin work queue controller');
    }
  },

  /** POST /admin/work-queue/:id/link-help/approve */
  async linkHelpApprove(req: Request, res: Response, next: NextFunction): Promise<void> {
    const queueItemId = req.params['id'] ?? '';
    const targetLegacyMemberId = String(req.body?.target_legacy_member_id ?? '');
    const targetHistoricalPersonId = String(req.body?.target_historical_person_id ?? '');
    try {
      identityAccessService.approveLinkHelpRequest(req.user!.userId, queueItemId, {
        legacyMemberId: targetLegacyMemberId,
        historicalPersonId: targetHistoricalPersonId,
      });
      writeFlash(res, req, FLASH_KIND.WORK_QUEUE_RESOLVED, queueItemId);
      res.redirect(303, queueReturnPath(req));
    } catch (err) {
      if (err instanceof ValidationError || err instanceof ConflictError) {
        res.status(422).render('admin/work-queue/index', adminWorkQueueService.getAdminWorkQueuePage({ adminMemberId: req.user!.userId, errorMessage: err.message }));
        return;
      }
      if (err instanceof NotFoundError) {
        res.status(404).render('admin/work-queue/index', adminWorkQueueService.getAdminWorkQueuePage({ adminMemberId: req.user!.userId, errorMessage: 'That queue item is no longer open.' }));
        return;
      }
      if (err instanceof RateLimitedError) {
        sendRateLimited(res, err);
        return;
      }
      handleControllerError(err, res, next, 'admin work queue controller');
    }
  },

  /** POST /admin/work-queue/:id/link-help/dispute-revert
   *
   * Upheld dispute: reverts the current HOLDER's confirmed claim. Leaves
   * the queue item open so the admin can then approve the requester's link
   * (which resolves the item) or reject it. */
  async linkHelpDisputeRevert(req: Request, res: Response, next: NextFunction): Promise<void> {
    const queueItemId = req.params['id'] ?? '';
    const targetLegacyMemberId = String(req.body?.target_legacy_member_id ?? '');
    const targetHistoricalPersonId = String(req.body?.target_historical_person_id ?? '');
    const reason = String(req.body?.reason ?? '');
    try {
      const result = identityAccessService.revertClaimForDispute(req.user!.userId, queueItemId, {
        legacyMemberId: targetLegacyMemberId,
        historicalPersonId: targetHistoricalPersonId,
      }, reason);
      if (result.status === 'nothing_to_revert') {
        res.status(422).render('admin/work-queue/index', adminWorkQueueService.getAdminWorkQueuePage({ adminMemberId: req.user!.userId, errorMessage: 'Nobody currently holds that record, so there is no claim to revert.' }));
        return;
      }
      writeFlash(res, req, FLASH_KIND.WORK_QUEUE_RESOLVED, req.params['id'] ?? '');
      res.redirect(303, queueReturnPath(req));
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).render('admin/work-queue/index', adminWorkQueueService.getAdminWorkQueuePage({ adminMemberId: req.user!.userId, errorMessage: err.message }));
        return;
      }
      if (err instanceof NotFoundError) {
        res.status(404).render('admin/work-queue/index', adminWorkQueueService.getAdminWorkQueuePage({ adminMemberId: req.user!.userId, errorMessage: 'No member with that id.' }));
        return;
      }
      if (err instanceof RateLimitedError) {
        sendRateLimited(res, err);
        return;
      }
      handleControllerError(err, res, next, 'admin work queue controller');
    }
  },

  /** POST /admin/work-queue/:id/link-help/reject */
  async linkHelpReject(req: Request, res: Response, next: NextFunction): Promise<void> {
    const queueItemId = req.params['id'] ?? '';
    const reason = String(req.body?.reason ?? '');
    try {
      identityAccessService.rejectLinkHelpRequest(req.user!.userId, queueItemId, reason);
      writeFlash(res, req, FLASH_KIND.WORK_QUEUE_RESOLVED, queueItemId);
      res.redirect(303, queueReturnPath(req));
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).render('admin/work-queue/index', adminWorkQueueService.getAdminWorkQueuePage({ adminMemberId: req.user!.userId, errorMessage: err.message }));
        return;
      }
      if (err instanceof NotFoundError) {
        res.status(404).render('admin/work-queue/index', adminWorkQueueService.getAdminWorkQueuePage({ adminMemberId: req.user!.userId, errorMessage: 'That queue item is no longer open.' }));
        return;
      }
      if (err instanceof RateLimitedError) {
        sendRateLimited(res, err);
        return;
      }
      handleControllerError(err, res, next, 'admin work queue controller');
    }
  },
};
