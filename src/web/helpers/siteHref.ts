// Handlebars helper for every service-shaped link printed into an href:
// `<a href="{{siteHref content.browseHref}}">`.
//
// It escapes the characters that could end the attribute or open markup
// (`&`, `<`, `>`, both quotes and the backtick) and leaves the rest of the
// address as written, so `/freestyle/tricks?family=osis` reaches the page as
// that text, and a quote in the value cannot close the attribute.
//
// It also refuses an address that is neither a path on this site (`/x`, never
// `//host`), an in-page fragment (`#x`), a query on the current page (`?x`), nor
// an http(s) link, because escaping stops attribute breakout but not a
// `javascript:` or `data:` scheme. A refused or missing value renders as the
// empty string, the same contract as the external-link helper.

import Handlebars from 'handlebars';

const ATTRIBUTE_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '`': '&#x60;',
};

function isAllowedAddress(value: string): boolean {
  if (value.startsWith('#') || value.startsWith('?')) return true;
  if (value.startsWith('/')) return !value.startsWith('//') && !value.startsWith('/\\');
  return /^https?:\/\//i.test(value);
}

export function siteHrefHelper(value: unknown): Handlebars.SafeString | string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (trimmed.length === 0 || !isAllowedAddress(trimmed)) return '';
  return new Handlebars.SafeString(trimmed.replace(/[&<>"'`]/g, (ch) => ATTRIBUTE_ESCAPES[ch]));
}
