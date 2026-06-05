/**
 * freestyleCanonicalSets.ts
 * ==========================
 *
 * Phase A of the set-system refactor (2026-05-25). Canonical-set ontology
 * objects for the Set Hub at /freestyle/tricks?view=sets.
 *
 * Each entry is a first-class ontology object — set systems are
 * compositional vocabulary, not browse filters. See:
 *
 *   exploration/set-system-refactor-2026-05-25/PROPOSAL.md
 *
 * Curator authority:
 *
 * - Formulas are quoted verbatim from Chris Holden's compilation where
 *   present (exploration/fborg/chrisHoldenSets.txt) and from
 *   freestyleCompositionalSets.ts; this module does not invent notation.
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
 * - Set hashtags use the pattern `#<slug>-set` to distinguish set
 *   ontology from trick ontology (`#pixie-set` ≠ `#pixie-mirage`).
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

export interface SlugReference {
  slug: string;        // e.g. "pixie"
  label: string;       // e.g. "Pixie"
}

export interface CanonicalSet {
  /** Stable kebab-case slug; matches the modifier registry slug where applicable. */
  slug: string;
  /** Set ontology hashtag — pattern `#<slug>-set`. */
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
   * jargon dump. Phase B detail pages will expand this; Phase A is a
   * seed.
   */
  movementExplanation: string;
  /** Equivalence notes (Holden parentheticals, folk-name readings). */
  equivalenceNotes: readonly EquivalenceNote[];
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
   * Future tier hook (Refinement #2 in proposal): literal-primitive vs
   * compositional-system distinction. Not yet populated in Phase A.
   */
  tier?: 'literal-primitive' | 'compositional-system';
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
      'no body modifier inside the chain, no second dex. Reusable uptime structures the ' +
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
      'merely "spin + set" — these are recognizable systems with their own movement ' +
      'identity.',
  },
  {
    key:   'whirl-swirl',
    label: 'Whirl / swirl-derived systems',
    intro:
      'CLIP-anchored cross-body rotational sets — explicit SWIRL tokens or the whirl ' +
      'family terminal pattern. Several family members are documented symposium / gyro ' +
      'variants of the base whirl shape.',
  },
  {
    key:   'uns',
    label: 'UNS sets (unusual non-standard entry)',
    intro:
      'Sets whose initial contact is something other than TOE or CLIP — pinch, dragon, ' +
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
// Canonical set entries (46)
// ─────────────────────────────────────────────────────────────────────

export const CANONICAL_SETS: readonly CanonicalSet[] = [

  // ── True core sets (8) ─────────────────────────────────────────────
  {
    slug: 'pixie', hashtag: '#pixie-set', displayName: 'Pixie', subtype: 'true-core',
    formula: 'TOE > SAME IN [DEX] >',
    movementExplanation:
      'Toe set, then a same-side inward dex. The simplest +1 uptime entry; the pre-base ' +
      'motion echoes the around-the-world shape.',
    equivalenceNotes: [],
    derivedSystems: [
      { slug: 'terraging', label: 'Terraging' },
      { slug: 'sailing',   label: 'Sailing' },
      { slug: 'frantic',   label: 'Frantic' },
      { slug: 'pixie-inspinning', label: 'Pixie Inspinning' },
      { slug: 'pixie-pinching',   label: 'Pixie Pinching' },
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
    slug: 'fairy', hashtag: '#fairy-set', displayName: 'Fairy', subtype: 'true-core',
    formula: 'TOE > SAME OUT [DEX] >',
    movementExplanation:
      'Toe set, then a same-side outward dex. The directional mirror of pixie; the ' +
      'pre-base motion echoes the orbit shape.',
    equivalenceNotes: [],
    derivedSystems: [
      { slug: 'fairy-atomic',   label: 'Fairy Atomic' },
      { slug: 'fairy-spinning', label: 'Fairy Spinning' },
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
    slug: 'stepping', hashtag: '#stepping-set', displayName: 'Stepping', subtype: 'true-core',
    formula: 'CLIP > OP IN [DEX] >',
    movementExplanation:
      'Clipper set, then an opposite-side inward dex. Set-foot relocation rather than ' +
      'a uptime compression; the open of a clipper-anchored chain.',
    equivalenceNotes: [],
    derivedSystems: [
      { slug: 'barraging',  label: 'Barraging' },
      { slug: 'blurry',     label: 'Blurry' },
      { slug: 'leaning',    label: 'Leaning' },
      { slug: 'go-go',      label: 'Go-Go' },
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
    slug: 'quantum', hashtag: '#quantum-set', displayName: 'Quantum', subtype: 'true-core',
    formula: 'TOE > OP IN [DEX] > (op side component)',
    movementExplanation:
      'Toe set, then an opposite-side inward dex resolving to an op-side terminal. Reads ' +
      'as a compressed atomic — the dex direction matches atomic, the terminal side flips.',
    equivalenceNotes: [
      { reading: 'compressed atomic', citation: 'Holden reading' },
    ],
    derivedSystems: [
      { slug: 'frantic', label: 'Frantic' },
    ],
    relatedSystems: [
      { slug: 'atomic',   label: 'Atomic (same dex direction, op-side terminal)' },
      { slug: 'slapping', label: 'Slapping (same-side-component sibling)' },
    ],
    source: 'platform-tracked',
    sourceCitation: 'Holden compilation (2003); aligned with platform operator reference.',
    auditStatus: 'aligned',
    tier: 'literal-primitive',
  },
  {
    slug: 'atomic', hashtag: '#atomic-set', displayName: 'Atomic', subtype: 'true-core',
    formula: 'TOE > OP OUT [DEX] > (op side component)',
    movementExplanation:
      'Toe set, then an opposite-side outward dex resolving to an op-side terminal. The ' +
      'uptime motion echoes the pickup crossing; Holden reads it as a Toe-set Illusion.',
    equivalenceNotes: [
      { reading: 'Toe set Illusion', citation: 'Holden parenthetical' },
    ],
    derivedSystems: [
      { slug: 'fairy-atomic', label: 'Fairy Atomic' },
      { slug: 'neutron',      label: 'Neutron' },
      { slug: 'tapping',      label: 'Tapping' },
    ],
    relatedSystems: [
      { slug: 'quantum', label: 'Quantum (same dex direction, op-side terminal)' },
      { slug: 'nuclear', label: 'Nuclear (platform reading: paradox + illusion)' },
    ],
    source: 'platform-tracked',
    sourceCitation: 'Holden compilation (2003); platform tracks atomic as a +1 set primitive (audit row records partial — platform does not formalize Holden\'s Toe-set Illusion decomposition).',
    auditStatus: 'partial',
    tier: 'literal-primitive',
  },
  {
    slug: 'bubba', hashtag: '#bubba-set', displayName: 'Bubba', subtype: 'true-core',
    formula: 'CLIP > OP OUT [DEX] >',
    movementExplanation:
      'Clipper set, then an opposite-side outward dex. The reverse-direction sibling of ' +
      'stepping; named in Holden\'s compilation but not currently a platform canonical.',
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
    slug: 'slapping', hashtag: '#slapping-set', displayName: 'Slapping', subtype: 'true-core',
    formula: 'TOE > OP IN [DEX] > (same side component)',
    movementExplanation:
      'Toe set, then an opposite-side inward dex resolving to a same-side terminal — the ' +
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
    slug: 'tapping', hashtag: '#tapping-set', displayName: 'Tapping', subtype: 'true-core',
    formula: 'TOE > OP OUT [DEX] (plant) > (same side component)',
    movementExplanation:
      'Toe set, then an opposite-side outward dex with a plant, resolving to a same-side ' +
      'terminal. Holden reads it as Atomic same-side; no current platform canonical.',
    equivalenceNotes: [
      { reading: 'Atomic same side', citation: 'Holden parenthetical' },
    ],
    derivedSystems: [],
    relatedSystems: [
      { slug: 'atomic', label: 'Atomic (op-side-terminal sibling)' },
    ],
    source: 'holden-only',
    sourceCitation: 'Holden compilation (2003); no current platform canonical.',
    auditStatus: 'holden-only',
    tier: 'literal-primitive',
  },

  // ── Composite / derived sets (11) ──────────────────────────────────
  {
    slug: 'miraging', hashtag: '#miraging-set', displayName: 'Miraging', subtype: 'composite-derived',
    formula: 'SET > OP IN [DEX] >',
    movementExplanation:
      'A derived entry topology readable as the mirage shape compressed into an uptime ' +
      'set: same dex direction and side, terminal toe-stall omitted because the set ' +
      'continues into the next move.',
    equivalenceNotes: [
      { reading: 'uptime mirage structure', citation: 'Structural reading' },
    ],
    derivedSystems: [
      { slug: 'flailing', label: 'Flailing (Symposium Reverse Miraging)' },
      { slug: 'surging',  label: 'Surging (Holden reading: spinning miraging)' },
    ],
    relatedSystems: [],
    source: 'platform-tracked',
    sourceCitation: 'Holden compilation (2003); aligned with platform notation.',
    auditStatus: 'aligned',
    tier: 'compositional-system',
  },
  {
    slug: 'terraging', hashtag: '#terraging-set', displayName: 'Terraging', subtype: 'composite-derived',
    formula: 'TOE > SAME IN [DEX] > SAME IN [DEX] >',
    movementExplanation:
      'Double Pixie. Two same-side inward dexes layered over a toe set — a literal ' +
      'doubling of the pixie pattern.',
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
    slug: 'barraging', hashtag: '#barraging-set', displayName: 'Barraging', subtype: 'composite-derived',
    formula: 'CLIP > OP IN [DEX] > SAME IN [DEX] >',
    movementExplanation:
      'High Stepping. Two-dex chain over a clipper set: stepping\'s opening dex followed ' +
      'by a same-side inward dex.',
    equivalenceNotes: [
      { reading: 'High Stepping', citation: 'Holden parenthetical' },
    ],
    derivedSystems: [
      { slug: 'furious', label: 'Furious (third dex extension)' },
    ],
    relatedSystems: [
      { slug: 'stepping', label: 'Stepping (single-dex base)' },
    ],
    source: 'platform-tracked',
    sourceCitation: 'Holden compilation (2003); aligned with platform tracking.',
    auditStatus: 'aligned',
    tier: 'compositional-system',
  },
  {
    slug: 'sailing', hashtag: '#sailing-set', displayName: 'Sailing', subtype: 'composite-derived',
    formula: 'TOE > SAME IN [DEX] > OP OUT [DEX] >',
    movementExplanation:
      'Pixie Illusion. Pixie\'s opening dex followed by an illusion-class second dex. ' +
      'Holden-cited; no current platform canonical.',
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
    slug: 'blurry', hashtag: '#blurry-set', displayName: 'Blurry', subtype: 'composite-derived',
    formula: 'CLIP > OP IN [DEX] > OP OUT [DEX] >',
    movementExplanation:
      'Stepping Paradox. Stepping\'s opening dex followed by a paradox-character second ' +
      'dex (the same-in → op-out hip flip).',
    equivalenceNotes: [
      { reading: 'Stepping Paradox', citation: 'Holden parenthetical' },
    ],
    derivedSystems: [],
    relatedSystems: [
      { slug: 'stepping', label: 'Stepping (single-dex base)' },
    ],
    source: 'platform-tracked',
    sourceCitation: 'Holden compilation (2003); aligned with pt8 platform ruling.',
    auditStatus: 'aligned',
    tier: 'compositional-system',
  },
  {
    slug: 'furious', hashtag: '#furious-set', displayName: 'Furious', subtype: 'composite-derived',
    formula: 'CLIP > OP IN [DEX] > SAME IN [DEX] > OP IN [DEX] >',
    movementExplanation:
      'Barraging Paradox Miraging. Barraging\'s two-dex open extended with a third dex ' +
      '— the longest named chain in Holden\'s compilation.',
    equivalenceNotes: [
      { reading: 'Barraging Paradox Miraging', citation: 'Holden parenthetical' },
    ],
    derivedSystems: [],
    relatedSystems: [
      { slug: 'barraging', label: 'Barraging (two-dex base)' },
    ],
    source: 'platform-tracked',
    sourceCitation: 'Holden compilation (2003); aligned with platform tracking.',
    auditStatus: 'aligned',
    tier: 'compositional-system',
  },
  {
    slug: 'frantic', hashtag: '#frantic-set', displayName: 'Frantic', subtype: 'composite-derived',
    formula: 'TOE > SAME IN [DEX] > OP IN [DEX] >',
    movementExplanation:
      'Pixie-quantum. Pixie\'s opening dex followed by quantum\'s direction. Holden-cited; ' +
      'no current platform canonical.',
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
    slug: 'fairy-atomic', hashtag: '#fairy-atomic-set', displayName: 'Fairy Atomic', subtype: 'composite-derived',
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
    slug: 'shooting', hashtag: '#shooting-set', displayName: 'Shooting', subtype: 'composite-derived',
    formula: 'CLIP > OP IN [DEX] > OP OUT [PDX][DEX] >',
    movementExplanation:
      'Stepping Paradox Illusion. Three-dex chain with an explicit paradox token in the ' +
      'second dex. Holden-cited; no current platform canonical.',
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
    slug: 'flailing', hashtag: '#flailing-set', displayName: 'Flailing', subtype: 'composite-derived',
    formula: 'SET > (no plant while) OP OUT [BOD] [DEX] >',
    movementExplanation:
      'Symposium Reverse Miraging. Miraging\'s opposite direction with an explicit no-plant ' +
      'symposium constraint. Holden-cited; no current platform canonical.',
    equivalenceNotes: [
      { reading: 'Symposium Reverse Miraging', citation: 'Holden parenthetical' },
      { reading: 'Symposium Illusioning', citation: 'Curator-adjudicated' },
    ],
    derivedSystems: [],
    relatedSystems: [
      { slug: 'miraging', label: 'Miraging (base direction)' },
    ],
    source: 'holden-only',
    sourceCitation: 'Holden compilation (2003); unusual notation with explicit no-plant constraint.',
    auditStatus: 'holden-only',
    tier: 'compositional-system',
  },
  {
    slug: 'nuclear', hashtag: '#nuclear-set', displayName: 'Nuclear', subtype: 'composite-derived',
    formula: 'CLIP > SAME OUT [DEX] >',
    movementExplanation:
      'Platform reading: paradox + illusion compounded — paradox\'s hip pivot combined with ' +
      'a downtime illusioning dex. Holden treats it as a basic single-dex set; the ' +
      'platform tracks it as a +2 compound.',
    equivalenceNotes: [
      { reading: 'paradox + illusion compound', citation: 'Platform reading (pt14)' },
      { reading: 'basic single-dex set',        citation: 'Holden reading' },
    ],
    derivedSystems: [
      { slug: 'twinspinning', label: 'Twinspinning (nuclear inspinning)' },
    ],
    relatedSystems: [
      { slug: 'atomic', label: 'Atomic (related uptime set; not a nuclear component under the paradox + illusion reading)' },
    ],
    source: 'platform-tracked',
    sourceCitation: 'Holden compilation (2003); audit row partial — Holden\'s "basic" reading vs platform\'s compound reading.',
    auditStatus: 'partial',
    tier: 'compositional-system',
  },

  // ── Rotational set systems (9) ─────────────────────────────────────
  {
    slug: 'surging', hashtag: '#surging-set', displayName: 'Surging', subtype: 'rotational',
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
      { slug: 'miraging', label: 'Miraging (Holden\'s reading anchor)' },
      { slug: 'stepping', label: 'Stepping (platform\'s reading anchor)' },
    ],
    source: 'platform-tracked',
    sourceCitation: 'Holden compilation (2003); audit row conflict — readings disagree on entry surface anchor.',
    auditStatus: 'conflict',
    tier: 'compositional-system',
  },
  {
    slug: 'sonic', hashtag: '#sonic-set', displayName: 'Sonic', subtype: 'rotational',
    formula: 'CLIP > (BACK) SPIN [BOD] > (BACK) SPIN [BOD] >',
    movementExplanation:
      'Double spinning over a clipper set — two back-spin tokens in sequence. Holden-cited; ' +
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
    slug: 'peeking', hashtag: '#peeking-set', displayName: 'Peeking', subtype: 'rotational',
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
    slug: 'leaning', hashtag: '#leaning-set', displayName: 'Leaning', subtype: 'rotational',
    formula: 'CLIP > OP IN [DEX] > (FRONT) SPIN [BOD] >',
    movementExplanation:
      'Stepping inspinning. Stepping\'s opening dex followed by a front-spin body token. ' +
      'Holden-cited; no current platform canonical.',
    equivalenceNotes: [
      { reading: 'stepping inspinning', citation: 'Holden parenthetical' },
    ],
    derivedSystems: [],
    relatedSystems: [
      { slug: 'stepping', label: 'Stepping (set base)' },
      { slug: 'go-go',    label: 'Go-Go (back-spin sibling)' },
    ],
    source: 'holden-only',
    sourceCitation: 'Holden compilation (2003); no current platform canonical.',
    auditStatus: 'holden-only',
    tier: 'compositional-system',
  },
  {
    slug: 'go-go', hashtag: '#go-go-set', displayName: 'Go-Go', subtype: 'rotational',
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
    slug: 'twinspinning', hashtag: '#twinspinning-set', displayName: 'Twinspinning', subtype: 'rotational',
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
    slug: 'neutron', hashtag: '#neutron-set', displayName: 'Neutron', subtype: 'rotational',
    formula: 'TOE > OP OUT [DEX] > (BACK) SPIN [BOD] > (op side component)',
    movementExplanation:
      'Atomic spin. Atomic\'s opening dex followed by a back-spin body token, terminating ' +
      'op-side. Holden-cited; no current platform canonical.',
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
    slug: 'fairy-spinning', hashtag: '#fairy-spinning-set', displayName: 'Fairy Spinning', subtype: 'rotational',
    formula: 'TOE > SAME OUT [DEX] > (BACK) SPIN [BOD] >',
    movementExplanation:
      'Fairy\'s opening dex followed by a back-spin body token. Holden-cited; no current ' +
      'platform canonical.',
    equivalenceNotes: [],
    derivedSystems: [],
    relatedSystems: [
      { slug: 'fairy', label: 'Fairy (set base)' },
      { slug: 'pixie-inspinning', label: 'Pixie Inspinning (directional sibling)' },
    ],
    source: 'holden-only',
    sourceCitation: 'Holden compilation (2003); no current platform canonical.',
    auditStatus: 'holden-only',
    tier: 'compositional-system',
  },
  {
    slug: 'pixie-inspinning', hashtag: '#pixie-inspinning-set', displayName: 'Pixie Inspinning', subtype: 'rotational',
    formula: 'TOE > SAME IN [DEX] > (FRONT) SPIN [BOD] >',
    movementExplanation:
      'Pixie\'s opening dex followed by a front-spin body token. Holden-cited; no current ' +
      'platform canonical.',
    equivalenceNotes: [],
    derivedSystems: [],
    relatedSystems: [
      { slug: 'pixie', label: 'Pixie (set base)' },
      { slug: 'fairy-spinning', label: 'Fairy Spinning (directional sibling)' },
    ],
    source: 'holden-only',
    sourceCitation: 'Holden compilation (2003); no current platform canonical.',
    auditStatus: 'holden-only',
    tier: 'compositional-system',
  },

  // ── Whirl / swirl-derived systems (8) ──────────────────────────────
  {
    slug: 'swirling', hashtag: '#swirling-set', displayName: 'Swirling', subtype: 'whirl-swirl',
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
    slug: 'whirling', hashtag: '#whirling-set', displayName: 'Whirling', subtype: 'whirl-swirl',
    formula: 'CLIP > OP IN [DEX] > (same side component)',
    movementExplanation:
      'Whirl-family base — clipper-anchored opposite-side inward dex with a same-side ' +
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
    slug: 'blazing', hashtag: '#blazing-set', displayName: 'Blazing', subtype: 'whirl-swirl',
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
    slug: 'scattered', hashtag: '#scattered-set', displayName: 'Scattered', subtype: 'whirl-swirl',
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
    slug: 'shattered', hashtag: '#shattered-set', displayName: 'Shattered', subtype: 'whirl-swirl',
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
    slug: 'pogo', hashtag: '#pogo-set', displayName: 'Pogo', subtype: 'whirl-swirl',
    formula: 'CLIP > (no plant while) OP IN [DEX] >',
    movementExplanation:
      'Symposium Whirling. Whirling\'s shape with an explicit no-plant constraint — the ' +
      'support leg does not contact the ground during the dex.',
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
    slug: 'blistering', hashtag: '#blistering-set', displayName: 'Blistering', subtype: 'whirl-swirl',
    formula: 'CLIP > OP IN [DEX] > (BACK) SPIN [BOD] >',
    movementExplanation:
      'Whirling Gyro. Whirling\'s opening dex followed by a back-spin body token (the ' +
      'gyro lineage anchor).',
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
    slug: 'broken', hashtag: '#broken-set', displayName: 'Broken', subtype: 'whirl-swirl',
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
    slug: 'finchy', hashtag: '#finchy-set', displayName: 'Finchy', subtype: 'uns',
    formula: 'PINCH > SAME OUT [DEX] >',
    movementExplanation:
      'Pinching Fairy. Fairy\'s dex direction over a pinch entry surface instead of a toe ' +
      'set. Holden-cited; no current platform canonical.',
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
    slug: 'pixie-pinching', hashtag: '#pixie-pinching-set', displayName: 'Pixie Pinching', subtype: 'uns',
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
    slug: 'twisted', hashtag: '#twisted-set', displayName: 'Twisted', subtype: 'uns',
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
    slug: 'snapping', hashtag: '#snapping-set', displayName: 'Snapping', subtype: 'uns',
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
    slug: 'arctic', hashtag: '#arctic-set', displayName: 'Arctic', subtype: 'uns',
    formula: 'FRIGIDOSIS > SAME IN [DEX] >',
    movementExplanation:
      'Frigidosis Pixie. Pixie\'s dex direction over a frigidosis entry surface. ' +
      'Holden-cited; no current platform canonical.',
    equivalenceNotes: [
      { reading: 'frigidosis Pixie', citation: 'Holden parenthetical' },
    ],
    derivedSystems: [],
    relatedSystems: [
      { slug: 'pixie',          label: 'Pixie (toe-entry sibling)' },
      { slug: 'pixie-pinching', label: 'Pixie Pinching (pinch-entry sibling)' },
    ],
    source: 'holden-only',
    sourceCitation: 'Holden compilation (2003); no current platform canonical.',
    auditStatus: 'holden-only',
    tier: 'compositional-system',
  },

  // ── Rooted / antisymposium systems (2) ─────────────────────────────
  {
    slug: 'rooting', hashtag: '#rooting-set', displayName: 'Rooting / Rooted', subtype: 'rooted-antisymposium',
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
    slug: 'zoid', hashtag: '#zoid-set', displayName: 'Zoid', subtype: 'rooted-antisymposium',
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
    slug: 'railing', hashtag: '#railing-set', displayName: 'Railing', subtype: 'rooted-antisymposium',
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
    slug: 'floating', hashtag: '#floating-set', displayName: 'Floating', subtype: 'composite-derived',
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
    slug: 'warping', hashtag: '#warping-set', displayName: 'Warping', subtype: 'composite-derived',
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

export function canonicalSetsBySubtype(subtype: SetSubtype): readonly CanonicalSet[] {
  return CANONICAL_SETS.filter(s => s.subtype === subtype);
}
