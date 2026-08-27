import { Request, Response, NextFunction } from 'express';
import {
  hasTier1Benefits,
  mayCreateClub,
  isTier2Plus,
  isTier3,
} from '../services/tierPredicates';
import { buildTierBenefitNotice, TierBenefitKind } from '../services/tierBenefitNotice';
import { renderForbidden, renderTierBenefitRequired } from '../lib/controllerErrors';

/**
 * Tier-based authz gates. Require `requireAuth` to have run first so
 * `req.user` is populated. Renders 403 for under-tiered authenticated
 * users and for unauthenticated requests that bypass `requireAuth`
 * (defensive). No 401 redirect: the user is authenticated, just under-
 * tiered, and a redirect would loop.
 *
 * The predicate reads from the DB on every request; no cached check.
 *
 * A Tier 1 benefits refusal names the benefit and how to earn it, because the
 * member is one qualifying event or one upgrade away from the feature and a
 * bare "no permission" tells them none of that. The Tier 2 and Tier 3 gates
 * keep the generic refusal: those tiers are bought, and every surface behind
 * them already states what it costs. The unauthenticated branch keeps it too,
 * because a caller with no session needs the sign-in control rather than being
 * told what an account we cannot identify is missing.
 */
function deny(res: Response): void {
  renderForbidden(res);
}

function makeRequireTier(
  predicate: (memberId: string) => boolean,
  benefit: TierBenefitKind | null,
) {
  return function requireTier(req: Request, res: Response, next: NextFunction): void {
    if (!req.user) {
      deny(res);
      return;
    }
    if (!predicate(req.user.userId)) {
      if (benefit === null) {
        deny(res);
        return;
      }
      renderTierBenefitRequired(res, buildTierBenefitNotice(req.user.slug, benefit));
      return;
    }
    next();
  };
}

export function requireTier1Benefits(benefit: TierBenefitKind = 'general') {
  return makeRequireTier(hasTier1Benefits, benefit);
}

export function requireMayCreateClub(benefit: TierBenefitKind = 'club') {
  return makeRequireTier(mayCreateClub, benefit);
}

export function requireTier2Plus() {
  return makeRequireTier(isTier2Plus, null);
}

export function requireTier3() {
  return makeRequireTier(isTier3, null);
}
