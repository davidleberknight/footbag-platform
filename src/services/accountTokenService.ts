/**
 * AccountTokenService -- single-use account tokens: issue, peek, consume.
 *
 * Owns:
 *   - Token generation (32 random bytes, URL-safe) and SHA-256 hash storage;
 *     the raw token is returned to the caller once and never persisted
 *   - Consumption with expiry + single-use enforcement, including the
 *     `consumeIfUnusedInTx` variant composed inside a caller transaction so
 *     a rolled-back caller write un-consumes the token
 *   - Non-consuming lookup (`peekToken`) for pre-flight rendering
 *
 * Does not own:
 *   - Token delivery (callers enqueue the email carrying the raw token)
 *   - The account workflows the token gates (verify, reset);
 *     callers act on the returned binding
 *   - TTL policy (callers pass ttlHours per flow)
 *
 * Required patterns:
 *   - Single-use and expiry are enforced in the UPDATE's WHERE clause, not a
 *     read-then-write, so concurrent consumers cannot double-spend.
 *   - Lookups are by token hash and token type together; a token never
 *     crosses flows.
 *
 * Persistence:
 *   account_tokens.
 *
 * Side effects: none beyond account_tokens writes (no audit, outbox, or
 * logging; callers own those).
 *
 * Service shape: singleton object (no external adapters beyond db.ts).
 */
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { accountTokens, type AccountTokenRow } from '../db/db';

export type AccountTokenType =
  | 'email_verify'
  | 'password_reset';

export interface IssuedToken {
  /** The raw URL-safe token handed to the caller. Never stored. */
  rawToken: string;
  /** The row ID of the persisted hash. */
  tokenRowId: string;
  expiresAt: string;
}

export interface ConsumedToken {
  memberId: string;
  tokenRowId: string;
}

export interface PeekedToken {
  memberId: string;
  tokenRowId: string;
  expiresAt: string;
}

function b64url(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Issue a cryptographically random single-use token for a member.
 * Returns the raw token (to be delivered to the member via a side channel
 * such as email) and the row ID. Only the SHA-256 hash is persisted so a
 * database compromise cannot be replayed into account takeover.
 */
export function issueToken(opts: {
  memberId: string;
  tokenType: AccountTokenType;
  ttlHours: number;
}): IssuedToken {
  if (opts.ttlHours <= 0) {
    throw new Error('ttlHours must be > 0');
  }
  const raw = b64url(randomBytes(32));
  const tokenHash = hashToken(raw);
  const now = new Date();
  const expiresAtDate = new Date(now.getTime() + opts.ttlHours * 60 * 60 * 1000);
  const nowIso = now.toISOString();
  const expiresAt = expiresAtDate.toISOString();
  const id = `tok_${randomUUID().replace(/-/g, '').slice(0, 24)}`;

  accountTokens.insert.run(
    id,
    nowIso,
    nowIso,
    opts.memberId,
    opts.tokenType,
    tokenHash,
    nowIso,
    expiresAt,
  );

  return { rawToken: raw, tokenRowId: id, expiresAt };
}

/**
 * Consume a raw token. Returns the member binding on success; returns null
 * when the token is unknown, expired, or already used. Never throws;
 * callers render a generic error message to prevent enumeration of valid tokens.
 *
 * The consume step is atomic: SQL UPDATE WHERE used_at IS NULL with a
 * rowcount check ensures a concurrent consume attempt wins exactly once.
 */
export function consumeToken(
  rawToken: string,
  tokenType: AccountTokenType,
): ConsumedToken | null {
  if (!rawToken) return null;
  const tokenHash = hashToken(rawToken);
  const row = accountTokens.findByHash.get(tokenHash, tokenType) as
    | AccountTokenRow
    | undefined;
  if (!row) return null;
  if (row.used_at !== null) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) return null;

  // The expiry pre-check above is a fast-fail; the UPDATE below re-checks
  // expiry in SQL via consumeIfUnusedAndUnexpired so a token that expires
  // between the JS check and the UPDATE cannot be consumed (TOCTOU close).
  // Same statement is used by the Tx variant.
  const nowIso = new Date().toISOString();
  const result = accountTokens.consumeIfUnusedAndUnexpired.run(nowIso, nowIso, row.id, nowIso);
  if (result.changes !== 1) return null;

  return {
    memberId: row.member_id,
    tokenRowId: row.id,
  };
}

