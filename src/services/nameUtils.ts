/**
 * Pure name-normalization helpers shared across services.
 *
 * These are domain-level name utilities (surname extraction, accent folding,
 * surname-key comparison) used by both identity/auth flows and the historical
 * player profile views. Kept free of DB access, Express imports, and any
 * service-specific state so they can be trivially unit-tested and reused.
 */

/**
 * Assemble a member's two recorded name parts into the full name that is
 * stored, matched against the legacy and historical records, and fed to the
 * whole-name matcher.
 *
 * Given names lead. The order is not a claim about how anyone writes their own
 * name, which is what the display name is for: it is the order the curated
 * name-variant rows are keyed in, and the order the nickname expansion assumes
 * when it looks at the first token. Either part may be empty.
 */
export function assembleFullName(givenNames: string, familyName: string): string {
  return [givenNames.trim(), familyName.trim()].filter(Boolean).join(' ');
}

/**
 * The surname key to match a member by.
 *
 * Prefers the recorded family name, and falls back to guessing it from the full
 * name for a record that has no parts stored. The fallback is what keeps the
 * legacy and historical records working: they carry one name string and always
 * will, so the guess remains the only thing available on that side of every
 * comparison.
 */
export function memberSurnameKey(
  parts: { family_name?: string | null; given_names?: string | null; real_name?: string | null },
): string {
  if (parts.family_name) return memberSurnameCompareKey(parts.family_name);
  // No family name means no recorded parts at all: registration requires one,
  // and a member with a single legal name records it here. So the only rows
  // reaching this are ones written before the parts existed, plus purged stubs.
  return surnameKey(parts.real_name ?? '');
}

/**
 * Does a whole name carry this member's surname?
 *
 * The two sides are not the same shape, and that asymmetry is the whole point:
 * the member's side is a recorded family name that may be several words, while
 * the target side is a single name string from a legacy or historical record
 * that never will be split. Comparing last word to last word, as the platform
 * did before the parts existed, silently refuses every member whose family name
 * is more than one word: "garcia lopez" can never equal "lopez". Comparing the
 * tail instead accepts both, and still refuses a name that merely ends in the
 * same final word.
 */
const NAME_SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'phd', 'md']);

function stripTrailingSuffixes(words: string[]): string[] {
  const out = [...words];
  while (out.length > 1 && NAME_SUFFIXES.has(out[out.length - 1].replace(/\.$/, '').toLowerCase())) {
    out.pop();
  }
  return out;
}

/**
 * A member-side surname reduced to the shape the target side is reduced to.
 *
 * Both halves of the comparison have to be folded the same way or the rule
 * refuses names it should accept. Internal spacing is collapsed, so a family
 * name entered as "Garcia  Lopez" still matches the record that carries it, and
 * a trailing suffix is dropped, because the target side drops one before
 * comparing. Used for the recorded family name and for a declared former
 * surname alike: a former surname is self-asserted free text and needs the
 * folding more, not less.
 */
export function memberSurnameCompareKey(surname: string | null | undefined): string {
  if (!surname) return '';
  const words = stripTrailingSuffixes(surname.trim().split(/\s+/).filter(Boolean));
  return stripAccents(words.join(' ')).toLowerCase();
}

export function surnameKeyMatchesName(
  memberSurname: string,
  targetName: string | null | undefined,
): boolean {
  if (!memberSurname || !targetName) return false;
  // Suffixes are dropped from the target the same way the last-word derivation
  // drops them, so "Maria Garcia Lopez Jr" still ends with the family name.
  const words = stripTrailingSuffixes(targetName.trim().split(/\s+/).filter(Boolean));
  const target = stripAccents(words.join(' ')).toLowerCase();
  return target === memberSurname || target.endsWith(` ${memberSurname}`);
}

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
  const words = name.trim().split(/\s+/);
  while (words.length > 1 && NAME_SUFFIXES.has(words[words.length - 1].replace(/\.$/, '').toLowerCase())) {
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
