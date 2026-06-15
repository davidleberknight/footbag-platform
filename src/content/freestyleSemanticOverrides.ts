/**
 * Semantic-notation overlays for the trick-detail surface.
 *
 * Two related but distinct maps, both consumed at the service layer
 * (freestyleService.shapeDictEntry + getTrickPage):
 *
 * 1. COMPOUND_SEMANTIC_DESCRIPTIONS: curator-authored semantic
 *    decompositions that replace the DB-column description when the
 *    DB description merely echoes the operational notation. Upgrades
 *    the "About this trick" prose from notational redundancy to
 *    compositional explanation. Applied to compound tricks; primitive
 *    tricks fall through to the redundancy-suppression rule below.
 *
 * 2. REVERSE_PAIR_TRANSFORMS: a SMALL educational overlay surfacing
 *    structural symmetry between reverse-direction pairs. Renders as
 *    a compact "Transform" line below the canonical JOB notation on
 *    five specific trick pages. NOT a general algebra system;
 *    deliberately scoped to these five pedagogically clear examples.
 *
 *    The rev(0) operator transforms in↔out dex direction. Hippy /
 *    leggy notation supplements are stylistic, not material; the
 *    five pairs differ only in dex direction once stylistic tokens
 *    are normalized.
 *
 * Both maps are curator-locked content. Adding new entries is an
 * editorial decision; the operator vocabulary (rev(0) and any
 * future transform tokens) must not balloon into a general symbolic
 * algebra layer.
 *
 * Layer separation: this module does NOT change canonical JOB
 * notation, operational notation, or ADD accounting. It is an
 * additional educational layer only.
 */

// ─────────────────────────────────────────────────────────────────────
// Part 1: compound semantic descriptions
//
// Curator-authored compositional readings for compound tricks where
// the DB description is a literal notation echo. The override
// replaces the description on the trick-detail "About" section.
//
// Entry criteria: the trick is a compositional structure (multi-dex,
// chained primitives, or a folk name with a clear structural reading),
// or a foundational atom/operator whose terse DB description benefits
// from a curator-authored identity or relationship reading. New
// entries land as the curator surfaces them; no automatic generation.
// ─────────────────────────────────────────────────────────────────────

export const COMPOUND_SEMANTIC_DESCRIPTIONS: ReadonlyMap<string, string> = new Map([
  // Curator-locked initial set.
  // Wording is plain compositional prose; not notation, not ADD math.
  ['double-legover', 'mirage + legover chain: two consecutive in-direction dex steps from a single set.'],
  ['blurry',         'stepping paradox-whirl structure: two-dex set with a paradox second component.'],
  ['furious',        'barraging extended with a third dex: three-dex chain layering on the high-stepping pattern.'],
  ['atom-smasher',   'atomic mirage composition: atomic set primitive followed by a mirage-class terminal.'],
  // Alternate canonical slug for atom smasher (some seeds use atomsmasher); both render the same description.
  ['atomsmasher',    'atomic mirage composition: atomic set primitive followed by a mirage-class terminal.'],
  // Foundational atoms and operators: identity plus the uptime/delay relationship pairs
  // (Around the World / Pixie and Orbit / Fairy). Worded as "an uptime X", never "X equals Y".
  ['around-the-world', 'Circle the bag with the foot, the leg tracing a full loop around the hanging bag before a toe stall. Around the World completes the dexterity around a delayed bag; its reverse-direction version is Orbit. Pixie can be understood as an uptime Around the World: both involve a leg circling the bag, but Around the World completes the dexterity around a delayed bag, while Pixie performs the circling motion as part of the set itself, before the bag reaches its peak.'],
  ['pixie', 'A set primitive that circles the leg around the bag during the set, acting as a +1 set modifier. Pixie can be understood as an uptime Around the World: both involve a leg circling the bag, but Pixie performs the circling motion as part of the set itself, before the bag reaches its peak, while Around the World completes that dexterity around a delayed bag.'],
  ['orbit', 'The reverse-direction full orbit: the leg circles the bag the opposite way around a delayed bag before the catch, making Orbit the reverse-direction counterpart of Around the World. Fairy can be understood as an uptime Orbit: Orbit performs the reverse-direction circling motion around a delayed bag, while Fairy performs that same reverse-direction dexterity during the set.'],
  ['fairy', 'A set primitive, the opposite-direction counterpart of pixie, acting as a +1 set modifier. Fairy can be understood as an uptime Orbit: it performs the reverse-direction circling dexterity during the set, before the bag reaches its peak, while Orbit completes that same reverse-direction dexterity around a delayed bag.'],
  ['around-the-world-kick', 'Circle the bag with the foot, then kick it instead of stalling it. Most dexterity tricks finish by catching the bag in a stall; a dex-kick finishes the same circling motion with a kick, so the loop scores a single ADD because no terminal stall is added. Around the World Kick is the most common trick of this kind, and it is no longer the only one: the same drop-the-stall pattern produces a small group of 1-ADD dex-kick tricks, including Pixie Kick, Orbit Kick, Fairy Kick, Legover Kick, Miraging Kick, and Atomic Kick. Around the World Kick is the one commonly practiced; the others follow naturally from the notation but are rarely performed as named tricks.'],
  // Pixie Kick and Around the World Kick share notation; only the footwork differs,
  // which the symbol cannot express, so the distinction is stated in prose.
  ['pixie-kick', 'Pixie Kick shares its notation with Around the World Kick but differs in footwork: Around the World Kick finishes with a kick from the same foot that circled the bag, while Pixie Kick finishes with a kick from the opposite foot. Both are 1-ADD dex-kicks: two ways to perform a dexterity without ending in a stall.'],
  // Atomic Kick is a logically-derived dex-kick (the Illusion dexterity without its
  // stall), rarely practiced as a named trick.
  ['atomic-kick', 'Atomic Kick uses the same dexterity pattern as Illusion but replaces the terminal stall with a kick. Atomic Kick is a logically derived member of the dex-kick family. Like Miraging Kick, Pixie Kick, Orbit Kick, and other dex-kick variants, it follows naturally from the notation system by replacing the final stall with a kick. Unlike Illusion itself, Atomic Kick is rarely encountered as a named or commonly practiced freestyle trick.'],
  // Double Switch-Over vs Double Around the World: same ADD and dex count, different
  // movement; deliberately not framed as a same-vs-opposite-foot mirror.
  ['double-switch-over', 'Double Switch-Over (DSO) and Double Around the World are both 3-ADD two-dex tricks, but they reach their two dexterities through very different movement patterns.'],
  ['2-bag-juggling', 'Controlling two bags with a single foot, keeping both in play through alternating delays on the same surface. The foundational multi-bag primitive: where standard freestyle works one bag, two-bag juggling adds a second object the foot must track and re-stall without dropping either.'],
  ['3-bag-juggling', 'Controlling three bags with two feet, keeping all three in play through coordinated delays across both feet. A higher-order multi-bag primitive: where two-bag juggling works two bags on a single foot, three-bag juggling distributes three bags across both feet, each foot tracking and re-stalling its share without dropping any.'],
]);

