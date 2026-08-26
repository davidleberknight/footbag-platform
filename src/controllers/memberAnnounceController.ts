/**
 * The community announcement an organizer-tier member sends: the compose form
 * and the send.
 *
 * The tier gate is applied at the route; ownership of the path's member key is
 * checked here, and a mismatch is a 404 rather than a 403, so the path cannot be
 * used to discover which member slugs exist. The send follows
 * post-redirect-get; a validation failure re-renders the form at 422 with the
 * text and the send token intact, and hitting the daily limit answers 429 with
 * Retry-After, which the error handler would otherwise turn into a 500.
 */
import type { NextFunction, Request, Response } from 'express';

import { broadcastService, type ComposeInput } from '../services/broadcastService';
import { NotFoundError, RateLimitedError, ValidationError } from '../services/serviceErrors';
import { renderNotFound } from '../lib/controllerErrors';
import { isOwnMemberRoute } from '../lib/routeOwnership';

function composeInputFromBody(body: Record<string, unknown>): ComposeInput {
  return {
    subject: typeof body.subject === 'string' ? body.subject : '',
    bodyText: typeof body.bodyText === 'string' ? body.bodyText : '',
    sendToken: typeof body.sendToken === 'string' ? body.sendToken : '',
  };
}

export const memberAnnounceController = {
  /** GET /members/:memberKey/announce */
  getForm(req: Request, res: Response, next: NextFunction): void {
    if (!isOwnMemberRoute(req)) {
      renderNotFound(res);
      return;
    }
    try {
      const notice = typeof req.query.notice === 'string' ? req.query.notice : undefined;
      const vm = broadcastService.getAnnouncePage(String(req.params.memberKey), { notice });
      if (!vm) {
        renderNotFound(res);
        return;
      }
      res.render('members/announce', vm);
    } catch (err) {
      next(err);
    }
  },

  /** POST /members/:memberKey/announce */
  postSend(req: Request, res: Response, next: NextFunction): void {
    if (!isOwnMemberRoute(req)) {
      renderNotFound(res);
      return;
    }
    const memberKey = String(req.params.memberKey);
    const input = composeInputFromBody(req.body as Record<string, unknown>);

    try {
      const outcome = broadcastService.sendAnnouncement(input, req.user!.userId);
      const notice = outcome.status === 'sent' ? 'sent' : outcome.reason;
      res.redirect(303, `/members/${memberKey}/announce?notice=${notice}`);
    } catch (err) {
      if (err instanceof RateLimitedError) {
        res.set('Retry-After', String(err.retryAfterSeconds));
        res.status(429).render(
          'members/announce',
          broadcastService.getAnnouncePage(memberKey, {
            submitted: input,
            fieldErrors: { subject: err.message },
          })!,
        );
        return;
      }
      if (err instanceof ValidationError) {
        const vm = broadcastService.getAnnouncePage(memberKey, {
          submitted: input,
          fieldErrors: err.fieldErrors ?? { subject: err.message },
        });
        if (!vm) {
          renderNotFound(res);
          return;
        }
        res.status(422).render('members/announce', vm);
        return;
      }
      if (err instanceof NotFoundError) {
        renderNotFound(res);
        return;
      }
      next(err);
    }
  },
};
