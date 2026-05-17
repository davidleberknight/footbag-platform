/**
 * freestyleFamilyInvariants.ts
 *
 * Curator-authored family-level structural invariants — pedagogical
 * surface that teaches the conserved structure shared by all members
 * of a "terminal family" (a family defined by a shared terminal /
 * recovery mechanic). Rendered as a small subdued line below the
 * family-view section heading and above the card stack.
 *
 * Slice I pilot (2026-05-16): Whirl family only.
 *
 * ── Observational distinction (NOT canonical taxonomy) ──────────────
 *
 * Per curator (2026-05-16), two different ontology axes share the same
 * `trick_family` column today:
 *
 *   A. Terminal families — conserved ending / recovery mechanic.
 *      Whirl (leggy in dex > ss clipper), Butterfly (hippy out dex >
 *      ss clipper), Mirage (hippy in dex > op toe), Osis (spin > ss
 *      clipper), Swirl (leggy xbd out dex > ss clipper) are candidates.
 *      These ARE the right targets for invariant entries.
 *
 *   B. Entry / topology / modifier systems — NOT terminal families.
 *      Paradox, symposium, spinning, ducking, stepping, pixie/fairy/
 *      atomic share entry, body, timing, plant, or set mechanics —
 *      different ontology axes. They DO NOT belong here; their place
 *      is on topology / component / modifier surfaces.
 *
 * See exploration/dictionary-glossary-normalization-audit-2026-05/
 * FAMILY_LEVEL_INVARIANTS.md addendum for the full distinction.
 *
 * ── Restraint ──────────────────────────────────────────────────────
 *
 * Per [[freestyle-topology-governance]] skill + [[feedback_reversible_
 * content_governance]]:
 *
 *   - No auto-derivation from `freestyle_tricks.operational_notation`.
 *     Auto-derivation would lie on heterogeneous families.
 *   - One entry per family slug, or no entry (absence = silence).
 *   - Curator-confirmed only.
 *   - Adding an entry here does NOT change the `trick_family` semantics
 *     or any other canonical classification. This is a pedagogical
 *     surface, not a taxonomy column.
 *   - Plain text content; the template wraps it in <code> at render
 *     time. No tokenization in this slice (visual restraint).
 */

export const FAMILY_INVARIANTS: ReadonlyMap<string, string> = new Map([
  // Whirl pilot. Every whirl-family trick (paradox-whirl, ducking-whirl,
  // hatchet, mullet, montage, etc.) shares this terminal mechanic, even
  // when its compositional reading differs. Sourced from `whirl`'s
  // operational-notation column with the `[set] >` set-prefix dropped
  // for token-clean rendering.
  ['whirl', 'leggy in dex > ss clipper'],
]);

/**
 * Resolve the family-level shared-terminal-structure invariant for a
 * family slug. Returns null when no curator-authored entry exists for
 * the slug — the rendering surface treats null as silence (no line
 * emitted under the family heading).
 */
export function getFamilyInvariant(familySlug: string): string | null {
  return FAMILY_INVARIANTS.get(familySlug) ?? null;
}