/** Lookup helper. Returns null when no curator override is authored. */
export function getCompoundSemanticDescription(slug: string): string | null {
  return COMPOUND_SEMANTIC_DESCRIPTIONS.get(slug) ?? null;
}

/**
 * Returns true when `description` is a literal (whitespace-normalized,
 * case-insensitive) echo of `notation`. Used by the service layer to
 * suppress the description rendering on primitive trick pages where
 * the DB description merely repeats the JOB notation.
 *
 * Non-redundant descriptions (including descriptions that contain
 * the notation as a substring but add prose, or descriptions that
 * differ substantively) fall through and render normally.
 */
export function isDescriptionRedundantWithNotation(
  description: string | null,
  notation: string | null,
): boolean {
  if (!description || !notation) return false;
  const norm = (s: string): string => s.trim().replace(/\s+/g, ' ').toLowerCase();
  return norm(description) === norm(notation);
}

// ─────────────────────────────────────────────────────────────────────
// Part 2: reverse-pair transforms (educational overlay)
//
// Five curator-locked entries surfacing the structural symmetry
// between reverse-direction core-atom pairs. Each entry renders a
// compact "Transform" line beneath the canonical JOB notation on
// the reverse trick's detail page.
//
// rev(0) is the only transform operator currently in use. Its
// semantics: transforms in↔out dex direction. The rev0Explainer
// renders alongside the expression on every transform-bearing page,
// so a reader unfamiliar with the operator is never left without
// context.
//
// FOREVER-RULE (locked at the editorial layer):
//   - rev(0) is used SPARINGLY, only for the five entries below.
//   - Do NOT mechanically apply to every reverse-direction trick.
//   - Do NOT introduce additional transform operators without an
//     explicit curator decision to extend this layer.
//   - This module is the floor of the transform system. Future
//     extensions must keep the educational-overlay framing, NOT a
//     general symbolic algebra layer.
// ─────────────────────────────────────────────────────────────────────

export interface ReversePairTransform {
  /** The transform expression, e.g. "rev(0) + mirage". */
  expression: string;
  /**
   * Canonical slug of the base trick. Used to cross-link the
   * transform line to the base trick page.
   */
  baseSlug: string;
  /** Display name of the base trick (matches CORE_TRICK_SPEC). */
  baseName: string;
  /** Base trick ADD value, for ALT-row rendering of the full
   *  rev(0) + base(N) = N ADD formula. rev(0) is +0, so totalAdd
   *  equals baseAdd for all five entries. */
  baseAdd: number;
}

export const REVERSE_PAIR_TRANSFORMS: ReadonlyMap<string, ReversePairTransform> = new Map([
  ['illusion',  { expression: 'rev(0) + mirage',           baseSlug: 'mirage',           baseName: 'mirage',           baseAdd: 2 }],
  ['pickup',    { expression: 'rev(0) + legover',          baseSlug: 'legover',          baseName: 'legover',          baseAdd: 2 }],
  ['rev-whirl', { expression: 'rev(0) + whirl',            baseSlug: 'whirl',            baseName: 'whirl',            baseAdd: 3 }],
  ['rev-swirl', { expression: 'rev(0) + swirl',            baseSlug: 'swirl',            baseName: 'swirl',            baseAdd: 3 }],
  ['orbit',     { expression: 'rev(0) + around-the-world', baseSlug: 'around-the-world', baseName: 'around-the-world', baseAdd: 2 }],
]);

/**
 * Shared explainer text for the rev(0) operator. Rendered alongside
 * every transform expression so the operator's semantics are always
 * visible on the page. Locked here as the single source of truth.
 */
export const REV_ZERO_EXPLAINER =
  'where rev(0) reverses the in↔out dex direction. ' +
  'Hippy / leggy notation supplements are stylistic; the pair differs ' +
  'only in dex direction once those are normalized.';

/** Lookup helper. Returns null when no transform is authored for the slug. */
export function getReversePairTransform(slug: string): ReversePairTransform | null {
  return REVERSE_PAIR_TRANSFORMS.get(slug) ?? null;
}
