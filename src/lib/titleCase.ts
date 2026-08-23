/**
 * Title Case for platform-authored interface chrome: button and call-to-action
 * labels, page titles, hero titles, and section headings.
 *
 * This module is the single definition of that rule. The view-layer rule
 * describes it in prose and points here; `tests/unit/heading-case-conformance.test.ts`
 * imports this function to check the templates and services against it. Rule,
 * gate, and any bulk fix therefore all read one word list, so the three cannot
 * drift apart the way a prose-only rule did.
 *
 * Two things this deliberately does not do, because both would re-case text the
 * platform does not own:
 *
 * - A word carrying an uppercase letter anywhere but the first position is left
 *   exactly as written. That covers acronyms (ADD, IFPA), the notation the
 *   freestyle surface uses, and any name whose owner capitalises it their own
 *   way. Forcing such a word through the rule would corrupt real data.
 * - Nothing here runs at render time. By the time a heading reaches a template
 *   it is one string, and this function cannot tell an authored literal from an
 *   interpolated member or club name inside it. Casing is applied where the
 *   literal is written, and interpolated values are shown verbatim.
 */

/**
 * The words that stay lowercase inside a title, unless they land first or last.
 * Kept as an ordered array as well as a set so the view-layer rule and any
 * message can render the list in a stable order rather than a hash order.
 */
export const TITLE_CASE_MINOR_WORDS: readonly string[] = [
  'a',
  'an',
  'as',
  'the',
  'and',
  'or',
  'nor',
  'but',
  'to',
  'of',
  'in',
  'on',
  'at',
  'by',
  'for',
];

const MINOR_WORD_SET = new Set(TITLE_CASE_MINOR_WORDS);

/**
 * True when the token is an HTML character reference rather than a word.
 * Named references are case-sensitive, so casing `&amp;` yields `&Amp;`, which
 * no longer decodes and renders as literal text on the page.
 */
function isHtmlEntity(word: string): boolean {
  return /^&(?:#\d+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);$/.test(word);
}

/** True when the word carries an uppercase letter past its first character. */
function hasInteriorCapital(word: string): boolean {
  return /\p{Lu}/u.test(word.slice(1));
}

/**
 * Uppercase the first letter, leaving every other character untouched.
 *
 * Letter-aware rather than ASCII-aware: searching for `[a-zA-Z]` would skip
 * past an accented initial and capitalise mid-word, turning "Uber" spelled with
 * an umlaut into a word with a capital in second position. A letter whose
 * uppercase form is a different length (the German sharp s uppercases to two
 * characters) is left exactly as written rather than silently respelled.
 */
function capitaliseFirstLetter(segment: string): string {
  const index = segment.search(/\p{L}/u);
  if (index === -1) return segment;
  const letter = String.fromCodePoint(segment.codePointAt(index)!);
  const upper = letter.toUpperCase();
  if (upper.length !== letter.length) return segment;
  return segment.slice(0, index) + upper + segment.slice(index + letter.length);
}

/**
 * Apply the rule to one whitespace-delimited word. `isEdge` marks the first and
 * last words of the title, where a minor word is capitalised like any other.
 *
 * A hyphen is not a word boundary, so "consecutive-kicks" becomes
 * "Consecutive-kicks" and only the leading segment is touched. Treating each
 * segment as its own word reads better on some compounds and worse on others
 * ("Consecutive-Kicks" against "Co-Leader", "Sub-Step"), and telling those apart
 * needs a list of prefixes on top of the minor words. One word list is the point
 * of this module, so the deterministic rule wins over the prettier one.
 *
 * A word starting with a digit is left exactly as written, which keeps ordinals
 * intact: without it "45th" becomes "45Th" and "1st Place" becomes "1St Place".
 * It also covers the game names "2-Square" and "4-Square".
 */
function caseWord(word: string, isEdge: boolean): string {
  if (word.length === 0) return word;
  if (isHtmlEntity(word)) return word;
  if (/^[^\p{L}]*\d/u.test(word)) return word;
  if (hasInteriorCapital(word)) return word;

  // Compare on letters only, so a trailing question mark or a wrapping paren
  // does not stop a minor word being recognised. Letter-aware, so a word whose
  // letters are not ASCII is not mistaken for a shorter minor word once its
  // non-ASCII characters are stripped.
  const bare = word.replace(/[^\p{L}]/gu, '').toLowerCase();
  if (!isEdge && MINOR_WORD_SET.has(bare)) return word.toLowerCase();

  return capitaliseFirstLetter(word);
}

/**
 * Return the Title Case form of an interface label or heading.
 *
 * Idempotent: applying it to its own output changes nothing, which is what lets
 * the conformance gate assert `toTitleCase(text) === text` rather than needing a
 * separate predicate.
 */
export function toTitleCase(text: string): string {
  // Split on whitespace runs while keeping them, so the original spacing,
  // including a non-breaking space, survives the round trip untouched.
  const parts = text.split(/(\s+)/);
  const wordIndices = parts
    .map((part, i) => (part.trim().length > 0 ? i : -1))
    .filter((i) => i !== -1);
  if (wordIndices.length === 0) return text;

  const first = wordIndices[0];
  const last = wordIndices[wordIndices.length - 1];

  return parts
    .map((part, i) => {
      if (part.trim().length === 0) return part;
      return caseWord(part, i === first || i === last);
    })
    .join('');
}
