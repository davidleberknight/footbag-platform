import { Request, Response, NextFunction } from 'express';
import { contactRequestService } from '../services/contactRequestService';
import { identityAccessService } from '../services/identityAccessService';
import { ConflictError, NotFoundError, RateLimitedError, ValidationError } from '../services/serviceErrors';
import { handleControllerError } from '../lib/controllerErrors';
import { FLASH_KIND, writeFlash, readFlash, clearFlash } from '../lib/flashCookie';

// The resolve methods rate-limit in-service (shared per-admin bucket; admin
// role does not bypass). This controller only maps the error to HTTP.
function sendRateLimited(res: Response, err: RateLimitedError): void {
  if (err.retryAfterSeconds) res.setHeader('Retry-After', String(err.retryAfterSeconds));
  res.status(429).type('text/plain').send(err.message);
}

export const adminWorkQueueController = {
  /** GET /admin/work-queue */
  index(req: Request, res: Response, next: NextFunction): void {
    try {
      const flash = readFlash(req);
      let resolvedFlag = false;
      let reviewedFlag = false;
      if (flash?.kind === FLASH_KIND.WORK_QUEUE_RESOLVED) {
        resolvedFlag = true;
        clearFlash(res, req);
      } else if (flash?.kind === FLASH_KIND.WORK_QUEUE_REVIEWED) {
        reviewedFlag = true;
        clearFlash(res, req);
      }
      res.render('admin/work-queue/index', contactRequestService.getAdminWorkQueuePage({ resolvedFlag, reviewedFlag }));
    } catch (err) {
      if (err instanceof RateLimitedError) {
        sendRateLimited(res, err);
        return;
      }
      handleControllerError(err, res, next, 'admin work queue controller');
    }
  },

  /** POST /admin/work-queue/:id/resolve */
  async resolve(req: Request, res: Response, next: NextFunction): Promise<void> {
    const queueItemId = req.params['id'] ?? '';
    const decisionLabel = String(req.body?.decision_label ?? '');
    const resolutionNote = String(req.body?.resolution_note ?? '');
    try {
      await contactRequestService.resolve({
        queueItemId,
        adminMemberId: req.user!.userId,
        decisionLabel: decisionLabel as never,
        resolutionNote,
      });
      writeFlash(res, req, FLASH_KIND.WORK_QUEUE_RESOLVED, queueItemId);
      res.redirect(303, '/admin/work-queue');
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).render('admin/work-queue/index', contactRequestService.getAdminWorkQueuePage({ errorMessage: err.message }));
        return;
      }
      if (err instanceof NotFoundError) {
        res.status(404).render('admin/work-queue/index', contactRequestService.getAdminWorkQueuePage({ errorMessage: 'That queue item is no longer open.' }));
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
   * Close an internal-review item (birth-date-conflict flag). No member email;
   * the linking already happened and is never reverted here. */
  dismiss(req: Request, res: Response, next: NextFunction): void {
    const queueItemId = req.params['id'] ?? '';
    const note = String(req.body?.note ?? '');
    try {
      contactRequestService.dismiss({ queueItemId, adminMemberId: req.user!.userId, note });
      writeFlash(res, req, FLASH_KIND.WORK_QUEUE_REVIEWED, queueItemId);
      res.redirect(303, '/admin/work-queue');
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).render('admin/work-queue/index', contactRequestService.getAdminWorkQueuePage({ errorMessage: err.message }));
        return;
      }
      if (err instanceof NotFoundError) {
        res.status(404).render('admin/work-queue/index', contactRequestService.getAdminWorkQueuePage({ errorMessage: 'That review item is no longer open.' }));
        return;
      }
      if (err instanceof RateLimitedError) {
        sendRateLimited(res, err);
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
      res.redirect(303, '/admin/work-queue');
    } catch (err) {
      if (err instanceof ValidationError || err instanceof ConflictError) {
        res.status(422).render('admin/work-queue/index', contactRequestService.getAdminWorkQueuePage({ errorMessage: err.message }));
        return;
      }
      if (err instanceof NotFoundError) {
        res.status(404).render('admin/work-queue/index', contactRequestService.getAdminWorkQueuePage({ errorMessage: 'That queue item is no longer open.' }));
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
    const holderMemberId = String(req.body?.holder_member_id ?? '').trim();
    const reason = String(req.body?.reason ?? '');
    try {
      if (!holderMemberId) {
        throw new ValidationError('The current holder\'s member id is required.');
      }
      const result = identityAccessService.revertClaimForDispute(req.user!.userId, queueItemId, holderMemberId, reason);
      if (result.status === 'nothing_to_revert') {
        res.status(422).render('admin/work-queue/index', contactRequestService.getAdminWorkQueuePage({ errorMessage: 'That member holds no claim to revert.' }));
        return;
      }
      writeFlash(res, req, FLASH_KIND.WORK_QUEUE_RESOLVED, req.params['id'] ?? '');
      res.redirect(303, '/admin/work-queue');
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).render('admin/work-queue/index', contactRequestService.getAdminWorkQueuePage({ errorMessage: err.message }));
        return;
      }
      if (err instanceof NotFoundError) {
        res.status(404).render('admin/work-queue/index', contactRequestService.getAdminWorkQueuePage({ errorMessage: 'No member with that id.' }));
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
      res.redirect(303, '/admin/work-queue');
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).render('admin/work-queue/index', contactRequestService.getAdminWorkQueuePage({ errorMessage: err.message }));
        return;
      }
      if (err instanceof NotFoundError) {
        res.status(404).render('admin/work-queue/index', contactRequestService.getAdminWorkQueuePage({ errorMessage: 'That queue item is no longer open.' }));
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
