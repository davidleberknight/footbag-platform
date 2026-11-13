/**
 * freestyleCanonicalSets.ts
 * ==========================
 *
 * Canonical-set ontology objects for the Set Encyclopedia at
 * /freestyle/sets and its per-set detail pages.
 *
 * Each entry is a first-class ontology object: set systems are
 * compositional vocabulary, not browse filters.
 *
 * Curator authority:
 *
 * - Formulas are quoted verbatim from Chris Holden's compilation where
 *   present and from freestyleCompositionalSets.ts; this module does
 *   not invent notation.
 * - `source` field preserves provenance: canonical (active dictionary
 *   row) / platform-tracked (in content modules, not a standalone
 *   dictionary entry) / holden-only (compilation-cited only).
 * - `auditStatus` preserves disagreement honestly when present; never
 *   silently resolves Holden ⇄ platform conflicts.
 * - Holden-only entries are NOT promoted to canonical trick ontology
 *   by this module. They render as set cards with honest provenance.
 *
 * Forever-rules:
 *
 * - Set hashtags use the role-prefix pattern `#set_<slug>` to distinguish
 *   set ontology from trick ontology (`#set_pixie` ≠ `#pixie_mirage`).
 * - Surface mechanics (sole, cloud, head, etc.) are NOT sets and do
 *   NOT appear in this module.
 * - Component mechanics (ducking, diving, bare spinning/inspinning,
 *   gyro) are body modifiers; they appear as cross-links from the set
 *   surfaces, never as set entries here.
 */

export type SetSubtype =
  | 'true-core'
  | 'composite-derived'
  | 'rotational'
  | 'whirl-swirl'
  | 'uns'
  | 'rooted-antisymposium';

export type CanonicalSetSource =
  | 'canonical'         // resolves to an active freestyle_tricks row
  | 'platform-tracked'  // appears in content modules but not as a standalone dictionary entry
  | 'holden-only';      // compilation-cited; no platform treatment

export type CanonicalSetAuditStatus =
  | 'aligned'      // Holden + platform agree
  | 'partial'      // notation matches; decomposition framing differs
  | 'conflict'     // substantive disagreement
  | 'holden-only'; // no platform entry

export interface SlugReference {
  slug: string;        // e.g. "pixie"
  label: string;       // e.g. "Pixie"
}

export interface CanonicalSet {
  /** Stable lowercase underscore slug; matches the modifier registry slug where applicable. */
  slug: string;
  /** Set ontology hashtag, role-prefix pattern `#set_<slug>`. */
  hashtag: string;
  /** Display name (Title Case). */
  displayName: string;
  /** Subtype cohort. */
  subtype: SetSubtype;
  /**
   * Operational notation, verbatim from Holden's compilation where
   * present. Movement-grammar string; not parser-friendly.
   */
  formula: string;
  /**
   * 1–2 sentence movement-language explanation. Coach-tone prose, no
   * jargon dump. Later detail pages will expand this; this is a seed.
   */
  movementExplanation: string;
  /** Parallel / sibling sets (e.g. pixie ↔ fairy directional mirrors). */
  relatedSystems: readonly SlugReference[];
  /** Provenance. The compilation is credited once, on the Set Encyclopedia. */
  source: CanonicalSetSource;
  /** Audit status when in the Compositional Sets audit table. */
  auditStatus?: CanonicalSetAuditStatus;
  /**
   * Future tier hook: literal-primitive vs compositional-system
   * distinction. Not yet populated.
   */
  tier?: 'literal-primitive' | 'compositional-system';
  /**
   * Display-only. When true the set is kept fully routable (its detail page and
   * any fold-map redirect still resolve) but is not shown as a confirmed set on
   * the Set Encyclopedia index list. Used while a concept's set status is held
   * pending doctrine, so the index does not teach it as a confirmed set.
   */
  heldFromEncyclopediaList?: boolean;
}

// ─────────────────────────────────────────────────────────────────────
// Subtype display metadata
// ─────────────────────────────────────────────────────────────────────

export interface SubtypeSpec {
  key: SetSubtype;
  label: string;
  intro: string;
}

export const SET_SUBTYPE_SPECS: readonly SubtypeSpec[] = [
  {
    key:   'true-core',
    label: 'True core sets',
    intro:
      'Foundational entry primitives: the basic toe and clipper entry surfaces plus the ' +
      'principal single-dex launch structures built from them. Reusable structures the ' +
      'rest of the language composes from.',
  },
  {
    key:   'composite-derived',
    label: 'Composite / derived sets',
    intro:
      'Multi-dex chains and derived entry topologies. Two or more dexes over the same set ' +
      'surface, or a structurally derived reading of a base shape. Named compositional ' +
      'systems built from the core grammar.',
  },
  {
    key:   'rotational',
    label: 'Rotational set systems',
    intro:
      'Named compositional systems carrying a SPIN body token inside the set chain. Not ' +
      'merely "spin + set": these are recognizable systems with their own movement ' +
      'identity.',
  },
  {
    key:   'whirl-swirl',
    label: 'Whirl / swirl-derived systems',
    intro:
      'CLIP-anchored cross-body rotational sets: explicit SWIRL tokens or the whirl ' +
      'family terminal pattern. Several family members are documented symposium / gyro ' +
      'variants of the base whirl shape.',
  },
  {
    key:   'uns',
    label: 'UNS sets (unusual non-standard entry)',
    intro:
      'Sets whose initial contact is something other than TOE or CLIP: pinch, dragon, ' +
      'frigidosis. The dex grammar applies as elsewhere; the entry surface shifts.',
  },
  {
    key:   'rooted-antisymposium',
    label: 'Rooted / antisymposium systems',
    intro:
      'The setting foot stays on the ground (antisymposium discipline). Discipline-level ' +
      'movement constraint applied to a set rather than a literal grammar string.',
  },
] as const;

