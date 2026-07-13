/**
 * freestyleCanonicalSets.ts
 * ==========================
 *
 * Canonical-set ontology objects for the Set Hub at
 * /freestyle/tricks?view=sets.
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
 *   gyro) are body modifiers; they appear as cross-links from the Set
 *   Hub, never as set entries here.
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

export interface EquivalenceNote {
  reading: string;     // e.g. "Stepping Paradox", "Double Pixie"
  citation: string;    // e.g. "Holden parenthetical"
}

/**
 * A doctrine-supported alternate or historic NAME for the set, distinct from
 * the structural equivalenceNotes. `structuralReading` gives the structural
 * explanation that grounds the name (e.g. Illusioning's REV(0) Miraging);
 * `note` carries any phrasing nuance. This is a set-naming equivalence, not a
 * folk alias and not a structural ≡ reading.
 */
export interface SetEquivalentName {
  name: string;
  structuralReading?: string;
  note?: string;
}

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
  /** Equivalence notes (Holden parentheticals, folk-name readings). */
  equivalenceNotes: readonly EquivalenceNote[];
  /**
   * Doctrine-supported alternate / historic set names ("Equivalent names"),
   * kept distinct from the structural equivalenceNotes / ≡ readings.
   */
  equivalentNames?: readonly SetEquivalentName[];
  /** Sets that compose FROM this one (e.g. pixie → terraging). */
  derivedSystems: readonly SlugReference[];
  /** Parallel / sibling sets (e.g. pixie ↔ fairy directional mirrors). */
  relatedSystems: readonly SlugReference[];
  /** Provenance. */
  source: CanonicalSetSource;
  /** One-line source citation; public prose. */
  sourceCitation: string;
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
      'Foundational single-dex primitives. One dexterity step over a single set surface, ' +
      'no body modifier inside the chain, no second dex. Reusable structures the ' +
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
      'The foundational entry surface: the bag is set up from a toe delay with no added ' +
      'dexterity. Most sets are this toe set plus a pre-base motion.',
    equivalenceNotes: [],
    derivedSystems: [],
    relatedSystems: [
      { slug: 'clipper', label: 'Clipper Set (inside-surface entry)' },
    ],
    source: 'platform-tracked',
    sourceCitation: 'Platform entry-surface reference.',
  },
  {
    slug: 'clipper', hashtag: '#set_clipper', displayName: 'Clipper Set', subtype: 'true-core',
    formula: 'CLIP >',
    movementExplanation:
      'The other foundational entry surface: the bag is set from a clipper (cross-body ' +
      'inside-surface) delay with no added dexterity. Many cross-body sets start here.',
    equivalenceNotes: [],
    derivedSystems: [],
    relatedSystems: [
      { slug: 'toe', label: 'Toe Set (toe-surface entry)' },
    ],
    source: 'platform-tracked',
    sourceCitation: 'Platform entry-surface reference.',
  },
  {
    slug: 'pixie', hashtag: '#set_pixie', displayName: 'Pixie', subtype: 'true-core',
    formula: 'TOE > SAME IN [DEX] >',
    movementExplanation:
      'A toe set with a same-side inward dex; the basic ATW-style entry and the ' +
      'directional mirror of fairy.',
    equivalenceNotes: [],
    derivedSystems: [
      { slug: 'terraging', label: 'Terraging' },
      { slug: 'sailing',   label: 'Sailing' },
      { slug: 'frantic',   label: 'Frantic' },
      { slug: 'pixie_inspinning', label: 'Pixie Inspinning' },
      { slug: 'pixie_pinching',   label: 'Pixie Pinching' },
      { slug: 'arctic',    label: 'Arctic' },
    ],
    relatedSystems: [
      { slug: 'fairy', label: 'Fairy (directional mirror)' },
    ],
    source: 'platform-tracked',
    sourceCitation: 'Holden compilation (2003); aligned with platform operator reference.',
    auditStatus: 'aligned',
    tier: 'literal-primitive',
  },
  {
    slug: 'fairy', hashtag: '#set_fairy', displayName: 'Fairy', subtype: 'true-core',
    formula: 'TOE > SAME OUT [DEX] >',
    movementExplanation:
      'A toe set with a same-side outward dex; the basic orbit-style entry and the ' +
      'directional mirror of pixie.',
    equivalenceNotes: [],
    derivedSystems: [
      { slug: 'fairy_atomic',   label: 'Fairy Atomic' },
      { slug: 'fairy_spinning', label: 'Fairy Spinning' },
      { slug: 'finchy',         label: 'Finchy' },
    ],
    relatedSystems: [
      { slug: 'pixie', label: 'Pixie (directional mirror)' },
    ],
    source: 'platform-tracked',
    sourceCitation: 'Holden compilation (2003); aligned with platform operator reference.',
    auditStatus: 'aligned',
    tier: 'literal-primitive',
  },
  {
    slug: 'stepping', hashtag: '#set_stepping', displayName: 'Stepping', subtype: 'true-core',
    formula: 'CLIP > OP IN [DEX] >',
    movementExplanation:
      'A clipper set with an opposite-side inward dex; the set foot relocates as it opens ' +
      'a clipper-anchored chain.',
    equivalenceNotes: [],
    derivedSystems: [
      { slug: 'blurry',     label: 'Blurry' },
      { slug: 'leaning',    label: 'Leaning' },
      { slug: 'go_go',      label: 'Go-Go' },
      { slug: 'shooting',   label: 'Shooting' },
    ],
    relatedSystems: [
      { slug: 'bubba', label: 'Bubba (directional mirror)' },
    ],
    source: 'platform-tracked',
    sourceCitation: 'Holden compilation (2003); aligned with platform resolved formulas.',
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
    equivalenceNotes: [
      { reading: 'compressed atomic', citation: 'Holden reading' },
    ],
    derivedSystems: [
      { slug: 'frantic', label: 'Frantic' },
    ],
    relatedSystems: [
      { slug: 'atomic',   label: 'Atomic (outward counterpart, op-side terminal)' },
      { slug: 'slapping', label: 'Slapping (same-side-component sibling)' },
    ],
    source: 'platform-tracked',
    sourceCitation: 'Holden compilation (2003); aligned with platform operator reference.',
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
    equivalenceNotes: [
      { reading: 'Toe set Illusion', citation: 'Holden parenthetical (historical; not formalized by the platform)' },
    ],
    derivedSystems: [
      { slug: 'fairy_atomic', label: 'Fairy Atomic' },
      { slug: 'neutron',      label: 'Neutron' },
      { slug: 'tapping',      label: 'Tapping' },
    ],
    relatedSystems: [
      { slug: 'quantum',  label: 'Quantum (inward counterpart, op-side terminal)' },
      { slug: 'nuclear',  label: 'Nuclear (platform reading: paradox + illusion)' },
    ],
    source: 'platform-tracked',
    sourceCitation: 'Holden compilation (2003); platform tracks atomic as a +1 set primitive (audit row records partial: platform does not formalize Holden\'s Toe-set Illusion decomposition).',
    auditStatus: 'partial',
    tier: 'literal-primitive',
  },
  {
    slug: 'bubba', hashtag: '#set_bubba', displayName: 'Bubba', subtype: 'true-core',
    formula: 'CLIP > OP OUT [DEX] >',
    movementExplanation:
      'A clipper set with an opposite-side outward dex; the reverse-direction mirror of ' +
      'stepping. Named in Holden\'s compilation but not currently a platform canonical.',
    equivalenceNotes: [],
    derivedSystems: [],
    relatedSystems: [
      { slug: 'stepping', label: 'Stepping (directional mirror)' },
    ],
    source: 'holden-only',
    sourceCitation: 'Holden compilation (2003); no current platform canonical.',
    auditStatus: 'holden-only',
    tier: 'literal-primitive',
  },
  {
    slug: 'slapping', hashtag: '#set_slapping', displayName: 'Slapping', subtype: 'true-core',
    formula: 'TOE > OP IN [DEX] > (same side component)',
    movementExplanation:
      'Toe set, then an opposite-side inward dex resolving to a same-side terminal, the ' +
      'terminal-side mirror of quantum. Holden-cited; no current platform canonical.',
    equivalenceNotes: [],
    derivedSystems: [],
    relatedSystems: [
      { slug: 'quantum', label: 'Quantum (op-side-terminal sibling)' },
    ],
    source: 'holden-only',
    sourceCitation: 'Holden compilation (2003); no current platform canonical.',
    auditStatus: 'holden-only',
    tier: 'literal-primitive',
  },
  {
    slug: 'tapping', hashtag: '#set_tapping', displayName: 'Tapping', subtype: 'true-core',
    formula: 'TOE > OP OUT [DEX] (plant) > (same side component)',
    movementExplanation:
      'Toe set, then an opposite-side outward dex with a plant, resolving to a same-side ' +
      'terminal. A historical Holden set reading (also read as Atomic same-side); the ' +
      'platform-canonical identity of tapping is the operator, a +1 tap modifier taught on the Tapping operator page.',
    equivalenceNotes: [
      { reading: 'Atomic same side', citation: 'Holden parenthetical' },
    ],
    derivedSystems: [],
    relatedSystems: [
      { slug: 'atomic', label: 'Atomic (op-side-terminal sibling)' },
    ],
    source: 'holden-only',
    sourceCitation: 'Holden compilation (2003); historical set reading only. The platform-canonical identity is the Tapping operator.',
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
    equivalenceNotes: [
      { reading: 'Double Pixie', citation: 'Holden parenthetical' },
    ],
    derivedSystems: [],
    relatedSystems: [
      { slug: 'pixie', label: 'Pixie (single-dex base)' },
    ],
    source: 'holden-only',
    sourceCitation: 'Holden compilation (2003); decomposition aligns with pixie doubled.',
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
    equivalenceNotes: [
      { reading: 'High Stepping', citation: 'Holden parenthetical (historical)' },
    ],
    derivedSystems: [],
    relatedSystems: [
      { slug: 'stepping', label: 'Stepping (single-dex base)' },
    ],
    source: 'platform-tracked',
    sourceCitation: 'Platform-tracked as the two-dex set; Barraging is a legacy name pattern for this set, not a canonical set of its own.',
    auditStatus: 'partial',
    tier: 'compositional-system',
  },
  {
    slug: 'sailing', hashtag: '#set_sailing', displayName: 'Sailing', subtype: 'composite-derived',
    formula: 'TOE > SAME IN [DEX] > OP OUT [DEX] >',
    movementExplanation:
      'Pixie extended with an illusion-style dex (folk name Pixie Illusion). Holden-cited; ' +
      'no current platform canonical.',
    equivalenceNotes: [
      { reading: 'Pixie Illusion', citation: 'Holden parenthetical' },
    ],
    derivedSystems: [
      { slug: 'railing', label: 'Railing (rooted sailing)' },
    ],
    relatedSystems: [
      { slug: 'pixie', label: 'Pixie (single-dex base)' },
    ],
    source: 'holden-only',
    sourceCitation: 'Holden compilation (2003); decomposes mechanically to pixie + illusion-class second dex.',
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
    equivalenceNotes: [],
    derivedSystems: [],
    relatedSystems: [
      { slug: 'weaving', label: 'Weaving (sibling ducking set; same-foot catch)' },
    ],
    source: 'platform-tracked',
    sourceCitation: 'A defined ducking set system; canonical JOB notation is pending authoring.',
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
    equivalenceNotes: [],
    derivedSystems: [],
    relatedSystems: [
      { slug: 'zulu', label: 'Zulu (sibling ducking set; across-body bag path)' },
    ],
    source: 'platform-tracked',
    sourceCitation: 'A defined ducking set system; canonical JOB notation is pending authoring.',
    tier: 'compositional-system',
  },
  {
    slug: 'blurry', hashtag: '#set_blurry', displayName: 'Blurry', subtype: 'composite-derived',
    formula: 'CLIP > OP IN [DEX] > OP OUT [DEX] >',
    movementExplanation:
      'Stepping combined with a paradox-style orientation change.',
    equivalenceNotes: [
      { reading: 'Stepping Paradox', citation: 'Holden parenthetical' },
    ],
    derivedSystems: [],
    relatedSystems: [
      { slug: 'stepping', label: 'Stepping (single-dex base)' },
    ],
    source: 'platform-tracked',
    sourceCitation: 'Holden compilation (2003); aligned with the platform ruling.',
    auditStatus: 'aligned',
    tier: 'compositional-system',
  },
  {
    slug: 'frantic', hashtag: '#set_frantic', displayName: 'Frantic', subtype: 'composite-derived',
    formula: 'TOE > SAME IN [DEX] > OP IN [DEX] >',
    movementExplanation:
      'Pixie into quantum\'s direction: pixie\'s opening dex followed by an opposite-side ' +
      'inward dex. Holden-cited; no current platform canonical.',
    equivalenceNotes: [
      { reading: 'pixie-quantum', citation: 'Holden reading' },
    ],
    derivedSystems: [],
    relatedSystems: [
      { slug: 'pixie',   label: 'Pixie (first-dex base)' },
      { slug: 'quantum', label: 'Quantum (second-dex base)' },
    ],
    source: 'holden-only',
    sourceCitation: 'Holden compilation (2003); decomposes mechanically to pixie + quantum-direction second dex.',
    auditStatus: 'holden-only',
    tier: 'compositional-system',
  },
  {
    slug: 'fairy_atomic', hashtag: '#set_fairy_atomic', displayName: 'Fairy Atomic', subtype: 'composite-derived',
    formula: 'TOE > SAME OUT [DEX] > OP OUT [DEX] >',
    movementExplanation:
      'Two-dex chain combining fairy\'s opening with atomic\'s direction. Holden-cited; ' +
      'no current platform canonical.',
    equivalenceNotes: [],
    derivedSystems: [],
    relatedSystems: [
      { slug: 'fairy',  label: 'Fairy (first-dex base)' },
      { slug: 'atomic', label: 'Atomic (second-dex direction)' },
    ],
    source: 'holden-only',
    sourceCitation: 'Holden compilation (2003); no current platform canonical.',
    auditStatus: 'holden-only',
    tier: 'compositional-system',
  },
  {
    slug: 'shooting', hashtag: '#set_shooting', displayName: 'Shooting', subtype: 'composite-derived',
    formula: 'CLIP > OP IN [DEX] > OP OUT [PDX][DEX] >',
    movementExplanation:
      'Stepping with a paradox-style orientation change, extended by an illusion-style dex ' +
      '(folk name Stepping Paradox Illusion). Holden-cited; no current platform canonical.',
    equivalenceNotes: [
      { reading: 'Stepping Paradox Illusion', citation: 'Holden parenthetical' },
    ],
    derivedSystems: [],
    relatedSystems: [
      { slug: 'stepping', label: 'Stepping (first-dex base)' },
      { slug: 'blurry',   label: 'Blurry (Stepping Paradox shape)' },
    ],
    source: 'holden-only',
    sourceCitation: 'Holden compilation (2003); no current platform canonical.',
    auditStatus: 'holden-only',
    tier: 'compositional-system',
  },
  {
    slug: 'flailing', hashtag: '#set_flailing', displayName: 'Flailing', subtype: 'composite-derived',
    formula: 'SET > (no plant while) OP OUT [BOD] [DEX] >',
    movementExplanation:
      'Miraging reversed and performed off the ground (folk name Symposium Reverse ' +
      'Miraging). Holden-cited; no current platform canonical.',
    equivalenceNotes: [
      { reading: 'Symposium Reverse Miraging', citation: 'Holden parenthetical' },
      { reading: 'Symposium Illusioning', citation: 'Curator-adjudicated' },
    ],
    derivedSystems: [],
    relatedSystems: [],
    source: 'holden-only',
    sourceCitation: 'Holden compilation (2003); unusual notation with explicit no-plant constraint.',
    auditStatus: 'holden-only',
    tier: 'compositional-system',
  },
  {
    slug: 'nuclear', hashtag: '#set_nuclear', displayName: 'Nuclear', subtype: 'composite-derived',
    formula: 'CLIP > SAME OUT [DEX] >',
    movementExplanation:
      'A clipper-based compound entry combining a paradox hip shift with an illusion-style ' +
      'dex. Holden treats it as a basic single-dex set; the platform tracks it as a +2 ' +
      'compound.',
    equivalenceNotes: [
      { reading: 'paradox + illusion compound', citation: 'Platform reading' },
      { reading: 'basic single-dex set',        citation: 'Holden reading' },
    ],
    derivedSystems: [
      { slug: 'twinspinning', label: 'Twinspinning (nuclear inspinning)' },
    ],
    relatedSystems: [
      { slug: 'atomic', label: 'Atomic (related uptime set; not a nuclear component under the paradox + illusion reading)' },
    ],
    source: 'platform-tracked',
    sourceCitation: 'Holden compilation (2003); audit row partial: Holden\'s "basic" reading vs platform\'s compound reading.',
    auditStatus: 'partial',
    tier: 'compositional-system',
  },

  // ── Rotational set systems (9) ─────────────────────────────────────
  {
    slug: 'surging', hashtag: '#set_surging', displayName: 'Surging', subtype: 'rotational',
    formula: 'SET > (BACK/FRONT) SPIN [BOD] > OP IN [DEX] >',
    movementExplanation:
      'Spin-anchored set system. Holden reads it as spinning miraging; later platform ' +
      'analysis records the decomposition as spinning + stepping (CLIP-led). Both readings ' +
      'preserved as documented disagreement.',
    equivalenceNotes: [
      { reading: 'spinning miraging',  citation: 'Holden parenthetical' },
      { reading: 'spinning stepping',  citation: 'Platform reading' },
    ],
    derivedSystems: [],
    relatedSystems: [
      { slug: 'stepping', label: 'Stepping (platform\'s reading anchor)' },
    ],
    source: 'platform-tracked',
    sourceCitation: 'Holden compilation (2003); audit row conflict: readings disagree on entry surface anchor.',
    auditStatus: 'conflict',
    tier: 'compositional-system',
  },
  {
    slug: 'sonic', hashtag: '#set_sonic', displayName: 'Sonic', subtype: 'rotational',
    formula: 'CLIP > (BACK) SPIN [BOD] > (BACK) SPIN [BOD] >',
    movementExplanation:
      'Double spinning over a clipper set, two back-spin tokens in sequence. Holden-cited; ' +
      'no current platform canonical.',
    equivalenceNotes: [
      { reading: 'double spinning', citation: 'Holden parenthetical' },
    ],
    derivedSystems: [],
    relatedSystems: [
      { slug: 'peeking', label: 'Peeking (SET-led variant)' },
    ],
    source: 'holden-only',
    sourceCitation: 'Holden compilation (2003); no current platform canonical.',
    auditStatus: 'holden-only',
    tier: 'compositional-system',
  },
  {
    slug: 'peeking', hashtag: '#set_peeking', displayName: 'Peeking', subtype: 'rotational',
    formula: 'SET > (BACK) SPIN [BOD] > (BACK) SPIN [BOD] >',
    movementExplanation:
      'Double spinning, SET-led variant. The directional sibling of sonic with a SET ' +
      'rather than CLIP anchor. Holden-cited; no current platform canonical.',
    equivalenceNotes: [
      { reading: 'double spinning (SET-led)', citation: 'Holden parenthetical' },
    ],
    derivedSystems: [],
    relatedSystems: [
      { slug: 'sonic', label: 'Sonic (CLIP-led variant)' },
    ],
    source: 'holden-only',
    sourceCitation: 'Holden compilation (2003); no current platform canonical.',
    auditStatus: 'holden-only',
    tier: 'compositional-system',
  },
  {
    slug: 'leaning', hashtag: '#set_leaning', displayName: 'Leaning', subtype: 'rotational',
    formula: 'CLIP > OP IN [DEX] > (FRONT) SPIN [BOD] >',
    movementExplanation:
      'Stepping with a forward spin (folk name Stepping inspinning). Holden-cited; no ' +
      'current platform canonical.',
    equivalenceNotes: [
      { reading: 'stepping inspinning', citation: 'Holden parenthetical' },
    ],
    derivedSystems: [],
    relatedSystems: [
      { slug: 'stepping', label: 'Stepping (set base)' },
      { slug: 'go_go',    label: 'Go-Go (back-spin sibling)' },
    ],
    source: 'holden-only',
    sourceCitation: 'Holden compilation (2003); no current platform canonical.',
    auditStatus: 'holden-only',
    tier: 'compositional-system',
  },
  {
    slug: 'go_go', hashtag: '#set_go_go', displayName: 'Go-Go', subtype: 'rotational',
    formula: 'CLIP > OP IN [DEX] > (BACK) SPIN [BOD] >',
    movementExplanation:
      'Stepping backspinning. The directional sibling of leaning with a back-spin token. ' +
      'Holden-cited; no current platform canonical.',
    equivalenceNotes: [
      { reading: 'stepping backspinning', citation: 'Holden parenthetical' },
    ],
    derivedSystems: [],
    relatedSystems: [
      { slug: 'stepping', label: 'Stepping (set base)' },
      { slug: 'leaning',  label: 'Leaning (front-spin sibling)' },
    ],
    source: 'holden-only',
    sourceCitation: 'Holden compilation (2003); no current platform canonical.',
    auditStatus: 'holden-only',
    tier: 'compositional-system',
  },
  {
    slug: 'twinspinning', hashtag: '#set_twinspinning', displayName: 'Twinspinning', subtype: 'rotational',
    formula: 'CLIP > SAME OUT [DEX] > (FRONT) SPIN [BOD] >',
    movementExplanation:
      'Nuclear inspinning. Nuclear\'s opening dex followed by a front-spin body token. ' +
      'Holden-cited; no current platform canonical.',
    equivalenceNotes: [
      { reading: 'nuclear inspinning', citation: 'Holden parenthetical' },
    ],
    derivedSystems: [],
    relatedSystems: [
      { slug: 'nuclear', label: 'Nuclear (set base)' },
    ],
    source: 'holden-only',
    sourceCitation: 'Holden compilation (2003); no current platform canonical.',
    auditStatus: 'holden-only',
    tier: 'compositional-system',
  },
  {
    slug: 'neutron', hashtag: '#set_neutron', displayName: 'Neutron', subtype: 'rotational',
    formula: 'TOE > OP OUT [DEX] > (BACK) SPIN [BOD] > (op side component)',
    movementExplanation:
      'Atomic with an added back spin (folk name Atomic spin). Holden-cited; no current ' +
      'platform canonical.',
    equivalenceNotes: [
      { reading: 'Atomic spin', citation: 'Holden parenthetical' },
    ],
    derivedSystems: [],
    relatedSystems: [
      { slug: 'atomic', label: 'Atomic (set base)' },
    ],
    source: 'holden-only',
    sourceCitation: 'Holden compilation (2003); no current platform canonical.',
    auditStatus: 'holden-only',
    tier: 'compositional-system',
  },
  {
    slug: 'fairy_spinning', hashtag: '#set_fairy_spinning', displayName: 'Fairy Spinning', subtype: 'rotational',
    formula: 'TOE > SAME OUT [DEX] > (BACK) SPIN [BOD] >',
    movementExplanation:
      'Fairy\'s opening dex followed by a back-spin body token. Holden-cited; no current ' +
      'platform canonical.',
    equivalenceNotes: [],
    derivedSystems: [],
    relatedSystems: [
      { slug: 'fairy', label: 'Fairy (set base)' },
      { slug: 'pixie_inspinning', label: 'Pixie Inspinning (directional sibling)' },
    ],
    source: 'holden-only',
    sourceCitation: 'Holden compilation (2003); no current platform canonical.',
    auditStatus: 'holden-only',
    tier: 'compositional-system',
  },
  {
    slug: 'pixie_inspinning', hashtag: '#set_pixie_inspinning', displayName: 'Pixie Inspinning', subtype: 'rotational',
    formula: 'TOE > SAME IN [DEX] > (FRONT) SPIN [BOD] >',
    movementExplanation:
      'Pixie\'s opening dex followed by a front-spin body token. Holden-cited; no current ' +
      'platform canonical.',
    equivalenceNotes: [],
    derivedSystems: [],
    relatedSystems: [
      { slug: 'pixie', label: 'Pixie (set base)' },
      { slug: 'fairy_spinning', label: 'Fairy Spinning (directional sibling)' },
    ],
    source: 'holden-only',
    sourceCitation: 'Holden compilation (2003); no current platform canonical.',
    auditStatus: 'holden-only',
    tier: 'compositional-system',
  },

  // ── Whirl / swirl-derived systems (8) ──────────────────────────────
  {
    slug: 'swirling', hashtag: '#set_swirling', displayName: 'Swirling', subtype: 'whirl-swirl',
    formula: 'CLIP > SAME BACK/FRONT SWIRL [DEX] >',
    movementExplanation:
      'Clipper-anchored cross-body rotational set with an explicit SWIRL dex token. The ' +
      'opening of the whirl/swirl family.',
    equivalenceNotes: [],
    derivedSystems: [
      { slug: 'snapping', label: 'Snapping (Dragon-set variant)' },
      { slug: 'twisted',  label: 'Twisted (Dragon-set Paradox variant)' },
    ],
    relatedSystems: [
      { slug: 'whirling', label: 'Whirling (same-side terminal sibling)' },
    ],
    source: 'platform-tracked',
    sourceCitation: 'Holden compilation (2003); aligned with platform tracking.',
    auditStatus: 'aligned',
    tier: 'compositional-system',
  },
  {
    slug: 'whirling', hashtag: '#set_whirling', displayName: 'Whirling', subtype: 'whirl-swirl',
    formula: 'CLIP > OP IN [DEX] > (same side component)',
    movementExplanation:
      'Whirl-family base: clipper-anchored opposite-side inward dex with a same-side ' +
      'terminal. Anchor of the whirl-family naming branch.',
    equivalenceNotes: [],
    derivedSystems: [
      { slug: 'blistering', label: 'Blistering (Whirling Gyro)' },
      { slug: 'pogo',       label: 'Pogo (Symposium Whirling)' },
    ],
    relatedSystems: [
      { slug: 'blazing',    label: 'Blazing (op-side-terminal variant)' },
      { slug: 'swirling',   label: 'Swirling (SWIRL-token sibling)' },
    ],
    source: 'platform-tracked',
    sourceCitation: 'Holden compilation (2003); aligned with platform operator reference.',
    auditStatus: 'aligned',
    tier: 'compositional-system',
  },
  {
    slug: 'blazing', hashtag: '#set_blazing', displayName: 'Blazing', subtype: 'whirl-swirl',
    formula: 'CLIP > OP IN [DEX] > (op side component)',
    movementExplanation:
      'Whirling with the opposite-side terminal component. Holden distinguishes blazing ' +
      'from whirling by terminal side; the platform does not separate them.',
    equivalenceNotes: [
      { reading: 'whirling (op-side terminal variant)', citation: 'Holden distinction' },
    ],
    derivedSystems: [],
    relatedSystems: [
      { slug: 'whirling', label: 'Whirling (same-side terminal sibling)' },
    ],
    source: 'holden-only',
    sourceCitation: 'Holden compilation (2003); Holden distinguishes by terminal side; platform treats as whirling.',
    auditStatus: 'holden-only',
    tier: 'compositional-system',
  },
  {
    slug: 'scattered', hashtag: '#set_scattered', displayName: 'Scattered', subtype: 'whirl-swirl',
    formula: 'CLIP > OP OUT [DEX] > (same side component)',
    movementExplanation:
      'Reverse Whirling (same-side terminal). The opposite-direction sibling of whirling. ' +
      'Holden-cited; no current platform canonical.',
    equivalenceNotes: [
      { reading: 'Reverse Whirling (same side)', citation: 'Holden parenthetical' },
    ],
    derivedSystems: [],
    relatedSystems: [
      { slug: 'shattered', label: 'Shattered (op-side terminal sibling)' },
      { slug: 'whirling',  label: 'Whirling (forward-direction sibling)' },
    ],
    source: 'holden-only',
    sourceCitation: 'Holden compilation (2003); no current platform canonical.',
    auditStatus: 'holden-only',
    tier: 'compositional-system',
  },
  {
    slug: 'shattered', hashtag: '#set_shattered', displayName: 'Shattered', subtype: 'whirl-swirl',
    formula: 'CLIP > OP OUT [DEX] > (op side component)',
    movementExplanation:
      'Reverse Whirling (op-side terminal). The terminal-side mirror of scattered. ' +
      'Holden-cited; no current platform canonical.',
    equivalenceNotes: [
      { reading: 'Reverse Whirling (op side)', citation: 'Holden parenthetical' },
    ],
    derivedSystems: [],
    relatedSystems: [
      { slug: 'scattered', label: 'Scattered (same-side terminal sibling)' },
    ],
    source: 'holden-only',
    sourceCitation: 'Holden compilation (2003); no current platform canonical.',
    auditStatus: 'holden-only',
    tier: 'compositional-system',
  },
  {
    slug: 'pogo', hashtag: '#set_pogo', displayName: 'Pogo', subtype: 'whirl-swirl',
    formula: 'CLIP > (no plant while) OP IN [DEX] >',
    movementExplanation:
      'Whirling performed off the ground (folk name Symposium Whirling): the whirl shape ' +
      'with no support-foot plant.',
    equivalenceNotes: [
      { reading: 'Symposium Whirling', citation: 'Holden parenthetical' },
    ],
    derivedSystems: [],
    relatedSystems: [
      { slug: 'whirling', label: 'Whirling (planted base)' },
    ],
    source: 'platform-tracked',
    sourceCitation: 'Holden compilation (2003); aligned with platform tracking.',
    auditStatus: 'aligned',
    tier: 'compositional-system',
  },
  {
    slug: 'blistering', hashtag: '#set_blistering', displayName: 'Blistering', subtype: 'whirl-swirl',
    formula: 'CLIP > OP IN [DEX] > (BACK) SPIN [BOD] >',
    movementExplanation:
      'Whirling with an added back spin (folk name Whirling Gyro); the gyro-lineage ' +
      'anchor.',
    equivalenceNotes: [
      { reading: 'Whirling Gyro', citation: 'Holden parenthetical' },
    ],
    derivedSystems: [],
    relatedSystems: [
      { slug: 'whirling', label: 'Whirling (dex base)' },
    ],
    source: 'platform-tracked',
    sourceCitation: 'Holden compilation (2003); aligned with platform tracking.',
    auditStatus: 'aligned',
    tier: 'compositional-system',
  },
  {
    slug: 'broken', hashtag: '#set_broken', displayName: 'Broken', subtype: 'whirl-swirl',
    formula: 'CLIP > OP OUT [DEX] > (SAME)',
    movementExplanation:
      'Clipper reverse whirl. The reverse-direction sibling of the whirl shape; folk-named ' +
      'in Holden\'s compilation. The underlying reverse-whirl shape is canonical; the name ' +
      '"Broken" itself is folk.',
    equivalenceNotes: [
      { reading: 'clipper reverse whirl', citation: 'Holden parenthetical' },
    ],
    derivedSystems: [],
    relatedSystems: [
      { slug: 'whirling',  label: 'Whirling (forward-direction sibling)' },
      { slug: 'scattered', label: 'Scattered (same-side-terminal sibling)' },
    ],
    source: 'holden-only',
    sourceCitation: 'Holden compilation (2003); name is folk, underlying reverse-whirl shape is canonical.',
    auditStatus: 'holden-only',
    tier: 'compositional-system',
  },

  // ── UNS sets (5) ────────────────────────────────────────────────────
  {
    slug: 'finchy', hashtag: '#set_finchy', displayName: 'Finchy', subtype: 'uns',
    formula: 'PINCH > SAME OUT [DEX] >',
    movementExplanation:
      'Fairy off a pinch entry (folk name Pinching Fairy): fairy\'s outward dex over a ' +
      'pinch surface, not a toe set. Holden-cited; no current platform canonical.',
    equivalenceNotes: [
      { reading: 'Pinching Fairy set', citation: 'Holden parenthetical' },
    ],
    derivedSystems: [],
    relatedSystems: [
      { slug: 'fairy', label: 'Fairy (toe-entry sibling)' },
    ],
    source: 'holden-only',
    sourceCitation: 'Holden compilation (2003); no current platform canonical.',
    auditStatus: 'holden-only',
    tier: 'compositional-system',
  },
  {
    slug: 'pixie_pinching', hashtag: '#set_pixie_pinching', displayName: 'Pixie Pinching', subtype: 'uns',
    formula: 'PINCH > SAME IN [DEX] >',
    movementExplanation:
      'Pixie\'s dex direction over a pinch entry surface. Holden-cited; no current ' +
      'platform canonical.',
    equivalenceNotes: [],
    derivedSystems: [],
    relatedSystems: [
      { slug: 'pixie',  label: 'Pixie (toe-entry sibling)' },
      { slug: 'finchy', label: 'Finchy (pinch-entry sibling)' },
    ],
    source: 'holden-only',
    sourceCitation: 'Holden compilation (2003); no current platform canonical.',
    auditStatus: 'holden-only',
    tier: 'compositional-system',
  },
  {
    slug: 'twisted', hashtag: '#set_twisted', displayName: 'Twisted', subtype: 'uns',
    formula: 'DRAGON > SAME FRONT SWIRL [DEX] > SAME IN/OUT [PDX][DEX] >',
    movementExplanation:
      'Dragon-set Swirling Paradox. A SWIRL token over a dragon entry, then a paradox-token ' +
      'second dex. Holden-cited; no current platform canonical.',
    equivalenceNotes: [
      { reading: 'Dragon set Swirling Paradox', citation: 'Holden parenthetical' },
    ],
    derivedSystems: [],
    relatedSystems: [
      { slug: 'snapping', label: 'Snapping (single-dex Dragon sibling)' },
    ],
    source: 'holden-only',
    sourceCitation: 'Holden compilation (2003); no current platform canonical.',
    auditStatus: 'holden-only',
    tier: 'compositional-system',
  },
  {
    slug: 'snapping', hashtag: '#set_snapping', displayName: 'Snapping', subtype: 'uns',
    formula: 'DRAGON > SAME FRONT SWIRL [DEX] >',
    movementExplanation:
      'Dragon-set Swirling. A SWIRL token over a dragon entry surface. Holden-cited; no ' +
      'current platform canonical.',
    equivalenceNotes: [
      { reading: 'Dragon set Swirling', citation: 'Holden parenthetical' },
    ],
    derivedSystems: [],
    relatedSystems: [
      { slug: 'swirling', label: 'Swirling (toe-entry sibling)' },
      { slug: 'twisted',  label: 'Twisted (paradox-extended Dragon sibling)' },
    ],
    source: 'holden-only',
    sourceCitation: 'Holden compilation (2003); no current platform canonical.',
    auditStatus: 'holden-only',
    tier: 'compositional-system',
  },
  {
    slug: 'arctic', hashtag: '#set_arctic', displayName: 'Arctic', subtype: 'uns',
    formula: 'FRIGIDOSIS > SAME IN [DEX] >',
    movementExplanation:
      'Pixie off a frigidosis entry (folk name Frigidosis Pixie): pixie\'s inward dex over ' +
      'a frigidosis surface. Holden-cited; no current platform canonical.',
    equivalenceNotes: [
      { reading: 'frigidosis Pixie', citation: 'Holden parenthetical' },
    ],
    derivedSystems: [],
    relatedSystems: [
      { slug: 'pixie',          label: 'Pixie (toe-entry sibling)' },
      { slug: 'pixie_pinching', label: 'Pixie Pinching (pinch-entry sibling)' },
    ],
    source: 'holden-only',
    sourceCitation: 'Holden compilation (2003); no current platform canonical.',
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
    equivalenceNotes: [
      { reading: 'support-foot set with attached dex (antisymposium)', citation: 'curator-ruled' },
    ],
    derivedSystems: [
      { slug: 'zoid', label: 'Zoid (rooted toe-clipper set)' },
    ],
    relatedSystems: [],
    source: 'holden-only',
    sourceCitation: 'Holden compilation (2003); discipline-level note rather than a literal set notation.',
    auditStatus: 'holden-only',
    tier: 'compositional-system',
  },
  {
    slug: 'zoid', hashtag: '#set_zoid', displayName: 'Zoid', subtype: 'rooted-antisymposium',
    formula: 'Rooted toe-clipper set',
    movementExplanation:
      'Specific named pattern for an antisymposium toe-clipper set. The setting foot stays ' +
      'on the ground through the toe-to-clipper transition.',
    equivalenceNotes: [],
    derivedSystems: [],
    relatedSystems: [
      { slug: 'rooting', label: 'Rooting (parent discipline)' },
    ],
    source: 'holden-only',
    sourceCitation: 'Holden compilation (2003); no current platform canonical.',
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
    equivalenceNotes: [
      { reading: 'Rooted Sailing', citation: 'Holden-derived (rooted + sailing)' },
    ],
    derivedSystems: [],
    relatedSystems: [
      { slug: 'sailing', label: 'Sailing (the +2 dex spine)' },
      { slug: 'rooting', label: 'Rooting / Rooted (the +0 antisymposium discipline)' },
    ],
    source: 'holden-only',
    sourceCitation: 'Holden compilation (2003); Rooted Sailing composition, documented to back the railing trick cohort.',
    auditStatus: 'holden-only',
    tier: 'compositional-system',
  },
  {
    slug: 'surfing', hashtag: '#set_surfing', displayName: 'Surfing', subtype: 'composite-derived',
    formula: 'TOE > SAME OUT [DEX] > (no plant while) OP IN [BOD] > OP BACK SWIRL [DEX] >',
    movementExplanation:
      'Surfing is a composite set reading Fairy Symposium Swirling: a fairy toe-set outward ' +
      'dex, a no-plant symposium body, and a back-swirl dex, contributing 3 ADD. Surfing-' +
      'family trick cards reference this entry by the (surfing set) shorthand instead of ' +
      'repeating the expansion.',
    equivalenceNotes: [
      { reading: 'Fairy Symposium Swirling', citation: 'derived from the surfing trick cohort expansion' },
    ],
    derivedSystems: [],
    relatedSystems: [
      { slug: 'fairy', label: 'Fairy (the toe-set outward entry)' },
      { slug: 'swirling', label: 'Swirling (the back-swirl dex)' },
    ],
    source: 'platform-tracked',
    sourceCitation: 'Derived from the surfing trick cohort expansion (FootbagMoves single-source).',
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
    equivalenceNotes: [
      { reading: 'Quantum Symposium Quantum', citation: 'curator-ruled' },
    ],
    derivedSystems: [],
    relatedSystems: [
      { slug: 'sailing', label: 'Sailing (sibling composite set)' },
    ],
    source: 'platform-tracked',
    sourceCitation: 'Composite set (Quantum Symposium Quantum); curator-ruled at 3 ADD.',
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
    equivalenceNotes: [
      { reading: 'two dexes, the second is symposium', citation: 'curator-ruled' },
    ],
    derivedSystems: [],
    relatedSystems: [
      { slug: 'sailing', label: 'Sailing (sibling composite set)' },
    ],
    source: 'platform-tracked',
    sourceCitation: 'Composite set (two dexes, second symposium); curator-ruled at 3 ADD.',
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
 * Set-to-set canonical folds. Empty under current doctrine: the former merge
 * folds (illusioning to atomic, furious to barraging) are removed, because those
 * pairs are no longer treated as one set. Furious is now its own set entry, and
 * Illusioning, Miraging, and Barraging are not sets. A media set-tag therefore
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
 * Old /freestyle/sets/:slug routes for concepts that are NOT confirmed sets.
 * Under current doctrine Illusioning is a standalone movement rather than a launch
 * set, and Miraging and Barraging are held / non-set terminology; none is a set page. Their old set
 * URLs redirect to the glossary term that explains each as a non-set concept, so
 * existing deep links resolve without teaching a set page. Only fires for slugs
 * that are not themselves a live canonical set.
 */
const SET_ROUTE_GLOSSARY_REDIRECTS: ReadonlyMap<string, string> = new Map([
  ['illusioning', '/freestyle/glossary#term-illusioning'],
  ['miraging',    '/freestyle/glossary#term-miraging-not-a-set'],
  ['barraging',   '/freestyle/glossary#term-barraging-not-a-set'],
]);

export function resolveSetRouteRedirect(slug: string): string | null {
  if (SETS_BY_SLUG.has(slug)) return null;
  return SET_ROUTE_GLOSSARY_REDIRECTS.get(slug) ?? null;
}

export function canonicalSetsBySubtype(subtype: SetSubtype): readonly CanonicalSet[] {
  return CANONICAL_SETS.filter(s => s.subtype === subtype);
}
