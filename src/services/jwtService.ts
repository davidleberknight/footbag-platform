/**
 * JWT service layer. Holds pure domain functions related to session JWTs.
 * Adapter interface and implementations live in `src/adapters/jwtSigningAdapter.ts`.
 */
import { getJwtSigningAdapter } from '../adapters/jwtSigningAdapter';

/**
 * Session JWT default TTL in seconds. Service-layer policy owned here so the
 * adapter stays a pure signer.
 */
export const DEFAULT_TTL_SECONDS = 24 * 60 * 60;

/**
 * Mints a session JWT for a signed-in member. Pure domain logic: takes
 * the member's identity fields and returns a JWT string. No HTTP
 * concerns (no cookies, no request/response). Controllers call this
 * and then set the cookie themselves.
 */
export async function createSessionJwt(
  memberId: string,
  role: string,
  passwordVersion: number,
): Promise<string> {
  return getJwtSigningAdapter().signJwt({
    sub: memberId,
    role,
    passwordVersion,
  }, DEFAULT_TTL_SECONDS);
}
