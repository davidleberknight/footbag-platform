/**
 * freestyleAliasGovernance.ts
 *
 * Curator-authored allow-list governing which `freestyle_trick_aliases`
 * rows surface on compact-object browse surfaces (dictionary cards,
 * landing Core Tricks, glossary cards). The DB alias table holds every
 * folk-name and equivalence relationship; only the entries explicitly
 * approved here are rendered as `≡ reading` lines on browse surfaces.
 *
 * Why an allow-list module, not an SQL taxonomy column. Key reasons:
 *   - Semantic-equivalence philosophy is still being refined; locking
 *     a taxonomy into SQL now risks premature ontology commitment.
 *   - Allow-list module is auditable, reversible, and explicit per
 *     curator entry.
 *   - DB taxonomy can be formalized later once the equivalence
 *     ontology stabilizes.
 *
 * Restraint-first default: an alias NOT listed here is NOT surfaced
 * on browse. Browse surfaces show only meaningful semantic
 * compression, never every textual relationship.
 *
 * Forever-rules:
 *   - Each entry carries a curator reason (rendered nowhere; serves
 *     as institutional memory for why a decision was made).
 *   - `surfaceOnBrowse: true` requires the alias to be:
 *       1. canonically locked (no pending doctrine resolution),
 *       2. semantically meaningful (compositional equivalence or
 *          a widely-used canonical shorthand),
 *       3. not a different trick wearing the same surface name.
 *   - `surfaceOnBrowse: false` rows are kept here (not deleted) so
 *     the rationale survives in code review.
 *   - Symbolic-equivalence chains (curator-authored multi-reading
 *     compositional decompositions) live in
 *     `freestyleSymbolicEquivalences.ts`, NOT here. This module is
 *     for single-string aliases drawn from `freestyle_trick_aliases`.
 *
 * Audit basis: the 5 atom-level aliases in `freestyle_trick_aliases`,
 * each appearing below with the curator decision.
 */

export interface AliasGovernanceEntry {
  readonly trickSlug:        string;   // canonical DB slug
  readonly aliasText:        string;   // DB alias_text (case-preserved)
  readonly surfaceOnBrowse:  boolean;  // false = filter out of compact-object browse surfaces
  readonly displayAs:        string | null;  // override rendered form (e.g., 'ATW' uppercase); null = use aliasText verbatim
  readonly reason:           string;   // curator institutional memory; not rendered
}

export const ALIAS_GOVERNANCE_ENTRIES: readonly AliasGovernanceEntry[] = [
  // ── Atom-level aliases (5 entries) ─────────────────────
  {
    trickSlug:       'around-the-world',
    aliasText:       'atw',
    surfaceOnBrowse: true,
    displayAs:       'ATW',
    reason:          'Canonical educational equivalence per Batch 1 user spec PART 3; uppercase form per established community convention.',
  },
  {
    trickSlug:       'illusion',
    aliasText:       'outside-in mirage',
    surfaceOnBrowse: false,
    displayAs:       null,
    reason:          'Formula Accountability Slice 2026-05-17: surfaceOnBrowse flipped to false. Maintainer review found the "outside-in mirage" reading misrepresents illusion (illusion is a dex with mid-flight rotation, not a directional mirage variant). Alias preserved as a folk record but suppressed from compact browse surfaces to avoid teaching a misleading decomposition. Re-enable only with explicit Wave-2 doctrine support.',
  },
  {
    trickSlug:       'legover',
    aliasText:       'leg-over',
    surfaceOnBrowse: false,
    displayAs:       null,
    reason:          'Orthographic-only variant (hyphenation). User spec PART 3A forbids orthographic noise on compact surfaces.',
  },
  {
    trickSlug:       'osis',
    aliasText:       'frigidosis',
    surfaceOnBrowse: false,
    displayAs:       null,
    reason:          'Wave-2 pending (Theme 2 focus-trick set per project_red_consultation_state). Folk-name overload; not a clean equivalence.',
  },
  {
    trickSlug:       'swirl',
    aliasText:       'reverse swirl',
    surfaceOnBrowse: false,
    displayAs:       null,
    reason:          'Reverse-swirl is a direction-variant trick, not an alias of swirl. Surfacing it as ≡ would misrepresent the relationship.',
  },
];

/**
 * Look up an alias-governance entry. Returns null when the (slug, alias)
 * pair is not in the allow-list. Restraint-first: callers should treat
 * a null return as "do not surface on browse".
 */
export function getAliasGovernanceEntry(
  trickSlug: string,
  aliasText: string,
): AliasGovernanceEntry | null {
  const normalizedSlug  = trickSlug.trim().toLowerCase();
  const normalizedAlias = aliasText.trim().toLowerCase();
  return ALIAS_GOVERNANCE_ENTRIES.find(
    e =>
      e.trickSlug === normalizedSlug &&
      e.aliasText.toLowerCase() === normalizedAlias,
  ) ?? null;
}

/**
 * Filter a list of (alias_text) strings for a given trick slug, returning
 * only those approved for compact-object browse surfaces in their
 * display form (respecting `displayAs` overrides).
 *
 * Aliases not in the allow-list are dropped, restraint-first default.
 */
export function filterAliasesForBrowse(
  trickSlug: string,
  aliasTexts: readonly string[],
): string[] {
  const out: string[] = [];
  for (const alias of aliasTexts) {
    const entry = getAliasGovernanceEntry(trickSlug, alias);
    if (entry?.surfaceOnBrowse) {
      out.push(entry.displayAs ?? alias);
    }
  }
  return out;
}
