/**
 * A member's email preferences, from both directions.
 *
 * The one-click unsubscribe endpoint is fired by a mail client from the
 * `List-Unsubscribe` headers on a bulk message, with no session and no Origin
 * header, so the signed token in the query string is the whole of the
 * authority. RFC 8058 wants a POST and a 2xx; the mail client reads the status
 * and shows its own confirmation, so there is no page to render.
 *
 * The subscription screen is the signed-in half. The member is taken from the
 * session and the path's member key must be their own, so the route can only
 * ever read or change the caller's own subscriptions; a mismatch is a 404
 * rather than a 403, so the path cannot be used to discover which member slugs
 * exist.
 */
import { Request, Response, NextFunction } from 'express';
import { emailSubscriptionService } from '../services/emailSubscriptionService';
import { NotFoundError, ValidationError } from '../services/serviceErrors';
import { renderNotFound } from '../lib/controllerErrors';
import { isOwnMemberRoute } from '../lib/routeOwnership';

export const emailPreferenceController = {
  postOneClickUnsubscribe(req: Request, res: Response, next: NextFunction): void {
    try {
      const token = typeof req.query.t === 'string' ? req.query.t : '';
      emailSubscriptionService.unsubscribeByToken(token);
      // Every outcome answers alike. A mail provider learns nothing about
      // whether an address, a member, or a subscription exists, so the endpoint
      // cannot be turned into a membership probe, and a client that fires twice
      // sees the same success both times.
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  },

  /** GET /members/:memberKey/email-preferences */
  getSubscriptions(req: Request, res: Response, next: NextFunction): void {
    if (!isOwnMemberRoute(req)) {
      renderNotFound(res);
      return;
    }
    try {
      const memberKey = String(req.params.memberKey);
      const notice = typeof req.query.notice === 'string' ? req.query.notice : undefined;
      res.render(
        'members/email-preferences',
        emailSubscriptionService.getSubscriptionsPage(memberKey, req.user!.userId, { notice }),
      );
    } catch (err) {
      next(err);
    }
  },

  /** POST /members/:memberKey/email-preferences */
  postSubscription(req: Request, res: Response, next: NextFunction): void {
    if (!isOwnMemberRoute(req)) {
      renderNotFound(res);
      return;
    }
    const memberKey = String(req.params.memberKey);
    const body = req.body as Record<string, unknown>;
    const slug = typeof body.slug === 'string' ? body.slug : '';
    const subscribe = body.subscribe === '1';

    try {
      const outcome = emailSubscriptionService.setOwnSubscription(req.user!.userId, slug, subscribe);
      const notice = outcome.status === 'noop' ? outcome.reason : outcome.status;
      res.redirect(303, `/members/${memberKey}/email-preferences?notice=${notice}`);
    } catch (err) {
      if (err instanceof NotFoundError) {
        renderNotFound(res);
        return;
      }
      if (err instanceof ValidationError) {
        // The member and their page are both real; only the choice was wrong.
        // Re-rendering the screen with the reason keeps them where they were
        // rather than dropping them on an error page.
        res.status(422).render(
          'members/email-preferences',
          emailSubscriptionService.getSubscriptionsPage(memberKey, req.user!.userId, {
            errorMessage: err.message,
          }),
        );
        return;
      }
      next(err);
    }
  },
};
