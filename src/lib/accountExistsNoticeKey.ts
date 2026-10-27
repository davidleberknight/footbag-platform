/**
 * Keyed hash of one registration attempt against an address that already has
 * an account, for the account-exists notice's outbox key.
 *
 * The notice is keyed on the member plus what the attempt submitted, so the
 * same attempt sent again (a double click, a back-button re-post) collapses
 * onto the notice already queued, while a different attempt still reaches the
 * owner. The key sits in the outbox, so the submitted names and address are
 * never written there in the clear, and the password never enters the hash.
 *
 * The key is derived from the session secret under a fixed purpose label, the
 * same derivation the claim-address hash and the unsubscribe token use, so no
 * further secret has to be provisioned.
 */
import { createHmac } from 'node:crypto';
import { config } from '../config/env';

function hashKey(): Buffer {
  return createHmac('sha256', config.sessionSecret).update('account-exists-notice-v1').digest();
}

/** The submitted name parts and normalized address, hashed under the derived key. */
export function accountExistsAttemptHash(
  givenNames: string,
  familyName: string,
  displayName: string,
  normalizedEmail: string,
): string {
  return createHmac('sha256', hashKey())
    .update(JSON.stringify([givenNames, familyName, displayName, normalizedEmail]))
    .digest('hex');
}
