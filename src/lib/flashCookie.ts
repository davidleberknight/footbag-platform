/**
 * Shared HTTP-layer helper for signed flash cookies. Centralizes the cookie
 * name, value format, and signed-cookie options so policy changes happen in
 * one place. Cookie integrity is signed with SESSION_SECRET.
 *
 * Value format: `<kind>` or `<kind>:<payload>`. Payload may contain additional
 * colons; the reader splits on the first colon only.
 */
import { Request, Response } from 'express';

export const FLASH_COOKIE = 'footbag_flash';

export const FLASH_KIND = {
  LOGOUT: 'logout',
  AVATAR_UPLOADED: 'avatar_uploaded',
  WIZARD_LEGACY_CLAIM_RESULT: 'wizard_legacy_claim_result',
  WIZARD_AUTO_LINK_DRIFT: 'wizard_auto_link_drift',
  WIZARD_CLUB_CARD_RESOLVED: 'wizard_club_card_resolved',
  MEDIA_SAVED: 'media_saved',
  CONTACT_SUBMITTED: 'contact_submitted',
  WORK_QUEUE_RESOLVED: 'work_queue_resolved',
  CLUB_ACTION: 'club_action',
  PROFILE_UPDATED: 'profile_updated',
  // Stub-only: carries the just-registered recipient email across the
  // register/resend POST->303->GET so the simulated-email dev card can scope
  // to that recipient and never show another pending user's verify token.
  VERIFY_EMAIL_PENDING: 'verify_email_pending',
} as const;
export type FlashKind = (typeof FLASH_KIND)[keyof typeof FLASH_KIND];

const FLASH_MAX_AGE_MS = 60_000;

export function writeFlash(
  res: Response,
  req: Request,
  kind: FlashKind,
  payload?: string,
): void {
  const value = payload ? `${kind}:${payload}` : kind;
  res.cookie(FLASH_COOKIE, value, {
    maxAge: FLASH_MAX_AGE_MS,
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
    path: '/',
    signed: true,
  });
}

const FLASH_KIND_VALUES = new Set<string>(Object.values(FLASH_KIND));

export function readFlash(
  req: Request,
): { kind: FlashKind; payload: string | null } | null {
  const raw = req.signedCookies?.[FLASH_COOKIE];
  if (typeof raw !== 'string' || raw.length === 0) return null;
  const colonIdx = raw.indexOf(':');
  const kind = colonIdx === -1 ? raw : raw.slice(0, colonIdx);
  // Defense-in-depth: cookie-parser already rejects tampered signatures,
  // so a `kind` arriving here was server-issued at some point. Whitelisting
  // against FLASH_KIND still drops orphaned values from older deploys (a
  // removed kind, a renamed kind) so the consumer never sees an unknown
  // discriminator.
  if (!FLASH_KIND_VALUES.has(kind)) return null;
  const payload = colonIdx === -1 ? null : raw.slice(colonIdx + 1);
  return { kind: kind as FlashKind, payload };
}

export function clearFlash(res: Response, req: Request): void {
  // RFC 6265-strict browsers require the clear cookie's attributes
  // (path, httpOnly, sameSite, secure) to match the set, so this mirrors
  // writeFlash's secure derivation.
  res.clearCookie(FLASH_COOKIE, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
  });
}
