import { Request, Response, NextFunction } from 'express';
import { auth as authDb } from '../db/db';
import { getJwtSigningAdapter } from '../adapters/jwtSigningAdapter';
import { config } from '../config/env';
// CUTOVER-REMOVE: dev/staging autologin shortcut.
// Current: applyDevAutologin is active only when FOOTBAG_DEV_AUTOLOGIN_MEMBER_ID
//   is set and footbagEnv === 'development'; env-config blocks the flag in
//   any non-dev environment.
// Target: remove this import and the autologin branch in authMiddleware()
//   at production go-live.
import { applyDevAutologin } from '../dev-shortcuts/runtime';

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

export function authMiddleware() {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    req.isAuthenticated = false;
    req.user = null;

    // CUTOVER-REMOVE: dev-only autologin path.
    // Current: when FOOTBAG_DEV_AUTOLOGIN_MEMBER_ID is set and
    //   footbagEnv === 'development', the cookie path is skipped entirely so
    //   a stale cookie cannot silently authenticate as a different member
    //   than the configured autologin.
    // Target: remove this block and the applyDevAutologin import before
    //   production launch.
    const autologinAttempted =
      config.footbagEnv === 'development' &&
      config.devAutologinMemberId !== undefined;
    if (applyDevAutologin(req)) {
      next();
      return;
    }
    if (autologinAttempted) {
      next();
      return;
    }

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