// ─────────────────────────────────────────────────────────────────────
// Canonical set entries (45)
// ─────────────────────────────────────────────────────────────────────

export const CANONICAL_SETS: readonly CanonicalSet[] = [

  // ── True core sets (11) ────────────────────────────────────────────
  {
    slug: 'toe', hashtag: '#set_toe', displayName: 'Toe Set', subtype: 'true-core',
    formula: 'TOE >',
    movementExplanation:
      'The foundational entry surface: the bag is set up from a toe stall with no added ' +
      'dexterity. Most sets are this toe set plus a pre-base motion.',
    relatedSystems: [
      { slug: 'clipper', label: 'Clipper Set (inside-surface entry)' },
    ],
    source: 'platform-tracked',
  },
  {
    slug: 'clipper', hashtag: '#set_clipper', displayName: 'Clipper Set', subtype: 'true-core',
    formula: 'CLIP >',
    movementExplanation:
      'The other foundational entry surface: the bag is set from a clipper (cross-body ' +
      'inside-surface) stall with no added dexterity. Many cross-body sets start here.',
    relatedSystems: [
      { slug: 'toe', label: 'Toe Set (toe-surface entry)' },
    ],
    source: 'platform-tracked',
  },
  {
    slug: 'pixie', hashtag: '#set_pixie', displayName: 'Pixie', subtype: 'true-core',
    formula: 'TOE > SAME IN [DEX] >',
    movementExplanation:
      'A toe set with a same-side inward dex; the basic around-the-world-style ' +
      'entry and the directional mirror of fairy.',
    relatedSystems: [
      { slug: 'fairy', label: 'Fairy (directional mirror)' },
    ],
    source: 'platform-tracked',
    auditStatus: 'aligned',
    tier: 'literal-primitive',
  },
  {
    slug: 'fairy', hashtag: '#set_fairy', displayName: 'Fairy', subtype: 'true-core',
    formula: 'TOE > SAME OUT [DEX] >',
    movementExplanation:
      'A toe set with a same-side outward dex; the basic orbit-style entry and the ' +
      'directional mirror of pixie.',
    relatedSystems: [
      { slug: 'pixie', label: 'Pixie (directional mirror)' },
    ],
    source: 'platform-tracked',
    auditStatus: 'aligned',
    tier: 'literal-primitive',
  },
  {
    slug: 'stepping', hashtag: '#set_stepping', displayName: 'Stepping', subtype: 'true-core',
    formula: 'CLIP > OP IN [DEX] >',
    movementExplanation:
      'A clipper set with an opposite-side inward dex; the set foot relocates as it opens ' +
      'a clipper-anchored chain.',
    relatedSystems: [
      { slug: 'bubba', label: 'Bubba (directional mirror)' },
    ],
    source: 'platform-tracked',
    auditStatus: 'aligned',
    tier: 'literal-primitive',
  },
  {
    slug: 'quantum', hashtag: '#set_quantum', displayName: 'Quantum', subtype: 'true-core',
    formula: 'TOE > OP IN [DEX] > (op side component)',
    movementExplanation:
      'Toe set, then an opposite-side inward dex resolving to an op-side terminal. The ' +
      'inward-direction counterpart of atomic: both finish op-side, but quantum dexes ' +
      'inward where atomic dexes outward.',
    relatedSystems: [
      { slug: 'atomic',   label: 'Atomic (outward counterpart, op-side terminal)' },
      { slug: 'slapping', label: 'Slapping (same-side-component sibling)' },
    ],
    source: 'platform-tracked',
    auditStatus: 'aligned',
    tier: 'literal-primitive',
  },
  {
    slug: 'atomic', hashtag: '#set_atomic', displayName: 'Atomic', subtype: 'true-core',
    formula: 'TOE > OP OUT [DEX] > (op side component)',
    movementExplanation:
      'Atomic is the outward dex realized with a set role. Hippy Atomic and leggy ' +
      'Atomic are execution styles of Atomic. Older sources may blur Atomic, leggy ' +
      'Atomic, and Illusioning language, but current doctrine keeps them distinct: ' +
      'Illusioning is that same movement realized standalone, not an equivalent name for Atomic.',
    relatedSystems: [
      { slug: 'quantum',  label: 'Quantum (inward counterpart, op-side terminal)' },
      { slug: 'nuclear',  label: 'Nuclear (platform reading: paradox + illusion)' },
    ],
    source: 'platform-tracked',
    auditStatus: 'partial',
    tier: 'literal-primitive',
  },
  {
    slug: 'bubba', hashtag: '#set_bubba', displayName: 'Bubba', subtype: 'true-core',
    formula: 'CLIP > OP OUT [DEX] >',
    movementExplanation:
      'A clipper set with an opposite-side outward dex; the reverse-direction mirror of ' +
      'stepping. Named in the historical compilation but not currently a platform canonical.',
    relatedSystems: [
      { slug: 'stepping', label: 'Stepping (directional mirror)' },
    ],
    source: 'holden-only',
    auditStatus: 'holden-only',
    tier: 'literal-primitive',
  },
  {
    slug: 'slapping', hashtag: '#set_slapping', displayName: 'Slapping', subtype: 'true-core',
    formula: 'TOE > OP IN [DEX] > (same side component)',
    movementExplanation:
      'Toe set, then an opposite-side inward dex resolving to a same-side terminal, the ' +
      'terminal-side mirror of quantum. From the historical compilation;no current platform canonical.',
    relatedSystems: [
      { slug: 'quantum', label: 'Quantum (op-side-terminal sibling)' },
    ],
    source: 'holden-only',
    auditStatus: 'holden-only',
    tier: 'literal-primitive',
  },
  {
    slug: 'tapping', hashtag: '#set_tapping', displayName: 'Tapping', subtype: 'true-core',
    formula: 'TOE > OP OUT [DEX] (plant) > (same side component)',
    movementExplanation:
      'Toe set, then an opposite-side outward dex with a plant, resolving to a same-side ' +
      'terminal. A historical set reading (also read as Atomic same-side); the ' +
      'platform-canonical identity of tapping is the operator, a +1 tap modifier taught on the Tapping operator page.',
    relatedSystems: [
      { slug: 'atomic', label: 'Atomic (op-side-terminal sibling)' },
    ],
    source: 'holden-only',
    auditStatus: 'holden-only',
    tier: 'literal-primitive',
  },
  // ── Composite / derived sets (9) ──────────────────────────────────
  {
    slug: 'terraging', hashtag: '#set_terraging', displayName: 'Terraging', subtype: 'composite-derived',
    formula: 'TOE > SAME IN [DEX] > SAME IN [DEX] >',
    movementExplanation:
      'Pixie doubled (folk name Double Pixie): two same-side inward dexes layered over a ' +
      'toe set.',
    relatedSystems: [
      { slug: 'pixie', label: 'Pixie (single-dex base)' },
    ],
    source: 'holden-only',
    auditStatus: 'aligned',
    tier: 'compositional-system',
  },
  {
    slug: 'furious', hashtag: '#set_furious', displayName: 'Furious', subtype: 'composite-derived',
    formula: 'CLIP > OP IN [DEX] > SAME IN [DEX] >',
    movementExplanation:
      'Furious is the two-dex set: a clipper set opening with an ' +
      'opposite-side inward dex followed by a same-side inward dex. Barraging is not a ' +
      'canonical set but a legacy name pattern for this set; some tricks carry ' +
      'barraging-based names for historical continuity, but the set is Furious and their ' +
      'decomposition resolves to Furious. Barrage is a separate standalone base concept, ' +
      'not to be confused with Barraging.',
    relatedSystems: [
      { slug: 'stepping', label: 'Stepping (single-dex base)' },
    ],
    source: 'platform-tracked',
    auditStatus: 'partial',
    tier: 'compositional-system',
  },
  {
    slug: 'sailing', hashtag: '#set_sailing', displayName: 'Sailing', subtype: 'composite-derived',
    formula: 'TOE > SAME IN [DEX] > OP OUT [DEX] >',
    movementExplanation:
      'Pixie extended with an illusion-style dex (folk name Pixie Illusion). From the historical compilation;' +
      'no current platform canonical.',
    relatedSystems: [
      { slug: 'pixie', label: 'Pixie (single-dex base)' },
    ],
    source: 'holden-only',
    auditStatus: 'holden-only',
    tier: 'compositional-system',
  },
  {
    slug: 'zulu', hashtag: '#set_zulu', displayName: 'Zulu', subtype: 'composite-derived',
    formula: '',
    movementExplanation:
      'A ducking set: the bag travels across the body, under the chin, before the duck. ' +
      'The launch incorporates the ducking body movement; the across-body path into the duck is ' +
      'what distinguishes it. A set is defined by its launch mechanism, and this launch ' +
      'incorporates ducking rather than a bare dexterity.',
    relatedSystems: [
      { slug: 'weaving', label: 'Weaving (sibling ducking set; same-foot catch)' },
    ],
    source: 'platform-tracked',
    tier: 'compositional-system',
  },
  {
    slug: 'weaving', hashtag: '#set_weaving', displayName: 'Weaving', subtype: 'composite-derived',
    formula: '',
    movementExplanation:
      'A ducking set in which the bag is caught on the same foot that performed the set. ' +
      'The launch incorporates the ducking body movement; the same-foot catch is what ' +
      'distinguishes it. A set is defined by its launch mechanism, and this launch ' +
      'incorporates ducking rather than a bare dexterity.',
    relatedSystems: [
      { slug: 'zulu', label: 'Zulu (sibling ducking set; across-body bag path)' },
    ],
    source: 'platform-tracked',
    tier: 'compositional-system',
  },
  {
    slug: 'blurry', hashtag: '#set_blurry', displayName: 'Blurry', subtype: 'composite-derived',
    formula: 'CLIP > OP IN [DEX] > OP OUT [DEX] >',
    movementExplanation:
      'Stepping combined with a paradox-style orientation change.',
    relatedSystems: [
      { slug: 'stepping', label: 'Stepping (single-dex base)' },
    ],
    source: 'platform-tracked',
    auditStatus: 'aligned',
    tier: 'compositional-system',
  },
  {
    slug: 'frantic', hashtag: '#set_frantic', displayName: 'Frantic', subtype: 'composite-derived',
    formula: 'TOE > SAME IN [DEX] > OP IN [DEX] >',
    movementExplanation:
      'Pixie into quantum\'s direction: pixie\'s opening dex followed by an opposite-side ' +
      'inward dex. From the historical compilation;no current platform canonical.',
    relatedSystems: [
      { slug: 'pixie',   label: 'Pixie (first-dex base)' },
      { slug: 'quantum', label: 'Quantum (second-dex base)' },
    ],
    source: 'holden-only',
    auditStatus: 'holden-only',
    tier: 'compositional-system',
  },
  {
    slug: 'fairy_atomic', hashtag: '#set_fairy_atomic', displayName: 'Fairy Atomic', subtype: 'composite-derived',
    formula: 'TOE > SAME OUT [DEX] > OP OUT [DEX] >',
    movementExplanation:
      'Two-dex chain combining fairy\'s opening with atomic\'s direction. From the historical compilation;' +
      'no current platform canonical.',
    relatedSystems: [
      { slug: 'fairy',  label: 'Fairy (first-dex base)' },
      { slug: 'atomic', label: 'Atomic (second-dex direction)' },
    ],
    source: 'holden-only',
    auditStatus: 'holden-only',
    tier: 'compositional-system',
  },
  {
    slug: 'shooting', hashtag: '#set_shooting', displayName: 'Shooting', subtype: 'composite-derived',
    formula: 'CLIP > OP IN [DEX] > OP OUT [PDX][DEX] >',
    movementExplanation:
      'Stepping with a paradox-style orientation change, extended by an illusion-style dex ' +
      '(folk name Stepping Paradox Illusion). From the historical compilation;no current platform canonical.',
    relatedSystems: [
      { slug: 'stepping', label: 'Stepping (first-dex base)' },
      { slug: 'blurry',   label: 'Blurry (Stepping Paradox shape)' },
    ],
    source: 'holden-only',
    auditStatus: 'holden-only',
    tier: 'compositional-system',
  },
  {
    slug: 'flailing', hashtag: '#set_flailing', displayName: 'Flailing', subtype: 'composite-derived',
    formula: 'SET > (no plant while) OP OUT [BOD] [DEX] >',
    movementExplanation:
      'A Symposium Atomic set: the atomic dex leads and the base\'s own leading dex ' +
      'becomes a no-plant body dex, so the launch reads as one movement rather than two. ' +
      'As a set treatment it contributes +2, and a Symposium written alongside Flailing in ' +
      'a folk name expands this set rather than adding a second symposium treatment. A ' +
      'positional qualifier reads against the side the set originates from: on that side ' +
      'is same-side, crossing to the other is opposite.',
    relatedSystems: [],
    source: 'platform-tracked',
    auditStatus: 'partial',
    tier: 'compositional-system',
  },
  {
    slug: 'nuclear', hashtag: '#set_nuclear', displayName: 'Nuclear', subtype: 'composite-derived',
    formula: 'CLIP > SAME OUT [DEX] >',
    movementExplanation:
      'A clipper-based compound entry combining a paradox hip shift with an illusion-style ' +
      'dex. The historical compilation treats it as a basic single-dex set; the platform tracks it as a +2 ' +
      'compound.',
    relatedSystems: [
      { slug: 'atomic', label: 'Atomic (related uptime set; not a nuclear component under the paradox + illusion reading)' },
    ],
    source: 'platform-tracked',
    auditStatus: 'partial',
    tier: 'compositional-system',
  },

  // ── Rotational set systems (9) ─────────────────────────────────────
  {
    slug: 'surging', hashtag: '#set_surging', displayName: 'Surging', subtype: 'rotational',
    formula: 'SET > (BACK/FRONT) SPIN [BOD] > OP IN [DEX] >',
    movementExplanation:
      'Spin-anchored set system. The historical compilation reads it as spinning miraging; later platform ' +
      'analysis records the decomposition as spinning + stepping (CLIP-led). Both readings ' +
      'preserved as documented disagreement.',
    relatedSystems: [
      { slug: 'stepping', label: 'Stepping (platform\'s reading anchor)' },
    ],
    source: 'platform-tracked',
    auditStatus: 'conflict',
    tier: 'compositional-system',
  },
  {
    slug: 'sonic', hashtag: '#set_sonic', displayName: 'Sonic', subtype: 'rotational',
    formula: 'CLIP > (BACK) SPIN [BOD] > (BACK) SPIN [BOD] >',
    movementExplanation:
      'Double spinning over a clipper set, two back-spin tokens in sequence. From the historical compilation;' +
      'no current platform canonical.',
    relatedSystems: [
      { slug: 'peeking', label: 'Peeking (SET-led variant)' },
    ],
    source: 'holden-only',
    auditStatus: 'holden-only',
    tier: 'compositional-system',
  },
  {
    slug: 'peeking', hashtag: '#set_peeking', displayName: 'Peeking', subtype: 'rotational',
    formula: 'SET > (BACK) SPIN [BOD] > (BACK) SPIN [BOD] >',
    movementExplanation:
      'Double spinning, SET-led variant. The directional sibling of sonic with a SET ' +
      'rather than CLIP anchor. From the historical compilation;no current platform canonical.',
    relatedSystems: [
      { slug: 'sonic', label: 'Sonic (CLIP-led variant)' },
    ],
    source: 'holden-only',
    auditStatus: 'holden-only',
    tier: 'compositional-system',
  },
  {
    slug: 'leaning', hashtag: '#set_leaning', displayName: 'Leaning', subtype: 'rotational',
    formula: 'CLIP > OP IN [DEX] > (FRONT) SPIN [BOD] >',
    movementExplanation:
      'Stepping with a forward spin (folk name Stepping inspinning). From the historical compilation;no ' +
      'current platform canonical.',
    relatedSystems: [
      { slug: 'stepping', label: 'Stepping (set base)' },
      { slug: 'go_go',    label: 'Go-Go (back-spin sibling)' },
    ],
    source: 'holden-only',
    auditStatus: 'holden-only',
    tier: 'compositional-system',
  },
  {
    slug: 'go_go', hashtag: '#set_go_go', displayName: 'Go-Go', subtype: 'rotational',
    formula: 'CLIP > OP IN [DEX] > (BACK) SPIN [BOD] >',
    movementExplanation:
      'Stepping backspinning. The directional sibling of leaning with a back-spin token. ' +
      'From the historical compilation;no current platform canonical.',
    relatedSystems: [
      { slug: 'stepping', label: 'Stepping (set base)' },
      { slug: 'leaning',  label: 'Leaning (front-spin sibling)' },
    ],
    source: 'holden-only',
    auditStatus: 'holden-only',
    tier: 'compositional-system',
  },
  {
    slug: 'twinspinning', hashtag: '#set_twinspinning', displayName: 'Twinspinning', subtype: 'rotational',
    formula: 'CLIP > SAME OUT [DEX] > (FRONT) SPIN [BOD] >',
    movementExplanation:
      'Nuclear inspinning. Nuclear\'s opening dex followed by a front-spin body token. ' +
      'From the historical compilation;no current platform canonical.',
    relatedSystems: [
      { slug: 'nuclear', label: 'Nuclear (set base)' },
    ],
    source: 'holden-only',
    auditStatus: 'holden-only',
    tier: 'compositional-system',
  },
  {
    slug: 'neutron', hashtag: '#set_neutron', displayName: 'Neutron', subtype: 'rotational',
    formula: 'TOE > OP OUT [DEX] > (BACK) SPIN [BOD] > (op side component)',
    movementExplanation:
      'Atomic with an added back spin (folk name Atomic spin). From the historical compilation;no current ' +
      'platform canonical.',
    relatedSystems: [
      { slug: 'atomic', label: 'Atomic (set base)' },
    ],
    source: 'holden-only',
    auditStatus: 'holden-only',
    tier: 'compositional-system',
  },
  {
    slug: 'fairy_spinning', hashtag: '#set_fairy_spinning', displayName: 'Fairy Spinning', subtype: 'rotational',
    formula: 'TOE > SAME OUT [DEX] > (BACK) SPIN [BOD] >',
    movementExplanation:
      'Fairy\'s opening dex followed by a back-spin body token. From the historical compilation;no current ' +
      'platform canonical.',
    relatedSystems: [
      { slug: 'fairy', label: 'Fairy (set base)' },
      { slug: 'pixie_inspinning', label: 'Pixie Inspinning (directional sibling)' },
    ],
    source: 'holden-only',
    auditStatus: 'holden-only',
    tier: 'compositional-system',
  },
  {
    slug: 'pixie_inspinning', hashtag: '#set_pixie_inspinning', displayName: 'Pixie Inspinning', subtype: 'rotational',
    formula: 'TOE > SAME IN [DEX] > (FRONT) SPIN [BOD] >',
    movementExplanation:
      'Pixie\'s opening dex followed by a front-spin body token. From the historical compilation;no current ' +
      'platform canonical.',
    relatedSystems: [
      { slug: 'pixie', label: 'Pixie (set base)' },
      { slug: 'fairy_spinning', label: 'Fairy Spinning (directional sibling)' },
    ],
    source: 'holden-only',
    auditStatus: 'holden-only',
    tier: 'compositional-system',
  },

  // ── Whirl / swirl-derived systems (7) ──────────────────────────────
  {
    slug: 'swirling', hashtag: '#set_swirling', displayName: 'Swirling', subtype: 'whirl-swirl',
    formula: 'CLIP > SAME BACK/FRONT SWIRL [DEX] >',
    movementExplanation:
      'Clipper-anchored cross-body rotational set with an explicit SWIRL dex token. The ' +
      'opening of the whirl/swirl family.',
    relatedSystems: [],
    source: 'platform-tracked',
    auditStatus: 'aligned',
    tier: 'compositional-system',
  },
  {
    slug: 'blazing', hashtag: '#set_blazing', displayName: 'Blazing', subtype: 'whirl-swirl',
    formula: 'CLIP > OP IN [DEX] > (op side component)',
    movementExplanation:
      'A whirling set: an uptime whirl that the following trick is performed off of. ' +
      'The side the set originates from is the reference, and the whirl forming the set ' +
      'crosses to the opposite side of it. The ' +
      'crossing belongs to the set. A trick performed off it keeps its own side ' +
      'relations, which is why each blazing compound reads as this set followed by its ' +
      'base written as the base is written.',
    relatedSystems: [],
    source: 'platform-tracked',
    auditStatus: 'partial',
    tier: 'compositional-system',
  },
  {
    slug: 'scattered', hashtag: '#set_scattered', displayName: 'Scattered', subtype: 'whirl-swirl',
    formula: 'CLIP > OP OUT [DEX] > (same side component)',
    movementExplanation:
      'Reverse Whirling (same-side terminal). The opposite-direction sibling of whirling. ' +
      'From the historical compilation;no current platform canonical.',
    relatedSystems: [
      { slug: 'shattered', label: 'Shattered (op-side terminal sibling)' },
    ],
    source: 'holden-only',
    auditStatus: 'holden-only',
    tier: 'compositional-system',
  },
  {
    slug: 'shattered', hashtag: '#set_shattered', displayName: 'Shattered', subtype: 'whirl-swirl',
    formula: 'CLIP > OP OUT [DEX] > (op side component)',
    movementExplanation:
      'Reverse Whirling (op-side terminal). The terminal-side mirror of scattered. ' +
      'From the historical compilation;no current platform canonical.',
    relatedSystems: [
      { slug: 'scattered', label: 'Scattered (same-side terminal sibling)' },
    ],
    source: 'holden-only',
    auditStatus: 'holden-only',
    tier: 'compositional-system',
  },
  {
    slug: 'pogo', hashtag: '#set_pogo', displayName: 'Pogo', subtype: 'whirl-swirl',
    formula: 'CLIP > (no plant while) OP IN [DEX] >',
    movementExplanation:
      'Whirling performed off the ground (folk name Symposium Whirling): the whirl shape ' +
      'with no support-foot plant. On its own it scores 0 ADD; when used as a set into ' +
      'another trick, it adds 1 ADD.',
    relatedSystems: [],
    source: 'platform-tracked',
    auditStatus: 'aligned',
    tier: 'compositional-system',
  },
  {
    slug: 'blistering', hashtag: '#set_blistering', displayName: 'Blistering', subtype: 'whirl-swirl',
    formula: 'CLIP > OP IN [DEX] > (BACK) SPIN [BOD] >',
    movementExplanation:
      'Whirling with an added back spin (folk name Whirling Gyro); the gyro-lineage ' +
      'anchor.',
    relatedSystems: [],
    source: 'platform-tracked',
    auditStatus: 'aligned',
    tier: 'compositional-system',
  },
  {
    slug: 'broken', hashtag: '#set_broken', displayName: 'Broken', subtype: 'whirl-swirl',
    formula: 'CLIP > OP OUT [DEX] > (SAME)',
    movementExplanation:
      'Clipper reverse whirl. The reverse-direction sibling of the whirl shape; folk-named ' +
      'in the historical compilation. The underlying reverse-whirl shape is canonical; the name ' +
      '"Broken" itself is folk.',
    relatedSystems: [
      { slug: 'scattered', label: 'Scattered (same-side-terminal sibling)' },
    ],
    source: 'holden-only',
    auditStatus: 'holden-only',
    tier: 'compositional-system',
  },

  // ── UNS sets (5) ────────────────────────────────────────────────────
  {
    slug: 'finchy', hashtag: '#set_finchy', displayName: 'Finchy', subtype: 'uns',
    formula: 'PINCH > SAME OUT [DEX] >',
    movementExplanation:
      'Fairy off a pinch entry (folk name Pinching Fairy): fairy\'s outward dex over a ' +
      'pinch surface, not a toe set. From the historical compilation;no current platform canonical.',
    relatedSystems: [
      { slug: 'fairy', label: 'Fairy (toe-entry sibling)' },
    ],
    source: 'holden-only',
    auditStatus: 'holden-only',
    tier: 'compositional-system',
  },
  {
    slug: 'pixie_pinching', hashtag: '#set_pixie_pinching', displayName: 'Pixie Pinching', subtype: 'uns',
    formula: 'PINCH > SAME IN [DEX] >',
    movementExplanation:
      'Pixie\'s dex direction over a pinch entry surface. From the historical compilation;no current ' +
      'platform canonical.',
    relatedSystems: [
      { slug: 'pixie',  label: 'Pixie (toe-entry sibling)' },
      { slug: 'finchy', label: 'Finchy (pinch-entry sibling)' },
    ],
    source: 'holden-only',
    auditStatus: 'holden-only',
    tier: 'compositional-system',
  },
  {
    slug: 'twisted', hashtag: '#set_twisted', displayName: 'Twisted', subtype: 'uns',
    formula: 'DRAGON > SAME FRONT SWIRL [DEX] > SAME IN/OUT [PDX][DEX] >',
    movementExplanation:
      'Dragon-set Swirling Paradox. A SWIRL token over a dragon entry, then a paradox-token ' +
      'second dex. From the historical compilation;no current platform canonical.',
    relatedSystems: [
      { slug: 'snapping', label: 'Snapping (single-dex Dragon sibling)' },
    ],
    source: 'holden-only',
    auditStatus: 'holden-only',
    tier: 'compositional-system',
  },
  {
    slug: 'snapping', hashtag: '#set_snapping', displayName: 'Snapping', subtype: 'uns',
    formula: 'DRAGON > SAME FRONT SWIRL [DEX] >',
    movementExplanation:
      'Dragon-set Swirling. A SWIRL token over a dragon entry surface. From the historical compilation;no ' +
      'current platform canonical.',
    relatedSystems: [
      { slug: 'swirling', label: 'Swirling (toe-entry sibling)' },
      { slug: 'twisted',  label: 'Twisted (paradox-extended Dragon sibling)' },
    ],
    source: 'holden-only',
    auditStatus: 'holden-only',
    tier: 'compositional-system',
  },
  {
    slug: 'arctic', hashtag: '#set_arctic', displayName: 'Arctic', subtype: 'uns',
    formula: 'FRIGIDOSIS > SAME IN [DEX] >',
    movementExplanation:
      'Pixie off a frigidosis entry (folk name Frigidosis Pixie): pixie\'s inward dex over ' +
      'a frigidosis surface. From the historical compilation;no current platform canonical.',
    relatedSystems: [
      { slug: 'pixie',          label: 'Pixie (toe-entry sibling)' },
      { slug: 'pixie_pinching', label: 'Pixie Pinching (pinch-entry sibling)' },
    ],
    source: 'holden-only',
    auditStatus: 'holden-only',
    tier: 'compositional-system',
  },

  // ── Rooted / antisymposium systems (2) ─────────────────────────────
  {
    slug: 'rooting', hashtag: '#set_rooting', displayName: 'Rooting / Rooted', subtype: 'rooted-antisymposium',
    formula: 'Support-foot set, then dex (antisymposium); 0 ADD',
    movementExplanation:
      'Rooted is a set in its own right and an antisymposium discipline: the footbag is set ' +
      'from the support foot, which then dexes the footbag. The setting foot stays on the ' +
      'ground throughout, the inverse of symposium\'s no-plant constraint. It carries one ' +
      'attached dexterity but contributes no ADD. Railing-family tricks carry this as their ' +
      '(rooted) annotation.',
    relatedSystems: [],
    source: 'holden-only',
    auditStatus: 'holden-only',
    tier: 'compositional-system',
  },
  {
    slug: 'zoid', hashtag: '#set_zoid', displayName: 'Zoid', subtype: 'rooted-antisymposium',
    formula: 'Rooted toe-clipper set',
    movementExplanation:
      'Specific named pattern for an antisymposium toe-clipper set. The setting foot stays ' +
      'on the ground through the toe-to-clipper transition.',
    relatedSystems: [
      { slug: 'rooting', label: 'Rooting (parent discipline)' },
    ],
    source: 'holden-only',
    auditStatus: 'holden-only',
    tier: 'compositional-system',
  },
  {
    slug: 'railing', hashtag: '#set_railing', displayName: 'Railing', subtype: 'rooted-antisymposium',
    formula: 'TOE > SAME IN [DEX] > OP OUT [DEX] (rooted) >',
    movementExplanation:
      'Rooted Sailing: the Sailing set (a Pixie Illusion, a toe set then a same-side inward ' +
      'dex and an outward illusion dex) carried out under the rooted antisymposium ' +
      'discipline, with the setting foot staying on the ground. Rooted adds no ADD and ' +
      'Sailing carries two, so Railing contributes 2. Railing-family trick cards reference ' +
      'this entry by the (railing set) shorthand instead of repeating the expansion.',
    relatedSystems: [
      { slug: 'sailing', label: 'Sailing (the +2 dex spine)' },
      { slug: 'rooting', label: 'Rooting / Rooted (the +0 antisymposium discipline)' },
    ],
    source: 'holden-only',
    auditStatus: 'holden-only',
    tier: 'compositional-system',
  },
  {
    slug: 'surfing', hashtag: '#set_surfing', displayName: 'Surfing', subtype: 'composite-derived',
    formula: 'TOE > SAME OUT [DEX] > (no plant while) OP IN [BOD] > OP OUT [DEX] >',
    movementExplanation:
      'Surfing is a composite set reading Fairy Symposium Swirling: a fairy toe-set outward ' +
      'dex, a no-plant symposium body, and swirling\'s out dex, contributing 3 ADD. Surfing-' +
      'family trick cards reference this entry by the (surfing set) shorthand instead of ' +
      'repeating the expansion.',
    relatedSystems: [
      { slug: 'fairy', label: 'Fairy (the toe-set outward entry)' },
      { slug: 'swirling', label: 'Swirling (the same-side out dex)' },
    ],
    source: 'platform-tracked',
    auditStatus: 'aligned',
    tier: 'compositional-system',
  },
  {
    slug: 'floating', hashtag: '#set_floating', displayName: 'Floating', subtype: 'composite-derived',
    formula: 'Quantum Symposium Quantum',
    movementExplanation:
      'Floating is a composite set reading Quantum Symposium Quantum: a quantum entry, a ' +
      'no-plant symposium event, and a second quantum, contributing 3 ADD. Floating-family ' +
      'trick cards reference this entry by the (floating set) shorthand instead of repeating ' +
      'the expansion.',
    relatedSystems: [
      { slug: 'sailing', label: 'Sailing (sibling composite set)' },
    ],
    source: 'platform-tracked',
    auditStatus: 'aligned',
    tier: 'compositional-system',
  },
  {
    slug: 'warping', hashtag: '#set_warping', displayName: 'Warping', subtype: 'composite-derived',
    formula: 'TOE > OP OUT [DEX] > (no plant while) OP OUT [BOD] [DEX]',
    movementExplanation:
      'Warping is a two-dex set contributing 3 ADD: a first dex, then a second dex carried as a ' +
      'no-plant symposium event. Warping-family trick cards reference this entry by the ' +
      '(warping set) shorthand instead of repeating the expansion.',
    relatedSystems: [
      { slug: 'sailing', label: 'Sailing (sibling composite set)' },
    ],
    source: 'platform-tracked',
    auditStatus: 'aligned',
    tier: 'compositional-system',
  },

] as const;

