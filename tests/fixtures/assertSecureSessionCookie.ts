/**
 * Shared assertion helper: the issued `footbag_session` cookie carries the
 * security flags named verbatim in M_Login A6 and M_Verify_Email A3 (HttpOnly,
 * SameSite=Lax, Max-Age matching the session window). The source of truth is
 * `src/lib/sessionCookie.ts`; this helper guards against a future regression
 * that drops a flag (e.g. removing HttpOnly for a dev-shortcut that leaks
 * into prod, or downgrading SameSite to None for a CORS workaround).
 *
 * Max-Age value mirrors `SESSION_COOKIE_MAX_AGE_MS` (24h) in
 * `src/middleware/auth.ts` — kept inline rather than imported so this
 * fixture stays side-effect free and does not pull `src/middleware/auth.ts`
 * (and its transitive db.ts open) into a test file's import graph before
 * `setTestEnv` runs. If the production value changes, this assertion fails
 * and the literal here is updated.
 *
 * The `Secure` flag depends on `req.secure || x-forwarded-proto === 'https'`.
 * Supertest defaults to HTTP, so `Secure` is normally absent in tests.
 * Pass `{ requireSecure: true }` when the caller has driven the request over
 * a TLS-equivalent path (e.g. via `.set('x-forwarded-proto', 'https')`).
 */
import { expect } from 'vitest';

const EXPECTED_MAX_AGE_SECONDS = 24 * 60 * 60;

type SetCookieHeader = string | string[] | undefined;

export function assertSecureSessionCookie(
  setCookieHeader: SetCookieHeader,
  opts: { requireSecure?: boolean } = {},
): void {
  const cookies: string[] = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : setCookieHeader
    ? [setCookieHeader]
    : [];
  const sessionCookie = cookies.find((c) => c.startsWith('footbag_session='));
  expect(sessionCookie, 'no footbag_session cookie in Set-Cookie header').toBeDefined();
  expect(sessionCookie, 'footbag_session missing HttpOnly').toMatch(/;\s*HttpOnly/i);
  expect(sessionCookie, 'footbag_session missing SameSite=Lax').toMatch(/;\s*SameSite=Lax/i);
  expect(sessionCookie, `footbag_session missing Max-Age=${EXPECTED_MAX_AGE_SECONDS}`).toMatch(
    new RegExp(`;\\s*Max-Age=${EXPECTED_MAX_AGE_SECONDS}\\b`, 'i'),
  );
  if (opts.requireSecure) {
    expect(sessionCookie, 'footbag_session missing Secure').toMatch(/;\s*Secure\b/i);
  }
}
