/**
 * Sanitize a request URL for safe logging:
 *
 *   1. Strip single-use token segments from token-bearing routes so a
 *      leaked debug log cannot replay the token and take over the
 *      associated account, password change, legacy-claim merge, or
 *      anchor mailbox verification.
 *
 *   2. Strip PII-bearing query-string values so member-search terms and
 *      similar free-text inputs do not persist in CloudWatch logs (per
 *      DATA_GOVERNANCE §8: search queries must be anonymized before
 *      persistence). Operators retain the path and parameter names; the
 *      values are redacted.
 *
 * The current set is `q` (member-search query) and `key` (the SNS feedback
 * webhook's shared-secret query key). Add a new param here (with a
 * regression test) when a new free-text or secret-bearing query-string
 * input lands on any route.
 */
const PII_QUERY_PARAMS = ['q', 'key'] as const;

export function redactTokenPaths(url: string): string {
  let out = url
    .replace(/^\/verify\/[^/?#]+/, '/verify/[redacted]')
    .replace(/^\/password\/reset\/[^/?#]+/, '/password/reset/[redacted]')
    .replace(
      /^\/register\/wizard\/legacy_claim\/claim\/confirm\/[^/?#]+/,
      '/register/wizard/legacy_claim/claim/confirm/[redacted]',
    )
    .replace(
      /^\/register\/wizard\/legacy_claim\/anchors\/verify\/[^/?#]+/,
      '/register/wizard/legacy_claim/anchors/verify/[redacted]',
    );
  for (const key of PII_QUERY_PARAMS) {
    // Match `?<key>=...` or `&<key>=...` up to the next `&` or `#`.
    out = out.replace(
      new RegExp(`([?&])${key}=[^&#]*`, 'g'),
      `$1${key}=[redacted]`,
    );
  }
  return out;
}
