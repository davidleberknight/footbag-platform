/**
 * Keyed hash of an email address for the claim-step audit evidence.
 *
 * The audit ledger is immutable and account erasure cannot reach it, so a raw
 * address must never be written there. A plain SHA-256 of an address is no
 * protection either: the old site's addresses are a small, known set, and every
 * one of them can be hashed and compared in moments. A keyed hash keeps the
 * property an administrator needs (two rows naming the same address carry the
 * same value) while a copy of the ledger alone reveals nothing.
 *
 * The key is derived from the session secret under a fixed purpose label, the
 * same derivation the unsubscribe token uses, so no further secret has to be
 * provisioned and a value minted here can never be mistaken for anything else
 * signed with that secret.
 */
import { createHmac } from 'node:crypto';
import { config } from '../config/env';

function hashKey(): Buffer {
  return createHmac('sha256', config.sessionSecret).update('claim-address-hash-v1').digest();
}

/** The address trimmed and lowercased, then hashed under the derived key. */
export function claimAddressHash(address: string): string {
  return createHmac('sha256', hashKey()).update(address.trim().toLowerCase()).digest('hex');
}
