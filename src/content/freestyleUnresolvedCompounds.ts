/**
 * freestyleUnresolvedCompounds.ts
 * ================================
 *
 * Curator-authored allow-list of trick slugs whose structural
 * decomposition is folk-derived, mechanically ambiguous, or otherwise
 * pending refinement.
 *
 * Why this layer exists
 * ---------------------
 * Several rows sit awkwardly in families because they are folk-named,
 * lack operational notation, or have hybrid mechanics. The dictionary
 * should acknowledge this honestly, without:
 *   - deleting the rows
 *   - inventing a separate "Unresolved" browse view
 *   - over-hardening taxonomy
 *   - pretending decomposition certainty exists
 *
 * The mechanism is a single binary flag rendered as a small italic pill
 * on the dictionary trick card: "pending decomposition refinement".
 * That is the entire ontology footprint. No severity scale, no
 * category, no auto-classification, no tooltip, no link.
 *
 * Reversibility
 * -------------
 * Pure TypeScript content. Removing an entry → the pill disappears
 * from that card on the next request. No DB column, no migration.
 *
 * Authoring rule
 * --------------
 * Curator-only. Adding an entry requires a curator decision tied to a
 * specific structural ambiguity. The directive forbids hardening this
 * into a doctrine; entries should NOT proliferate.
 */

export const UNRESOLVED_COMPOUNDS: ReadonlySet<string> = new Set<string>([
  // Folk-named direction-variant whose canonical structural role is
  // unconfirmed (no op-notation; explicitly deferred).
  'rev-up',
  // Folk-derived; no modifier links; the orphan after the
  // clipper-stall family retirement.
  'reaper',
  // Hybrid: chain reading places it in whirl-family lineage, but
  // op-notation uses front-whirl dex. Explicitly deferred.
  'surreal',
  // Same hybrid pattern as surreal. Explicitly deferred.
  'montage',
  // witchdoctor is not flagged: Red published a composite-base reading
  // (atom-smasher(4) + symposium(+1) = 5) that mechanically converges
  // through the convergence-rule extension. Its structural identity is
  // no longer single-sourced, so the pill would misrepresent the row's
  // resolution state.
  // Folk name; curator-flagged.
  'fury',
  // Mechanically resembles rev-whirl/hatchet but no curator
  // confirmation yet (kept in rev-whirl family).
  'surgery',
  // 'tomahawk' is not flagged: strong external consensus
  // (FM 'Ducking Paradox Whirl' + PB 'Clipper Ducking far Whirl')
  // decomposes it to ducking+paradox+whirl (far = paradox per Red).
  // The chain reading is authored in
  // freestyleSymbolicEquivalences.ts with curatorConfirmPending=false.
]);

/**
 * Returns true when a trick slug is curator-flagged as folk-derived /
 * mechanically ambiguous / pending decomposition refinement. Callers
 * render a small italic pill on the dictionary trick card; suppress
 * the pill otherwise.
 */
export function isUnresolvedCompound(slug: string): boolean {
  return UNRESOLVED_COMPOUNDS.has(slug);
}
