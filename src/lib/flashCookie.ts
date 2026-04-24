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

export function readFlash(
  req: Request,
): { kind: string; payload: string | null } | null {
  const raw = req.signedCookies?.[FLASH_COOKIE];
  if (typeof raw !== 'string' || raw.length === 0) return null;
  const colonIdx = raw.indexOf(':');
  if (colonIdx === -1) return { kind: raw, payload: null };
  return { kind: raw.slice(0, colonIdx), payload: raw.slice(colonIdx + 1) };
}

export function clearFlash(res: Response): void {
  res.clearCookie(FLASH_COOKIE, { path: '/' });
}
