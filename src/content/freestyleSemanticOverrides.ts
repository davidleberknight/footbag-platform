/**
 * Rules for the trick page's description and reverse-pair formula.
 *
 * The two description rules decide whether a trick's description is reader-
 * facing prose or a placeholder that belongs in the notation; they are rules,
 * not content, so they stay in code. The rev(0) explainer is the page copy that
 * accompanies every reverse-pair formula. Which tricks carry a formula, and the
 * curator descriptions themselves, are database columns.
 */

/**
 * Returns true when `description` is a literal (whitespace-normalized,
 * case-insensitive) echo of `notation`. Used by the service layer to
 * suppress the description rendering on primitive trick pages where
 * the DB description merely repeats the JOB notation.
 *
 * Non-redundant descriptions (including descriptions that contain
 * the notation as a substring but add prose, or descriptions that
 * differ substantively) fall through and render normally.
 */
export function isDescriptionRedundantWithNotation(
  description: string | null,
  notation: string | null,
): boolean {
  if (!description || !notation) return false;
  const norm = (s: string): string => s.trim().replace(/\s+/g, ' ').toLowerCase();
  return norm(description) === norm(notation);
}

/**
 * The single home for the description-suppression policy. Returns true when a
 * trick description is a structural placeholder rather than reader-facing
 * prose, so it must never render on a public surface. Every public description
 * consumer (the trick About block and the SEO meta description) calls this, so
 * one rule governs every render path.
 *
 * Two placeholder shapes:
 *   - Thin auto-generated restatements ("Atomic-modified barrage.", "Popular
 *     freestyle trick.").
 *   - Formula-embedded backfills that belong in the notation column, not in
 *     prose: a JOB-notation chain, bracket tokens ([DEX], [BOD], ...), or
 *     ADD-arithmetic shorthand ("5 ADD = atomic(1) + blender(4)", or a bare
 *     signed bonus like "(+2)"). Uppercase "ADD =" and the signed-paren form
 *     are notation, never ordinary prose.
 *
 * The database row is never mutated; this governs rendering only.
 */
export function isDescriptionStructuralPlaceholder(description: string | null): boolean {
  if (!description) return false;
  const trimmed = description.trim();
  if (/^[A-Z][a-zA-Z-]+(?:-modified|-and-[a-zA-Z-]+ modified) [a-zA-Z][a-zA-Z -]*\.?$/.test(trimmed)) return true;
  if (/^Popular freestyle trick\.?$/i.test(trimmed)) return true;
  if (/^Common freestyle trick\.?$/i.test(trimmed)) return true;
  if (/; JOB /.test(trimmed)) return true;
  if (/\[(DEX|BOD|PDX|XBD|DEL|UNS|XDEX)\]/.test(trimmed)) return true;
  if (/\bADD\s*=/.test(trimmed)) return true;
  if (/\(\+\d+\)/.test(trimmed)) return true;
  return false;
}

/**
 * Shared explainer text for the rev(0) operator. Rendered alongside
 * every reverse-pair formula so the operator's semantics are always
 * visible on the page.
 */
export const REV_ZERO_EXPLAINER =
  'where rev(0) reverses the in↔out dex direction. ' +
  'Hippy / leggy notation supplements are stylistic; the pair differs ' +
  'only in dex direction once those are normalized.';
