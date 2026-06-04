/**
 * Sanitize a request URL for safe logging:
 *
 *   1. Strip single-use token segments from token-bearing routes so a
 *      leaked debug log cannot replay the token and take over the
 *      associated account, password change, legacy-claim merge, or
 *      auto-link revert.
 *
 *   2. Strip PII-bearing query-string values so member-search terms and
 *      similar free-text inputs do not persist in CloudWatch logs (per
 *      DATA_GOVERNANCE §8: search queries must be anonymized before
 *      persistence). Operators retain the path and parameter names; the
 *      values are redacted.
 *
 * The current PII set is `q` (member-search query). Add a new param here
 * (with a regression test) when a new free-text query-string input
 * lands on any route.
 */
const PII_QUERY_PARAMS = ['q'] as const;

export function redactTokenPaths(url: string): string {
  let out = url
    .replace(/^\/verify\/[^/?#]+/, '/verify/[redacted]')
    .replace(/^\/password\/reset\/[^/?#]+/, '/password/reset/[redacted]')
    .replace(
      /^\/auto-link\/report-incorrect\/[^/?#]+/,
      '/auto-link/report-incorrect/[redacted]',
    )
    .replace(
      /^\/register\/wizard\/legacy_claim\/claim\/confirm\/[^/?#]+/,
      '/register/wizard/legacy_claim/claim/confirm/[redacted]',
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
