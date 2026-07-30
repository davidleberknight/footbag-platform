/**
 * Pure name-normalization helpers shared across services.
 *
 * These are domain-level name utilities (surname extraction, accent folding,
 * surname-key comparison) used by both identity/auth flows and the historical
 * player profile views. Kept free of DB access, Express imports, and any
 * service-specific state so they can be trivially unit-tested and reused.
 */

/**
 * Strip accents for comparison (Unicode NFD decomposition, remove combining marks).
 */
export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Extract the surname (last word) from a name after stripping common suffixes.
 */
export function extractSurname(name: string): string {
  const suffixes = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'phd', 'md']);
  const words = name.trim().split(/\s+/);
  while (words.length > 1 && suffixes.has(words[words.length - 1].replace(/\.$/, '').toLowerCase())) {
    words.pop();
  }
  return words[words.length - 1] || '';
}

/**
 * Normalized comparison key for a surname: accent-folded, lowercased last word.
 * Empty string for null/undefined/empty input, so two missing names never compare equal.
 */
export function surnameKey(name: string | null | undefined): string {
  if (!name) return '';
  return stripAccents(extractSurname(name)).toLowerCase();
}

// Words nobody may carry as their own name or profile URL, because each one
// asserts a position the person does not hold. A member's display name is
// public attribution wherever their uploads appear, so a name reading as an
// official account impersonates the platform to every visitor, and no
// after-the-fact deletion undoes what was shown in the meantime.
const RESERVED_ROLE_WORDS: ReadonlySet<string> = new Set([
  'admin', 'administrator', 'system', 'support', 'moderator', 'staff',
]);
const RESERVED_PLATFORM_WORDS: ReadonlySet<string> = new Set([
  'ifpa', 'footbag', 'official',
]);

// Digit and symbol spellings of letters, folded away before comparison so
// "Adm1n" and "Supp0rt" are caught alongside their plain spellings. Only these
// substitutions are folded: cross-script lookalikes need no entry here, since a
// name mixing writing systems is already refused outright.
const SUBSTITUTION_FOLD: ReadonlyMap<string, string> = new Map([
  ['0', 'o'], ['1', 'i'], ['3', 'e'], ['4', 'a'], ['5', 's'], ['7', 't'],
  ['@', 'a'], ['$', 's'], ['!', 'i'], ['|', 'i'],
]);

// Whitespace plus the punctuation that joins name parts, so a claim written as
// "Smith-Admin" or "ifpa_official_smith" separates into words the same way
// "Smith Admin" does.
const NAME_WORD_SEPARATORS = /[\s'’._-]+/;

function foldNameWord(word: string): string {
  return stripAccents(word)
    .toLowerCase()
    .replace(/[013457@$!|]/g, ch => SUBSTITUTION_FOLD.get(ch) ?? ch);
}

/**
 * The first word of `text` that claims a role or an official position, or null
 * when none does. Whole words only: a longer name that merely contains one,
 * such as the surname Stafford, is a real name and passes. Comparison is
 * accent-folded, case-insensitive, and folds digit-for-letter substitutions.
 */
export function matchReservedNameWord(text: string | null | undefined): string | null {
  if (!text) return null;
  for (const word of text.split(NAME_WORD_SEPARATORS)) {
    if (!word) continue;
    const folded = foldNameWord(word);
    if (RESERVED_ROLE_WORDS.has(folded) || RESERVED_PLATFORM_WORDS.has(folded)) return word;
  }
  return null;
}
