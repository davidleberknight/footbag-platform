import { Request, Response, NextFunction } from 'express';
import { contactRequestService } from '../services/contactRequestService';
import { NotFoundError, ValidationError } from '../services/serviceErrors';
import { handleControllerError } from '../lib/controllerErrors';
import { FLASH_KIND, writeFlash, readFlash, clearFlash } from '../lib/flashCookie';

export const adminWorkQueueController = {
  /** GET /admin/work-queue */
  index(req: Request, res: Response, next: NextFunction): void {
    try {
      const flash = readFlash(req);
      let resolvedFlag = false;
      if (flash?.kind === FLASH_KIND.WORK_QUEUE_RESOLVED) {
        resolvedFlag = true;
        clearFlash(res, req);
      }
      res.render('admin/work-queue/index', contactRequestService.getAdminWorkQueuePage({ resolvedFlag }));
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
      handleControllerError(err, res, next, 'admin work queue controller');
    }
  },
};
