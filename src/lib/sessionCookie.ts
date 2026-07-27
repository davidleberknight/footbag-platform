/**
 * Shared HTTP-layer helper for setting the session cookies. Centralizes the
 * cookie-option block (httpOnly, sameSite, maxAge, secure detection) so
 * cookie-attribute changes happen in one place. Also marks the response
 * no-store: a response that carries Set-Cookie must never be stored by a
 * browser or shared cache, otherwise one member's session could be replayed
 * to another. This covers the unauthenticated entry points (login, email
 * verify, password reset) that the request-level no-store middleware misses
 * because the request itself is not yet authenticated.
 *
 * Where a deployment configures an archive cookie signer, every issue also
 * mints the three CloudFront-* cookies the archive edge validates, scoped by
 * a custom policy to the archive base URL with expiry equal to the session
 * cookie's, so archive access and main-site access share one staleness
 * boundary. Clearing removes ALL FOUR with matching attributes: a signed-out
 * member on a shared machine must not retain working archive access for the
 * rest of the policy lifetime.
 */
import { Request, Response } from 'express';
import {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_MAX_AGE_MS,
} from '../middleware/auth';
import { config } from '../config/env';
import { getCloudFrontSigningAdapter } from '../adapters/cloudFrontSigningAdapter';

const ARCHIVE_COOKIE_NAMES = [
  'CloudFront-Policy',
  'CloudFront-Signature',
  'CloudFront-Key-Pair-Id',
] as const;

function isSecureRequest(req: Request): boolean {
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}

export function issueSessionCookie(
  res: Response,
  cookieValue: string,
  req: Request,
): void {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  const secure = isSecureRequest(req);
  res.cookie(SESSION_COOKIE_NAME, cookieValue, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_COOKIE_MAX_AGE_MS,
    secure,
  });

  const signer = getCloudFrontSigningAdapter();
  if (signer && config.archiveUrl) {
    const expiresEpochSeconds = Math.floor(
      (Date.now() + SESSION_COOKIE_MAX_AGE_MS) / 1000,
    );
    const values = signer.signArchiveCookies(
      `${config.archiveUrl}/*`,
      expiresEpochSeconds,
    );
    const archiveOpts = {
      httpOnly: true,
      sameSite: 'lax' as const,
      maxAge: SESSION_COOKIE_MAX_AGE_MS,
      secure,
      ...(config.archiveCookieDomain ? { domain: config.archiveCookieDomain } : {}),
    };
    res.cookie('CloudFront-Policy', values.policy, archiveOpts);
    res.cookie('CloudFront-Signature', values.signature, archiveOpts);
    res.cookie('CloudFront-Key-Pair-Id', values.keyPairId, archiveOpts);
  }
}

/**
 * Clear the session cookies with attributes matching the ones they were set
 * with. RFC 6265-strict browsers (and proxies that enforce attribute parity
 * on clear) silently ignore a clear whose secure/sameSite/domain do not
 * match the set, leaving the cookie alive until natural expiry.
 */
export function clearSessionCookie(res: Response, req: Request): void {
  const secure = isSecureRequest(req);
  res.clearCookie(SESSION_COOKIE_NAME, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
  });
  if (config.archiveCookieSigner && config.archiveUrl) {
    const archiveOpts = {
      path: '/',
      httpOnly: true,
      sameSite: 'lax' as const,
      secure,
      ...(config.archiveCookieDomain ? { domain: config.archiveCookieDomain } : {}),
    };
    for (const name of ARCHIVE_COOKIE_NAMES) {
      res.clearCookie(name, archiveOpts);
    }
  }
}
