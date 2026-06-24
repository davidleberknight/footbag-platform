// Role-aware notation rendering: service-layer shape.
//
// Reads the existing `notation` field on a freestyle_tricks row and produces
// a list of role-classified tokens for the trick-detail template. Display-
// only: never affects parser output, ADD math, or asserted_adds.
//
// Architectural notes:
//   - Hybrid registry: static parser-mirror sets here in TS for vocabulary
//     not in the DB (rotation, direction, delay/unusual surface, body
//     component, footedness, multiplicity, suffix); DB-driven lookups
//     for modifier slugs+types and core-family slugs+aliases.
//   - Forever-rule §7 sync: when freestyle/scripts/parse_freestyle_notation.py adds
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
// SYNC RULE: keep aligned with freestyle/scripts/parse_freestyle_notation.py registries.
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

// ── Static token sets ──────────────────────────────────────────────────────

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

// ── Educational tooltip text (harmonized with operational renderer; ratified §5.4a) ─

const ROLE_LABELS: Record<NotationRole, string> = {
  core_family:      'Base trick family',
  set:              'Set modifier',
  rotation:         'Rotation modifier',
  modifier:         'Body modifier',
  delay_surface:    'Delay surface',
  unusual_surface:  'Delay surface (non-standard)',
  directionality:   'Direction prefix',
  body_component:   'Body-component flag',
  footedness:       'Footedness indicator',
  multiplicity:     'Repetition prefix',
  suffix:           'Surface suffix',
  unresolved:       'Unrecognized, community notation may be evolving',
};

// Per-token tooltip overrides. Harmonized with the operational renderer's
// WORD_TOKEN_LABELS for consistency. Ambiguous tokens (WHIRL, SWIRL, SAME,
// OP, IN, OUT, TOE) carry layer-disambiguated wording so the same token reads
// distinctly across the semantic and operational layers. Keyed UPPERCASE for
// case-insensitive lookup; bracket-form body-component flags handled
// separately below.
const WORD_TOKEN_LABELS: Record<string, string> = {
  // ── Base trick families (core_family) ─────────────────────────────────
  WHIRL:     'Whirl, base trick family (3 ADD)',
  MIRAGE:    'Mirage, base trick family (2 ADD)',
  OSIS:      'Osis, base trick family (3 ADD)',
  TORQUE:    'Torque, base trick family (4 ADD; miraging osis)',
  BUTTERFLY: 'Butterfly, base trick family (3 ADD)',
  EGGBEATER: 'Eggbeater, base trick family (3 ADD; atomic legover)',
  LEGOVER:   'Legover, base trick family (2 ADD)',
  PICKUP:    'Pickup, base trick family (2 ADD)',
  BLENDER:   'Blender, base trick family (4 ADD; whirling osis)',
  DRIFTER:   'Drifter, base trick family (3 ADD; miraging clipper)',
  BARFLY:    'Barfly, base trick family (4 ADD)',
  SWIRL:     'Swirl, base trick family (3 ADD)',

  // ── Body modifiers (modifier) ─────────────────────────────────────────
  PARADOX:   'Paradox, entry topology (+1 ADD)',
  SYMPOSIUM: 'Symposium, body modifier (+1 ADD)',
  DUCKING:   'Ducking, body modifier (+1 ADD)',
  STEPPING:  'Stepping, set modifier (+1 ADD)',
  TAPPING:   'Tapping, body modifier (+1 ADD; distinct from Stepping)',
  DIVING:    'Diving, body modifier (+1 ADD)',
  BLAZING:   'Blazing, body modifier (+1 ADD)',
  BARRAGING: 'Barraging, body modifier (+1 ADD; underlies Flurry)',
  WEAVING:   'Weaving, body modifier (+1 ADD)',
  MIRAGING:  'Miraging, body modifier (+1 ADD; underlies Torque, Drifter, DLO)',
  BACKSIDE:  'Backside, body modifier (+1 ADD; Symposium-equivalent)',
  TERRAGING: 'Terraging, body modifier (+3 ADD)',
  XDEX:      'X-Dex, conditional +1 ADD on an eligible far-form receiver dex',

  // ── Rotation modifiers (rotation) ─────────────────────────────────────
  SPINNING:   'Spinning, rotation modifier (+1 ADD)',
  WHIRLING:   'Whirling, rotation modifier (+1 ADD; underlies Blender)',
  SWIRLING:   'Swirling, rotation modifier (+1 ADD)',
  INSPINNING: 'Inspinning, rotation modifier (distinct from Spinning)',
  GYRO:       'Gyro, rotation modifier (+1 ADD; underlies Mobius)',

  // ── Set modifiers (set) ───────────────────────────────────────────────
  BLURRY:   'Blurry, set modifier (+1 ADD)',
  ATOMIC:   'Atomic, set modifier (+1)',
  NUCLEAR:  'Nuclear, set modifier (+2 ADD; Paradox + Illusion)',
  QUANTUM:  'Quantum, set modifier (+1 ADD)',
  PIXIE:    'Pixie, set modifier (+1 ADD)',
  FAIRY:    'Fairy, set modifier (+1 ADD)',
  FURIOUS:  'Furious, set modifier (+1 / +2 on rotational base)',
  POGO:     'Pogo, set modifier (0 ADD; non-scoring)',
  SHOOTING: 'Shooting, set modifier (+3 ADD)',
  ROOTED:   'Rooted, set modifier (0 ADD; held position)',

  // ── Delay surfaces ────────────────────────────────────────────────────
  CLIPPER: 'Clipper, delay surface (foundational stall)',
  TOE:     'Toe (semantic), delay surface',
  HEEL:    'Heel, delay surface',
  INSIDE:  'Inside, delay surface',
  OUTSIDE: 'Outside, delay surface',

  // ── Unusual surfaces ──────────────────────────────────────────────────
  SOLE:     'Sole, unusual delay surface',
  KNEE:     'Knee, unusual delay surface',
  HEAD:     'Head, unusual delay surface',
  CLOUD:    'Cloud, unusual delay surface (back of shin)',
  NECK:     'Neck, unusual delay surface',
  SHOULDER: 'Shoulder, unusual delay surface',
  FOREHEAD: 'Forehead, unusual delay surface',

  // ── Direction prefixes ────────────────────────────────────────────────
  REV:     'Rev, reverse-direction prefix',
  REVERSE: 'Reverse, direction prefix',

  // ── Footedness (semantic context, layer-disambiguated) ───────────────
  SAME: 'Same (semantic), same-foot indicator',
  OP:   'Opposite (semantic), opposite-foot indicator',
  IN:   'In (semantic), inward-arc indicator',
  OUT:  'Out (semantic), outward-arc indicator',

  // ── Multiplicity prefixes ─────────────────────────────────────────────
  DOUBLE:    'Double, repetition prefix (per pt8: stabilized examples only)',
  TRIPLE:    'Triple, repetition prefix',
  QUADRUPLE: 'Quadruple, repetition prefix',
  QUINTUPLE: 'Quintuple, repetition prefix',
};

