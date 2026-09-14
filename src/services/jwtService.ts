/**
 * JWT service layer. Holds the domain functions related to session JWTs, and
 * owns the session-lifetime policy the adapter is handed; the adapter itself
 * stays a pure signer. Adapter interface and implementations live in
 * `src/adapters/jwtSigningAdapter.ts`.
 */
import { getJwtSigningAdapter } from '../adapters/jwtSigningAdapter';
import { readSessionTtlSeconds } from './configReader';

/**
 * Mints a session JWT for a signed-in member: takes the member's identity
 * fields and returns a JWT string, stamped with the configured session
 * lifetime. No HTTP concerns (no cookies, no request/response). Controllers
 * call this and then set the cookie themselves, with the same lifetime read
 * from the same place.
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
  }, readSessionTtlSeconds());
}
