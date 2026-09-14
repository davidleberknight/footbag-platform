/**
 * The Active Player vouch a Tier 2 or Tier 3 member gives from the profile of
 * the member it is for.
 *
 * This is the one `/members/:memberKey` route whose key is somebody else: the
 * path names the target, the signed-in member is the voucher, and the ownership
 * check is therefore inverted. A member's own profile renders the owner page,
 * which carries no vouch control, so a vouch for yourself exists only as a
 * crafted request and is answered 404 rather than 403, keeping the path useless
 * for discovering which member slugs exist.
 *
 * The send follows post-redirect-get, with the outcome travelling to the
 * profile as a code in the flash cookie. Hitting the per-voucher limit answers
 * 429 with Retry-After, which the error handler would otherwise turn into a
 * 500.
 */
import type { NextFunction, Request, Response } from 'express';

import { memberService } from '../services/memberService';
import { RateLimitedError } from '../services/serviceErrors';
import { handleControllerError, renderNotFound } from '../lib/controllerErrors';
import { isOwnMemberRoute } from '../lib/routeOwnership';
import { FLASH_KIND, writeFlash } from '../lib/flashCookie';

export const memberVouchController = {
  /** POST /members/:memberKey/vouch */
  postVouch(req: Request, res: Response, next: NextFunction): void {
    if (isOwnMemberRoute(req)) {
      renderNotFound(res);
      return;
    }
    const targetKey = String(req.params.memberKey);
    try {
      const outcome = memberService.vouchForActivePlayer(req.user!.userId, targetKey);
      writeFlash(res, req, FLASH_KIND.VOUCH_RESULT, outcome);
      res.redirect(303, `/members/${encodeURIComponent(targetKey)}`);
    } catch (err) {
      if (err instanceof RateLimitedError) {
        res.set('Retry-After', String(err.retryAfterSeconds));
        const vm = memberService.getMemberProfilePage(
          targetKey,
          { authenticated: true, admin: req.user?.role === 'admin', memberId: req.user!.userId },
          { vouchOutcome: 'rate_limited' },
        );
        if (!vm) {
          renderNotFound(res);
          return;
        }
        res.status(429).render('members/public-profile', vm);
        return;
      }
      handleControllerError(err, res, next, 'member vouch controller');
    }
  },
};
