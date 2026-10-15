/**
 * A member's email preferences, from both directions.
 *
 * The one-click unsubscribe endpoint is fired by a mail client from the
 * `List-Unsubscribe` headers on a bulk message, with no session and no Origin
 * header, so the signed token in the query string is the whole of the
 * authority. RFC 8058 wants a POST and a 2xx; the mail client reads the status
 * and shows its own confirmation. A client without one-click opens the same
 * address as a link instead, so the GET renders a page with one button that
 * posts it, and that page's POST answers with a page rather than JSON. The GET
 * changes nothing: link scanners open it too.
 *
 * The subscription screen is the signed-in half. The member is taken from the
 * session and the path's member key must be their own, so the route can only
 * ever read or change the caller's own subscriptions; a mismatch is a 404
 * rather than a 403, so the path cannot be used to discover which member slugs
 * exist. The recovery route on the same screen is the member's way back after
 * their address bounced, under the same ownership check.
 */
import { Request, Response, NextFunction } from 'express';
import { emailSubscriptionService, type UnsubscribeContent } from '../services/emailSubscriptionService';
import { UNSUBSCRIBE_PATH } from '../services/communicationService';
import { PageViewModel } from '../types/page';
import { identityAccessService } from '../services/identityAccessService';
import { NotFoundError, RateLimitedError, ValidationError } from '../services/serviceErrors';
import { handleControllerError, renderNotFound } from '../lib/controllerErrors';
import { isOwnMemberRoute } from '../lib/routeOwnership';
import { FLASH_KIND, takeFlash, writeFlash } from '../lib/flashCookie';

/** The unsubscribe address carries its token in the query string, so neither
 *  a browser nor a shared proxy may keep the page. */
function setNoStore(res: Response): void {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
}

export const emailPreferenceController = {
  postOneClickUnsubscribe(req: Request, res: Response, next: NextFunction): void {
    try {
      const token = typeof req.query.t === 'string' ? req.query.t : '';
      const outcome = emailSubscriptionService.unsubscribeByToken(token);
      // Every outcome answers the mail client alike. A mail provider learns
      // nothing about whether an address, a member, or a subscription exists, so
      // the endpoint cannot be turned into a membership probe, and a client that
      // fires twice sees the same success both times.
      if (req.body?.confirm === '1') {
        // The button on the page the link opened: a person is reading, so the
        // outcome is shown as a page, a refused link included.
        setNoStore(res);
        res.render('email/unsubscribe', emailSubscriptionService.getUnsubscribeOutcomePage(outcome));
        return;
      }
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  },

  /** GET /email/unsubscribe?t=...
   *  The address a mail client without one-click opens as a link. One button
   *  posts it; the GET itself changes nothing and reveals nothing about the
   *  token. */
  getUnsubscribe(req: Request, res: Response): void {
    const token = typeof req.query.t === 'string' ? req.query.t : '';
    setNoStore(res);
    res.render('email/unsubscribe', {
      seo: { title: 'Unsubscribe', noindex: true },
      page: { sectionKey: '', pageKey: 'email_unsubscribe', title: 'Unsubscribe' },
      content: { done: false, actionHref: `${UNSUBSCRIBE_PATH}?t=${encodeURIComponent(token)}` },
    } satisfies PageViewModel<UnsubscribeContent>);
  },

  /** GET /members/:memberKey/email-preferences */
  getSubscriptions(req: Request, res: Response, next: NextFunction): void {
    if (!isOwnMemberRoute(req)) {
      renderNotFound(res);
      return;
    }
    try {
      const memberKey = String(req.params.memberKey);
      const notice = takeFlash(req, res, FLASH_KIND.EMAIL_PREFERENCE_RESULT) ?? undefined;
      res.render(
        'members/email-preferences',
        emailSubscriptionService.getSubscriptionsPage(memberKey, req.user!.userId, { notice }),
      );
    } catch (err) {
      next(err);
    }
  },

  /** POST /members/:memberKey/email-preferences */
  async postSubscription(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!isOwnMemberRoute(req)) {
      renderNotFound(res);
      return;
    }
    const memberKey = String(req.params.memberKey);
    const body = req.body as Record<string, unknown>;
    const slug = typeof body.slug === 'string' ? body.slug : '';
    const subscribe = body.subscribe === '1';

    try {
      const outcome = await emailSubscriptionService.setOwnSubscription(req.user!.userId, slug, subscribe);
      const notice = outcome.status === 'noop' ? outcome.reason : outcome.status;
      writeFlash(res, req, FLASH_KIND.EMAIL_PREFERENCE_RESULT, notice);
      res.redirect(303, `/members/${memberKey}/email-preferences`);
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
      handleControllerError(err, res, next, 'email preference controller');
    }
  },

  /** POST /members/:memberKey/email-preferences/recover */
  async postRecover(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!isOwnMemberRoute(req)) {
      renderNotFound(res);
      return;
    }
    const memberKey = String(req.params.memberKey);
    const memberId = req.user!.userId;
    try {
      const outcome = await identityAccessService.requestAddressRecovery(memberId);
      const notice = outcome.status === 'sent' ? 'recovery_sent' : 'recovery_unneeded';
      writeFlash(res, req, FLASH_KIND.EMAIL_PREFERENCE_RESULT, notice);
      res.redirect(303, `/members/${memberKey}/email-preferences`);
    } catch (err) {
      if (err instanceof ValidationError || err instanceof RateLimitedError) {
        if (err instanceof RateLimitedError && err.retryAfterSeconds !== undefined) {
          res.set('Retry-After', String(err.retryAfterSeconds));
        }
        res.status(err instanceof RateLimitedError ? 429 : 422).render(
          'members/email-preferences',
          emailSubscriptionService.getSubscriptionsPage(memberKey, memberId, {
            errorMessage: err.message,
          }),
        );
        return;
      }
      handleControllerError(err, res, next, 'email preference controller');
    }
  },
};
