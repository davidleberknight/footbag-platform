import { Request, Response, NextFunction } from 'express';
import { auth as authDb } from '../db/db';
import { getJwtSigningAdapter } from '../adapters/jwtSigningAdapter';
import { createSessionJwt } from '../services/jwtService';
import { issueSessionCookie } from '../lib/sessionCookie';

export const SESSION_COOKIE_NAME = 'footbag_session';
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
    req.user = null;

    const cookie = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
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
