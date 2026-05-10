// Phase 6: role-aware notation rendering — service-layer shape.
//
// Reads the existing `notation` field on a freestyle_tricks row and produces
// a list of role-classified tokens for the trick-detail template. Display-
// only: never affects parser output, ADD math, or asserted_adds.
//
// Architectural notes (see PHASE6_ROLE_AWARE_RENDERING_PLAN.md):
//   - Hybrid registry: static parser-mirror sets here in TS for vocabulary
//     not in the DB (rotation, direction, delay/unusual surface, body
//     component, footedness, multiplicity, suffix); DB-driven lookups
//     for modifier slugs+types and core-family slugs+aliases.
//   - Forever-rule §7 sync: when scripts/parse_freestyle_notation.py adds
//     or modifies a token in ROTATION_TOKENS, DIRECTION_TOKENS,
//     DELAY_SURFACE_TOKENS, or UNUSUAL_SURFACE_TOKENS, the matching constant
//     in this file MUST update in the same change.
//   - Restraint principle (§0): only the four primary roles
//     (core_family, set, rotation, modifier) carry color saturation. Others
//     render muted; unresolved is amber dashed (NOT red error styling).

import {
  FreestyleTrickRow, FreestyleTrickModifierRow, FreestyleTrickAliasRow,
} from '../db/db';

export type NotationRole =
  | 'core_family'
  | 'set'
  | 'rotation'
  | 'modifier'
  | 'delay_surface'
  | 'unusual_surface'
  | 'directionality'
  | 'body_component'
  | 'footedness'
  | 'multiplicity'
  | 'suffix'
  | 'unresolved';

export interface NotationToken {
  text:    string;        // verbatim token from the input (preserved casing)
  role:    NotationRole;  // machine-readable role (underscore form: 'core_family')
  cssRole: string;        // CSS-class-suffix form (hyphenated: 'core-family')
  label:   string;        // educational tooltip text (see ROLE_LABELS)
}

export interface NotationDisplay {
  rawNotation: string;
  tokens:      NotationToken[];
}

// ── Static parser-mirror sets ─────────────────────────────────────────────
// SYNC RULE: keep aligned with scripts/parse_freestyle_notation.py registries.
// Tokens stored UPPERCASE here to match the authored notation casing
// (parser stores lowercase because it tokenizes canonical_name which is
// lowercase; this renderer tokenizes notation which is uppercase).

const ROTATION_TOKENS = new Set([
  'SPINNING', 'INSPINNING', 'SWIRLING', 'WHIRLING', 'GYRO',
]);

const DIRECTION_TOKENS = new Set([
  'REV', 'REVERSE',
]);

const DELAY_SURFACE_TOKENS = new Set([
  'CLIPPER', 'TOE', 'INSIDE', 'HEEL', 'OUTSIDE',
]);

const UNUSUAL_SURFACE_TOKENS = new Set([
  'SOLE', 'KNEE', 'HEAD', 'NECK', 'SHOULDER', 'FOREHEAD', 'CLOUD',
]);

// ── Phase-6-specific static sets ──────────────────────────────────────────

const FOOTEDNESS_TOKENS = new Set([
  'SAME', 'OP', 'IN', 'OUT',
]);

const MULTIPLICITY_TOKENS = new Set([
  'DOUBLE', 'TRIPLE', 'QUADRUPLE', 'QUINTUPLE',
]);

const SUFFIX_TOKENS = new Set([
  'STALL', 'KICK',
]);

const BODY_COMPONENT_RE = /^\[[A-Z]+\]$/;

// ── Educational tooltip text (ratified §5.4a) ─────────────────────────────

const ROLE_LABELS: Record<NotationRole, string> = {
  core_family:      'Core trick family',
  set:              'Set primitive',
  rotation:         'Rotation modifier',
  modifier:         'Body modifier',
  delay_surface:    'Delay surface',
  unusual_surface:  'Surface (non-standard)',
  directionality:   'Direction marker',
  body_component:   'Body component',
  footedness:       'Footedness',
  multiplicity:     'Repetition prefix',
  suffix:           'Surface suffix',
  unresolved:       'Unrecognized — community notation may be evolving',
};

// ── Caller-supplied lookup context ────────────────────────────────────────

export interface NotationLookupContext {
  // slug (lowercase) → row; resolves CORE_FAMILY for direct tokens like WHIRL
  bySlug:        Map<string, FreestyleTrickRow>;
  // alias_text (lowercase) → trick_slug; resolves CORE_FAMILY for tokens like ATW
  aliasToSlug:   Map<string, string>;
  // modifier slug (lowercase) → modifier row; resolves SET / MODIFIER for tokens
  // like PARADOX, BLURRY, ATOMIC. Excludes any token already classified by
  // the static rotation set (so SPINNING wins as rotation, not body modifier).
  modifierBySlug: Map<string, FreestyleTrickModifierRow>;
}

