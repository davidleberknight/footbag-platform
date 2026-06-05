/**
 * Shared HTTP-layer helper for setting the session JWT cookie. Centralizes
 * the cookie-option block (httpOnly, sameSite, maxAge, secure detection)
 * so cookie-attribute changes happen in one place. Also marks the response
 * no-store: a response that carries Set-Cookie must never be stored by a
 * browser or shared cache, otherwise one member's session could be replayed
 * to another. This covers the unauthenticated entry points (login, email
 * verify, password reset) that the request-level no-store middleware misses
 * because the request itself is not yet authenticated.
 */
import { Request, Response } from 'express';
import {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_MAX_AGE_MS,
} from '../middleware/auth';

export function issueSessionCookie(
  res: Response,
  cookieValue: string,
  req: Request,
): void {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.cookie(SESSION_COOKIE_NAME, cookieValue, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_COOKIE_MAX_AGE_MS,
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
  });
}

/**
 * Clear the session cookie with attributes matching the ones it was set
 * with. RFC 6265-strict browsers (and proxies that enforce attribute parity
 * on clear) silently ignore a clear whose secure/sameSite do not match the
 * set, leaving the cookie alive until natural expiry.
 */
export function clearSessionCookie(res: Response, req: Request): void {
  res.clearCookie(SESSION_COOKIE_NAME, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
  });
}