/**
 * Index canonical sets by slug for O(1) lookup. Built once at module
 * load; safe because the array is `as const`.
 */
const SETS_BY_SLUG: ReadonlyMap<string, CanonicalSet> = new Map(
  CANONICAL_SETS.map(s => [s.slug, s]),
);

export function findCanonicalSetBySlug(slug: string): CanonicalSet | null {
  return SETS_BY_SLUG.get(slug) ?? null;
}

/**
 * Set-to-set canonical folds. Empty under current doctrine: illusioning and
 * atomic, and furious and barraging, are not treated as one set. Furious is its
 * own set entry, and Illusioning, Miraging, and Barraging are not sets. A media set-tag therefore
 * canonicalizes to itself, never folding one set name into another.
 */
const SET_SLUG_ALIASES: ReadonlyMap<string, string> = new Map();

/**
 * Returns the canonical set slug a retired alias slug folds to, or null when the
 * slug is not a fold. Empty today; kept as the media / sitemap seam so a future
 * genuine set-to-set fold has one home. A real set is never folded.
 */
export function resolveCanonicalSetAlias(slug: string): string | null {
  if (SETS_BY_SLUG.has(slug)) return null;
  return SET_SLUG_ALIASES.get(slug) ?? null;
}

/**
 * Old /freestyle/sets/:slug routes for a retired concept that is not a confirmed
 * set. Whirling is not a set; the uptime whirling set is Blazing, so the old
 * Whirling set URL lands on the Blazing page. Only the set URL moves: whirling stays a body modifier, and its
 * modifier and trick routes resolve as any modifier's do. A retired nickname
 * that names exactly one canonical set and nothing else (barraging names the
 * Furious set) redirects all its routes to that set page instead, resolved ahead
 * of this map. Only fires for slugs that are not themselves a live canonical set.
 */
const SET_ROUTE_RETIRED_REDIRECTS: ReadonlyMap<string, string> = new Map([
  ['whirling',    '/freestyle/sets/blazing'],
]);

export function resolveSetRouteRedirect(slug: string): string | null {
  if (SETS_BY_SLUG.has(slug)) return null;
  return SET_ROUTE_RETIRED_REDIRECTS.get(slug) ?? null;
}

export function canonicalSetsBySubtype(subtype: SetSubtype): readonly CanonicalSet[] {
  return CANONICAL_SETS.filter(s => s.subtype === subtype);
}
