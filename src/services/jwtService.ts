/**
 * JWT service layer. Holds pure domain functions related to session JWTs.
 * Adapter interface and implementations live in `src/adapters/jwtSigningAdapter.ts`.
 */
import { getJwtSigningAdapter } from '../adapters/jwtSigningAdapter';

/**
 * Session JWT default TTL in seconds. Service-layer policy owned here so the
 * adapter stays a pure signer. Staging currently runs at 10 minutes for
 * observability; baseline per DD §3.5 is 24h and reverts before prod cutover
 * (see IMPLEMENTATION_PLAN active gotcha).
 */
export const DEFAULT_TTL_SECONDS = 10 * 60;

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
