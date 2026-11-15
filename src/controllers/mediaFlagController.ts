import { Request, Response, NextFunction } from 'express';
import { getDefaultMediaModerationService } from '../services/mediaModerationService';
import { ForbiddenError, RateLimitedError, ValidationError } from '../services/serviceErrors';
import { handleControllerError, renderForbidden, renderInvalidRequest } from '../lib/controllerErrors';
import { z } from 'zod';
import { parseFormBody, formOptionalText } from '../lib/parseFormBody';

const flagForm = z.object({
  reason_code: formOptionalText('The reason for the report'),
  reason_text: formOptionalText('Your note about the report'),
});

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
    // The item page has no form surface to re-render, so a body the form never
    // sends is answered on the invalid-request page, with a way back.
    const parsed = parseFormBody(flagForm, req.body);
    if (!parsed.ok) { renderInvalidRequest(res, { title: parsed.message, backHref: itemHref }); return; }
    try {
      getDefaultMediaModerationService().flagMediaItem({
        mediaId,
        reporterMemberId: req.user!.userId,
        reasonCode:       parsed.data.reason_code,
        reasonText:       parsed.data.reason_text,
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
