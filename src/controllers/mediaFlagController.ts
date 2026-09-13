import { Request, Response, NextFunction } from 'express';
import { getDefaultMediaModerationService } from '../services/mediaModerationService';
import { ForbiddenError, RateLimitedError, ValidationError } from '../services/serviceErrors';
import { handleControllerError, renderForbidden } from '../lib/controllerErrors';

export const mediaFlagController = {
  /** POST /media/item/:mediaId/flag
   *
   *  The item page is the only destination either way: a recorded report and a
   *  repeat of one the same member already filed both leave that page saying the
   *  item has been reported, which is the whole of what the reporter is owed.
   *  Nothing tells them what happened to it afterwards, deliberately: the
   *  decision is the uploader's to hear about, not the reporter's. */
  submit(req: Request, res: Response, next: NextFunction): void {
    const mediaId = req.params['mediaId'] ?? '';
    const itemHref = `/media/item/${encodeURIComponent(mediaId)}`;
    try {
      getDefaultMediaModerationService().flagMediaItem({
        mediaId,
        reporterMemberId: req.user!.userId,
        reasonCode:       req.body?.reason_code,
        reasonText:       req.body?.reason_text,
      });
      res.redirect(303, itemHref);
    } catch (err) {
      if (err instanceof RateLimitedError) {
        if (err.retryAfterSeconds) res.setHeader('Retry-After', String(err.retryAfterSeconds));
        res.status(429).type('text/plain').send(err.message);
        return;
      }
      if (err instanceof ValidationError) {
        // The form constrains both fields, so this is a hand-made request. It
        // returns to the item with nothing recorded rather than rendering a
        // validation surface the page does not have.
        res.redirect(303, itemHref);
        return;
      }
      if (err instanceof ForbiddenError) { renderForbidden(res); return; }
      handleControllerError(err, res, next, 'media flag controller');
    }
  },
};