export function buildNotationLookupContext(
  allDictRows:    FreestyleTrickRow[],
  allModifiers:   FreestyleTrickModifierRow[],
  allAliases:     FreestyleTrickAliasRow[],
): NotationLookupContext {
  const bySlug         = new Map<string, FreestyleTrickRow>();
  const aliasToSlug    = new Map<string, string>();
  const modifierBySlug = new Map<string, FreestyleTrickModifierRow>();

  for (const r of allDictRows)   bySlug.set(r.slug.toLowerCase(), r);
  for (const a of allAliases)    aliasToSlug.set(a.alias_text.toLowerCase().trim(), a.trick_slug);
  for (const m of allModifiers)  modifierBySlug.set(m.slug.toLowerCase(), m);

  return { bySlug, aliasToSlug, modifierBySlug };
}

// ── Classification (per token, single-pass first-match-wins) ──────────────

function classifyToken(
  raw: string,
  ctx: NotationLookupContext,
): { role: NotationRole; resolvedName: string | null } {
  // 1. Bracketed body component — single-token bracket pair (e.g. [DEX]).
  if (BODY_COMPONENT_RE.test(raw))            return { role: 'body_component',  resolvedName: null };
  // 2. Multiplicity prefix.
  if (MULTIPLICITY_TOKENS.has(raw))           return { role: 'multiplicity',    resolvedName: null };
  // 3. Footedness markers.
  if (FOOTEDNESS_TOKENS.has(raw))             return { role: 'footedness',      resolvedName: null };
  // 4. Directionality.
  if (DIRECTION_TOKENS.has(raw))              return { role: 'directionality',  resolvedName: null };
  // 5. Surface-suffix (STALL, KICK).
  if (SUFFIX_TOKENS.has(raw))                 return { role: 'suffix',          resolvedName: null };
  // 6. Rotation registry (must precede modifier — SPINNING wins as rotation).
  if (ROTATION_TOKENS.has(raw))               return { role: 'rotation',        resolvedName: null };
  // 7. Delay surface registry.
  if (DELAY_SURFACE_TOKENS.has(raw))          return { role: 'delay_surface',   resolvedName: null };
  // 8. Unusual surface registry.
  if (UNUSUAL_SURFACE_TOKENS.has(raw))        return { role: 'unusual_surface', resolvedName: null };

  // 9. DB-driven: modifier registry (split set vs body modifier).
  const lowered = raw.toLowerCase();
  const mod = ctx.modifierBySlug.get(lowered);
  if (mod) {
    return {
      role:         mod.modifier_type === 'set' ? 'set' : 'modifier',
      resolvedName: null,
    };
  }

  // 10. DB-driven: core family (direct slug match).
  if (ctx.bySlug.has(lowered)) {
    return { role: 'core_family', resolvedName: lowered };
  }

  // 11. DB-driven: alias resolution to a slug (e.g. ATW → around-the-world).
  const aliased = ctx.aliasToSlug.get(lowered);
  if (aliased && ctx.bySlug.has(aliased.toLowerCase())) {
    return { role: 'core_family', resolvedName: aliased.toLowerCase() };
  }

  // 12. Fallback.
  return { role: 'unresolved', resolvedName: null };
}

// ── Public shape function ────────────────────────────────────────────────

/**
 * Tokenize the notation by whitespace and classify each token. Returns null
 * when the input is null/empty/whitespace.
 *
 * For `core_family` tokens the tooltip resolves to the canonical slug:
 *   'WHIRL'     → 'Core trick family: whirl'
 *   'ATW'       → 'Core trick family: around-the-world'   (alias resolution)
 * Other roles use the static label without per-token enrichment.
 */
export function shapeNotationDisplay(
  notation: string | null | undefined,
  ctx:      NotationLookupContext,
): NotationDisplay | null {
  if (typeof notation !== 'string') return null;
  const trimmed = notation.trim();
  if (trimmed.length === 0)         return null;

  const rawTokens = trimmed.split(/\s+/).filter(t => t.length > 0);
  if (rawTokens.length === 0)       return null;

  const tokens: NotationToken[] = rawTokens.map(text => {
    const { role, resolvedName } = classifyToken(text, ctx);
    const baseLabel = ROLE_LABELS[role];
    const label = role === 'core_family' && resolvedName
      ? `${baseLabel}: ${resolvedName}`
      : baseLabel;
    return { text, role, cssRole: role.replace(/_/g, '-'), label };
  });

  return { rawNotation: trimmed, tokens };
}
