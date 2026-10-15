/**
 * Following a post-redirect-get the way a browser does: the POST's response
 * sets the signed one-shot flash cookie, and the receiving GET must carry it
 * back for the outcome to show. Use these instead of reading the redirect's
 * query string, which carries no outcome.
 */

type HasHeaders = { get(header: string): string[] | string | undefined };

/** The `footbag_flash=<value>` pair to send on the follow-up request, or
 *  undefined when the response set no flash. */
export function flashCookieOf(res: HasHeaders): string | undefined {
  const raw = res.get('Set-Cookie');
  const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return cookies.find((c) => c.startsWith('footbag_flash='))?.split(';')[0];
}

/** The flash's `<kind>` or `<kind>:<payload>` text, signature removed, or
 *  undefined when the response set no flash. */
export function flashValueOf(res: HasHeaders): string | undefined {
  const pair = flashCookieOf(res);
  if (!pair) return undefined;
  const signed = decodeURIComponent(pair.slice('footbag_flash='.length));
  // A signed cookie reads `s:<value>.<signature>`; the signature is base64 and
  // carries no dot, so the value ends at the last one.
  return signed.slice(2, signed.lastIndexOf('.'));
}
