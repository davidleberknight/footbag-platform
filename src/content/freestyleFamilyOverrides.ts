/**
 * freestyleFamilyOverrides.ts
 *
 * Curator-authored re-mapping of `trick_family` at service-shape time.
 * Reversible TypeScript content module. NO `freestyle_tricks.trick_family`
 * column UPDATEs; NO SQL migrations. Delete an entry → the row reverts
 * to its DB trick_family value.
 *
 * Promote three rows out of the Whirl family into the new Rev-Whirl
 * sibling terminal family.
 *
 * ── Context ────────────────────────────────────────────────────────
 *
 * The Whirl family-level invariant is `leggy in dex > ss clipper`.
 * Op-notation evidence shows three rows in the Whirl family that DO
 * NOT preserve that invariant; they share a different conserved
 * terminal mechanic (front whirl dex > op clipper [XBD]). They are
 * siblings of Whirl, not descendants.
 *
 * Per the curator's terminal-vs-entry-topology distinction: Rev-Whirl
 * IS a true terminal family with its own conserved ending mechanic,
 * not a topology / modifier / entry system.
 *
 * ── Promotions ─────────────────────────────────────────────────────
 *
 * Three rows move from whirl-family → rev-whirl-family:
 *   - rev-whirl (3 ADD, dex): the canonical direction-variant anchor
 *   - hatchet (4 ADD, compound): mechanics-confirmed FRONT WHIRL dex
 *   - mullet (6 ADD, compound): mechanics-confirmed FRONT WHIRL dex
 *
 * EXPLICITLY DEFERRED (stay in whirl-family pending curator decision):
 *   - rev-up: folk name; no op-notation; canonical direction-variant
 *     status unconfirmed
 *   - tomahawk: folk name; no op-notation; structural decomposition
 *     uncertain
 *   - surreal: hybrid. Chain reading `surging paradox whirl` places it
 *     in whirl-family lineage, but op-notation uses FRONT WHIRL dex.
 *     Stays whirl-family by chain identity; detail page can surface
 *     the front-whirl execution as a contextual note (future work).
 *   - montage: same hybrid pattern as surreal.
 *
 * ── Restraint ──────────────────────────────────────────────────────
 *
 *   - No auto-derivation from operational_notation patterns. The
 *     three entries are curator-confirmed only.
 *   - No DB column UPDATE. The override map is read at service-shape
 *     time.
 *   - One-way redirection: row slug → target family slug. No
 *     multi-family memberships here.
 *   - Adding an entry here does NOT change `freestyle_tricks.trick_family`
 *     semantics or affect any other canonical surface.
 *   - This map is scoped to a single sibling-family promotion. Future
 *     promotions (butterfly / mirage / osis / swirl sibling families
 *     if discovered) require their own audit + approval.
 */

