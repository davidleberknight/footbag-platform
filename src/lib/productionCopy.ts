/**
 * The fixed values a copy of the production database is built with, shared by
 * the copy builder, the statements it runs and the development test routes.
 *
 * Once production is live every other database is a copy of it, built on the
 * production host from a snapshot with every credential and payment-provider
 * identifier removed (design decision "Migrations and Non-production Databases
 * with a Live Production Database", DD §1.18). The column register says what
 * happens to each column; this module holds the values the removal writes and
 * the one marker that tells the rest of the code it is looking at a copy.
 *
 * Neutral layer: no service, database or testkit dependency, so the builder,
 * the database module and the persona harness share one definition.
 */

/**
 * The system configuration key the copy appends a row under. Its presence is
 * how the development test routes know the database can hold real member
 * accounts, and so serve synthetic personas only.
 */
export const PRODUCTION_COPY_CONFIG_KEY = 'production_copy';

/**
 * The value every live account's password hash becomes in a copy. It is a
 * well-formed argon2id encoding, so a sign-in attempt runs the ordinary verify
 * and is refused, rather than failing on an unreadable hash; its digest is all
 * zero bytes, which no known password produces. The credential constraint
 * refuses an empty hash on a live account, which is why the copy writes this
 * rather than clearing the column. Its cost parameters are low because they
 * protect nothing: there is no password behind it.
 */
export const NEVER_VERIFYING_PASSWORD_HASH =
  '$argon2id$v=19$m=8192,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

/**
 * What a copy writes where a column requires a value and the original named a
 * payment-provider object: it names no object at the provider.
 */
export const PROVIDER_ID_PLACEHOLDER = 'removed_in_copy';

/**
 * Templates whose sent body carries a link holding a plaintext one-time token:
 * the verification link and the password-reset link. A copy clears the body of
 * every sent message made from one of them.
 */
export const TOKEN_LINK_TEMPLATE_KEYS: readonly string[] = ['account_verify', 'password_reset_request'];

/**
 * A payment-provider object identifier: the provider's lowercase type prefix,
 * an underscore, then its opaque id.
 */
const PROVIDER_ID_VALUE = /^(acct|ba|card|ch|cs|cus|di|dp|du|evt|ii|in|pi|pm|po|price|prod|py|re|seti|si|sub|tr|txn|whsec)_[A-Za-z0-9]{8,}$/;

/** A key naming a payment-provider field, in either the snake or camel form. */
const PROVIDER_KEY = /^stripe/i;

function stripValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripValue);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      if (PROVIDER_KEY.test(key)) continue;
      out[key] = stripValue(inner);
    }
    return out;
  }
  if (typeof value === 'string' && PROVIDER_ID_VALUE.test(value)) return PROVIDER_ID_PLACEHOLDER;
  return value;
}

/**
 * Remove payment-provider identifiers from a JSON text column: every key named
 * for the provider is dropped at any depth, and any remaining string value
 * shaped like a provider object id is replaced by the placeholder. Everything
 * else is kept. A null stays null. Text that is not JSON is refused rather than
 * passed through, because a copy must never carry what it could not inspect.
 */
export function stripProviderIds(json: string | null): string | null {
  if (json === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('production copy: a JSON column holds text that is not JSON, so its provider identifiers cannot be removed');
  }
  return JSON.stringify(stripValue(parsed));
}

/** Whether a JSON text still carries a provider key or a provider-shaped value. */
export function carriesProviderIds(json: string | null): boolean {
  if (json === null) return false;
  return stripProviderIds(json) !== JSON.stringify(JSON.parse(json));
}