// Body-component bracket flags (rare in semantic but possible).
const BODY_COMPONENT_LABELS: Record<string, string> = {
  '[DEX]':  'DEX, dexterity component (controlled flick)',
  '[DEL]':  'DEL, delay component (stall landing)',
  '[BOD]':  'BOD, body-position component',
  '[XBD]':  'XBD, cross-body component',
  '[PDX]':  'PDX, paradox-direction marker',
  '[XDEX]': 'XDEX, X-Dex (conditional +1 on a far-form receiver dex)',
};

// ── Caller-supplied lookup context ────────────────────────────────────────

export interface NotationLookupContext {
  bySlug:        Map<string, FreestyleTrickRow>;
  aliasToSlug:   Map<string, string>;
  // Modifier lookup excludes tokens already classified by the static rotation
  // set, so SPINNING resolves as rotation and never as a body modifier.
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
  // 1. Bracketed body component,single-token bracket pair (e.g. [DEX]).
  if (BODY_COMPONENT_RE.test(raw))            return { role: 'body_component',  resolvedName: null };
  // 2. Multiplicity prefix.
  if (MULTIPLICITY_TOKENS.has(raw))           return { role: 'multiplicity',    resolvedName: null };
  // 3. Footedness markers.
  if (FOOTEDNESS_TOKENS.has(raw))             return { role: 'footedness',      resolvedName: null };
  // 4. Directionality.
  if (DIRECTION_TOKENS.has(raw))              return { role: 'directionality',  resolvedName: null };
  // 5. Surface-suffix (STALL, KICK).
  if (SUFFIX_TOKENS.has(raw))                 return { role: 'suffix',          resolvedName: null };
  // 6. Rotation registry (must precede modifier,SPINNING wins as rotation).
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
    // Per-token label preference order:
    //   1. WORD_TOKEN_LABELS[UPPER(text)],per-token specific override
    //   2. BODY_COMPONENT_LABELS[text]   ,bracketed body-component flags
    //   3. ROLE_LABELS[role] + resolved  ,core_family with slug suffix
    //   4. ROLE_LABELS[role]             ,generic role fallback
    const upper = text.toUpperCase();
    const wordLabel = WORD_TOKEN_LABELS[upper];
    const bracketLabel = role === 'body_component' ? BODY_COMPONENT_LABELS[text] : undefined;
    const baseLabel = ROLE_LABELS[role];
    const fallback = role === 'core_family' && resolvedName
      ? `${baseLabel}: ${resolvedName}`
      : baseLabel;
    const label = wordLabel ?? bracketLabel ?? fallback;
    return { text, role, cssRole: role.replace(/_/g, '-'), label };
  });

  return { rawNotation: trimmed, tokens };
}