export const FAMILY_OVERRIDES: ReadonlyMap<string, string> = new Map([
  // Rev-Whirl sibling family: 3 row promotions. Each row's DB
  // trick_family is 'whirl'; the service re-buckets via this override
  // into the new 'rev-whirl' family.
  ['rev_whirl', 'rev_whirl'],   // canonical direction-variant anchor
  ['hatchet',   'rev_whirl'],   // mechanics-confirmed
  ['mullet',    'rev_whirl'],   // mechanics-confirmed

  // high-plains-drifter follows drifter into the drifter branch family
  // after the clipper-stall family retirement (see RETIRED_FAMILIES
  // below). One-way redirect: row no longer bucketed under clipper-stall.
  ['high_plains_drifter', 'drifter'],

  // Curator ruling: lose rev-up from the Whirl family until its
  // decomposition is resolved.
  // Override target is the row's own slug, producing a singleton
  // 'rev-up' family. The family-view bucketing's `length > 1` filter
  // then suppresses it from family browse. rev-up still surfaces on
  // ADD view (canonical row remains active) and carries the existing
  // pendingDecomposition pill via UNRESOLVED_COMPOUNDS. No new family
  // is created; no ontology hardened. Reversible by deleting this
  // entry: rev-up returns to whirl family on next request.
  ['rev_up', 'rev_up'],

  // Nearest-anchor family reassignment. Each row below sits in the lineage of a
  // derived branch family (torque / blender / double-leg-over / eggbeater) but
  // carried its root's label (osis / legover), so it browsed under the root and
  // never appeared on its own branch page. A trick belongs to the nearest
  // meaningful family anchor, not the oldest ancestor; these one-way redirects
  // make the branch the owning family. Branch families stay contained in their
  // root for display, so a row still reaches the root section as a branch member.

  // Torque (carried osis)
  ['torque', 'torque'],
  ['symposium_torque', 'torque'],
  ['forque', 'torque'],
  ['stepping_paradox_torque', 'torque'],
  ['spinning_symposium_torque', 'torque'],
  ['spinning_miraging_symposium_torque', 'torque'],
  ['fairy_gyro_torque', 'torque'],
  ['fairy_torque', 'torque'],
  ['reverse_swirling_paradox_torque', 'torque'],
  ['reverse_torque', 'torque'],
  ['toe_spinning_torque', 'torque'],
  ['atomic_ducking_torque', 'torque'],
  ['nuclear_torque', 'torque'],

  // Blender (carried osis)
  ['blender', 'blender'],
  ['fender', 'blender'],
  ['fender_bender', 'blender'],
  ['stepping_blender', 'blender'],
  ['reverse_blender', 'blender'],
  ['clipper_ducking_blender', 'blender'],
  ['reverse_swirling_blender', 'blender'],
  ['atomic_blender', 'blender'],

  // Double Leg Over (carried legover; stepping-ducking-smog was a route-out)
  ['double_leg_over', 'double_leg_over'],
  ['nova', 'double_leg_over'],
  ['gyro_double_leg_over', 'double_leg_over'],
  ['oh_wheely', 'double_leg_over'],
  ['atomic_double_leg_over', 'double_leg_over'],
  ['nuclear_double_leg_over', 'double_leg_over'],
  ['stepping_ducking_smog', 'double_leg_over'],

  // Eggbeater (carried legover; stepping-ducking-pigbeater was a route-out)
  ['eggbeater', 'eggbeater'],
  ['pigbeater', 'eggbeater'],
  ['mantis', 'eggbeater'],
  ['symposium_eggbeater', 'eggbeater'],
  ['stepping_eggbeater', 'eggbeater'],
  ['fairy_eggbeater', 'eggbeater'],
  ['pixie_eggbeater', 'eggbeater'],
  ['pandemonium', 'eggbeater'],
  ['bladerunner', 'eggbeater'],
  ['chainsaw_massacre', 'eggbeater'],
  ['stepping_ducking_symposium_eggbeater', 'eggbeater'],
  ['spinning_eggbeater', 'eggbeater'],
  ['barraging_eggbeater', 'eggbeater'],
  ['stepping_ducking_pigbeater', 'eggbeater'],

  // Flurry (anchor carried its legover root; the branch members flurricane /
  // gyro-flurry / paradox-flurry already carry the flurry label, so only the
  // anchor and toe-flurry browsed under legover instead of their own family).
  ['flurry', 'flurry'],
  ['toe_flurry', 'flurry'],

  // Flail (anchor carried its illusion root; every flail-* descendant already
  // carries the flail label, so only the anchor browsed under illusion).
  ['flail', 'flail'],

  // Butterfly-Swirl (anchor carried its swirl root; every butterfly-swirl-*
  // descendant already carries the label, so only the anchor browsed under swirl).
  ['butterfly_swirl', 'butterfly_swirl'],

  // Drifter (the drifter root family lost its anchor and several members to the
  // retired clipper-stall label they still carried; these redirects return them
  // to the drifter family they descend from. drifter also keeps its
  // dual-membership entry below).
  ['drifter', 'drifter'],
  ['clipper_ducking_drifter', 'drifter'],
  ['diving_drifter', 'drifter'],
  ['fairy_drifter', 'drifter'],
  ['fume', 'drifter'],
  ['lotus', 'drifter'],
  ['nuclear_drifter', 'drifter'],
  ['quantum_drifter', 'drifter'],
  ['stepping_ducking_drifter', 'drifter'],
]);

/**
 * Resolve the family slug a row should be bucketed under. Returns the
 * override target when present, otherwise null. Callers fall back to
 * `freestyle_tricks.trick_family` when null.
 */
