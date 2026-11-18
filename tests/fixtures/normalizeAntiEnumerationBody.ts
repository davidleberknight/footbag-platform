/**
 * Normalization for anti-enumeration body comparisons.
 *
 * Two responses that must not reveal whether an account exists have to be
 * compared as whole bodies, because a length comparison passes on any pair of
 * pages that happen to be about the same size while differing in exactly the
 * words that leak. What legitimately varies between two such responses is the
 * per-request CSRF token and the address the form refills, both of which arrive
 * as input attribute values, plus incidental whitespace from the template.
 * A page that echoes the visitor's own typed address back in its text varies
 * by that address too, so a caller names the addresses it submitted and each
 * is replaced wherever it appears. Everything else must match byte for byte.
 */
export function normalizeAntiEnumerationBody(
  text: string,
  submittedAddresses: readonly string[] = [],
): string {
  const withoutAddresses = submittedAddresses.reduce(
    (body, address) => body.split(address).join('SUBMITTED_ADDRESS'),
    text,
  );
  return withoutAddresses
    .replace(/value="[^"]*"/g, 'value="REDACTED"')
    .replace(/\s+/g, ' ')
    .trim();
}
