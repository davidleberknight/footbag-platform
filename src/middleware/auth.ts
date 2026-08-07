import { Request, Response, NextFunction } from 'express';
import { auth as authDb } from '../db/db';
import { getJwtSigningAdapter } from '../adapters/jwtSigningAdapter';
import { createSessionJwt } from '../services/jwtService';
import { issueSessionCookie } from '../lib/sessionCookie';
import { memberOnboardingService } from '../services/memberOnboardingService';

/**
 * The `__Host-` prefix is enforced by the browser rather than by the server: a
 * cookie so named is discarded unless it carries Secure, carries no Domain
 * attribute, and has Path=/. That is the protection host-only scope cannot
 * supply on its own, because cookie scope is evaluated against a request's
 * destination host and not against whoever set the cookie, and because the
 * Cookie request header carries only name and value, so the application cannot
 * tell a cookie it set from one another host planted. Without the prefix, any
 * other footbag.org name, including one still served by another operator, can
 * set a parent-domain cookie of this name that shadows the real session and
 * silently substitutes its own identity for the member's.
 *
 * The name is unconditional, and only this name is ever read. Browsers exempt
 * localhost from the HTTPS requirement for Secure cookies, so the prefixed name
 * works in local development as well, and there is no transport on which a
 * second name would be needed. Deciding the name from the request or the
 * environment would be fail-open: the moment that signal was lost the
 * application would silently accept the shadowing cookie again.
 */
export const SESSION_COOKIE_NAME = '__Host-footbag_session';

export const SESSION_COOKIE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface SessionUser {
  userId: string;
  slug: string;
  role: string;
  displayName?: string;
}

declare global {
  namespace Express {
    interface Request {
      isAuthenticated: boolean;
      // Membership is an authorization level above authentication: an account
      // is pending from registration until every onboarding task completes,
      // and a pending registrant holds a session but no member authorization.
      // True only when the session belongs to a member whose onboarding is
      // complete; auth-enhanced surfaces key member privileges off this, so a
      // pending registrant reads public pages as an anonymous visitor.
      isMember: boolean;
      user: SessionUser | null;
    }
  }
}

interface SessionMemberRow {
  id: string;
  slug: string | null;
  display_name: string | null;
  password_version: number;
  is_admin: number;
}

/**
 * Sliding-session refresh window: when a verified token is within this many
 * seconds of expiry, the middleware re-issues a fresh 24-hour token on the
 * same response. No refresh tokens exist; a token allowed to expire is not
 * renewed and the next request lands unauthenticated.
 */
export const SESSION_REFRESH_WINDOW_SECONDS = 6 * 60 * 60;

export function authMiddleware() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    req.isAuthenticated = false;
    req.isMember = false;
    req.user = null;

    const cookie = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
    // Removing this early return changes no outcome: a request with no cookie
    // that falls through verifies an absent token, gets nothing back, and ends
    // unauthenticated by the next guard or by the catch below. Mutation runs
    // otherwise spend the whole suite twice over proving that. The negated
    // condition on this line stays enabled and still proves the guard is live.
    // Stryker disable next-line BlockStatement,ConditionalExpression: falling through ends unauthenticated too, so no assertion can tell the difference
    if (!cookie) {
      next();
      return;
    }

    try {
      const claims = await getJwtSigningAdapter().verifyJwt(cookie);
      if (!claims) {
        next();
        return;
      }

      const row = authDb.findMemberForSession.get(claims.sub) as
        | SessionMemberRow
        | undefined;
      if (!row) {
        next();
        return;
      }

      if (row.password_version !== claims.passwordVersion) {
        next();
        return;
      }

      req.isAuthenticated = true;
      // Authorization level, not identity: pending until every onboarding task
      // completes, member afterwards. Derived fresh per request from the task
      // rows so a session issued mid-onboarding gains membership the moment
      // the completion transition lands, with no re-login.
      req.isMember = memberOnboardingService.isOnboardingComplete(row.id);
      req.user = {
        userId: row.id,
        slug: row.slug ?? row.id,
        // Authz role is derived strictly from the current DB row, never
        // from JWT claims. A stale admin-role JWT issued before demotion
        // must not grant admin privileges after `is_admin` is cleared.
        // `claims.role` stays in the token for audit logs but is not used
        // for authorization decisions.
        role: row.is_admin ? 'admin' : 'member',
        displayName: row.display_name ?? undefined,
      };

      // Sliding refresh: an active member near expiry gets a fresh token in
      // place. Failures here never break the request — the current token is
      // still valid; the next in-window request retries the refresh.
      const secondsToExpiry = claims.exp - Math.floor(Date.now() / 1000);
      if (secondsToExpiry > 0 && secondsToExpiry <= SESSION_REFRESH_WINDOW_SECONDS) {
        try {
          const fresh = await createSessionJwt(
            row.id,
            row.is_admin ? 'admin' : 'member',
            row.password_version,
          );
          issueSessionCookie(res, fresh, req);
        } catch {
          // Signing hiccup (KMS blip): keep serving on the still-valid token.
        }
      }

      next();
    } catch {
      // Malformed / unverifiable cookie: treat as unauthenticated, not as a
      // server error. The legitimate path for a stale or corrupt cookie is
      // "not logged in"; routing a 500 through next(err) here gave users a
      // confusing Service Unavailable page on what is really a session issue.
      next();
    }
  };
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.isAuthenticated) {
    res.redirect(`/login?returnTo=${encodeURIComponent(req.originalUrl)}`);
    return;
  }
  next();
}

/**
 * Member-capability route guard. An account is pending from registration until
 * every onboarding task completes; a pending registrant holds a session but no
 * member authorization, so every member-capability route requires this guard
 * and a pending request is routed to its next outstanding wizard task. Bare
 * requireAuth remains only on the surfaces a pending registrant legitimately
 * uses: the wizard routes and the historical-record claim routes (claiming is
 * part of finishing onboarding). A conformance test pins that allowlist.
 */
export function requireMember(req: Request, res: Response, next: NextFunction): void {
  if (!req.isAuthenticated) {
    res.redirect(`/login?returnTo=${encodeURIComponent(req.originalUrl)}`);
    return;
  }
  if (!req.isMember) {
    res.redirect(303, nextPendingWizardHref(req.user!.userId));
    return;
  }
  next();
}

/**
 * The pending registrant's next stop. With nothing outstanding, route to the
 * wizard complete page, which re-checks and redirects onward if a task is in
 * fact still pending; falling back to a specific task here would loop if that
 * task were ever non-completable.
 */
export function nextPendingWizardHref(memberId: string): string {
  const next = memberOnboardingService.nextOutstandingTaskType(memberId);
  return next ? `/register/wizard/${next}` : '/register/wizard/complete';
}
