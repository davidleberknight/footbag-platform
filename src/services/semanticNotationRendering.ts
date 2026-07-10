/**
 * semanticNotationRendering.ts
 *
 * Tokenizes semantic ≡ readings ("Spinning Paradox Whirl") into role-classified
 * tokens for browse-card rendering. Companion to operationalNotationRendering.ts
 * (which handles operational `[clip] > op in dex` form).
 *
 * Role-classification contract:
 *   - Four token roles maximum (base-anchor / modifier / side-positional / unknown).
 *   - Unknown tokens render neutral; never guess a role.
 *   - The registry is curator-locked; only operators with established structural
 *     readings get a role classification.
 *
 * Current scope: classify the tokens and emit the isFamilyAnchor flag from the
 * caller-provided active anchor slug. Count-bearing / hidden-X-dex / Fairy chip
 * differentiation is not yet implemented.
 */

export type SemanticRole =
  | 'base-anchor'
  | 'modifier'
  | 'side-positional'
  | 'unknown';

export interface SemanticBrowseToken {
  /** Token text, lowercase as it appears in the reading (e.g. 'spinning', 'ss', 'osis'). */
  text:           string;
  /** Hyphen-formed slug used for CSS / data attributes (e.g. 'around-the-world' → 'atw'). */
  slug:           string;
  /** Role classification; drives the CSS color class. */
  role:           SemanticRole;
  /** Hyphenated CSS class suffix; matches role unless role-specific accents differ. */
  cssRole:        string;
  /** True when this token IS the active view's anchor (family / component / topology). */
  isFamilyAnchor: boolean;
  /**
   * Cross-link to the glossary entry for this token, or null when no
   * curator-authored anchor exists. Provides token-level navigation from the
   * dictionary surface to the glossary teaching surface. Modifier-role tokens
   * with a glossary modifier card map to `/freestyle/glossary#modifier-{slug}`;
   * base-anchor tokens for the 12 core atoms map to
   * `/freestyle/glossary#term-{slug}`.
   * side-positional and unknown roles never receive a glossary anchor.
   *
   * Four-layer rule: this field is a NAVIGATION reference (layer 3 →
   * layer 4 jump), not a content collapse. The token's text + role +
   * slug remain pure symbolic-decomposition content.
   */
  glossaryAnchor: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Token registry (curator-locked).
//
// Lowercase exact-match tokens only. Multi-word atoms (e.g. "around the world")
// are split on whitespace at tokenize time and tested one word at a time;
// add the word-level entries for them (e.g. 'around', 'the', 'world').
// ─────────────────────────────────────────────────────────────────────────────

const BASE_ANCHORS: ReadonlySet<string> = new Set([
  // Foundational atoms (mirrors src/services/coreTrickRegistry.ts CORE_TRICKS
  // + the displaySlug 'clipper' for clipper-stall).
  'toe-stall', 'toe',
  'clipper-stall', 'clipper',
  'around-the-world', 'atw',
  'orbit',
  'legover',
  'pickup',
  'mirage',
  'illusion',
  'butterfly',
  'osis',
  'whirl',
  'swirl',
  // Named-compound bases that function as anchors in semantic readings.
  // (Torque = quantum osis; appears as a base in spinning torque = mobius.)
  'torque',
  'blender',
  // Direction-variant base anchors (rev-whirl exists as its own row; appears
  // as an anchor in some readings).
  'rev-whirl',
  'rev-swirl',
  // Other named-compound bases that recur as anchors in compound readings.
  'eggbeater',
  'drifter',
  'barfly',
  'dyno',
]);

const MODIFIERS: ReadonlySet<string> = new Set([
  // Body modifiers (Tier-1 board + foundational).
  'paradox',
  'spinning',
  'ducking',
  'symposium',
  'stepping',
  'tapping',
  'diving',
  'weaving',
  'zulu',
  'inspinning',
  // Set modifiers (Tier-1 board + intermediate).
  'pixie',
  'fairy',
  'atomic',
  'quantum',
  'blurry',
  'nuclear',
  'barraging',
  'furious',
  // Compositional / structural modifiers (per RED_RESOLVED_CANON §B.3).
  'miraging',
  'whirling',
  'illusioning',
  // Current: count-bearing / quantifier tokens render identically to operators.
  // Target: render count / quantifier semantics distinctly.
  'double',
  'triple',
  'surging',
  'high',
  // Other operators with semantic-token presence.
  'gyro',
  'terraging',
]);

const SIDE_POSITIONAL: ReadonlySet<string> = new Set([
  'ss',
  'op',
  'far',
  'near',
  'reverse',
  'rev',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Glossary-anchor allow-lists.
//
// Curator-locked: only slugs with a known, populated glossary anchor receive a
// glossaryAnchor URL. Tokens whose role allows linking but whose slug is not
// in the relevant allow-list fall back to glossaryAnchor=null — better a
// non-link than a dead anchor.
//
// MODIFIER_GLOSSARY_ANCHORS mirrors the 13 modifier-feel cards in
// FreestyleGlossaryContent.{setModifierFeelCards, bodyModifierFeelCards}.
// Each card carries `id="modifier-{slug}"` on its outer <article>.
// ─────────────────────────────────────────────────────────────────────────────
const MODIFIER_GLOSSARY_ANCHORS: ReadonlySet<string> = new Set([
  // Set cluster (9): SET_MODIFIER_FEEL_CARDS in freestyleService.ts
  'pixie', 'fairy', 'stepping', 'atomic', 'quantum',
  'blurry', 'nuclear', 'barraging', 'furious',
  // Body cluster (4): BODY_MODIFIER_FEEL_CARDS in freestyleService.ts
  'paradox', 'spinning', 'ducking', 'symposium',
]);

// BASE_ANCHOR_GLOSSARY_ANCHORS mirrors the curator-authored term-{slug}
// anchors in glossary §5 (Core Trick Structures, rendered via the
// core-tricks-grid partial with idPrefix="term-") + §2 (foundational
// surfaces). Aliases like 'atw' get the same anchor as their canonical
// form (term-around-the-world) when the canonical entry exists in §5.
const BASE_ANCHOR_GLOSSARY_ANCHORS: ReadonlySet<string> = new Set([
  // 12 core atoms (CORE_TRICKS) + 'atw' alias display form
  'toe-stall', 'clipper-stall', 'around-the-world', 'atw', 'orbit',
  'legover', 'pickup', 'mirage', 'illusion', 'butterfly', 'osis',
  'whirl', 'swirl',
  // Named-compound bases that appear in §5 with term-{slug} anchors
  'torque', 'blender',
]);

/**
 * Resolve the glossary cross-link for a token, or null when no curator
 * anchor exists. Restraint-first: never point at an anchor that doesn't
 * exist on the glossary page.
 */
function resolveGlossaryAnchor(slug: string, role: SemanticRole): string | null {
  if (role === 'modifier' && MODIFIER_GLOSSARY_ANCHORS.has(slug)) {
    return `/freestyle/glossary#modifier-${slug}`;
  }
  if (role === 'base-anchor' && BASE_ANCHOR_GLOSSARY_ANCHORS.has(slug)) {
    return `/freestyle/glossary#term-${slug}`;
  }
  return null;
}

/**
 * Strip trailing punctuation from a raw word; preserve case.
 * Display text in tokens (e.g. 'ATW') should round-trip the curator's casing.
 */
function stripPunct(raw: string): string {
  return raw.trim().replace(/[,.;:]+$/, '');
}

/**
 * Canonical lookup key for registry membership tests. Lowercased; preserves
 * embedded hyphens (so 'rev-whirl' stays a hyphenated single token).
 */
function lookupKey(displayText: string): string {
  return displayText.toLowerCase();
}

/** Slug form of a token for data attributes (no spaces; hyphens preserved). */
function toSlug(text: string): string {
  return text.replace(/\s+/g, '-');
}

/**
 * Classify a single normalized token. Returns 'unknown' when the token isn't
 * in any registry — never guess.
 */
function classify(token: string): SemanticRole {
  if (BASE_ANCHORS.has(token))     return 'base-anchor';
  if (MODIFIERS.has(token))        return 'modifier';
  if (SIDE_POSITIONAL.has(token))  return 'side-positional';
  return 'unknown';
}

/**
 * Tokenize a semantic ≡ reading into role-classified tokens.
 *
 * @param reading        Free-form reading string, e.g. "Spinning Paradox Whirl"
 *                       or "spinning ss quantum osis". Case-insensitive;
 *                       tokens are emitted lowercase.
 * @param activeAnchor   Optional active-view anchor slug. When a token matches
 *                       this slug, `isFamilyAnchor` is true → template can
 *                       apply the underline emphasis.
 *
 * Returns a flat array of tokens preserving reading order.
 *
 * Tokenization is whitespace-only; readings should already be space-separated
 * canonical form (no punctuation, no operators). Tokens beyond the registry
 * fall back to 'unknown' role.
 */
export function shapeSemanticNotation(
  reading: string,
  activeAnchor: string | null = null,
): SemanticBrowseToken[] {
  const anchor = activeAnchor ? activeAnchor.trim().toLowerCase() : null;
  const words  = reading.trim().split(/\s+/).filter(w => w.length > 0);

  return words.map(word => {
    const displayText = stripPunct(word);
    const key         = lookupKey(displayText);
    const slug        = toSlug(key);
    const role        = classify(key);
    return {
      text:           displayText,
      slug,
      role,
      cssRole:        role,
      isFamilyAnchor: anchor !== null && (key === anchor || slug === anchor),
      glossaryAnchor: resolveGlossaryAnchor(slug, role),
    };
  });
}

/**
 * Convenience: tokenize multiple readings (e.g. mobius has two stopping-depth
 * readings) and return parallel arrays.
 */
export function shapeSemanticNotations(
  readings: readonly string[],
  activeAnchor: string | null = null,
): SemanticBrowseToken[][] {
  return readings.map(r => shapeSemanticNotation(r, activeAnchor));
}
