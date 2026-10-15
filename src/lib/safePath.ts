/**
 * Redirect-target guard for request-supplied paths (?returnTo=, Referer).
 * Accepts only same-origin absolute paths: must start with a single '/'
 * ('//' is a protocol-relative external URL) and must not contain a
 * backslash (some user agents normalize '\' to '/', reopening the '//'
 * escape), nor a control character (browsers strip tab, CR and LF while
 * parsing a URL, so '/<TAB>/evil.com' rendered as a link opens '//evil.com').
 * Anything else falls back to a caller-chosen safe default.
 * Single shared definition so the guard cannot drift or be weakened in
 * one copy.
 */
const CONTROL_CHARACTER = /[\x00-\x1f\x7f]/;

export function isSafePath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\') &&
    !CONTROL_CHARACTER.test(value)
  );
}
