/**
 * Write-time cleaning for text a person typed.
 *
 * Every human-authored text field is cleaned once, at the service boundary,
 * before it is validated and stored; reading it back never re-cleans it, and
 * template escaping stays the second layer for anything that slips past. The
 * steps run in a fixed order: refuse broken encoding, compose Unicode (NFC) so
 * look-alike spellings compare equal, drop HTML tags and entities, drop control
 * characters, then tidy whitespace. Field length limits are the caller's,
 * checked on the cleaned value, because a limit counts what is stored.
 *
 * Three shapes:
 * - single_line: names, titles, labels, short reasons. Any whitespace run,
 *   including a stray newline or tab, becomes one space.
 * - multi_line: bios, descriptions, messages, notes. Line breaks and tabs
 *   survive; space and tab runs within a line collapse, line ends are trimmed,
 *   and at most one blank line is kept between paragraphs, so a paragraph
 *   break the writer meant is kept while a stack of empty lines is not.
 * - notation: freestyle notation, where `<`, `>` and `[ ]` are syntax. Treated
 *   as multi_line but with no HTML step, since its brackets are not markup.
 *
 * HTML removal is shape-based, not a parser: only a sequence that looks like a
 * tag (a `<` directly followed by a letter, `/`, `!` or `?`, through the next
 * `>`) is removed, so ordinary prose such as "3 < 5" keeps its characters.
 * Entities are removed rather than decoded, so an encoded tag can never turn
 * back into a real one. A bare `&` is ordinary text and stays.
 */

import { ValidationError } from '../services/serviceErrors';

export type TextShape = 'single_line' | 'multi_line' | 'notation';

export type SanitizeResult =
  | { status: 'ok'; text: string }
  | { status: 'invalid_encoding' };

// A lone surrogate is not a character at all, and U+FFFD is what the request
// body parser leaves where the submitted bytes were not valid UTF-8; either
// means the input arrived damaged, and storing it would store the damage.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const REPLACEMENT_CHARACTER = /�/;

const HTML_COMMENT = /<!--[\s\S]*?(?:-->|$)/g;
const HTML_TAG = /<\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^<>]*)?\/?>|<[!?][^<>]*>/g;
const HTML_ENTITY = /&(?:[A-Za-z][A-Za-z0-9]{1,31}|#[0-9]{1,7}|#[xX][0-9A-Fa-f]{1,6});/g;

// C0 controls, DEL and C1 controls. The multi-line form spares tab and newline.
const CONTROL_ALL = /[\u0000-\u001F\u007F-\u009F]/g;
const CONTROL_EXCEPT_TAB_NEWLINE = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;

function stripHtml(text: string): string {
  // Repeat until stable: removing one tag can join the halves of another
  // ("<scr<b>ipt>"), and a single pass would leave that joined tag behind.
  let current = text;
  for (;;) {
    const next = current.replace(HTML_COMMENT, '').replace(HTML_TAG, '');
    if (next === current) break;
    current = next;
  }
  return current.replace(HTML_ENTITY, '');
}

function tidySingleLine(text: string): string {
  return text
    .replace(/[\t\n\r]/g, ' ')
    .replace(CONTROL_ALL, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function tidyMultiLine(text: string): string {
  return text
    .replace(CONTROL_EXCEPT_TAB_NEWLINE, '')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ \n/g, '\n')
    .replace(/\n /g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function sanitizeUserText(raw: string, shape: TextShape): SanitizeResult {
  if (LONE_SURROGATE.test(raw) || REPLACEMENT_CHARACTER.test(raw)) {
    return { status: 'invalid_encoding' };
  }
  let text = raw.normalize('NFC');
  if (shape !== 'single_line') {
    text = text.replace(/\r\n?/g, '\n');
  }
  if (shape !== 'notation') {
    text = stripHtml(text);
  }
  text = shape === 'single_line' ? tidySingleLine(text) : tidyMultiLine(text);
  return { status: 'ok', text };
}

/**
 * The message a form shows beside a field whose submitted text arrived with
 * broken encoding. One wording everywhere, so the services that clean text
 * do not each invent their own.
 */
export const INVALID_TEXT_ENCODING_MESSAGE =
  'This text contains characters that could not be read. Please retype it.';

/**
 * Clean one submitted field, or refuse it as a field error. For the common
 * service shape where a field is cleaned before its own checks run; a service
 * that gathers several field errors into one refusal uses `sanitizeUserText`
 * and records the encoding failure beside its other errors instead.
 */
export function cleanUserText(raw: string, shape: TextShape, fieldName: string): string {
  const result = sanitizeUserText(raw, shape);
  if (result.status === 'invalid_encoding') {
    throw new ValidationError(INVALID_TEXT_ENCODING_MESSAGE, {
      fieldErrors: { [fieldName]: INVALID_TEXT_ENCODING_MESSAGE },
    });
  }
  return result.text;
}