export function resolveFamilyOverride(slug: string): string | null {
  return FAMILY_OVERRIDES.get(slug) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────
// Branch-family dual-membership.
//
// A branch-family anchor (e.g., `torque`, `blender`, `drifter`) lives in
// its lineage family per the DB (osis-family / clipper-stall-family) AND
// should ALSO appear as the anchor of its own branch family. This is
// ADDITIVE: the row stays in its primary family per FAMILY_OVERRIDES /
// trick_family, and gains membership in the listed extra families.
//
// Different from FAMILY_OVERRIDES (one-way redirect; removes from
// original): dual-membership keeps the row in BOTH the primary family
// AND the listed extras. The Family-view bucketing loop in the service
// walks `[primaryFamily, ...dualMemberships]` per row.
//
// Restraint: each entry requires curator confirmation. No automatic
// derivation. No DB column changes.
// ─────────────────────────────────────────────────────────────────────────

export const FAMILY_DUAL_MEMBERSHIPS: ReadonlyMap<string, readonly string[]> = new Map([
  // Branch-family anchors, also appearing in their own branch family
  // alongside their lineage family.
  ['torque',  ['torque']],    // primary: osis-family;       also: torque-family (own anchor)
  ['blender', ['blender']],   // primary: osis-family;       also: blender-family (own anchor)
  ['drifter', ['drifter']],   // primary: was clipper-stall (retired) → falls through;
                              // also:    drifter-family (own anchor)
]);

/**
 * Returns the extra family slugs a row should appear under, in addition
 * to its primary family. Empty array when no dual-membership entry.
 */
export function resolveFamilyDualMemberships(slug: string): readonly string[] {
  return FAMILY_DUAL_MEMBERSHIPS.get(slug) ?? [];
}

// ─────────────────────────────────────────────────────────────────────────
// Retired Family-View family slugs.
//
// Families listed here are hidden from the Family-View browse surface.
// The rows themselves remain in the DB and surface on every other
// browse view (ADD / Alpha / Search / Movement System / Modifier /
// Topology). The trick_family column is untouched.
//
// Clipper-Stall is retired because the newer ontology distinguishes
// root terminal families / branch families / movement systems / entry
// topologies, and "clipper-stall" doesn't function as a coherent
// terminal family at the current ontology level:
//   - drifter (3 ADD) has its own branch family (see FAMILY_DUAL_MEMBERSHIPS)
//   - ducking-clipper / spinning-clipper are modifier-led, discoverable
//     via Movement System → Midtime Body axis
//   - reaper is folk-derived; gains the unresolved-compound pill
//   - high-plains-drifter follows drifter via FAMILY_OVERRIDES above
//   - clipper-stall (anchor) stays in ADD / Alpha; singleton bucket
//     already prevented from rendering by the rows.length > 1 filter
//
// NOT retired: the clipper-stall ROW, the clipper notation, clipper as
// a glossary concept, the clipper-stall canonical name. Strictly the
// family-view surface.
// ─────────────────────────────────────────────────────────────────────────

// Route-outs. These family labels are NOT
// productive movement lineages and are removed from the Family-view browse
// surface so the view shows only the 8 canonical parent families plus
// still-deferred labels. The rows, their trick_family data, notation,
// glossary concepts, and other browse views are untouched; reversible by
// deleting an entry. Four route-out kinds:
//   - Modifier ecosystems: a modifier (pixie/fairy/…) recombines across many
//     base tricks; it is an axis, not a family (browse via Movement System /
//     By Modifier).
//   - Alternative surfaces: a contact surface (sole / heel / cross-body /
//     cloud / head-neck-shoulder / flying), not a family (browse via the
//     Alternative Surfaces grouping on Movement System).
//   - Foundational surfaces: toe-stall / clipper(-stall) are base primitives,
//     highly visible in glossary + notation + neighborhoods, but not parent
//     families.
//   - Multi-bag / kick primitives: juggling counts and bare kick/spin tokens
//     are not movement lineages.
export const RETIRED_FAMILIES: ReadonlySet<string> = new Set<string>([
  // Foundational surfaces / base primitives
  'clipper_stall',
  'clipper',
  'toe_stall',
  // Modifier ecosystems
  'pixie',
  'fairy',
  'atomic',
  'quantum',
  'surging',
  'terrage',
  'spyro',
  'pogo',
  'rooted',
  'sailing',
  'shooting',
  'furious',
  // Alternative surfaces
  'cross_body_sole_stall',
  'sole_stall',
  'heel_stall',
  'sole_kick',
  'inside_stall',
  'outside_stall',
  'head_stall',
  'neck_stall',
  'shoulder_stall',
  'forehead_stall',
  'cloud_stall',
  'cloud_kick',
  'knee_stall',
  'dragonfly_kick',
  'flying_inside',
  'flying_outside',
  // Multi-bag / kick primitives
  '2_bag_juggling',
  '3_bag_juggling',
  'spin',
  'double_spin',
  'double_knee',
  'knee_clipper',
]);

/**
 * Returns true when the family slug should NOT render in the Family
 * View browse surface. Callers should skip the family during bucketing.
 */
export function isRetiredFamily(familySlug: string): boolean {
  return RETIRED_FAMILIES.has(familySlug);
}

/**
 * Curator-authored display name overrides for family slugs whose
 * default capitalize-first-char doesn't read well. Most families use
 * the default ("whirl" → "Whirl"); hyphenated slugs need explicit
 * casing here ("rev-whirl" → "Rev Whirl").
 *
 * Restraint: this map is ONLY for slugs whose default rendering is
 * objectively wrong (e.g., "Rev-whirl family"). Other hyphenated
 * families that haven't surfaced as new sibling families yet keep
 * their default rendering; the curator can opt them in when an
 * audit warrants.
 */
export const FAMILY_DISPLAY_NAMES: ReadonlyMap<string, string> = new Map([
  ['rev_whirl', 'Rev Whirl'],
]);

/**
 * Resolve the display name for a family slug, or null when no curator
 * override exists. Callers fall back to the default capitalization.
 */
export function resolveFamilyDisplayName(familySlug: string): string | null {
  return FAMILY_DISPLAY_NAMES.get(familySlug) ?? null;
}
