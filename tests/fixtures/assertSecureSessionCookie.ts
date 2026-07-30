/**
 * Shared assertion helper: the issued session cookie carries the security flags
 * the login and email-verify stories name verbatim (HttpOnly, SameSite=Lax,
 * Max-Age matching the session window), plus the three attributes a browser
 * requires before it will store a cookie under the `__Host-` name prefix at all
 * (Secure, Path=/, and no Domain). The source of truth is
 * `src/lib/sessionCookie.ts`; this helper guards against a future regression
 * that drops a flag (e.g. removing HttpOnly for a dev-shortcut that leaks
 * into prod, or downgrading SameSite to None for a CORS workaround).
 *
 * All of these are unconditional, on every transport. The prefix is what stops
 * another host on the same registrable domain from setting a cookie of this name
 * that shadows the real session, and a browser silently discards a `__Host-`
 * cookie that arrives without Secure, so an environment-dependent Secure flag
 * would mean an environment-dependent session cookie. Browsers exempt localhost
 * from the HTTPS requirement for Secure cookies, so this holds in local
 * development too.
 *
 * Max-Age value mirrors `SESSION_COOKIE_MAX_AGE_MS` (24h) in
 * `src/middleware/auth.ts` — kept inline rather than imported so this
 * fixture stays side-effect free and does not pull `src/middleware/auth.ts`
 * (and its transitive db.ts open) into a test file's import graph before
 * `setTestEnv` runs. If the production value changes, this assertion fails
 * and the literal here is updated.
 */
import { expect } from 'vitest';

const EXPECTED_MAX_AGE_SECONDS = 24 * 60 * 60;
const NAME = '__Host-footbag_session';

type SetCookieHeader = string | string[] | undefined;

export function assertSecureSessionCookie(setCookieHeader: SetCookieHeader): void {
  const cookies: string[] = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : setCookieHeader
    ? [setCookieHeader]
    : [];
  const sessionCookie = cookies.find((c) => c.startsWith(`${NAME}=`));
  expect(sessionCookie, `no ${NAME} cookie in Set-Cookie header`).toBeDefined();
  expect(sessionCookie, `${NAME} missing HttpOnly`).toMatch(/;\s*HttpOnly/i);
  expect(sessionCookie, `${NAME} missing SameSite=Lax`).toMatch(/;\s*SameSite=Lax/i);
  expect(sessionCookie, `${NAME} missing Max-Age=${EXPECTED_MAX_AGE_SECONDS}`).toMatch(
    new RegExp(`;\\s*Max-Age=${EXPECTED_MAX_AGE_SECONDS}\\b`, 'i'),
  );
  expect(sessionCookie, `${NAME} missing Secure`).toMatch(/;\s*Secure\b/i);
  expect(sessionCookie, `${NAME} missing Path=/`).toMatch(/;\s*Path=\/(;|$)/i);
  expect(sessionCookie, `${NAME} must carry no Domain attribute`).not.toMatch(/;\s*Domain=/i);
}
