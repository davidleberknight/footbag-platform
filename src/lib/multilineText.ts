/**
 * Collapse CRLF to LF in text that came from a form.
 *
 * HTML form submission normalizes a textarea's line breaks to CRLF before
 * sending them, whatever value the browser was handed. Columns hold LF, so a
 * multi-line field posted back with no edit does not equal what is stored, and
 * a before-and-after comparison over it reports a change nobody made.
 *
 * Applied where such a comparison is made, on the field that carries line
 * breaks. It is deliberately not applied globally: doing that at the body
 * parser would reach every form on the site, which is a wider change than the
 * comparisons that need it and belongs to its own piece of work.
 */
export function normalizeLineEndings(value: string): string;
export function normalizeLineEndings(value: string | undefined): string | undefined;
export function normalizeLineEndings(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return value.includes('\r') ? value.replace(/\r\n/g, '\n') : value;
}
