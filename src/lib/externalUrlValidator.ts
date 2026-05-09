// Slim user-supplied external URL validator for media + gallery fields.
// Implements the highest-impact subset of DD §3.17:
//   - empty/null acceptance (the field is optional everywhere)
//   - length cap (rejects abusive payloads early)
//   - URL parse (rejects malformed input)
//   - scheme allowlist http/https (blocks javascript:, data:, file:, ftp:)
//
// Deferred to a separate slice (tracked in IP): private-IP/SSRF block,
// redirect-follow re-resolution, Safe Browsing lookup, optional
// reachability HEAD with 24-hour cache. The deferred subset requires
// network I/O, an adapter, and a cache; this slim helper is sync.
//
// Service-layer use: call at the service boundary, throw ValidationError
// with the returned `error` message on invalid input. Persist
// `normalizedUrl` (canonicalizes trailing slashes and percent-encoding)
// and stamp `external_url_validated_at` to the current time on accept.

const MAX_URL_LENGTH = 2048;
const ALLOWED_SCHEMES: ReadonlySet<string> = new Set(['http:', 'https:']);

export interface ValidatedExternalUrl {
  valid: boolean;
  normalizedUrl: string | null;
  error?: string;
}

export function validateExternalUrl(
  input: string | null | undefined,
): ValidatedExternalUrl {
  if (input === null || input === undefined) {
    return { valid: true, normalizedUrl: null };
  }
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { valid: true, normalizedUrl: null };
  }
  if (trimmed.length > MAX_URL_LENGTH) {
    return {
      valid: false,
      normalizedUrl: null,
      error: `URL exceeds the maximum length of ${MAX_URL_LENGTH} characters.`,
    };
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      valid: false,
      normalizedUrl: null,
      error: 'Invalid URL format.',
    };
  }
  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    return {
      valid: false,
      normalizedUrl: null,
      error: 'This URL appears to use a disallowed protocol.',
    };
  }
  return { valid: true, normalizedUrl: parsed.toString() };
}
