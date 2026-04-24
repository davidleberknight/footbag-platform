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
