/**
 * Normalization for anti-enumeration body comparisons.
 *
 * Two responses that must not reveal whether an account exists have to be
 * compared as whole bodies, because a length comparison passes on any pair of
 * pages that happen to be about the same size while differing in exactly the
 * words that leak. What legitimately varies between two such responses is the
 * per-request CSRF token and the address the form refills, both of which arrive
 * as input attribute values, plus incidental whitespace from the template.
 * Everything else must match byte for byte.
 */
export function normalizeAntiEnumerationBody(text: string): string {
  return text
    .replace(/value="[^"]*"/g, 'value="REDACTED"')
    .replace(/\s+/g, ' ')
    .trim();
}
