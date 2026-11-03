import latinAscii from '../public/js/latin-ascii.json';

// The one rule that turns text into a slug or a hashtag body, everywhere the site or the
// pipeline makes one, so the same name always yields the same token.
//
// Letters come from the Unicode CLDR "Latin-ASCII" transform (release 49), the
// transliteration standard ICU ships: accents are removed (decompose, drop the marks,
// recompose), then each remaining character is mapped through the transform's table, so
// "ß" reads "ss", "Æ" reads "AE" and "Ł" reads "L". The table is one committed file,
// `src/public/js/latin-ascii.json`, carrying the Unicode License V3 notice; the browser
// scripts and the pipeline read the same file. Text in any other script maps to nothing,
// so a name with no Latin form yields no token.
//
// Then: lowercase; apostrophes are deleted, because they sit inside a word rather than
// between two ("O'Brien" reads "obrien"); every other run of characters outside a to z
// and 0 to 9 becomes one underscore, trimmed from both ends.
const LATIN_ASCII: Readonly<Record<string, string>> = latinAscii.map;

const APOSTROPHE = /'/g;
const COMBINING_MARK = /\p{Mn}/gu;

export function slugifyForTag(input: string): string {
  return foldKeepingCase(input).toLowerCase();
}

// The one rule with capitals left as typed: a hashtag is matched in lowercase but
// shown as its author capitalized it (#WorldsJapan), so the stored display form
// keeps them and only the comparison form is lowered.
function foldKeepingCase(input: string): string {
  const unaccented = input.normalize('NFD').replace(COMBINING_MARK, '').normalize('NFC');
  let ascii = '';
  for (const ch of unaccented) ascii += LATIN_ASCII[ch] ?? ch;
  return ascii
    .replace(APOSTROPHE, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Whether text holds a letter or digit the rule cannot convert: one with no form
 * in a to z or 0 to 9 even after the standard table (a word in Han, Cyrillic or
 * Arabic script, say). Such a tag or slug is refused rather than folded, because
 * folding would silently drop part of what the person wrote.
 */
export function hasUnconvertibleLetters(input: string): boolean {
  const unaccented = input.normalize('NFD').replace(COMBINING_MARK, '').normalize('NFC');
  for (const ch of unaccented) {
    const mapped = LATIN_ASCII[ch] ?? ch;
    if (/[^A-Za-z0-9]/.test(mapped) && /[\p{L}\p{N}]/u.test(mapped)) return true;
  }
  return false;
}

/**
 * A typed hashtag in its stored form: any leading `#` dropped, the rest folded by the one
 * rule, the `#` put back. Empty when nothing foldable is left, so the caller drops it.
 */
export function typedTag(raw: string): string {
  const body = slugifyForTag(raw.trim().replace(/^#+/, ''));
  return body ? `#${body}` : '';
}

/**
 * A typed hashtag in the form it is saved and shown: folded by the one rule like
 * `typedTag`, with the author's capitals kept for display. Its lowercase is the
 * form every match compares.
 */
export function typedTagForDisplay(raw: string): string {
  const body = foldKeepingCase(raw.trim().replace(/^#+/, ''));
  return body ? `#${body}` : '';
}

// A player hashtag credits the person performing in a media item. A member is
// credited by their own slug, the same token their uploader tag carries, so one
// person reads the same whether they uploaded a clip or play in it; a historical
// person is credited by their record's name folded the same way a member's
// default slug is.
export const PLAYER_TAG_PREFIX = '#player_';

export function playerTagForMemberSlug(slug: string): string {
  return `${PLAYER_TAG_PREFIX}${slug.toLowerCase()}`;
}

export function playerTagForName(name: string): string {
  return `${PLAYER_TAG_PREFIX}${slugifyForTag(name)}`;
}
