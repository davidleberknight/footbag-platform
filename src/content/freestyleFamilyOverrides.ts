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
]);

/**
 * Resolve the family slug a row should be bucketed under. Returns the
 * override target when present, otherwise null. Callers fall back to
 * `freestyle_tricks.trick_family` when null.
 */
export function resolveFamilyOverride(slug: string): string | null {
  return FAMILY_OVERRIDES.get(slug) ?? null;
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
