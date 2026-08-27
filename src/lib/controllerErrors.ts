import { NextFunction, Response } from 'express';
import { NotFoundError, ServiceUnavailableError, ValidationError } from '../services/serviceErrors';
import { logger } from '../config/logger';
import { ErrorPageContent, NavLink, PageViewModel, TierBenefitNotice } from '../types/page';

/**
 * Every error surface on the site renders one template through these helpers.
 * Routes never build the error view-model themselves: a hand-written render is
 * how a response answering 422 came to display "404" and tell the visitor their
 * link was no longer routable. Here the digit is derived from the status the
 * response is given, so the two cannot drift apart.
 *
 * Each page offers a single control home. An error page is a dead end by
 * definition, and the one destination guaranteed to work is the front door.
 */

const HOME_ACTION: NavLink = { label: 'Go to Home', href: '/' };
const SIGN_IN_ACTION: NavLink = { label: 'Sign In', href: '/login' };

function renderErrorPage(
  res: Response,
  statusCode: number,
  title: string,
  paragraphs: string[],
  actions: NavLink[] = [HOME_ACTION],
): void {
  res.status(statusCode).render('errors/error', {
    seo:  { title },
    page: { sectionKey: '', pageKey: `error_${statusCode}`, title },
    content: { statusCode, paragraphs, actions },
  } satisfies PageViewModel<ErrorPageContent>);
}

/**
 * The 404 page, and the anti-enumeration answer for an owner-only route whose
 * slug does not match the caller. The second paragraph is aimed at a visitor
 * following a link from the old footbag.org, whose URL space this site does not
 * carry forward.
 */
export function renderNotFound(res: Response, opts: { title?: string } = {}): void {
  renderErrorPage(res, 404, opts.title ?? 'Page Not Found', [
    'This page does not exist on footbag.org.',
    'If you followed a link from the old footbag.org, that link is no longer routable. Please check out the new website.',
  ]);
}

/**
 * An authorization refusal. Where the caller is refused because they have no
 * session, an expired cookie among them, the useful next step is signing in
 * rather than the front door, so the control says so.
 *
 * The test is deliberately `=== false`, not falsy. The auth middleware sets the
 * flag to a real boolean, so `undefined` means the refusal happened at the
 * perimeter before authentication ran: a cross-origin request refused there is
 * a request-integrity failure, not a missing session, and offering a signed-in
 * caller a sign-in control would be a control that lies.
 */
export function renderForbidden(res: Response): void {
  const signedOut = res.locals.isAuthenticated === false;
  renderErrorPage(
    res,
    403,
    'Forbidden',
    [signedOut
      ? 'You need to be signed in to view this page.'
      : "You don't have permission to view this page."],
    [signedOut ? SIGN_IN_ACTION : HOME_ACTION],
  );
}

/**
 * The refusal a member meets on a form that a benefit they do not hold stands
 * behind. It answers the same 403 as the generic refusal and carries the same
 * one error template, but it names the benefit and what unlocks it, because a
 * member one purchase away from the feature learns nothing from being told they
 * lack permission. The single control stands: an error page still offers one
 * destination, and here the useful one is the route to the benefit rather than
 * the front door.
 */
export function renderTierBenefitRequired(res: Response, notice: TierBenefitNotice): void {
  renderErrorPage(
    res,
    403,
    'Tier 1 Benefit Required',
    [notice.lead, notice.explanation],
    [{ label: notice.upgradeLabel, href: notice.upgradeHref }],
  );
}

/**
 * A state-changing action that cannot apply because the target is already in
 * its terminal state. The title names the specific conflict.
 */
export function renderConflict(res: Response, opts: { title: string }): void {
  renderErrorPage(res, 409, opts.title, [
    'This action could not be applied because it conflicts with the current state.',
  ]);
}

/**
 * A request the caller can fix, on a surface with no inline re-render path.
 * Answers 422 by convention; the internal QC tooling answers 400 for a
 * malformed query string, which is a request-shape fault rather than a
 * validation failure on submitted values. `backHref` returns the caller to the
 * surface they came from, which beats the front door when one is known.
 */
export function renderInvalidRequest(
  res: Response,
  opts: { title: string; statusCode?: 400 | 422; message?: string; backHref?: string },
): void {
  renderErrorPage(
    res,
    opts.statusCode ?? 422,
    opts.title,
    opts.message ? [opts.message] : [],
    opts.backHref ? [{ label: 'Go Back', href: opts.backHref }] : undefined,
  );
}

/**
 * A throttle hit rendered as a page. Callers set `Retry-After` from the error's
 * `retryAfterSeconds` before calling this.
 */
export function renderRateLimited(res: Response, opts: { title: string }): void {
  renderErrorPage(res, 429, opts.title, []);
}

/**
 * Render the service-unavailable page directly. Used by controllers that catch
 * an image-worker / external-adapter failure and need to surface a truthful 503
 * rather than delegate to the generic 500 error middleware, which cannot
 * distinguish a dependency outage from an unexpected exception.
 */
export function renderServiceUnavailable(res: Response, statusCode: 500 | 503 = 503): void {
  renderErrorPage(res, statusCode, 'Service Unavailable', [
    'The site is temporarily unavailable. Please try again in a moment.',
  ]);
}

/**
 * Map a service-layer error to an HTTP response. Renders 404 for
 * NotFoundError / ValidationError, 503 for ServiceUnavailableError, and
 * delegates everything else to the Express error middleware via next(err).
 *
 * ValidationError intentionally renders 404 on public pages so validation
 * detail is never leaked to visitors.
 */
export function handleControllerError(
  err: unknown,
  res: Response,
  next: NextFunction,
  context: string,
): void {
  if (err instanceof NotFoundError || err instanceof ValidationError) {
    renderNotFound(res);
    return;
  }
  if (err instanceof ServiceUnavailableError) {
    renderServiceUnavailable(res);
    return;
  }
  logger.error(`unexpected error in ${context}`, {
    error: err instanceof Error ? err.message : String(err),
  });
  next(err);
}
