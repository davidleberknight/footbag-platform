import { Request, Response, NextFunction } from 'express';
import {
  hasTier1Benefits,
  isTier2Plus,
  isTier3,
} from '../services/tierPredicates';

/**
 * Tier-based authz gates. Require `requireAuth` to have run first so
 * `req.user` is populated. Renders 403 for under-tiered authenticated
 * users and for unauthenticated requests that bypass `requireAuth`
 * (defensive). No 401 redirect: the user is authenticated, just under-
 * tiered, and a redirect would loop.
 *
 * The predicate reads from the DB on every request; no cached check.
 */
function deny(res: Response): void {
  res.status(403).render('errors/forbidden', {
    seo: { title: 'Forbidden' },
    page: { sectionKey: '', pageKey: 'error_403', title: 'Forbidden' },
  });
}

function makeRequireTier(predicate: (memberId: string) => boolean) {
  return function requireTier(req: Request, res: Response, next: NextFunction): void {
    if (!req.user) {
      deny(res);
      return;
    }
    if (!predicate(req.user.userId)) {
      deny(res);
      return;
    }
    next();
  };
}

export function requireTier1Benefits() {
  return makeRequireTier(hasTier1Benefits);
}

export function requireTier2Plus() {
  return makeRequireTier(isTier2Plus);
}

export function requireTier3() {
  return makeRequireTier(isTier3);
}
