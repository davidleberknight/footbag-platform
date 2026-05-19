/**
 * freestyleTrickKindOverrides.ts
 * ===============================
 *
 * Curator-authored discriminator for the `kind` field on every
 * `DictionaryTrickCard`. Slice A of the 2026-05 dictionary/glossary
 * normalization plan (see exploration/dictionary-glossary-normalization-
 * audit-2026-05/AUDIT.md §3.1).
 *
 * Why this layer exists
 * ---------------------
 * `freestyle_tricks` mixes structural roles in one table: true tricks (whirl,
 * ripwalk, mobius) alongside modifiers (spinning, paradox), set operators
 * (pixie, atomic, quantum), and catch surfaces (toe-stall, clipper-stall,
 * cloud-stall). The trick-browse surfaces (ADD / family / category /
 * component / topology) should render ONLY true tricks; modifiers /
 * operators / surfaces have their own homes (operator board, /freestyle/sets,
 * glossary §2 surfaces).
 *
 * This module supplies the discriminator. Each slug maps to one of:
 *   - 'trick'           — true trick; ends in bag contact and has structural
 *                         depth (compound, dex, named structure)
 *   - 'modifier'        — body or set modifier; transforms a base trick
 *   - 'operator'        — set primitive that initiates a trick (pixie, atomic, ...)
 *   - 'surface'         — catch surface; structural primitive (toe-stall, ...)
 *   - 'pending-review'  — curator-flagged ambiguity; never on public surfaces
 *
 * Ontology-layer constraint (per user 2026-05-16): this module classifies
 * STRUCTURAL ROLE only. It does not collapse any of the four ontology
 * layers (canonical nomenclature / descriptive movement shorthand /
 * symbolic decomposition / embodied movement analogy) into a single
 * field. `kind` is metadata about role, not content about meaning.
 *
 * Reversibility
 * -------------
 * Per [[feedback_reversible_content_governance]], this lives as TypeScript
 * content rather than a SQL column while the Red ontology consultation is
 * still in flight. Promotion to a `freestyle_tricks.kind` column waits
 * until Red Wave 2 (operator-vs-trick boundary) is answered.
 *
 * Authoring rule
 * --------------
 * Lists are explicit. If a slug is not in any of the four override sets
 * below, the resolver returns 'trick'. Curator-confirmed at audit time
 * against ground-truth queries on freestyle_tricks (2026-05-16). When new
 * trick rows land, the default ('trick') applies; curators add to the
 * appropriate set only when the discriminator should differ.
 */

export type FreestyleTrickKind =
  | 'trick'
  | 'modifier'
  | 'operator'
  | 'surface'
  | 'pending-review';

// All 11 slugs with category='modifier' in freestyle_tricks as of 2026-05-16,
// plus one category='body' override that is really a modifier (spin).
//
// Note: barraging and stepping are curator-recognized as set-cluster
// modifiers in the operator board, but the DB category column places them
// here. Modifier classification preserved per DB.
const MODIFIER_SLUGS = new Set<string>([
  'barraging',
  'blazing',
  'ducking',
  'gyro',
  'illusioning',
  'paradox',
  'spinning',
  'stepping',
  'symposium',
  'tapping',
  'terraging',
  // category='body' overrides:
  'spin',
  // Formula Accountability Slice 2026-05-17: spyro is a folk synonym for
  // a spinning-class body operator (see glossary §11 spyro→inspin mapping
  // and the 2026-05-17 classification_drift_report). The DB row carries
  // category='body' adds=1 but the trick is not a standalone scoring
  // element — it's a rotational descriptor. Filtering it out of the
  // public 1-ADD trick list. Preserved in glossary §11 as folk vocabulary.
  'spyro',
  // Emergency public-readiness slice 2026-05-19 (Notation Normalization
  // Wave follow-on): double-spin is a body/operator concept, not a
  // standalone trick — same status as `spin`. It is not a settled
  // canonical trick row absent a bag-contact resolution. Curator ruling.
  // Filters it off the canonical trick browse views (ADD / family /
  // movement-system / topology / category). The DB row stays active for
  // operator-layer surfaces (glossary / movement-system as a modifier).
  'double-spin',
]);

// All 9 slugs with category='set' in freestyle_tricks as of 2026-05-16.
// Includes pogo + rooted at adds=0 (curator-flagged: they are stationary
// set primitives, not 0-ADD tricks).
const OPERATOR_SLUGS = new Set<string>([
  'atomic',
  'fairy',
  'furious',
  'pixie',
  'pogo',
  'quantum',
  'rooted',
  'sailing',
  'shooting',
]);

// Catch surfaces that should NOT appear as tricks in the difficulty
// ladder. Reserved for the narrow case where the row is a bare surface
// NAME masquerading as a trick — not for legitimate stall primitives.
//
// `clipper` (category='body' in the DB, ADD=1) is the load-bearing
// example: it's the surface name, not the stall trick. The actual
// 1-ADD trick is `clipper-stall`, which stays `kind='trick'`.
//
// Curator note: every stall in `freestyle_tricks` with category='surface'
// (toe-stall, clipper-stall, cloud-stall, sole-stall, head-stall, etc.)
// DOES end in bag contact — passes the user's discriminating criterion
// "all tricks must end with bag contact" — and is legitimately a 1-2 ADD
// trick. Those rows are NOT in this set. They surface in the ADD ladder
// as the simplest tricks. The future "isSurface" facet (Slice E/F) will
// add the glossary §2 cross-link without conflating it with kind.
const SURFACE_SLUGS = new Set<string>([
  'clipper',
]);

// Curator-flagged ambiguities. Each carries an inline note that surfaces
// in the QC panel; never on public browse views.
const PENDING_REVIEW_SLUGS = new Set<string>([
  // 2026-05-16 user-flagged: should this be a set/modifier or a true
  // trick? Compound rows with `base_trick='surging'` exist; the trick's
  // own structural role is unresolved.
  'surging',
]);

/**
 * Resolve the kind for a trick slug.
 *
 * Order: pending-review > modifier > operator > surface > trick (default).
 * Pending-review wins over any other classification so a curator-flagged
 * row is never silently routed to a public surface even when other lists
 * also contain it.
 */
export function resolveTrickKind(slug: string): FreestyleTrickKind {
  if (PENDING_REVIEW_SLUGS.has(slug)) return 'pending-review';
  if (MODIFIER_SLUGS.has(slug))       return 'modifier';
  if (OPERATOR_SLUGS.has(slug))       return 'operator';
  if (SURFACE_SLUGS.has(slug))        return 'surface';
  return 'trick';
}

/** Exposed for tests + the future QC panel. */
export const TRICK_KIND_OVERRIDE_SETS = {
  modifier:       MODIFIER_SLUGS,
  operator:       OPERATOR_SLUGS,
  surface:        SURFACE_SLUGS,
  'pending-review': PENDING_REVIEW_SLUGS,
} as const;