/**
 * Atomic consume-or-fail for use inside an existing caller transaction.
 * Returns the token's bound member info if the UPDATE succeeded; null if
 * the token is unknown, expired, already used, or wrong type.
 *
 * Designed for callers that need consume + downstream work to commit-or-
 * rollback together. The caller wraps the entire flow in transaction(...)
 * and invokes this; if the downstream work throws, the rollback un-consumes
 * the token automatically (the UPDATE rolls back with the rest).
 *
 * The expiry check is included in the UPDATE WHERE clause, closing the
 * check-then-update TOCTOU window that the standalone consumeToken has.
 */
export function consumeIfUnusedInTx(
  rawToken: string,
  tokenType: AccountTokenType,
): ConsumedToken | null {
  if (!rawToken) return null;
  const tokenHash = hashToken(rawToken);
  const row = accountTokens.findByHash.get(tokenHash, tokenType) as
    | AccountTokenRow
    | undefined;
  if (!row) return null;
  // Snapshot bindings before the UPDATE so we can return them if it wins.
  const memberId = row.member_id;
  const tokenRowId = row.id;
  const nowIso = new Date().toISOString();
  const result = accountTokens.consumeIfUnusedAndUnexpired.run(
    nowIso,
    nowIso,
    tokenRowId,
    nowIso,
  );
  if (result.changes !== 1) return null;
  return { memberId, tokenRowId };
}

/**
 * Look up a token without marking it used. Returns null when the token is
 * unknown, expired, or already consumed. Used by confirm-page renders that
 * defer the consume step to the subsequent POST (so a single email link can
 * present a review screen before any DB mutation).
 */
export function peekToken(
  rawToken: string,
  tokenType: AccountTokenType,
): PeekedToken | null {
  if (!rawToken) return null;
  const tokenHash = hashToken(rawToken);
  const row = accountTokens.findByHash.get(tokenHash, tokenType) as
    | AccountTokenRow
    | undefined;
  if (!row) return null;
  if (row.used_at !== null) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) return null;

  return {
    memberId: row.member_id,
    tokenRowId: row.id,
    expiresAt: row.expires_at,
  };
}

/**
 * The member a token belonged to, when it has already been spent. A repeat of
 * an email link reports the first outcome rather than an error, and only a
 * token that was actually consumed earns that: an unknown or merely expired
 * token returns null and keeps the generic invalid answer. Reads only.
 */
export function findSpentToken(
  rawToken: string,
  tokenType: AccountTokenType,
): { memberId: string } | null {
  if (!rawToken) return null;
  const row = accountTokens.findByHash.get(hashToken(rawToken), tokenType) as
    | AccountTokenRow
    | undefined;
  if (!row || row.used_at === null) return null;
  return { memberId: row.member_id };
}


/**
 * Whether the member was issued an unused token of this type within the last
 * `seconds` whose email is queued under `emailKeyPrefix` plus the token's id.
 * Reads only. A request submitted twice in that span is the same request, and
 * its first email is already on its way; a token whose email never queued
 * does not count, so a retry after a failed enqueue still sends.
 */
export function hasFreshQueuedToken(
  memberId: string,
  tokenType: AccountTokenType,
  emailKeyPrefix: string,
  seconds: number,
): boolean {
  const now = Date.now();
  return accountTokens.hasLiveQueuedSince.get(
    emailKeyPrefix, memberId, tokenType,
    new Date(now).toISOString(), new Date(now - seconds * 1000).toISOString(),
  ) !== undefined;
}

export const accountTokenService = {
  issueToken,
  consumeToken,
  consumeIfUnusedInTx,
  peekToken,
  findSpentToken,
  hasFreshQueuedToken,
};
