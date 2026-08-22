import { Request, Response, NextFunction } from 'express';
import { memberActionService } from '../services/memberActionService';

/**
 * The cross-page banner for the member's action block.
 *
 * A member holding a needs-attention-now obligation gets one compact line on
 * every member-facing page, linking back to their own profile, where the block
 * itself carries the detail and the controls. It is deliberately absent on that
 * profile: the block is right there, and repeating it would say the same thing
 * twice on one page.
 *
 * Nothing is stored for this. The obligations are worked out on the page draw,
 * which is also why the banner can never go stale: it stops appearing the
 * moment the record behind the item changes.
 *
 * A member holding only obligations that can wait sees the block and no banner.
 */
export function memberActionBanner(req: Request, res: Response, next: NextFunction): void {
  const user = req.user;
  // Membership, not authentication. A pending registrant is not yet a member
  // and can hold none of these obligations; every capability route bounces them
  // to their next wizard task anyway.
  if (!req.isMember || !user?.slug) {
    next();
    return;
  }
  // Express matches routes without strict slash handling, so the member's own
  // profile is served at both `/members/<slug>` and `/members/<slug>/`. Testing
  // the raw path would leave the trailing-slash form drawing the banner directly
  // above the block it points at, which is the one place it must not appear.
  const path = req.path.length > 1 ? req.path.replace(/\/+$/, '') : req.path;
  if (path === `/members/${user.slug}`) {
    next();
    return;
  }
  const actions = memberActionService.collectFor({ memberId: user.userId, slug: user.slug });
  if (!actions.hasUrgent) {
    next();
    return;
  }
  res.locals.memberActionBanner = {
    href: `/members/${user.slug}`,
    // The banner carries no item detail: one member can hold several, and the
    // line has to be true for all of them. The block behind the link is where
    // each obligation says what it is.
    label: actions.urgentItems.length === 1
      ? 'Something needs your attention.'
      : `${actions.urgentItems.length} things need your attention.`,
    linkLabel: 'Go to My Profile',
  };
  next();
}
