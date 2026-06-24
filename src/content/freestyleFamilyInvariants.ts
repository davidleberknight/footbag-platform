/**
 * freestyleFamilyInvariants.ts
 *
 * Curator-authored family-level structural invariants: pedagogical
 * surface that teaches the conserved structure shared by all members
 * of a "terminal family" (a family defined by a shared terminal /
 * recovery mechanic). Rendered as a small subdued line below the
 * family-view section heading and above the card stack.
 *
 * ── Observational distinction (NOT canonical taxonomy) ──────────────
 *
 * Per curator, two different ontology axes share the same
 * `trick_family` column today:
 *
 *   A. Terminal families: conserved ending / recovery mechanic.
 *      Whirl (leggy in dex > ss clipper), Butterfly (hippy out dex >
 *      ss clipper), Mirage (hippy in dex > op toe), Osis (spin > ss
 *      clipper), Swirl (leggy xbd out dex > ss clipper) are candidates.
 *      These ARE the right targets for invariant entries.
 *
 *   B. Entry / topology / modifier systems: NOT terminal families.
 *      Paradox, symposium, spinning, ducking, stepping, pixie/fairy/
 *      atomic share entry, body, timing, plant, or set mechanics,
 *      different ontology axes. They DO NOT belong here; their place
 *      is on topology / component / modifier surfaces.
 *
 * ── Restraint ──────────────────────────────────────────────────────
 *
 *   - No auto-derivation from `freestyle_tricks.operational_notation`.
 *     Auto-derivation would lie on heterogeneous families.
 *   - One entry per family slug, or no entry (absence = silence).
 *   - Curator-confirmed only.
 *   - Adding an entry here does NOT change the `trick_family` semantics
 *     or any other canonical classification. This is a pedagogical
 *     surface, not a taxonomy column.
 *   - Plain text content; the template wraps it in <code> at render
 *     time. No tokenization (visual restraint).
 */

export const FAMILY_INVARIANTS: ReadonlyMap<string, string> = new Map([
  // Whirl pilot. Every standard-whirl-family trick (paradox-whirl,
  // ducking-whirl, montage, etc.) shares this conserved inward-leggy
  // terminal mechanic. Sourced from `whirl`'s operational-notation
  // column with the `[set] >` set-prefix dropped for token-clean
  // rendering.
  ['whirl', 'leggy in dex > ss clipper'],
  // Rev-Whirl sibling terminal family. The invariant text mirrors
  // Whirl's pedagogical form so the sibling-family relationship is
  // structurally legible at a glance:
  //
  //   Whirl:     leggy in  dex > ss clipper
  //   Rev-Whirl: leggy out dex > ss clipper
  //
  // The verbatim FRONT WHIRL [DEX] + OP CLIP [XBD] mechanics still
  // live in each member's per-row operational-notation column; the
  // family-invariant line is the pedagogical anchor, not the
  // mechanical specification.
  ['rev_whirl', 'leggy out dex > ss clipper'],
  // The four entries below are the remaining terminal-family candidates
  // named in the freestyle-topology-governance skill description (whirl
  // and rev-whirl are already covered above). Structural-form lines
  // follow the shallow-readable pedagogical convention established by
  // the whirl / rev-whirl pair, not raw operational-notation columns.
  //
  // Butterfly: outward-hippy entry, ss-clipper terminal. Anchors the
  // walking family (ripwalk, dimwalk, sidewalk, dada-curve, phoenix,
  // matador).
  ['butterfly', 'hippy out dex > ss clipper'],
  // Mirage: inward-hippy entry, op-toe terminal. Anchors a deep
  // cohort (paradox-mirage, atom-smasher, smear, blur, witchdoctor).
  // The op-toe terminator distinguishes mirage from whirl/butterfly's
  // ss-clipper terminal.
  ['mirage', 'hippy in dex > op toe'],
  // Osis: spin-entry, ss-clipper terminal. Anchors the rotational
  // base cohort (spinning-osis, ducking-osis, blender, torque). The
  // spin entry distinguishes osis from the leggy/hippy entries.
  ['osis', 'spin > ss clipper'],
  // Swirl: leggy-cross-body outward, ss-clipper terminal. The xbd
  // qualifier distinguishes swirl from butterfly's straight hippy out;
  // both share the ss-clipper terminator.
  ['swirl', 'leggy xbd out dex > ss clipper'],
]);

/**
 * Resolve the family-level shared-terminal-structure invariant for a
 * family slug. Returns null when no curator-authored entry exists for
 * the slug; the rendering surface treats null as silence (no line
 * emitted under the family heading).
 */
export function getFamilyInvariant(familySlug: string): string | null {
  return FAMILY_INVARIANTS.get(familySlug) ?? null;
}
