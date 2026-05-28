/**
 * freestyleFamilyOverrides.ts
 *
 * Curator-authored re-mapping of `trick_family` at service-shape time.
 * Reversible TypeScript content per [[feedback_reversible_content_
 * governance]]. NO `freestyle_tricks.trick_family` column UPDATEs;
 * NO SQL migrations. Delete an entry → the row reverts to its DB
 * trick_family value.
 *
 * Slice J of 2026-05 normalization (Stage A): promote three rows out
 * of the Whirl family into the new Rev-Whirl sibling terminal family.
 *
 * ── Context ────────────────────────────────────────────────────────
 *
 * Slice I added the Whirl family-level invariant `leggy in dex >
 * ss clipper`. Op-notation evidence then showed three rows in the
 * Whirl family that DO NOT preserve that invariant — they share a
 * different conserved terminal mechanic (front whirl dex > op
 * clipper [XBD]). They are siblings of Whirl, not descendants.
 *
 * See exploration/dictionary-glossary-normalization-audit-2026-05/
 * REV_WHIRL_SIBLING_FAMILY.md for the full op-notation forensic +
 * three-cohort framing.
 *
 * Per the curator's terminal-vs-entry-topology distinction (Slice I
 * addendum): Rev-Whirl IS a true terminal family with its own
 * conserved ending mechanic. Same governance as Slice I — not a
 * topology / modifier / entry system.
 *
 * ── Stage A scope (this slice) ─────────────────────────────────────
 *
 * Three rows move from whirl-family → rev-whirl-family:
 *   - rev-whirl (3 ADD, dex) — the canonical direction-variant anchor
 *   - hatchet (4 ADD, compound) — mechanics-confirmed FRONT WHIRL dex
 *   - mullet (6 ADD, compound) — mechanics-confirmed FRONT WHIRL dex
 *
 * EXPLICITLY DEFERRED (stay in whirl-family pending curator decision):
 *   - rev-up — folk name; no op-notation; canonical direction-variant
 *     status unconfirmed
 *   - tomahawk — folk name; no op-notation; structural decomposition
 *     uncertain
 *   - surreal — hybrid: chain reading `surging paradox whirl` places
 *     in whirl-family lineage, but op-notation uses FRONT WHIRL dex.
 *     Stays whirl-family by chain identity; detail page can surface
 *     the front-whirl execution as a contextual note (future work).
 *   - montage — same hybrid pattern as surreal.
 *
 * ── Restraint ──────────────────────────────────────────────────────
 *
 *   - No auto-derivation from operational_notation patterns. The
 *     three Stage A entries are curator-confirmed only.
 *   - No DB column UPDATE. The override map is read at service-shape
 *     time.
 *   - One-way redirection: row slug → target family slug. No
 *     multi-family memberships in this slice.
 *   - Adding an entry here does NOT change `freestyle_tricks.trick_family`
 *     semantics or affect any other canonical surface.
 *   - Slice scoped to a single sibling-family promotion. Future
 *     promotions (butterfly / mirage / osis / swirl sibling families
 *     if discovered) require their own audit + approval.
 */

export const FAMILY_OVERRIDES: ReadonlyMap<string, string> = new Map([
  // Rev-Whirl sibling family — 3 row promotions (Stage A, 2026-05-16).
  // Each row's DB trick_family is 'whirl'; the service re-buckets via
  // this override into the new 'rev-whirl' family.
  ['rev-whirl', 'rev-whirl'],   // canonical direction-variant anchor
  ['hatchet',   'rev-whirl'],   // mechanics-confirmed
  ['mullet',    'rev-whirl'],   // mechanics-confirmed

  // Slice M (2026-05-16) — high-plains-drifter follows drifter into the
  // drifter branch family after the clipper-stall family retirement
  // (see RETIRED_FAMILIES below). One-way redirect: row no longer
  // bucketed under clipper-stall.
  ['high-plains-drifter', 'drifter'],

  // Emergency public-readiness slice 2026-05-19 — curator ruling: lose
  // rev-up from the Whirl family until its decomposition is resolved.
  // Override target is the row's own slug, producing a singleton
  // 'rev-up' family. The family-view bucketing's `length > 1` filter
  // then suppresses it from family browse. rev-up still surfaces on
  // ADD view (canonical row remains active) and carries the existing
  // pendingDecomposition pill via UNRESOLVED_COMPOUNDS. No new family
  // is created; no ontology hardened. Reversible by deleting this
  // entry: rev-up returns to whirl family on next request.
  ['rev-up', 'rev-up'],
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
// Slice M (2026-05-16) — branch-family dual-membership.
//
// A branch-family anchor (e.g., `torque`, `blender`, `drifter`) lives in
// its lineage family per the DB (osis-family / clipper-stall-family) AND
// should ALSO appear as the anchor of its own branch family. This is
// ADDITIVE — the row stays in its primary family per FAMILY_OVERRIDES /
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
  // Branch-family anchors — also appear in their own branch family
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
// Slice M (2026-05-16) — retired Family-View family slugs.
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

// Family ruling pass (2026-05-28) — route-outs. These family labels are NOT
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
  'clipper-stall',
  'clipper',
  'toe-stall',
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
  'cross-body-sole-stall',
  'sole-stall',
  'heel-stall',
  'sole-kick',
  'inside-stall',
  'outside-stall',
  'head-stall',
  'neck-stall',
  'shoulder-stall',
  'forehead-stall',
  'cloud-stall',
  'cloud-kick',
  'knee-stall',
  'dragonfly-kick',
  'flying-inside',
  'flying-outside',
  // Multi-bag / kick primitives
  '2-bag-juggling',
  '3-bag-juggling',
  'spin',
  'double-spin',
  'double-knee',
  'knee-clipper',
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
  ['rev-whirl', 'Rev Whirl'],
]);

/**
 * Resolve the display name for a family slug, or null when no curator
 * override exists. Callers fall back to the default capitalization.
 */
export function resolveFamilyDisplayName(familySlug: string): string | null {
  return FAMILY_DISPLAY_NAMES.get(familySlug) ?? null;
}
