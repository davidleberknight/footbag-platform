/**
 * Keyed hash of an expelled member's login address, which registration
 * refuses.
 *
 * The address itself is never kept: a list of expelled people's addresses is
 * exactly the record nobody should be able to read back. A plain SHA-256 is no
 * protection, because addresses are a small, guessable space; a keyed hash
 * still lets registration ask "is this address barred?" while a copy of the
 * table alone reveals nothing.
 *
 * The key is derived from the session secret under its own purpose label, the
 * derivation the claim-address hash and the unsubscribe token use, so no
 * further secret is provisioned and a value minted here can never be mistaken
 * for anything else signed with that secret.
 */
import { createHmac } from 'node:crypto';
import { config } from '../config/env';

function hashKey(): Buffer {
  return createHmac('sha256', config.sessionSecret).update('barred-email-hash-v1').digest();
}

/** The address trimmed and lowercased, then hashed under the derived key. */
export function barredEmailHash(address: string): string {
  return createHmac('sha256', hashKey()).update(address.trim().toLowerCase()).digest('hex');
}
