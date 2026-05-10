// Handlebars helper for rendering user-supplied external URLs per
// DD §3.17. Always emits target="_blank" rel="nofollow noopener
// noreferrer" plus an external-link icon and a title attribute carrying
// the full URL. Direct <a href="{{url}}"> markup that bypasses this
// helper is the contract the validator + helper pair enforces.
//
// Usage: {{externalLink url}}
//        {{externalLink url label="Event Website"}}
//        {{externalLink url label="website" class="club-external-link"}}
//        {{externalLink url noIcon=true}}
//
// `label`, `class`, and `noIcon` are optional kwargs. `noIcon=true`
// suppresses the trailing ↗ external-link icon — useful in surfaces
// where the URL itself is the anchor text and an extra glyph reads
// as visual clutter.
//
// Null/empty `url` returns the empty string so calling sites do not
// need to wrap with {{#if url}}.

import Handlebars from 'handlebars';

const ICON_SVG =
  '<svg class="external-link-icon" viewBox="0 0 12 12" width="10" height="10" aria-hidden="true" focusable="false">' +
  '<path d="M3 1h7a1 1 0 0 1 1 1v7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
  '<path d="M11 1L5 7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
  '<path d="M9 6v4a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>' +
  '</svg>';

interface ExternalLinkOptions {
  hash?: { label?: string; class?: string; noIcon?: boolean };
}

export function externalLinkHelper(
  url: unknown,
  options?: ExternalLinkOptions,
): Handlebars.SafeString | string {
  if (typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (trimmed.length === 0) return '';

  const hash = options?.hash ?? {};
  const labelInput =
    typeof hash.label === 'string' && hash.label.trim().length > 0
      ? hash.label
      : trimmed;
  const extraClass =
    typeof hash.class === 'string' && hash.class.trim().length > 0
      ? hash.class.trim()
      : '';
  const noIcon = hash.noIcon === true;

  const escape = Handlebars.Utils.escapeExpression;
  const href = escape(trimmed);
  const title = escape(trimmed);
  const label = escape(labelInput);
  const className = extraClass ? `external-link ${escape(extraClass)}` : 'external-link';
  const iconHtml = noIcon ? '' : ICON_SVG;

  const html =
    `<a href="${href}" target="_blank" rel="nofollow noopener noreferrer" ` +
    `title="${title}" class="${className}">${label}${iconHtml}</a>`;
  return new Handlebars.SafeString(html);
}
