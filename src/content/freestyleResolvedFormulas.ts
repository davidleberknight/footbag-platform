/**
 * freestyleResolvedFormulas.ts
 * =============================
 *
 * Curator-published compact formulas for mechanically-derivable
 * compound tricks. Rows accumulate here as the curator burn-down
 * proceeds.
 *
 * Patterns covered:
 *   - Pure +1-stack: operator(+1) + base(N) where both operator and
 *     base are Red-settled.
 *   - Pattern expansion: pt-ruled compounds, positional modifiers
 *     (reverse = +0), multi-operator chains (paradox-symposium-whirl),
 *     and folk-name resolutions whose decomposition is curator-locked.
 *   - Targeted folk-name resolutions: smear (PIX + MIRAGE), ripwalk
 *     (STEP + BUTTERFLY) per the operator-board lede, plus rev-up
 *     (most-defensible positional reading with curator-uncertainty note).
 *
 * Every row continues to satisfy the V1+V2 publication contract:
 *
 *   - Operator is in the settled +1 inventory (paradox, spinning,
 *     ducking, symposium, stepping, atomic, whirling)
 *   - Base is a Red-settled core atom or settled compound (mirage 2,
 *     whirl 3, butterfly 3, osis 3, swirl 3, torque 4, blender 4)
 *   - DB ADD value matches the arithmetic (N+1)
 *   - Zero unresolved-doctrine dependency (no barraging, no blurry transitivity,
 *     no fairy weight, no atomic-family X-dex scope, no compression
 *     intent, no hidden-vs-flat preservation)
 *
 * Per V1 §1 (symbolic representation) + V1 §5 (honest incompleteness)
 * + V1 §6 (no fabricated structure): every row here is a curator-
 * verifiable mechanical composition. Nothing inferred; nothing
 * doctrinal-edge.
 *
 * Surfaces as a compact reference table on /freestyle/add-analysis
 * between §2 (worked examples) and §3 (discrepancy cases). Not a
 * worked-example expansion; the table is reference-density.
 *
 * Reversibility: TypeScript content module. To extend: add more rows;
 * to reclassify a row out (e.g., if a later doctrine ruling complicates
 * it): remove the row.
 *
 * Rows here are classified `resolved` (not `curator_pending`) in the
 * formula-gap classification.
 */

// ─────────────────────────────────────────────────────────────────────────
// DUAL-CONVENTION SEMANTIC RULE (forever-rule):
//
// Two ADD-counting conventions coexist in this content module:
//
//   1. CANONICAL BRACKET CONVENTION (footbag.org-style; uppercase tokens,
//      [BRACKETS]). Every [TOKEN] contributes +1 ADD. Used by the
//      curator-resolved compounds (barfly, paradon, blur, barraging-osis,
//      high-plains-drifter, squeeze, etc.) and by the published modifier-
//      stack rows. Most entries in this file use this convention.
//
//   2. FM PARENS CONVENTION (FootbagMoves-style; mixed case, (parens)).
//      Only (DEX) tokens contribute +1 ADD; all other parenthesized flags
//      ((XBD), (BOD), (PDX), (DEL), (XDEX), (UNS)) are descriptive
//      qualifiers. Used by FM-sourced folk-name promotions (bladerunner,
//      bling-blang, cold-fusion, flurricane, golden-shower, goliath,
//      gybas, motion-sickness, pandemonium).
//
// FOREVER-RULE: The JOB-notation punctuation style determines its
// counting convention. (parens) → FM dex-count. [brackets] → canonical
// full-token-count. The conventions describe the same physical movement
// under different counting models; both are recognized scoring layers.
// Rewriting an FM-parens JOB into canonical brackets (or vice versa) is
// doctrine work that may change the implied ADD; it is not transcription.
//
// ─────────────────────────────────────────────────────────────────────────

export interface ResolvedFormula {
  /** IFPA canonical slug. Links to /freestyle/tricks/{slug}. */
  slug:        string;
  /** Display name (canonical). */
  name:        string;
  /** Operator token (paradox / spinning / etc.). */
  operator:    string;
  /** Base trick name (mirage / whirl / torque / etc.). */
  base:        string;
  /** Base ADD (numeric). */
  baseAdd:     number;
  /** Total ADD (operator +1 contribution + base). */
  totalAdd:    number;
  /** Curator-published derivation string. */
  derivation:  string;
  /** Settlement provenance (pt-ruling / Red-date / canonical-inventory). */
  provenance:  string;
  /** Curator-authored operational notation (JOB form), when published.
   *  Overrides freestyle_tricks.operational_notation at shape time for
   *  trick-detail + dictionary browse cards. Use only for entries whose
   *  operational form is curator-settled. Leave null/undefined when no
   *  JOB notation has been authored; the DB column stays authoritative. */
  operationalNotation?: string | null;
  /** Fully spelled-out operational chain for entries whose
   *  operationalNotation uses a named-set shorthand (e.g. '(railing set) >>').
   *  Surfaces as an extra EXPANDED row on the first-class detail notation
   *  summary so the detail page carries both the compact shorthand and the
   *  full form; compact browse cards keep the shorthand. Leave undefined when
   *  operationalNotation is already fully spelled out. */
  expandedNotation?: string | null;
}

export const RESOLVED_FORMULAS_FRAMING_PROSE =
  "Mechanically-derivable compound formulas: pure +1 operator stacks, " +
  "compounds with a settled scoring rule, positional modifiers (reverse=+0), " +
  "folk-name resolutions with a confirmed decomposition, and the first multi-" +
  "operator chain. Each row's derivation is verifiable from the " +
  "settled operator + base inventory.";

// Resolved formulas accumulator. All rows were classified
// `curator_pending` in the formula-gap classification and the
// composition is mechanically derivable.
export const RESOLVED_FORMULAS_SPRINT_1: readonly ResolvedFormula[] = [
  {
    slug:        'quantum_guay',
    name:        'quantum guay',
    operator:    'quantum',
    base:        'guay',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'quantum(+1) + guay(2) = 3 ADD',
    operationalNotation: 'TOE > OP IN [DEX] > OP IN [DEX] > SAME INSIDE [DEL]',  // quantum-drifter chassis on guay; guay non-rotational so no X-Dex.
    provenance:  'quantum = +1 set modifier; guay = 2 ADD base (pickup into inside-stall)',
  },
  {
    slug:        'nuclear_guay',
    name:        'nuclear guay',
    operator:    'nuclear',
    base:        'guay',
    baseAdd:     2,
    totalAdd:    4,
    derivation:  'nuclear(+2) + guay(2) = 4 ADD',
    operationalNotation: 'CLIP > SAME OUT [PDX] [DEX] > OP IN [DEX] > SAME INSIDE [DEL]',  // nuclear-illusion chassis on guay.
    provenance:  'nuclear = +2 set modifier (paradox + downtime illusion); guay = 2 ADD base',
  },
  {
    slug:        'nuclear_drifter',
    name:        'nuclear drifter',
    operator:    'nuclear',
    base:        'drifter',
    baseAdd:     3,
    totalAdd:    5,
    derivation:  'nuclear(+2) + drifter(3) = 5 ADD',
    operationalNotation: 'CLIP > SAME OUT [PDX] [DEX] > OP IN [DEX] > SAME CLIP [XBD] [DEL]',  // nuclear chassis on drifter.
    provenance:  'nuclear = +2 set modifier; drifter = 3 ADD base',
  },
  {
    slug:        'nuclear_double_leg_over',
    name:        'nuclear double leg over',
    operator:    'nuclear',
    base:        'double-leg-over',
    baseAdd:     3,
    totalAdd:    5,
    derivation:  'nuclear(+2) + double-leg-over(3) = 5 ADD',
    operationalNotation: 'CLIP > SAME OUT [PDX] [DEX] > OP IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]',  // nuclear chassis on double-leg-over.
    provenance:  'nuclear = +2 set modifier; double-leg-over = 3 ADD base',
  },
  {
    slug:        'nuclear_dyno',
    name:        'nuclear dyno',
    operator:    'nuclear',
    base:        'dyno',
    baseAdd:     4,
    totalAdd:    6,
    derivation:  'nuclear(+2) + dyno(4) = 6 ADD',
    operationalNotation: 'CLIP > SAME OUT [PDX] [DEX] > OP OUT [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]',  // nuclear chassis on dyno.
    provenance:  'nuclear = +2 set modifier; dyno = 4 ADD base',
  },
  {
    slug:        'nuclear_torque',
    name:        'nuclear torque',
    operator:    'nuclear',
    base:        'torque',
    baseAdd:     4,
    totalAdd:    6,
    derivation:  'nuclear(+2) + torque(4) = 6 ADD',
    operationalNotation: 'CLIP > SAME OUT [PDX] [DEX] > OP IN [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]',  // nuclear chassis on torque.
    provenance:  'nuclear = +2 set modifier; torque = 4 ADD base (osis branch)',
  },
  {
    slug:        'paradox_mirage',
    name:        'paradox mirage',
    operator:    'paradox',
    base:        'mirage',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'paradox(+1) + mirage(2) = 3 ADD',
    provenance:  'paradox = +1 dex relationship (canonical inventory); mirage = 2 ADD core atom',
  },
  {
    slug:        'symposium_mirage',
    name:        'symposium mirage',
    operator:    'symposium',
    base:        'mirage',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'symposium(+1) + mirage(2) = 3 ADD',
    operationalNotation: 'SET > (no plant while) OP IN [BOD] [DEX] > OP TOE [DEL]',  // Sibling-derivation; symposium-whirl precedent + mirage base; not Red-confirmed.
    provenance:  'symposium = +1 no-plant body modifier; mirage = 2 ADD core atom',
  },
  {
    slug:        'atomic_butterfly',
    name:        'atomic butterfly',
    operator:    'atomic',
    base:        'butterfly',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'atomic(+1) + butterfly(3) = 4 ADD',
    provenance:  'atomic = +1; butterfly = 3 ADD core atom',
  },
  {
    slug:        'ducking_butterfly',
    name:        'ducking butterfly',
    operator:    'ducking',
    base:        'butterfly',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'ducking(+1) + butterfly(3) = 4 ADD',
    provenance:  'ducking = +1 midtime body modifier; butterfly = 3 ADD core atom',
  },
  {
    slug:        'ducking_osis',
    name:        'ducking osis',
    operator:    'ducking',
    base:        'osis',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'ducking(+1) + osis(3) = 4 ADD',
    provenance:  'ducking = +1 midtime body modifier; osis = 3 ADD core atom',
  },
  {
    slug:        'ducking_whirl',
    name:        'ducking whirl',
    operator:    'ducking',
    base:        'whirl',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'ducking(+1) + whirl(3) = 4 ADD',
    operationalNotation: 'TOE > DUCK [BOD] > OP IN [DEX] > OP CLIP [XBD] [DEL]',  // Sibling-derivation; ducking-mirage precedent + whirl base; not Red-confirmed.
    provenance:  'ducking = +1 midtime body modifier; whirl = 3 ADD core atom',
  },
  {
    slug:        'spinning_butterfly',
    name:        'spinning butterfly',
    operator:    'spinning',
    base:        'butterfly',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'spinning(+1) + butterfly(3) = 4 ADD',
    provenance:  'spinning = +1 midtime body modifier; butterfly = 3 ADD core atom',
  },
  {
    slug:        'spinning_osis',
    name:        'spinning osis',
    operator:    'spinning',
    base:        'osis',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'spinning(+1) + osis(3) = 4 ADD',
    provenance:  'spinning = +1 midtime body modifier; osis = 3 ADD core atom',
  },
  {
    slug:        'stepping_osis',
    name:        'stepping osis',
    operator:    'stepping',
    base:        'osis',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'stepping(+1) + osis(3) = 4 ADD',
    provenance:  'stepping = +1 set modifier (foot relocation); osis = 3 ADD core atom',
  },
  {
    slug:        'stepping_whirl',
    name:        'stepping whirl',
    operator:    'stepping',
    base:        'whirl',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'stepping(+1) + whirl(3) = 4 ADD',
    operationalNotation: 'CLIP > OP IN [DEX] >> SAME IN [DEX] > OP CLIP [XBD] [DEL]',  // Sibling-derivation; tombstone (stepping drifter) precedent + whirl base; not Red-confirmed.
    provenance:  'stepping = +1 set modifier; whirl = 3 ADD core atom',
  },
  {
    slug:        'symposium_whirl',
    name:        'symposium whirl',
    operator:    'symposium',
    base:        'whirl',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'symposium(+1) + whirl(3) = 4 ADD',
    provenance:  'symposium = +1 no-plant body modifier; whirl = 3 ADD core atom',
  },
  {
    slug:        'whirling_swirl',
    name:        'whirling swirl',
    operator:    'whirling',
    base:        'swirl',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'whirling(+1) + swirl(3) = 4 ADD',
    provenance:  'whirling = +1 midtime body modifier (Movement System inheritance); swirl = 3 ADD core atom',
  },
  {
    slug:        'paradox_blender',
    name:        'paradox blender',
    operator:    'paradox',
    base:        'blender',
    baseAdd:     4,
    totalAdd:    5,
    derivation:  'paradox(+1) + blender(4) = 5 ADD',
    operationalNotation: 'CLIP > SAME IN [PDX] [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]',  // Sibling-derivation; paradox-whirl direction-flip precedent + blender base; not Red-confirmed.
    provenance:  'paradox = +1 dex relationship; blender = 4 ADD compound (whirling osis)',
  },
  {
    slug:        'paradox_torque',
    name:        'paradox torque',
    operator:    'paradox',
    base:        'torque',
    baseAdd:     4,
    totalAdd:    5,
    derivation:  'paradox(+1) + torque(4) = 5 ADD',
    operationalNotation: 'CLIP > SAME IN [PDX] [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]',  // Sibling-derivation; paradox-whirl direction-flip precedent + torque (miraging osis) base; not Red-confirmed.
    provenance:  'paradox = +1 dex relationship; torque = 4 ADD compound (miraging osis, pt11)',
  },
  {
    slug:        'spinning_torque',
    name:        'spinning torque',
    operator:    'spinning',
    base:        'torque',
    baseAdd:     4,
    totalAdd:    5,
    derivation:  'spinning(+1) + torque(4) = 5 ADD',
    operationalNotation: 'CLIP > (back) SPIN [BOD] > OP IN [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]',  // Sibling-derivation; spinning-osis double-spin pattern + torque (miraging osis) base; not Red-confirmed.
    provenance:  'spinning = +1 midtime body modifier; torque = 4 ADD compound (miraging osis, pt11)',
  },

  // ─── Pattern expansion ───────────────────────────────────────────────
  // Beyond the pure +1-stacks: pt-ruled compounds, positional modifiers
  // (reverse=+0), the first multi-operator chain, and folk-name
  // resolutions whose decomposition is curator-locked.

  {
    slug:        'eggbeater',
    name:        'eggbeater',
    operator:    'atomic',
    base:        'legover',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'atomic(+1) + legover(2) = 3 ADD',
    provenance:  'pt4 settled: eggbeater = atomic legover. atomic = +1; legover = 2 ADD core atom',
  },
  {
    slug:        'ducking_clipper',
    name:        'ducking clipper',
    operator:    'ducking',
    base:        'clipper-stall',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'ducking(+1) + clipper-stall(2) = 3 ADD',
    provenance:  'ducking = +1 midtime body modifier; clipper-stall = 2 ADD core atom (xbody + stall)',
  },
  {
    slug:        'spinning_clipper',
    name:        'spinning clipper',
    operator:    'spinning',
    base:        'clipper-stall',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'spinning(+1) + clipper-stall(2) = 3 ADD',
    provenance:  'spinning = +1 midtime body modifier; clipper-stall = 2 ADD core atom',
  },
  {
    slug:        'rev_whirl',
    name:        'rev whirl',
    operator:    'reverse',
    base:        'whirl',
    baseAdd:     3,
    totalAdd:    3,
    derivation:  'xbody(1) + dex(1) + stall(1) = 3 ADD',
    operationalNotation: 'CLIP > OP OUT [DEX] > OP CLIP [XBD] [DEL]',
    provenance:  'Structural ADD decomposition: rev-whirl is structurally a whirl atom (1 dex + 1 cross-body + 1 stall = 3); the reverse(+0) + whirl(3) reading is the ALT interpretation (reverse-pair transform). ADD row carries the structural form; ALT row carries the reverse-pair reading.',
  },
  {
    slug:        'orbit',
    name:        'orbit',
    operator:    'reverse',
    base:        'around-the-world',
    baseAdd:     2,
    totalAdd:    2,
    derivation:  'reverse(+0) + around-the-world(2) = 2 ADD',
    provenance:  'reverse = positional direction marker (+0 per Red); ATW = 2 ADD core atom (full-orbit dex + stall). orbit is the canonical slug; reverse-around-the-world and reverse-atw are aliases. Slug aligned to canonical `orbit` alongside DB row activation (red_additions + loader 19).',
  },
  {
    slug:        'paradox_symposium_whirl',
    name:        'paradox symposium whirl',
    operator:    'paradox + symposium',
    base:        'whirl',
    baseAdd:     3,
    totalAdd:    5,
    derivation:  'paradox(+1) + symposium(+1) + whirl(3) = 5 ADD',
    provenance:  'paradox = +1 dex relationship; symposium = +1 no-plant body modifier (the "PS X" shorthand per glossary §6); whirl = 3 ADD core atom. First multi-operator chain in the resolved set',
  },
  {
    slug:        'dimwalk',
    name:        'dimwalk',
    operator:    'pixie',
    base:        'butterfly',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'pixie(+1) + butterfly(3) = 4 ADD',
    provenance:  'Folk-name resolution per operator-board lede: PIX + BUTTERFLY → DIMWALK. pixie = +1 compressed set modifier (per pt10); butterfly = 3 ADD core atom',
  },

  // ─── Three additional folk-name resolutions ──────────────────────────
  // The operator-board lede explicitly maps two of these (PIX + MIRAGE →
  // SMEAR, STEP + BUTTERFLY → RIPWALK). The third (rev-up) publishes the
  // most-defensible positional reading; see the provenance note for the
  // curator-uncertainty caveat.

  {
    slug:        'smear',
    name:        'smear',
    operator:    'pixie',
    base:        'mirage',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'pixie(+1) + mirage(2) = 3 ADD',
    provenance:  'Folk-name resolution per operator-board lede: PIX + MIRAGE → SMEAR. pixie = +1 compressed set modifier (per pt10); mirage = 2 ADD core atom. Confirms the existing freestyle_tricks.notation field ("PIXIE MIRAGE") with explicit ADD arithmetic',
  },
  {
    slug:        'ripwalk',
    name:        'ripwalk',
    operator:    'stepping',
    base:        'butterfly',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'stepping(+1) + butterfly(3) = 4 ADD',
    operationalNotation: 'CLIP > SAME IN [DEX] >> OP OUT [DEX] > OP CLIP [XBD] [DEL]',  // Sibling-derivation; dimwalk (pixie butterfly) dex-direction model + tombstone (stepping drifter) stepping pattern; not Red-confirmed.
    provenance:  'Folk-name resolution per operator-board lede + glossary §3 + §8: STEP + BUTTERFLY → RIPWALK. stepping = +1 set modifier (foot relocation); butterfly = 3 ADD core atom.',
  },
  // 'rev-up' has no resolved-formula entry: it is structurally distinct
  // from rev-whirl (NOT the same trick despite shared base=whirl +
  // ADD=3), so rev-whirl's reverse-pair derivation does not apply. The
  // rev-up canonical row is is_active=0 (red_corrections) until a
  // curator-authored structural reading is published.

  // ─── Atomic-specific x-dex contribution ──────────────────────────────
  // An atomic-modifier formula where the +1 atomic contribution is
  // augmented by a doctrine-locked atomic-specific x-dex (paradox-like)
  // contribution from the toe-start position. Red: "Atom
  // Smasher carries x-dex like paradox from a toe." The extra +1 is part
  // of atomic's structural identity in this compound, not a separate
  // operator. External sources (FootbagMoves) list 3 ADD by collapsing
  // atomic into the base; IFPA treats it as 4 because atomic contributes
  // its own +1 AND brings the x-dex/paradox-like contribution from toe.

  {
    slug:        'atom_smasher',
    name:        'atom smasher',
    operator:    'atomic + x-dex',
    base:        'mirage',
    baseAdd:     2,
    totalAdd:    4,
    derivation:  'atomic(+1) + mirage(2) + x-dex/paradox-like contribution(+1) = 4 ADD',
    operationalNotation: 'TOE > SAME OUT [DEX] >> OP IN [DEX] > OP TOE [DEL]',  // Sibling-derivation; scrambled-eggbeater (atomic-pickup X-Dex) pattern + mirage base; not Red-confirmed (Red ruled the ADD-math but not the operational notation).
    provenance:  'Red ruling: Atom Smasher carries x-dex/paradox-like extra difficulty from toe. FootbagMoves lists 3 ADD; IFPA treats it as 4. The extra +1 is an atomic-specific x-dex/paradox-like contribution, not a separate ducking operator. Chain reading remains "atomic mirage" per freestyleSymbolicEquivalences.ts.',
  },

  // ─── Movement-element components ─────────────────────────────────────
  // Adds two new resolved-formula entries for the swing-element doctrine
  // (pendulum) and the flying-modifier doctrine (flying-clipper). Both
  // extend the +1 modifier-stack pattern with movement-element components
  // distinct from the named operator modifiers (paradox,
  // spinning, ducking, symposium, stepping, atomic, whirling, pixie).
  //
  // Swing-element pair: pendulum = swing(1) + contact(1) = 2 ADD, finishing
  // on an arbitrary terminal contact; rake = swing(1) + toe-stall(1) with a
  // fixed toe terminal. Only
  // pendulum is published here; rake has no active freestyle_tricks row
  // yet. Canonicalization of rake (red_additions_2026_04_20.csv + DB
  // reload) is a separate curator step before its resolved-formula entry
  // can land. The chain reading for pendulum stays implicit; the
  // freestyle_tricks.notation field carries the structural form.
  //
  // Flying-modifier: the `flying` body component is a body-modifier
  // bucket (BOD) contributing +1 ADD to the base trick. ADD accounting
  // renders as BOD(1); flying-clipper = BOD(1) + clipper(1) = 2 ADD,
  // matching the DB row's adds=2. flying-inside and flying-outside are
  // NOT included here; they are 1 ADD body primitives where the flying
  // motion IS the trick (irreducible; no compound +1 stack), parallel
  // to spin / double-spin / hop-over.
  //
  // Body-token casing is semantic, not cosmetic: uppercase BOD(n) marks
  // an operator mapping into the body-modifier ADD bucket (as on
  // flying-clipper); lowercase bod(n) is a primitive body component
  // summed alongside dex/del inside an irreducible atom's decomposition
  // (hop-over, butterfly-kick, eclipse). The two roles are not unified.

  {
    slug:        'pendulum',
    name:        'pendulum',
    operator:    'swing',
    base:        'toe-stall',
    baseAdd:     1,
    totalAdd:    2,
    derivation:  'swing(1) + contact(1) = 2 ADD',
    provenance:  'Curator-locked swing-element doctrine: pendulum is a toe-swing that completes on an arbitrary terminal contact. It is the only trick with an arbitrary final surface, so the terminal renders as an open (contact) rather than a fixed stall, for ADD = swing(1) + contact(1) = 2. The "swing" component is a structural movement element (not a named operator modifier) contributing +1 ADD. Companion trick rake reads the swing-element arithmetic with a fixed toe-stall terminal (swing > toe); rake awaits canonical row before its resolved-formula entry lands.',
  },
  {
    slug:        'flying_clipper',
    name:        'flying clipper',
    operator:    'flying',
    base:        'clipper',
    baseAdd:     1,
    totalAdd:    2,
    derivation:  'BOD(1) + clipper(1) = 2 ADD',
    provenance:  'Curator-locked flying-modifier doctrine: flying-X = flying body modifier (BOD bucket; +1 ADD) + base trick. ADD accounting renders as BOD(1) per the body-modifier bucket convention. Here: flying + clipper kick (1 ADD body primitive, not clipper-stall surface). Distinct from flying-inside and flying-outside, which are themselves 1 ADD body primitives (the flying motion as the trick, not a +1 stack on a separate base).',
  },

  // ─── Rake (direction-variant companion to pendulum) ──────────────────
  // Closes the swing-element pair. With rake active in freestyle_tricks
  // (red_additions row + loader 19 reload), the second
  // half of the direction-variant pair lands here. Arithmetic is
  // identical to pendulum (toe + swing = 2 ADD); element order is
  // reversed (swing > toe). FootbagMoves lists rake at 3 ADD; IFPA treats
  // it as 2; Red review of the discrepancy pending.

  {
    slug:        'rake',
    name:        'rake',
    operator:    'swing',
    base:        'toe-stall',
    baseAdd:     1,
    totalAdd:    2,
    derivation:  'swing(1) + toe(1) = 2 ADD',
    operationalNotation: 'SET > SWING TOE [DEL]',
    provenance:  'Direction-variant companion of pendulum. Same swing-element doctrine; swing > toe order (vs pendulum toe > swing). FootbagMoves lists rake at 3 ADD; IFPA treats it as 2 per curator-locked swing-element doctrine (Red review pending).',
  },

  // ─── Fury + fog (Red pt6-locked folk compounds) ──────────────────────
  // Two folk-named compounds from the workbook missing-IFPA queue. Both
  // have Red pt6 rulings published in red_additions
  // and modifier_links registered on the DB rows.
  //
  // fury: Red pt6 overrode pt4 (paradox+barraging+mirage)
  // with the cleaner furious-paradox-mirage reading. furious is +2
  // universally (a two-dex set). Historically grouped with barraging;
  // current doctrine holds furious and barraging distinct by timing.
  //
  // fog: Red pt6 MODEL_CHANGE: Fog does NOT contain an
  // eggbeater (Bedwetter does). Decomposition uses dlo (double-leg-over)
  // as base with stepping+paradox operator stack.

  {
    slug:        'fury',
    name:        'fury',
    operator:    'furious + paradox',
    base:        'mirage',
    baseAdd:     2,
    totalAdd:    5,
    derivation:  'furious(+2) + paradox(+1) + mirage(2) = 5 ADD',
    operationalNotation: 'CLIP > SAME IN [DEX] >> OP IN [PDX] [DEX] > OP TOE [DEL]',  // Sibling-derivation; furious multi-dex pattern (nemesis precedent) + paradox-mirage stack; not Red-confirmed (Red pt6 ruled the chain reading but not the operational notation).
    provenance:  'Red pt6: Fury = Furious Paradox Mirage (replaces pt4 paradox+barraging+mirage decomposition; ADD 5 unchanged). furious modifier is +2 universally (a two-dex uptime set). Chain reading published in freestyleSymbolicEquivalences.ts.',
  },
  {
    slug:        'fog',
    name:        'fog',
    operator:    'stepping + paradox',
    base:        'double-leg-over',
    baseAdd:     3,
    totalAdd:    5,
    derivation:  'stepping(+1) + paradox(+1) + dlo(3) = 5 ADD',
    provenance:  'Red pt6 MODEL_CHANGE: Fog does NOT contain an eggbeater (Bedwetter does). Decomposition is stepping+paradox+dlo with double-leg-over as the 3-ADD base. Folk aliases blurry dlo and blurry dim walk preserved on DB row.',
  },

  // ── Low-risk compound promotions. Each derivation
  //    is mechanically verifiable from the modifier × base ADD table.
  //    No composite-modifier expansion, no doctrine block, no folk-name
  //    ambiguity. Promoted into FIRST_CLASS_TIER_2 (JOB chain pending;
  //    ADD curator-locked).
  {
    slug:        'atomic_torque',
    name:        'atomic torque',
    operator:    'atomic',
    base:        'torque',
    baseAdd:     4,
    totalAdd:    5,
    operationalNotation: 'TOE > OP OUT [DEX] > OP IN [DEX] > (back or front) SPIN [BOD] > OP CLIP [XBD] [DEL]',  // atomic chassis on torque; atomic adds one outward uptime dex (+1); no X-Dex.
    derivation:  'atomic(+1) + torque(4) = 5 ADD',
    provenance:  'atomic = +1 (single outward uptime dex); the +2-rotational reading is retired. torque = 4 ADD compound base; no X-Dex (cf. atomic-drifter, the published atomic-miraging sibling at base+1).',
  },
  {
    slug:        'ducking_mirage',
    name:        'ducking mirage',
    operator:    'ducking',
    base:        'mirage',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'ducking(+1) + mirage(2) = 3 ADD',
    provenance:  'ducking = +1 midtime body modifier; mirage = 2 ADD core atom (rotational). Audit derivation.',
  },
  {
    slug:        'paradox_drifter',
    name:        'paradox drifter',
    operator:    'paradox',
    base:        'drifter',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'paradox(+1) + drifter(3) = 4 ADD',
    operationalNotation: 'CLIP > SAME IN [PDX] [DEX] > SAME CLIP [XBD] [DEL]',  // Sibling-derivation; paradox-whirl direction-flip precedent + drifter base; not Red-confirmed.
    provenance:  'paradox = +1 dex relationship; drifter = 3 ADD rotational compound base. Audit derivation.',
  },
  {
    slug:        'spinning_pickup',
    name:        'spinning pickup',
    operator:    'spinning',
    base:        'pickup',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'spinning(+1) + pickup(2) = 3 ADD',
    provenance:  'spinning = +1 midtime body modifier; pickup = 2 ADD core atom (non-rotational). Audit derivation.',
  },
  {
    slug:        'tapping_whirl',
    name:        'tapping whirl',
    operator:    'tapping',
    base:        'whirl',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'tapping(+1) + whirl(3) = 4 ADD',
    provenance:  'tapping = +1 body modifier; whirl = 3 ADD core atom (rotational). Audit derivation.',
  },

  // ── Audit-derived promotions. Each entry is a
  //    parser-validated modifier × base derivation (the audit's
  //    "real-compound" path). Closes most of the remaining promotion-
  //    candidate pool from the read-only audit. No composite-modifier
  //    expansion here; the blurry-* / haze / food-processor /
  //    mantis / nova compounds remain non-first-class until their
  //    composite-derivation entries are curator-authored.
  {
    slug:        'cross_body_sole_stall',
    name:        'cross-body sole stall',
    operator:    'xbody',
    base:        'sole-stall',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'xbody(+1) + sole-stall(2) = 3 ADD',
    provenance:  'cross-body normalizes to xbody bucket per curator; sole-stall = 2 ADD unusual-surface stall.',
  },
  {
    slug:        'legeater',
    name:        'legeater',
    operator:    'quantum',
    base:        'pickup',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'quantum(+1) + pickup(2) = 3 ADD',
    provenance:  'quantum = +1 set modifier; pickup = 2 ADD core atom.',
  },
  {
    slug:        'paste',
    name:        'paste',
    operator:    'pixie',
    base:        'pickup',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'pixie(+1) + pickup(2) = 3 ADD',
    provenance:  'pixie = +1 set modifier; pickup = 2 ADD core atom. Folk-name resolution.',
  },
  {
    slug:        'reverse_drifter',
    name:        'reverse-drifter',
    operator:    'reverse (directional)',
    base:        'drifter',
    baseAdd:     3,
    totalAdd:    3,
    derivation:  'reverse(+0) + drifter(3) = 3 ADD',
    provenance:  'rev/reverse is directional notation (zero-ADD); drifter = 3 ADD core compound. Curator: rev/reverse is alternate directional notation, not an ADD operator.',
  },
  {
    slug:        'scrambled_eggbeater',
    name:        'scrambled eggbeater',
    operator:    'atomic',
    base:        'pickup',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'atomic(+1) + pickup(2) = 3 ADD',
    provenance:  'atomic = +1 set modifier; pickup = 2 ADD core atom.',
  },
  {
    slug:        'tap',
    name:        'tap',
    operator:    'tapping',
    base:        'mirage',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'tapping(+1) + mirage(2) = 3 ADD',
    provenance:  'tapping = +1 body modifier; mirage = 2 ADD core atom. Folk-name resolution (≡ tapping mirage).',
  },
  {
    slug:        'blur',
    name:        'blur',
    operator:    'stepping + paradox',
    base:        'mirage',
    baseAdd:     2,
    totalAdd:    4,
    derivation:  'stepping(+1) + paradox(+1) + mirage(2) = 4 ADD',
    provenance:  'Folk-name resolution (≡ stepping paradox mirage). stepping = +1 set modifier; paradox = +1 dex relationship; mirage = 2 ADD core atom.',
  },
  {
    slug:        'hatchet',
    name:        'hatchet',
    operator:    'diving',
    base:        'whirl',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'diving(+1) + whirl(3) = 4 ADD',
    provenance:  'diving = +1 body modifier; whirl = 3 ADD rotational core atom. Folk-name resolution (≡ diving whirl).',
  },
  {
    slug:        'paradox_whirl',
    name:        'paradox whirl',
    operator:    'paradox',
    base:        'whirl',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'paradox(+1) + whirl(3) = 4 ADD',
    provenance:  'paradox = +1 dex relationship; whirl = 3 ADD rotational core atom.',
  },
  {
    slug:        'pigbeater',
    name:        'pigbeater',
    operator:    'pixie',
    base:        'eggbeater',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'pixie(+1) + eggbeater(3) = 4 ADD',
    provenance:  'pixie = +1 set modifier; eggbeater = 3 ADD compound (≡ atomic legover). Folk-name resolution.',
  },
  {
    slug:        'spinning_whirl',
    name:        'spinning whirl',
    operator:    'spinning',
    base:        'whirl',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'spinning(+1) + whirl(3) = 4 ADD',
    operationalNotation: 'CLIP > (back) SPIN [BOD] > OP IN [DEX] > OP CLIP [XBD] [DEL]',  // Sibling-derivation; spinning-pickup / spinning-clipper precedents + whirl base; not Red-confirmed.
    provenance:  'spinning = +1 midtime body modifier; whirl = 3 ADD rotational core atom.',
  },
  {
    slug:        'tripwalk',
    name:        'tripwalk',
    operator:    'quantum',
    base:        'butterfly',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'quantum(+1) + butterfly(3) = 4 ADD',
    provenance:  'quantum = +1 set modifier; butterfly = 3 ADD core atom. Folk-name resolution (≡ quantum butterfly).',
  },
  {
    slug:        'matador',
    name:        'matador',
    operator:    'nuclear',
    base:        'butterfly',
    baseAdd:     3,
    totalAdd:    5,
    derivation:  'nuclear(+2) + butterfly(3) = 5 ADD',
    provenance:  'nuclear = +2 set modifier (non-rotational); butterfly = 3 ADD core atom. Folk-name resolution (≡ nuclear butterfly).',
  },
  {
    slug:        'phoenix',
    name:        'phoenix',
    operator:    'pixie + ducking',
    base:        'butterfly',
    baseAdd:     3,
    totalAdd:    5,
    derivation:  'pixie(+1) + ducking(+1) + butterfly(3) = 5 ADD',
    provenance:  'pixie = +1 set modifier; ducking = +1 body modifier; butterfly = 3 ADD core atom. Folk-name resolution.',
  },
  {
    slug:        'spinal_tap',
    name:        'spinal tap',
    operator:    'tapping',
    base:        'torque',
    baseAdd:     4,
    totalAdd:    5,
    derivation:  'tapping(+1) + torque(4) = 5 ADD',
    provenance:  'tapping = +1 body modifier; torque = 4 ADD rotational compound base. Folk-name resolution (≡ tapping torque).',
  },
  {
    slug:        'spinning_symposium_whirl',
    name:        'spinning symposium whirl',
    operator:    'spinning + symposium',
    base:        'whirl',
    baseAdd:     3,
    totalAdd:    5,
    derivation:  'spinning(+1) + symposium(+1) + whirl(3) = 5 ADD',
    operationalNotation: 'CLIP > (back) SPIN [BOD] > (no plant while) OP IN [BOD] [DEX] > OP CLIP [XBD] [DEL]',  // Sibling-derivation; clean compose of spinning + symposium-whirl precedents on whirl base; not Red-confirmed.
    provenance:  'spinning = +1 body modifier; symposium = +1 no-plant body modifier; whirl = 3 ADD rotational core atom.',
  },
  {
    slug:        'witchdoctor',
    name:        'witchdoctor',
    operator:    'atomic + symposium',
    base:        'mirage',
    baseAdd:     2,
    totalAdd:    5,
    derivation:  'atom-smasher(4) + symposium(+1) = 5 ADD',
    operationalNotation: 'CLIP > (no plant while) SAME OUT [BOD] [DEX] >> OP IN [DEX] > OP TOE [DEL]',  // Sibling-derivation; atom-smasher (atomic-mirage X-Dex) + symposium-whirl no-plant pattern; not Red-confirmed (Red ruled the ADD-math but not the operational notation).
    provenance:  'Red adjudication: Atomic Mirage already 4 (Atom Smasher canonical); witchdoctor = Atomic Mirage + Symposium = 5 ADD. Composite reading (COMPOSITE_DERIVATIONS) — atom-smasher as the curator-canonical 4-ADD composite base.',
  },
  {
    slug:        'mind_bender',
    name:        'mind bender',
    operator:    'ducking + paradox',
    base:        'blender',
    baseAdd:     4,
    totalAdd:    6,
    derivation:  'ducking(+1) + paradox(+1) + blender(4) = 6 ADD',
    provenance:  'ducking = +1 body modifier; paradox = +1 dex relationship; blender = 4 ADD rotational compound. Folk-name resolution.',
  },
  {
    slug:        'mullet',
    name:        'mullet',
    operator:    'ducking + paradox + symposium',
    base:        'whirl',
    baseAdd:     3,
    totalAdd:    6,
    derivation:  'ducking(+1) + paradox(+1) + symposium(+1) + whirl(3) = 6 ADD',
    provenance:  'ducking = +1 body modifier; paradox = +1 dex relationship; symposium = +1 no-plant body modifier; whirl = 3 ADD rotational core atom. Folk-name resolution.',
  },
  {
    slug:        'spender',
    name:        'spender',
    operator:    'spinning + paradox',
    base:        'blender',
    baseAdd:     4,
    totalAdd:    6,
    derivation:  'spinning(+1) + paradox(+1) + blender(4) = 6 ADD',
    provenance:  'spinning = +1 body modifier; paradox = +1 dex relationship; blender = 4 ADD rotational compound. Folk-name resolution (≡ spinning paradox blender).',
  },
  {
    slug:        'gauntlet',
    name:        'gauntlet',
    operator:    'stepping + ducking + paradox',
    base:        'torque',
    baseAdd:     4,
    totalAdd:    7,
    derivation:  'stepping(+1) + ducking(+1) + paradox(+1) + torque(4) = 7 ADD',
    provenance:  'Three-modifier stack on torque (≡ stepping ducking paradox torque). All modifiers = +1 body modifiers; torque = 4 ADD rotational compound base.',
  },
  {
    slug:        'montage',
    name:        'montage',
    operator:    'spinning + ducking + paradox + symposium',
    base:        'whirl',
    baseAdd:     3,
    totalAdd:    7,
    derivation:  'spinning(+1) + ducking(+1) + paradox(+1) + symposium(+1) + whirl(3) = 7 ADD',
    provenance:  'Four-modifier stack on whirl (≡ spinning ducking paradox symposium whirl). All modifiers = +1 body modifiers; whirl = 3 ADD rotational core atom. The deepest curator-locked compound currently published.',
  },

  // ── Mechanical notation back-fill promotions.
  //    18 ordinary modifier+base compounds previously sitting in
  //    missing-notation because the DB notation column was empty.
  //    Each derivation uses the standard modifier × base ADD math; no
  //    doctrine interpretation, no composite-modifier expansion, no
  //    folk-name semantics required. Notation column back-filled
  //    via red_corrections in the same slice. Provenance cites the
  //    DB description (curator-authored short-form) where it sources
  //    the modifier identity.
  {
    slug:        'flail',
    name:        'flail',
    operator:    'symposium',
    base:        'illusion',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'symposium(+1) + illusion(2) = 3 ADD',
    operationalNotation: 'SET > (no plant while) OP OUT [BOD] [DEX] > OP TOE [DEL]',  // Sibling-derivation; symposium-whirl no-plant pattern + illusion base; not Red-confirmed.
    provenance:  'symposium = +1 no-plant body modifier; illusion = 2 ADD core atom. DB description "Symposium-modified illusion."',
  },
  {
    slug:        'magellan',
    name:        'magellan',
    operator:    'pixie',
    base:        'legover',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'pixie(+1) + legover(2) = 3 ADD',
    provenance:  'pixie = +1 set modifier; legover = 2 ADD core atom. DB description "Pixie-modified legover."',
  },
  {
    slug:        'merkon',
    name:        'merkon',
    operator:    'spinning',
    base:        'legover',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'spinning(+1) + legover(2) = 3 ADD',
    provenance:  'spinning = +1 midtime body modifier; legover = 2 ADD core atom. DB description "Spinning-modified legover."',
  },
  {
    slug:        'smudge',
    name:        'smudge',
    operator:    'pixie',
    base:        'illusion',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'pixie(+1) + illusion(2) = 3 ADD',
    provenance:  'pixie = +1 set modifier; illusion = 2 ADD core atom. DB description "Pixie-modified illusion."',
  },
  {
    slug:        'pixie_same_side_illusion',
    name:        'pixie same side illusion',
    operator:    'pixie',
    base:        'illusion',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'pixie(+1) + illusion(2) = 3 ADD',
    provenance:  'pixie = +1 set modifier; illusion = 2 ADD core atom. Same-side double-dexterity sibling of Magellan (pixie same legover), ending on the opposite toe instead of the same toe. footbag.org "Pixie Same Side Illusion".',
    operationalNotation: 'TOE > SAME IN [DEX] >> SAME OUT [DEX] > OP TOE [DEL]',
  },
  {
    slug:        'backside_magellan',
    name:        'backside magellan',
    operator:    'backside',
    base:        'magellan',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'backside(+1) + magellan(3) = 4 ADD',
    provenance:  'backside = +1 body modifier (symposium-equivalent); magellan = 3 ADD compound base. Record-attested compound.',
    operationalNotation: 'TOE > BS [DEX] > SAME IN [DEX] >> SAME OUT [DEX] > SAME TOE [DEL]',
  },
  {
    slug:        'backside_paste',
    name:        'backside paste',
    operator:    'backside',
    base:        'paste',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'backside(+1) + paste(3) = 4 ADD',
    provenance:  'backside = +1 body modifier (symposium-equivalent); paste = 3 ADD compound base. Record-attested compound.',
    operationalNotation: 'TOE > BS [DEX] > SAME IN [DEX] >> OP IN [DEX] > SAME TOE [DEL]',
  },
  {
    slug:        'stepping_double_switch_over',
    name:        'stepping double switch-over',
    operator:    'stepping',
    base:        'double-switch-over',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'stepping(+1) + double-switch-over(3) = 4 ADD',
    provenance:  'stepping = +1 set modifier; double-switch-over = 3 ADD base. footbag.org "Stepping Opposite Reaper" — the opposite-reaper base is double-switch-over; stepping prefixes a leading OP IN dex.',
    operationalNotation: 'CLIP > OP IN [DEX] > OP OUT [DEX] > SAME OUT [DEX] > SAME TOE [DEL]',
  },
  {
    slug:        'pixie_double_switch_over',
    name:        'pixie double switch-over',
    operator:    'pixie',
    base:        'double-switch-over',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'pixie(+1) + double-switch-over(3) = 4 ADD',
    provenance:  'pixie = +1 set modifier; double-switch-over = 3 ADD base. Pixie entry-prefix on the double-switch-over body, mirroring pixie-double-leg-over. Record name "Pixie DSO".',
    operationalNotation: 'TOE > SAME IN [DEX] > OP OUT [DEX] > SAME OUT [DEX] > SAME TOE [DEL]',
  },
  {
    slug:        'fairy_same_side_whirl',
    name:        'fairy same side whirl',
    operator:    'fairy',
    base:        'whirl',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'fairy(+1) + whirl(3) = 4 ADD',
    provenance:  'fairy = +1 set modifier; whirl = 3 ADD core atom. Same-side double-dexterity variant of fairy-whirl: the second dexterity lands on the same leg after a plant, where fairy-whirl uses the opposite leg. footbag.org "Fairy Same Side Whirl".',
    operationalNotation: 'TOE > SAME OUT [DEX] (plant) > SAME IN [DEX] > OP CLIP [XBD] [DEL]',
  },
  {
    slug:        'fairy_same_side_mirage',
    name:        'fairy same side mirage',
    operator:    'fairy',
    base:        'mirage',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'fairy(+1) + mirage(2) = 3 ADD',
    provenance:  'fairy = +1 set modifier; mirage = 2 ADD core atom. Same-side double-dexterity variant of fairy-mirage (Fear): the second dexterity lands on the same leg after a plant, where fairy-mirage uses the opposite leg. footbag.org "Fairy Same Side Mirage".',
    operationalNotation: 'TOE > SAME OUT [DEX] (plant) > SAME IN [DEX] > OP TOE [DEL]',
  },
  {
    slug:        'shooting_mirage',
    name:        'shooting mirage',
    operator:    'shooting',
    base:        'mirage',
    baseAdd:     2,
    totalAdd:    5,
    derivation:  'shooting(+3) + mirage(2) = 5 ADD',
    provenance:  'shooting = +3 set modifier (Red-confirmed +3 universal, rotational bases included); mirage = 2 ADD core atom. Canonical precedent: redwetter (shooting eggbeater = 6).',
    operationalNotation: 'CLIP > OP IN [DEX] > OP OUT [PDX] [DEX] > OP IN [DEX] > OP TOE [DEL]',
  },
  {
    slug:        'shooting_butterfly',
    name:        'shooting butterfly',
    operator:    'shooting',
    base:        'butterfly',
    baseAdd:     3,
    totalAdd:    6,
    derivation:  'shooting(+3) + butterfly(3) = 6 ADD',
    provenance:  'shooting = +3 set modifier (Red-confirmed +3 universal); butterfly = 3 ADD core atom. The modifier reference uses this exact compound as its worked example.',
    operationalNotation: 'CLIP > OP IN [DEX] > OP OUT [PDX] [DEX] > OP OUT [DEX] > OP CLIP [XBD] [DEL]',
  },
  {
    slug:        'shooting_star',
    name:        'shooting star',
    operator:    'shooting',
    base:        'double-over-down',
    baseAdd:     4,
    totalAdd:    7,
    derivation:  'shooting(+3) + double-over-down(4) = 7 ADD',
    provenance:  'shooting = +3 set modifier (Red-confirmed +3 universal); double-over-down = 4 ADD compound base. Folk name "Shooting Star"; structural form "shooting double over down".',
    operationalNotation: 'CLIP > OP IN [DEX] > OP OUT [PDX] [DEX] > OP OUT [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]',
  },
  {
    slug:        'shooting_torque',
    name:        'shooting torque',
    operator:    'shooting',
    base:        'torque',
    baseAdd:     4,
    totalAdd:    7,
    derivation:  'shooting(+3) + torque(4) = 7 ADD',
    provenance:  'shooting = +3 set modifier (Red-confirmed +3 universal, rotational bases included); torque = 4 ADD compound base.',
    operationalNotation: 'CLIP > OP IN [DEX] > OP OUT [PDX] [DEX] > OP IN [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]',
  },
  {
    slug:        'shooting_clipper',
    name:        'shooting clipper',
    operator:    'shooting',
    base:        'clipper-stall',
    baseAdd:     2,
    totalAdd:    5,
    derivation:  'shooting(+3) + clipper-stall(2) = 5 ADD',
    provenance:  'shooting = +3 set modifier (Red-confirmed +3 universal); clipper-stall = 2 ADD delay surface. Notation derived via the shooting chassis.',
    operationalNotation: 'CLIP > OP IN [DEX] > OP OUT [PDX] [DEX] > OP CLIP [XBD] [DEL]',
  },
  {
    slug:        'shooting_barfly',
    name:        'shooting barfly',
    operator:    'shooting',
    base:        'barfly',
    baseAdd:     4,
    totalAdd:    7,
    derivation:  'shooting(+3) + barfly(4) = 7 ADD',
    provenance:  'shooting = +3 set modifier (Red-confirmed +3 universal); barfly = 4 ADD compound base. Notation derived via the shooting chassis.',
    operationalNotation: 'CLIP > OP IN [DEX] > OP OUT [PDX] [DEX] > SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [DEL] [XBD]',
  },
  {
    slug:        'shooting_da_da_curve',
    name:        'shooting da da curve',
    operator:    'shooting',
    base:        'dada-curve',
    baseAdd:     4,
    totalAdd:    7,
    derivation:  'shooting(+3) + da-da-curve(4) = 7 ADD',
    provenance:  'shooting = +3 set modifier (Red-confirmed +3 universal); da-da-curve = 4 ADD compound base. Notation derived via the shooting chassis.',
    operationalNotation: 'CLIP > OP IN [DEX] > OP OUT [PDX] [DEX] > OP IN [DEX] > (no plant while) OP OUT [DEX] > OP CLIP [XBD] [DEL]',
  },
  {
    slug:        'shooting_double_leg_over',
    name:        'shooting double leg over',
    operator:    'shooting',
    base:        'double-leg-over',
    baseAdd:     3,
    totalAdd:    6,
    derivation:  'shooting(+3) + double-leg-over(3) = 6 ADD',
    provenance:  'shooting = +3 set modifier (Red-confirmed +3 universal); double-leg-over = 3 ADD compound base. Notation derived via the shooting chassis.',
    operationalNotation: 'CLIP > OP IN [DEX] > OP OUT [PDX] [DEX] > OP IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]',
  },
  {
    slug:        'assassin',
    name:        'assassin',
    operator:    'pixie + ducking',
    base:        'mirage',
    baseAdd:     2,
    totalAdd:    4,
    derivation:  'pixie(+1) + ducking(+1) + mirage(2) = 4 ADD',
    provenance:  'pixie = +1 set modifier; ducking = +1 midtime body modifier; mirage = 2 ADD core atom. DB description "Pixie-and-ducking modified mirage."',
  },
  {
    slug:        'haze',
    name:        'haze',
    operator:    'stepping',
    base:        'double-leg-over',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'stepping(+1) + dlo(3) = 4 ADD',
    operationalNotation: 'CLIP > OP IN [DEX] >> SAME IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]',  // Sibling-derivation; tombstone (stepping drifter) stepping pattern + double-leg-over base; not Red-confirmed.
    provenance:  'stepping = +1 set modifier; double-leg-over (dlo) = 3 ADD compound base. DB description "Stepping-modified double leg over." Folk-name resolution.',
  },
  {
    slug:        'mantis',
    name:        'mantis',
    operator:    'gyro',
    base:        'eggbeater',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'gyro(+1) + eggbeater(3) = 4 ADD',
    provenance:  'gyro = +1 body modifier; eggbeater = 3 ADD compound (≡ atomic legover). DB description "Gyro-modifier eggbeater."',
  },
  {
    slug:        'nova',
    name:        'nova',
    operator:    'symposium',
    base:        'double-leg-over',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'symposium(+1) + dlo(3) = 4 ADD',
    provenance:  'symposium = +1 no-plant body modifier; double-leg-over (dlo) = 3 ADD compound base. DB description "Symposium-modifier double-leg-over."',
  },
  {
    slug:        'parkwalk',
    name:        'parkwalk',
    operator:    'pixie',
    base:        'butterfly',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'pixie(+1) + butterfly(3) = 4 ADD',
    provenance:  'pixie = +1 set modifier; butterfly = 3 ADD core atom. DB description "Pixie-modified same-side butterfly."',
  },
  {
    slug:        'royale',
    name:        'royale',
    operator:    'paradox',
    base:        'reverse-drifter',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'paradox(+1) + reverse-drifter(3) = 4 ADD',
    provenance:  'paradox = +1 dex relationship; reverse-drifter = 3 ADD compound. DB description "Paradox-modified reverse drifter."',
  },
  {
    slug:        'smog',
    name:        'smog',
    operator:    'pixie',
    base:        'double-leg-over',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'pixie(+1) + dlo(3) = 4 ADD',
    provenance:  'pixie = +1 set modifier; double-leg-over (dlo) = 3 ADD compound base. DB description "Pixie-modified double leg over."',
  },
  {
    slug:        'smoke',
    name:        'smoke',
    operator:    'pixie',
    base:        'drifter',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'pixie(+1) + drifter(3) = 4 ADD',
    provenance:  'pixie = +1 set modifier; drifter = 3 ADD rotational compound base. DB description "Pixie-modified drifter."',
  },
  {
    slug:        'tapdown',
    name:        'tapdown',
    operator:    'tapping',
    base:        'butterfly',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'tapping(+1) + butterfly(3) = 4 ADD',
    provenance:  'tapping = +1 body modifier; butterfly = 3 ADD core atom. DB description "Tapping-modifier butterfly."',
  },
  {
    slug:        'tombstone',
    name:        'tombstone',
    operator:    'stepping',
    base:        'drifter',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'stepping(+1) + drifter(3) = 4 ADD',
    provenance:  'stepping = +1 set modifier; drifter = 3 ADD rotational compound base. DB description "Stepping-modified drifter."',
  },
  {
    slug:        'blurriest',
    name:        'blurriest',
    operator:    'blurry',
    base:        'barfly',
    baseAdd:     4,
    totalAdd:    5,
    derivation:  'blurry(+1) + barfly(4) = 5 ADD',
    provenance:  'blurry = +1 flat (post Red retraction; "blurry just implies stepping"); barfly = 4 ADD compound (ATAM-derived). Per build_trick_reconciliation_workbook.py MODIFIER_COMPOSITIONS allowlist comment: blurriest specifically uses blurry as +1 flat, NOT as the stepping+paradox carve-out applied to blur/blurry-whirl/blurry-torque/food-processor.',
  },
  {
    slug:        'grave_digger',
    name:        'grave digger',
    operator:    'stepping',
    base:        'torque',
    baseAdd:     4,
    totalAdd:    5,
    derivation:  'stepping(+1) + torque(4) = 5 ADD',
    provenance:  'stepping = +1 set modifier; torque = 4 ADD rotational compound base. DB description "Stepping-modified same-side torque." Folk-name resolution.',
  },
  {
    slug:        'tomahawk',
    name:        'tomahawk',
    operator:    'ducking',
    base:        'paradox-whirl',
    baseAdd:     4,
    totalAdd:    5,
    derivation:  'ducking(+1) + paradox-whirl(4) = 5 ADD',
    provenance:  'ducking = +1 midtime body modifier; paradox-whirl = 4 ADD compound. DB description "Ducking-modified paradox whirl." Folk-name resolution. Shallow-readable derivation per composite-modifier framework §6.1: treats paradox-whirl as the published 4-ADD base rather than recursively expanding to ducking(+1)+paradox(+1)+whirl(3).',
  },
  {
    slug:        'big_apple',
    name:        'big apple',
    operator:    'gyro + symposium',
    base:        'torque',
    baseAdd:     4,
    totalAdd:    6,
    derivation:  'gyro(+1) + symposium(+1) + torque(4) = 6 ADD',
    provenance:  'gyro = +1 body modifier; symposium = +1 no-plant body modifier; torque = 4 ADD rotational compound base. DB description "Gyro-and-symposium modified torque." Folk-name resolution.',
  },

  // ── Observational→canonical promotions. Fourteen entries moved from
  //    OBSERVATIONAL_TRICKS module into canonical freestyle_tricks rows
  //    via the audit-validated promotion frontier (9 FB.org + 4 PassBack
  //    + 1 stepwise FB.org, where paradox-blizzard depends on blizzard).
  //    Per the layer-separation contract, each row's observational entry
  //    is removed in the same change-set.
  {
    slug:        'blizzard',
    name:        'blizzard',
    operator:    'stepping',
    base:        'illusion',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'stepping(+1) + illusion(2) = 3 ADD',
    provenance:  'stepping = +1 set modifier; illusion = 2 ADD core atom. PassBack folk-name resolution (Stepping far Illusion). Observational→canonical promotion.',
  },
  {
    slug:        'blaze',
    name:        'blaze',
    operator:    'whirling',
    base:        'mirage',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'whirling(+1) + mirage(2) = 3 ADD',
    provenance:  'whirling = +1 body modifier; mirage = 2 ADD core atom (rotational). PassBack folk-name resolution (Whirling far Mirage). Whirling operator settled per Movement System axes.',
  },
  {
    slug:        'bedwetter',
    name:        'bedwetter',
    operator:    'stepping',
    base:        'eggbeater',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'stepping(+1) + eggbeater(3) = 4 ADD',
    provenance:  'stepping = +1 set modifier; eggbeater = 3 ADD compound (≡ atomic legover per pt4). PassBack folk-name resolution.',
  },
  {
    slug:        'sole_survivor',
    name:        'sole survivor',
    operator:    'spinning + symposium',
    base:        'whirl',
    baseAdd:     3,
    totalAdd:    5,
    derivation:  'spinning(+1) + symposium(+1) + whirl(3) = 5 ADD',
    operationalNotation: 'CLIP > (back) SPIN [BOD] > (no plant while) OP IN [BOD] [DEX] > OP CLIP [XBD] [DEL]',  // identical structure to spinning-symposium-whirl (its structural twin); 5 brackets match the 5 ADD.
    provenance:  'spinning = +1 midtime body modifier; symposium = +1 no-plant body modifier; whirl = 3 ADD core atom (rotational). PassBack folk-name resolution; "sole survivor" is a pun name, not a sole-surface catch.',
  },
  {
    slug:        'spinning_paradox_mirage',
    name:        'spinning paradox mirage',
    operator:    'spinning + paradox',
    base:        'mirage',
    baseAdd:     2,
    totalAdd:    4,
    derivation:  'spinning(+1) + paradox(+1) + mirage(2) = 4 ADD',
    provenance:  'spinning = +1 body modifier; paradox = +1 dex relationship; mirage = 2 ADD core atom. FB.org /newmoves Paradox Moves listing (2003).',
  },
  {
    slug:        'spinning_paradox_illusion',
    name:        'spinning paradox illusion',
    operator:    'spinning + paradox',
    base:        'illusion',
    baseAdd:     2,
    totalAdd:    4,
    derivation:  'spinning(+1) + paradox(+1) + illusion(2) = 4 ADD',
    provenance:  'spinning = +1 body modifier; paradox = +1 dex relationship; illusion = 2 ADD core atom. FB.org /newmoves Paradox Moves listing (2003).',
  },
  {
    slug:        'spinning_paradox_whirl',
    name:        'spinning paradox whirl',
    operator:    'spinning + paradox',
    base:        'whirl',
    baseAdd:     3,
    totalAdd:    5,
    derivation:  'spinning(+1) + paradox(+1) + whirl(3) = 5 ADD',
    provenance:  'spinning = +1 body modifier; paradox = +1 dex relationship; whirl = 3 ADD core atom (rotational). FB.org /newmoves (2003).',
  },
  {
    slug:        'paradox_double_leg_over',
    name:        'paradox double leg over',
    operator:    'paradox',
    base:        'double-leg-over',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'paradox(+1) + dlo(3) = 4 ADD',
    provenance:  'paradox = +1 dex relationship; double-leg-over (dlo) = 3 ADD compound base. FB.org /newmoves description: "A paradox mirage with an extra leg over at the end."',
  },
  {
    slug:        'paradox_barrage',
    name:        'paradox barrage',
    operator:    'paradox',
    base:        'barrage',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'paradox(+1) + barrage(3) = 4 ADD',
    provenance:  'paradox = +1 dex relationship; barrage = 3 ADD compound (SS=+0 per pt12 ruling). FB.org /newmoves (2003).',
  },
  {
    slug:        'paradox_symposium_mirage',
    name:        'paradox symposium mirage',
    operator:    'paradox + symposium',
    base:        'mirage',
    baseAdd:     2,
    totalAdd:    4,
    derivation:  'paradox(+1) + symposium(+1) + mirage(2) = 4 ADD',
    provenance:  'paradox = +1 dex relationship; symposium = +1 no-plant body modifier; mirage = 2 ADD core atom. FB.org /newmoves (2003).',
  },
  {
    slug:        'paradox_high_plains_drifter',
    name:        'paradox high-plains-drifter',
    operator:    'paradox',
    base:        'high-plains-drifter',
    baseAdd:     4,
    totalAdd:    5,
    derivation:  'paradox(+1) + high-plains-drifter(4) = 5 ADD',
    provenance:  'paradox = +1 dex relationship; high-plains-drifter = 4 ADD compound (pt11 = miraging clipper). FB.org /newmoves; alias Paradox Double Drifter.',
  },
  {
    slug:        'spinning_paradox_blender',
    name:        'spinning paradox blender',
    operator:    'spinning + paradox',
    base:        'blender',
    baseAdd:     4,
    totalAdd:    6,
    derivation:  'spinning(+1) + paradox(+1) + blender(4) = 6 ADD',
    provenance:  'spinning = +1 body modifier; paradox = +1 dex relationship; blender = 4 ADD compound (rotational; pt11 = whirling osis). FB.org /newmoves (2003).',
  },
  {
    slug:        'stepping_ducking_paradox_blender',
    name:        'stepping ducking paradox blender',
    operator:    'stepping + ducking + paradox',
    base:        'blender',
    baseAdd:     4,
    totalAdd:    7,
    derivation:  'stepping(+1) + ducking(+1) + paradox(+1) + blender(4) = 7 ADD',
    provenance:  'Three-modifier stack on blender. All modifiers = +1 body modifiers; blender = 4 ADD rotational compound base. FB.org /newmoves (2003). Highest-ADD compound in the FB.org corpus that decomposes cleanly via +1 arithmetic.',
  },
  {
    slug:        'paradox_blizzard',
    name:        'paradox blizzard',
    operator:    'paradox',
    base:        'blizzard',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'paradox(+1) + blizzard(3) = 4 ADD',
    provenance:  'paradox = +1 dex relationship; blizzard = 3 ADD compound (canonicalized; was stepping illusion). Stepwise dependency resolved. FB.org /newmoves (2003).',
  },

  // ── Doctrine-divergence pilot batch. Three rows promoted from the
  //    observational corpus under the doctrine-divergence framework.
  //    Each row's IFPA-grammar derivation differs from PassBack's source
  //    claim by +1 ADD; the published canonical value matches the IFPA
  //    derivation, and the divergence is documented as
  //    historical-divergence in DOCTRINE_DIVERGENCE_REGISTRY. Linked to
  //    Red queue Q7 (implicit-operator hypothesis).
  {
    slug:        'blurrage',
    name:        'blurrage',
    operator:    'stepping',
    base:        'barrage',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'stepping(+1) + barrage(3) = 4 ADD',
    operationalNotation: 'CLIP > SAME IN [DEX] >> OP IN [DEX] > SAME IN [DEX] > OP TOE [DEL]',  // Sibling-derivation; tombstone (stepping drifter) stepping pattern + barrage doubled-dex base; medium confidence (stepping-on-barrage stack pattern is unprecedented); not Red-confirmed.
    provenance:  'stepping = +1 set modifier; barrage = 3 ADD compound (promotion via ATAM bracket-flag count). PassBack source claims 3 ADD; the +1 gap is documented as historical-divergence under Red Q7 (doctrine-divergence pilot).',
  },
  {
    slug:        'predator',
    name:        'predator',
    operator:    'atomic',
    base:        'double-leg-over',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'atomic(+1) + dlo(3) = 4 ADD',
    provenance:  'atomic = +1 set modifier; double-leg-over (dlo) = 3 ADD compound base. PassBack source claims 3 ADD; the +1 gap may reflect pt10\'s implicit paradox-atomic framing per Red Q7. Doctrine-divergence pilot.',
  },
  {
    slug:        'schmoe',
    name:        'schmoe',
    operator:    'stepping',
    base:        'legover',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'stepping(+1) + legover(2) = 3 ADD',
    provenance:  'stepping = +1 set modifier; legover = 2 ADD core atom. PassBack source claims 2 ADD (reading: Stepping near Legover); the +1 gap is the same systemic pattern as blurrage. Doctrine-divergence pilot, Red Q7.',
  },

  // ── Productive-multiplicity base entries (DATW + DLO) ────────────────
  // Top-level JOB + ADD entries for the two community-stabilized
  // productive-multiplicity compounds (per freestyle-dictionary skill's
  // productive multiplicity exception list). Both base operational forms
  // come from the footbag.org corpus; ADD breakdown decomposes through
  // dex events and stall delay.
  {
    slug:        'double_around_the_world',
    name:        'double around the world',
    operator:    'double',
    base:        'around-the-world',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'dex(2) + stall(1) = 3 ADD',
    operationalNotation: 'TOE > SAME IN [DEX] > SAME IN [DEX] > SAME TOE [DEL]',
    provenance:  'footbag.org corpus base operational form. Two same-side inside dex events into a same-side toe stall. ADD decomposes as two dex events (1 each) plus the terminal stall (1).',
  },
  {
    slug:        'double_leg_over',
    name:        'double leg over',
    operator:    'double',
    base:        'legover',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'dex(2) + stall(1) = 3 ADD',
    operationalNotation: 'SET > OP IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]',
    provenance:  'footbag.org corpus base operational form. Opposite-side inside dex into opposite-side outside dex into a same-side toe stall. ADD decomposes as two dex events (1 each) plus the terminal stall (1). Alias forms (double legover, dlo) collapse to the canonical double-leg-over slug.',
  },

  // ─── Derivation backfill ──────────────────────────────────────────────────
  // Three new ResolvedFormula entries from the pre-Red derivation audit.
  // The slugs had neither a ResolvedFormula entry nor an
  // operational_notation row in DB; the audit derived candidate JOB
  // forms from observed sibling precedents and operator-grammar rules.
  // All three are sibling-derivation only; NOT Red-confirmed.
  {
    slug:        'bigwalk',
    name:        'bigwalk',
    operator:    'surging',
    base:        'butterfly',
    baseAdd:     3,
    totalAdd:    5,
    derivation:  'surging(+2) + butterfly(3) = 5 ADD',
    operationalNotation: 'CLIP > (back) SPIN [BOD] > SAME IN [DEX] >> OP OUT [DEX] > OP CLIP [XBD] [DEL]',  // Sibling-derivation; surging pattern (surge / surreal / venom) + butterfly base; not Red-confirmed.
    provenance:  'surging primitive (2 ADD; decomposes to spinning + stepping per Red pt2); butterfly = 3 ADD core atom. Chain reading "surging butterfly" per freestyleSymbolicEquivalences.ts. Bucket A derivation backfill.',
  },
  {
    slug:        'torque',
    name:        'torque',
    operator:    'miraging',
    base:        'osis',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'miraging(+1) + osis(3) = 4 ADD',
    operationalNotation: 'SET > OP IN [DEX] > (back or front) SPIN [BOD] > OP CLIP [XBD] [DEL]',  // Sibling-derivation; compound-of-canonicals (mirage dex + osis spin-terminal); chain reading "miraging osis" pt11-locked; not Red-confirmed for operational notation.
    provenance:  'pt11-locked chain reading "miraging osis": torque = mirage operator (+1 dex on the osis chassis) + osis = 4 ADD. The operational notation composes mirage\'s in-to-out dex with osis\'s spin-into-clipper terminal. Bucket A derivation backfill.',
  },
  {
    slug:        'omelette',
    name:        'omelette',
    operator:    'atomic',
    base:        'illusion',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'atomic(+1) + illusion(2) = 3 ADD',
    operationalNotation: 'SET > OP OUT [DEX] >> OP IN [DEX] > OP TOE [DEL]',  // Sibling-derivation; chain reading "atomic illusion" (pt2 + followup-2026-04 locked) drives the derivation despite DB base_trick=pickup; structural conflict noted in audit; not Red-confirmed for operational notation.
    provenance:  'Chain reading "atomic illusion" per freestyleSymbolicEquivalences.ts (pt2 + followup-2026-04 locked) — derivation follows the chain, NOT the DB base_trick=pickup. Structural conflict between chain reading and DB base flagged in audit Bucket A (medium confidence). atomic = +1 set modifier; illusion = 2 ADD core atom. Bucket A derivation backfill.',
  },

  // ─── Foundational-vocabulary promotion ─────────────────────────────────
  // Conservative canonical promotion for the most conspicuous
  // foundational omissions. Three new canonical rows added to
  // the red_additions curated input; operationalNotation overlays
  // below render the JOB row pre-pipeline-rebuild. Provenance:
  // fb.org-derived / sibling-derived; NOT Red-confirmed. Surfaces
  // Red questions K-1..K-3 + B-1.

  {
    slug:        'around_the_world_kick',
    name:        'around the world kick',
    operator:    'kick (terminal stall removed)',
    base:        'around-the-world',
    baseAdd:     2,
    totalAdd:    1,
    derivation:  'dex(1) = 1 ADD',
    operationalNotation: 'TOE > SAME IN [DEX]',  // fb.org-derived; kick-rule applied; not Red-confirmed.
    provenance:  'Foundational-vocabulary promotion. Kick-rule derivation: remove terminal [DEL] and stall(1) from around-the-world. fb.org-derived ("Around the World Kick"); not Red-confirmed. Surfaces Red Q K-1..K-3 (kick-family ADD reading + uniform [bod] vs structural [dex] interpretation).',
  },
  {
    slug:        'clipper',
    name:        'clipper',
    operator:    'body-kick primitive',
    base:        'clipper',
    baseAdd:     1,
    totalAdd:    1,
    derivation:  'xbody(1) = 1 ADD',
    operationalNotation: 'OP CLIP [XBD]',  // 1-ADD body kick into clipper position; user-spec operational form; not Red-confirmed.
    provenance:  'Foundational-vocabulary polish. The existing clipper row (1-ADD body kick into clipper position) lacked operational notation; OP CLIP [XBD] derived per user spec (cross-body event without terminal stall). Curator-published; not Red-confirmed.',
  },
  {
    slug:        'triple_around_the_world',
    name:        'triple around the world',
    operator:    'triple (3-dex extension)',
    base:        'around-the-world',
    baseAdd:     2,
    totalAdd:    4,
    derivation:  'dex(3) + stall(1) = 4 ADD',
    operationalNotation: 'TOE > SAME IN [DEX] > SAME IN [DEX] > SAME IN [DEX] > SAME TOE [DEL]',  // Sibling-derivation from around-the-world + double-around-the-world; fb.org-derived; not Red-confirmed.
    provenance:  'Foundational-vocabulary promotion. Sibling-derivation from around-the-world(2) + double-around-the-world(3): three consecutive full leg circles ending in a same-side toe delay. fb.org-derived ("Triple Around The World"); not Red-confirmed. Math: dex(3) + stall(1) = 4. Surfaces Red Q B-1 (canonical promotion).',
  },
  {
    slug:        'double_around_the_world_heel',
    name:        'double around the world heel',
    operator:    'heel terminal (toe→heel surface swap)',
    base:        'double-around-the-world',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'dex(2) + unusual-surface(1) + heel-stall(1) = 4 ADD',
    operationalNotation: 'TOE > SAME IN [DEX] > SAME IN [DEX] > SAME HEEL [UNS] [DEL]',  // Terminal-surface variant of double-around-the-world (toe→heel); the heel terminal is an unusual surface, so it carries both [UNS] and the stall [DEL]. fb.org-derived; not Red-confirmed.
    provenance:  'Foundational-vocabulary promotion. Terminal-surface variant of double-around-the-world: the heel is an unusual surface, so the terminal carries a [UNS] tag on top of the stall delay, giving dex(2) + unusual-surface(1) + heel-stall(1) = 4 ADD. Bracket count 4 matches the official ADD. fb.org-derived; not Red-confirmed.',
  },

  // ─── Held-delay leg-over family + butterfly-kick correction ───────────
  // Four entries:
  //   - hop-over    (2 ADD; existing DB row with empty op_notation;
  //                  fb.org [bod] [del])
  //   - walk-over   (2 ADD; existing DB row with empty op_notation;
  //                  fb.org [del] [dex])
  //   - wrap        (2 ADD; new canonical row in red_additions; fb.org
  //                  [del] [dex])
  //   - butterfly-kick (DB correction applied via red_corrections: 3→2 ADD,
  //                     drop terminal [XBD]; overlay entry below provides
  //                     the curator-published derivation for the ADD analysis
  //                     disclosure)
  //
  // Held-delay leg-over family is sibling-not-merge per the curator's
  // topology-family note: distinct event signatures (hop-over = body jump;
  // walk-over = leg step over; wrap = bag pulled around the leg).

  {
    slug:        'hop_over',
    name:        'hop over',
    operator:    'body-jump primitive',
    base:        'hop-over',
    baseAdd:     2,
    totalAdd:    2,
    derivation:  'inside-delay(1) + bod(1) = 2 ADD',
    operationalNotation: '[set] > inside [DEL] > (hop over) [BOD]',  // Held-delay leg-over family; fb.org-derived ("Hop Over"); not Red-confirmed.
    provenance:  'Held-delay leg-over family. fb.org-derived: "Hold an inside delay close to the ground and hop over it with the support leg." Component tags [bod] [del] = 2 ADD. Sibling-not-merge to walk-over and wrap; distinct event signature (body jump over a held delay). Not Red-confirmed.',
  },
  {
    slug:        'walk_over',
    name:        'walk over',
    operator:    'leg-step primitive',
    base:        'walk-over',
    baseAdd:     2,
    totalAdd:    2,
    derivation:  'inside-delay(1) + dex(1) = 2 ADD',
    operationalNotation: '[set] > inside [DEL] > OP (step over) [DEX]',  // Held-delay leg-over family; fb.org-derived ("Walk Over" / "Step Over"); not Red-confirmed. Step-over is the fb.org alias of walk-over.
    provenance:  'Held-delay leg-over family. fb.org-derived: "Put an inside delay on the ground and step over it with the opposite leg." Component tags [del] [dex] = 2 ADD. fb.org uses "step over" as the alias of walk-over. Sibling-not-merge to hop-over and wrap; distinct event signature (leg passes over a held delay). Not Red-confirmed.',
  },
  {
    slug:        'wrap',
    name:        'wrap',
    operator:    'wrap-around primitive',
    base:        'wrap',
    baseAdd:     2,
    totalAdd:    2,
    derivation:  'inside-delay(1) + dex(1) = 2 ADD',
    operationalNotation: '[set] > inside [DEL] > (wrap) [DEX]',  // Held-delay leg-over family; new canonical row promoted in red_additions; fb.org-derived ("Wrap"); not Red-confirmed.
    provenance:  'Held-delay leg-over family. fb.org-derived: "Inside delay the footbag and pull the footbag around your support leg into a cross body position." Component tags [del] [dex] = 2 ADD. New canonical row promoted via red_additions. Sibling-not-merge to hop-over and walk-over; distinct event signature (bag pulled around the support leg). Not Red-confirmed.',
  },
  {
    slug:        'butterfly_kick',
    name:        'butterfly kick',
    operator:    'kick (terminal stall removed)',
    base:        'butterfly',
    baseAdd:     3,
    totalAdd:    2,
    derivation:  'bod(1) + dex(1) = 2 ADD',
    operationalNotation: 'SET > JUMP [BOD] > SAME or OP OUT [DEX]',  // Curator ruling: butterfly-kick = 2 ADD per fb.org [dex] [bod]; drops the terminal OP CLIP [XBD] that prior IFPA DB row carried. DB correction via red_corrections; overlay carries the resolved formula.
    provenance:  'Curator ruling: butterfly-kick = 2 ADD per fb.org [dex] [bod] reading. Resolves Red Q K-1. Prior IFPA DB value of 3 ADD with terminal [XBD] is corrected. Kick rule: same topology as butterfly stall minus terminal [DEL] / stall(1).',
  },

  // ─── Eclipse promotion (airborne hop-over topology) ──────────────────
  // Curator-published operational notation for the eclipse trick.
  // Eclipse is structurally an airborne symposium-style evolution of
  // hop-over topology: grounded held-delay crossover becomes a jump-
  // initiated aerial dexterity sequence. Existing DB row was at 3 ADD
  // with empty op_notation; this entry supplies the curator-authored JOB.

  {
    slug:        'eclipse',
    name:        'eclipse',
    operator:    'airborne hop-over topology',
    base:        'eclipse',
    baseAdd:     3,
    totalAdd:    3,
    derivation:  'bod(1) + del(1) + dex(1) = 3 ADD (jump + mid-flight inside delay + outward dex)',
    operationalNotation: 'SET > (jump) [BOD] > SAME or OP INSIDE [DEL] > OP OUT [DEX] > (land)',  // Curator-supplied; fb.org-aligned (pt1 jump-bearing 3-ADD reading); airborne hop-over topology.
    provenance:  'Curator-published operational notation. Eclipse structurally an airborne symposium-style evolution of hop-over topology: jump-initiated aerial dexterity sequence with mid-flight held inside delay. bod(1) + del(1) + dex(1) = 3 ADD. fb.org-aligned (pt1 ruled jump-bearing 3-ADD). Historical alias "Catwalk" preserved on DB row.',
  },

  // ─── Pixie-clipper compound promotions (deferred-candidate
  //     follow-on from the ADD-flattening note review). Two siblings: pixie
  //     modifier prefix + clipper-stall terminator, opposite-side and
  //     same-side variants. Both 3 ADD by canonical bracket convention:
  //     pixie [DEX] + clipper-stall [XBD] [DEL]. JOB derivation follows the
  //     established pattern of drifter / fairy-clipper / spinning-clipper
  //     (all 3-ADD clipper-stall compounds carrying the XBD-DEL terminator
  //     regardless of side). Not Red-confirmed for these specific compounds;
  //     family inventory (pixie = +1 PDX modifier) IS Red-settled (pt12).

  {
    slug:        'pixie_opposite_clipper',
    name:        'pixie opposite clipper',
    operator:    'pixie',
    base:        'clipper-stall',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'pixie(+1) + clipper-stall(2) = 3 ADD ([DEX] + [XBD] + [DEL])',
    operationalNotation: 'TOE > SAME IN [DEX] > OP CLIP [XBD] [DEL]',  // Sibling-derivation from drifter / fairy-clipper / spinning-clipper; opposite-side clipper terminator (OP CLIP). Not Red-confirmed.
    provenance:  'Deferred-candidate promotion. pixie = +1 PDX modifier (Red-settled inventory, pt12); clipper-stall = 2 ADD core atom. Opposite-side clipper terminator. Sibling JOB derivation from drifter (SET > OP IN [DEX] > SAME CLIP [XBD] [DEL]) / fairy-clipper / spinning-clipper. fb.org-derived. Not Red-confirmed for this specific compound.',
  },
  {
    slug:        'pixie_same_clipper',
    name:        'pixie same clipper',
    operator:    'pixie',
    base:        'clipper-stall',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'pixie(+1) + clipper-stall(2) = 3 ADD ([DEX] + [XBD] + [DEL])',
    operationalNotation: 'TOE > SAME IN [DEX] > SAME CLIP [XBD] [DEL]',  // Sibling-derivation from drifter / fairy-clipper / spinning-clipper; same-side clipper terminator (SAME CLIP). Not Red-confirmed.
    provenance:  'Deferred-candidate promotion. pixie = +1 PDX modifier (Red-settled inventory, pt12); clipper-stall = 2 ADD core atom. Same-side clipper terminator. Sibling JOB derivation from drifter / fairy-clipper / spinning-clipper. fb.org-derived. Not Red-confirmed for this specific compound.',
  },

  // ─── Inspinning-family compound promotions (deferred-candidate
  //     follow-on; settled doctrine per Red pt7 "Modifier stacking" ruling on
  //     PassBack Inspinning). Three compounds, all mirroring their spinning-*
  //     siblings (already in DB) with the spin direction flipped: spinning
  //     uses `(back) SPIN [BOD]`; inspinning uses `(front) SPIN [BOD]`. ADD
  //     math is identical to the spinning variant; JOB derivation is purely
  //     directional. Bases are all canonical (butterfly core atom; paradox-
  //     illusion / paradox-mirage as compound bases already in DB).

  {
    slug:        'inspinning_butterfly',
    name:        'inspinning butterfly',
    operator:    'inspinning',
    base:        'butterfly',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'inspinning(+1) + butterfly(3) = 4 ADD',
    operationalNotation: 'CLIP > (front) SPIN [BOD] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]',  // FB.org-confirmed JOB. Inspinning rotation flips spin to (front) AND flips dex side OP→SAME while preserving dex direction.
    provenance:  'Deferred-candidate promotion. inspinning = +1 modifier (Red pt7: "Modifier stacking" on PassBack Inspinning group); butterfly = 3 ADD core atom. JOB form is FB.org-confirmed via RECONCILIATION (jobs=CLIP > (front) SPIN [BOD] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]). Establishes the inspinning direction-flip rule: spin (back→front), dex side (OP→SAME), dex direction + terminal stall unchanged.',
  },
  {
    slug:        'inspinning_paradox_illusion',
    name:        'inspinning paradox illusion',
    operator:    'inspinning',
    base:        'paradox-illusion',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'inspinning(+1) + paradox-illusion(3) = 4 ADD',
    operationalNotation: 'CLIP > (front) SPIN [BOD] > SAME OUT [PDX] [DEX] > OP TOE [DEL]',  // Sibling-derivation from spinning-paradox-illusion with the inspinning direction-flip rule established by FB.org-confirmed inspinning-butterfly. Not Red-confirmed.
    provenance:  'Deferred-candidate promotion. inspinning = +1 modifier (Red pt7); paradox-illusion = 3 ADD canonical compound in DB. Sibling JOB derivation from spinning-paradox-illusion (CLIP > (back) SPIN [BOD] > OP OUT [PDX] [DEX] > OP TOE [DEL]) applying the inspinning direction-flip rule (spin back→front, dex side OP→SAME) established by FB.org-confirmed inspinning-butterfly. fb.org-derived. Not Red-confirmed for this specific compound.',
  },
  {
    slug:        'inspinning_paradox_mirage',
    name:        'inspinning paradox mirage',
    operator:    'inspinning',
    base:        'paradox-mirage',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'inspinning(+1) + paradox-mirage(3) = 4 ADD',
    operationalNotation: 'CLIP > (front) SPIN [BOD] > SAME IN [PDX] [DEX] > OP TOE [DEL]',  // Sibling-derivation from spinning-paradox-mirage with the inspinning direction-flip rule established by FB.org-confirmed inspinning-butterfly. Not Red-confirmed.
    provenance:  'Deferred-candidate promotion. inspinning = +1 modifier (Red pt7); paradox-mirage = 3 ADD canonical compound in DB. Sibling JOB derivation from spinning-paradox-mirage (CLIP > (back) SPIN [BOD] > OP IN [PDX] [DEX] > OP TOE [DEL]) applying the inspinning direction-flip rule (spin back→front, dex side OP→SAME) established by FB.org-confirmed inspinning-butterfly. fb.org-derived. Not Red-confirmed for this specific compound.',
  },

  // ─── Down-family compound promotions (deferred-candidate
  //     follow-on; Red pt7 settled: "Down pattern" tricks are different
  //     tricks). Three siblings: double-over-down + down-double-down
  //     (distinct toe-set vs clipper-set chassis at 4 ADD); down-diver
  //     (5 ADD = diving(+1) + double-over-down chassis). All three JOBs
  //     FB.org-confirmed verbatim. Diving is a body-modifier per the
  //     freestyleTrickIntuition mobius/osis ontology notes (four-way
  //     ducking/diving/weaving/zulu family).

  {
    slug:        'double_over_down',
    name:        'double-over down',
    operator:    'doubled-dex chassis',
    base:        'double-over-down',
    baseAdd:     4,
    totalAdd:    4,
    derivation:  '[DEX] + [DEX] + [XBD] + [DEL] = 4 ADD (two same-side OUT dexes from toe set ending opposite-leg clipper)',
    operationalNotation: 'TOE > SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]',  // FB.org-confirmed. Toe-set chassis with two same-side OUT dexes.
    provenance:  'Deferred-candidate promotion. Red pt7 ruled "Down pattern" tricks (double-over down / down double-down / down diver) as Different tricks. JOB FB.org-confirmed verbatim ("TOE > SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]"). 4 ADD by canonical bracket convention.',
  },
  {
    slug:        'down_double_down',
    name:        'down double-down',
    operator:    'doubled-dex chassis',
    base:        'down-double-down',
    baseAdd:     4,
    totalAdd:    4,
    derivation:  '[DEX] + [DEX] + [XBD] + [DEL] = 4 ADD (clipper-set entry: OP/SAME dex alternation between two same-side clippers)',
    operationalNotation: 'CLIP > OP OUT [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]',  // FB.org-confirmed. Clipper-set entry with alternating OP/SAME OUT dexes.
    provenance:  'Deferred-candidate promotion. Red pt7 ruled "Down pattern" tricks as Different tricks. JOB FB.org-confirmed verbatim ("CLIP > OP OUT [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]"). Distinct chassis from double-over-down (clipper-set entry vs toe-set entry, OP/SAME alternation vs SAME/SAME). 4 ADD by canonical bracket convention.',
  },
  {
    slug:        'down_diver',
    name:        'down diver',
    operator:    'diving',
    base:        'double-over-down',
    baseAdd:     4,
    totalAdd:    5,
    derivation:  'diving(+1) + double-over-down(4) = 5 ADD ([BOD] + [DEX] + [DEX] + [XBD] + [DEL])',
    operationalNotation: 'TOE > DIVE [BOD] > SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]',  // FB.org-confirmed. Diving modifier on double-over-down chassis (TOE-set, SAME/SAME dexes, NOT down-double-down despite the "Diving Down Double-Down" alias).
    provenance:  'Deferred-candidate promotion. JOB FB.org-confirmed verbatim. FB.org alias "Diving Down Double-Down" preserved on row. Note: RECONCILIATION formula reads "diving(+1) + down-double-down(4)" but the actual FB.org JOB chassis matches double-over-down (TOE start, SAME OUT/SAME OUT), not down-double-down (CLIP start, OP/SAME alternation). Following JOB evidence as authoritative.',
  },

  // ─── Paradox-family compound promotions (deferred-candidate
  //     follow-on). Two compounds, both FB.org-confirmed JOBs.
  //     Standard paradox-prefix pattern: the base's leading dex is replaced
  //     by SAME IN [PDX] [DEX] (adds the [PDX] component flag for the +1
  //     ADD). Most paradox-* compounds already in DB; these two are the
  //     remaining promotable candidates from the audit.

  {
    slug:        'paradox_da_da_curve',
    name:        'paradox da-da curve',
    operator:    'paradox',
    base:        'dada-curve',
    baseAdd:     4,
    totalAdd:    5,
    derivation:  'paradox(+1) + dada-curve(4) = 5 ADD ([PDX] + [DEX] + [DEX] + [XBD] + [DEL])',
    operationalNotation: 'CLIP > SAME IN [PDX] [DEX] > (NO PLANT WHILE) OP OUT [DEX] > OP CLIP [XBD] [DEL]',  // FB.org-confirmed. Paradox prefix on dada-curve no-plant-while chassis.
    provenance:  'Deferred-candidate promotion. paradox = +1 PDX modifier (Red-settled canonical inventory); dada-curve = 4 ADD canonical compound in DB. JOB FB.org-confirmed verbatim. Standard paradox-prefix pattern: SAME IN [PDX] [DEX] replaces the base\'s leading OP IN [DEX].',
  },
  {
    slug:        'paradox_whirling_swirl',
    name:        'paradox whirling swirl',
    operator:    'paradox',
    base:        'whirling-swirl',
    baseAdd:     4,
    totalAdd:    5,
    derivation:  'paradox(+1) + whirling-swirl(4) = 5 ADD ([PDX] + [DEX] + [DEX] + [XBD] + [DEL])',
    operationalNotation: 'CLIP > SAME IN [PDX] [DEX] > OP BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]',  // FB.org-confirmed. Paradox prefix on whirling-swirl chassis (preserves OP BACK SWIRL second dex + SAME CLIP terminal).
    provenance:  'Deferred-candidate promotion. paradox = +1 PDX modifier (Red-settled canonical inventory); whirling-swirl = 4 ADD canonical compound in DB. JOB FB.org-confirmed verbatim. Standard paradox-prefix pattern: SAME IN [PDX] [DEX] replaces the base\'s leading OP IN [DEX]; OP BACK SWIRL second dex + SAME CLIP terminator unchanged.',
  },

  // ─── Symposium-pixie promotion (deferred-candidate follow-on).
  //     No FB.org-published JOB for this specific compound. Sibling-derived
  //     using the symposium-prefix pattern (BOD fuses with first dex via
  //     "(no plant while) <side> <direction> [BOD] [DEX]") applied to
  //     pixie's base JOB. Verified against pixie-symposium-mirage in DB
  //     (4 ADD: pixie(+1) + symposium(+1) + mirage(2) carries the same
  //     symposium [BOD]+[DEX] fusion pattern).

  {
    slug:        'symposium_pixie',
    name:        'symposium pixie',
    operator:    'symposium',
    base:        'pixie',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'symposium(+1) + pixie(2) = 3 ADD ([BOD] + [DEX] + [DEL])',
    operationalNotation: 'TOE > (no plant while) SAME IN [BOD] [DEX] > OP TOE [DEL]',  // Sibling-derived from symposium-prefix pattern applied to pixie base. Not Red-confirmed.
    provenance:  'Deferred-candidate promotion. symposium = +1 no-plant body modifier (Red-settled canonical inventory); pixie = 2 ADD set primitive in DB. JOB sibling-derived: symposium prefix wraps pixie\'s first dex with "(no plant while) [BOD]" fused on the SAME IN [DEX]. Verified against pixie-symposium-mirage in DB which carries the same symposium [BOD]+[DEX] fusion structure. Not Red-confirmed for this specific compound.',
  },

  // ─── Ricochet promotion (deferred-candidate follow-on).
  //     Two out-to-in dexterities from a toe set ending on a cross-body
  //     sole (flapper) delay. FB.org-confirmed JOB.
  //     Base is cross-body-sole-stall (folk-name = flapper / flapper-stall;
  //     aliases already registered in DB). [UNS] flag counts +1 ADD per
  //     canonical bracket convention; the cross-body-sole-stall DB row
  //     uses descriptive op_notation ([set] > sole [xbd]) while ricochet's
  //     JOB expands to canonical-bracket form with the explicit [UNS] tag.

  {
    slug:        'ricochet',
    name:        'ricochet',
    operator:    'doubled-dex chassis',
    base:        'cross-body-sole-stall',
    baseAdd:     3,
    totalAdd:    5,
    derivation:  '[DEX] + [DEX] + [XBD] + [UNS] + [DEL] = 5 ADD (two same-direction OUT dexes from toe set ending opposite-side sole/flapper)',
    operationalNotation: 'TOE > OP OUT [DEX] > SAME OUT [DEX] > OP SOLE [XBD] [UNS] [DEL]',  // FB.org-confirmed. Cross-body sole (flapper) terminator carries [XBD] [UNS] [DEL] = 3 ADD.
    provenance:  'Deferred-candidate promotion. JOB FB.org-confirmed verbatim. Base is cross-body-sole-stall (DB canonical, 3 ADD; folk-name = flapper / flapper-stall; aliases already wired). The cross-body-sole-stall row uses descriptive op_notation ([set] > sole [xbd]) while ricochet expands the terminator to canonical-bracket form ([XBD] [UNS] [DEL]) — same structure, different representational convention.',
  },

  // ─── Flurricane promotion (deferred-candidate follow-on).
  //     Gyro(+1) modifier on flurry(4) base = 5 ADD. FB.org-confirmed JOB.
  //     Standard gyro-prefix pattern:
  //     (back) SPIN [BOD] prepended; first dex shifts from OP IN to
  //     SAME IN (matches gyro-* sibling pattern in DB). FB.org publishes
  //     a TOE-set variant too; CLIP-set form used as primary per fb.org
  //     listing order. FB.org alias "Gyro Flurry" preserved on row.

  {
    slug:        'flurricane',
    name:        'flurricane',
    operator:    'gyro',
    base:        'flurry',
    baseAdd:     4,
    totalAdd:    5,
    derivation:  'gyro(+1) + flurry(4) = 5 ADD ([BOD] + [DEX] + [DEX] + [DEX] + [DEL])',
    operationalNotation: 'CLIP > (back) SPIN [BOD] > SAME IN [DEX] > SAME IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]',  // FB.org-confirmed. CLIP-set primary form (TOE-set variant also published).
    provenance:  'Deferred-candidate promotion. gyro = +1 spinning-style body modifier (Red-settled via gyro-* siblings in DB: gyro-mirage, gyro-illusion, gyro-whirl, gyro-butterfly all canonical with (back) SPIN [BOD] prefix); flurry = 4 ADD canonical compound in DB. JOB FB.org-confirmed verbatim. FB.org alias "Gyro Flurry" wired via aliases column. FB.org also publishes a TOE-set variant (TOE > (back) SPIN [BOD] > OP IN [DEX] > SAME IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]); CLIP-set form used as primary per fb.org listing order.',
  },

  // ─── Pixie-swirl promotion (deferred-candidate follow-on).
  //     Pixie(+1) + swirl(3) = 4 ADD. FB.org-confirmed JOB. Standard
  //     pixie-prefix pattern: SAME IN [DEX]
  //     prepended to swirl base. fb.org preserves SAME/OP variant on the
  //     BACK SWIRL second dex (player choice).

  {
    slug:        'pixie_swirl',
    name:        'pixie swirl',
    operator:    'pixie',
    base:        'swirl',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'pixie(+1) + swirl(3) = 4 ADD ([DEX] + [DEX] + [XBD] + [DEL])',
    operationalNotation: 'TOE > SAME IN [DEX] > SAME/OP BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]',  // FB.org-confirmed. SAME/OP variant on BACK SWIRL preserved verbatim per fb.org.
    provenance:  'Deferred-candidate promotion. pixie = +1 PDX modifier (Red pt12 settled); swirl = 3 ADD core atom in DB. JOB FB.org-confirmed verbatim. Pixie prefix adds SAME IN [DEX] before swirl base; fb.org preserves SAME/OP variant on the BACK SWIRL second dex (player choice).',
  },

  // ─── Down-family follow-ons + flux (deferred-candidate
  //     follow-on). Two modifier-stacked extensions on the down-family
  //     base (just shipped) + flux as a simple atomic-osis compound.
  //     All three JOBs FB.org-confirmed verbatim.

  {
    slug:        'pixie_double_over_down',
    name:        'pixie double-over down',
    operator:    'pixie',
    base:        'double-over-down',
    baseAdd:     4,
    totalAdd:    5,
    derivation:  'pixie(+1) + double-over-down(4) = 5 ADD ([DEX] + [DEX] + [DEX] + [XBD] + [DEL])',
    operationalNotation: 'TOE > SAME IN [DEX] (plant) > SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]',  // FB.org-confirmed. Pixie prefix carries unusual (plant) pre-state between first dex and the double-over-down chassis.
    provenance:  'Deferred-candidate promotion. pixie = +1 PDX modifier (Red pt12 settled); double-over-down = 4 ADD canonical compound in DB. JOB FB.org-confirmed verbatim. The (plant) pre-state flag between the pixie dex and the doubled-out dex pair is curator-locked per fb.org source.',
  },
  {
    slug:        'scorpions_tail',
    name:        "Scorpion's Tail",
    operator:    'spinning',
    base:        'down-double-down',
    baseAdd:     4,
    totalAdd:    5,
    derivation:  'spinning(+1) + down-double-down(4) = 5 ADD ([BOD] + [DEX] + [DEX] + [XBD] + [DEL])',
    operationalNotation: 'CLIP > (back) SPIN [bod] > OP OUT [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]',  // FB.org-confirmed. lowercase [bod] preserved verbatim per fb.org source.
    provenance:  'Deferred-candidate promotion. spinning = +1 midtime body modifier (Red-settled canonical inventory; many spinning-* siblings in DB); down-double-down = 4 ADD canonical compound in DB. JOB FB.org-confirmed verbatim. FB.org alias "Spinning Down Double-Down" wired via aliases column. Note: fb.org uses lowercase [bod] for the SPIN tag (most siblings use uppercase [BOD]); the source form preserved as-is.',
  },
  {
    slug:        'flux',
    name:        'flux',
    operator:    'atomic',
    base:        'osis',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'atomic(+1) + osis(3) = 4 ADD ([DEX] + [BOD] + [XBD] + [DEL])',
    operationalNotation: 'TOE > OP OUT [DEX] > (FRONT) SPIN [BOD] > OP CLIP [XBD] [DEL]',  // FB.org-confirmed. Atomic prefix manifests as (FRONT) SPIN [BOD] mid-trick rather than at the front.
    provenance:  'Deferred-candidate promotion. atomic = +1 set modifier (Red-settled canonical inventory); osis = 3 ADD core atom in DB. JOB FB.org-confirmed verbatim. FB.org alias "Atomic Osis" wired via aliases column.',
  },

  // ─── Double-over-down-swirl promotion (extends just-shipped
  //     double-over-down chassis with a back-swirl third dex). FB.org-confirmed
  //     JOB. Atom-level: 3 [DEX] tokens + cross-body clipper terminator.

  {
    slug:        'double_over_down_swirl',
    name:        'double-over down swirl',
    operator:    'tripled-dex chassis',
    base:        'double-over-down',
    baseAdd:     4,
    totalAdd:    5,
    derivation:  'double-over-down(4) + back-swirl dex(1) = 5 ADD ([DEX] + [DEX] + [DEX] + [XBD] + [DEL])',
    operationalNotation: 'TOE > SAME OUT [DEX] > SAME OUT [DEX] > OP BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]',  // FB.org-confirmed. Extends double-over-down with OP BACK SWIRL third dex; terminator swaps OP CLIP → SAME CLIP.
    provenance:  'Deferred-candidate promotion. Extension of double-over-down (4 ADD canonical compound in DB). JOB FB.org-confirmed verbatim. The two SAME OUT dex pair from double-over-down is preserved; third dex is an OP BACK SWIRL (rotation-variant fused token); terminator swaps from OP CLIP to SAME CLIP per fb.org source.',
  },

  // ─── Quantum-symposium-mirage promotion (with backside-symposium-
  //     toe-blur folk-name as alias). Per Red pt2 'toe X → quantum X' retirement
  //     ruling, the modern canonical name is quantum-symposium-mirage (sibling
  //     to quantum-mirage / quantum-illusion / quantum-butterfly already in DB).
  //     The folk-name 'backside symposium toe blur' is wired as a pure S3 alias.

  {
    slug:        'quantum_symposium_mirage',
    name:        'quantum symposium mirage',
    operator:    'quantum + symposium',
    base:        'mirage',
    baseAdd:     2,
    totalAdd:    4,
    derivation:  'quantum(+1) + symposium-mirage(3) = 4 ADD ([DEX] + [BOD] + [DEX] + [DEL])',
    operationalNotation: 'TOE > OP IN [DEX] > (no plant while) OP IN [BOD] [DEX] > OP TOE [DEL]',  // FB.org-confirmed. Quantum prefix = OP IN [DEX]; symposium prefix = (no plant while) [BOD] fused with the dex.
    provenance:  'Deferred-candidate promotion. quantum = +1 set modifier (Red pt2 retired the toe- prefix in favor of quantum-; siblings quantum-mirage / quantum-illusion / quantum-butterfly all canonical in DB). symposium = +1 no-plant body modifier (canonical inventory). JOB FB.org-confirmed verbatim. Folk-name alias "Backside Symposium Toe Blur" wired (the "toe" prefix is the pre-Quantum folk-name retired by Red pt2).',
  },

  // ─── Avalanche + spike-hammer (deferred-candidate follow-on).
  //     Structural twins: both 5 ADD, identical 3-operator modifier stack
  //     (stepping + ducking + paradox-X), differ only in the base atom
  //     (illusion vs mirage). The JOB difference is the dex direction
  //     after DUCK [BOD]: OP OUT [PDX] [DEX] for illusion (avalanche),
  //     OP IN [PDX] [DEX] for mirage (spike-hammer). Both folk-names
  //     compress a 3-operator-stack reading into a single word, a
  //     textbook example of the glossary §composition "Structural
  //     compression" doctrine. FB.org-confirmed verbatim.

  {
    slug:        'avalanche',
    name:        'avalanche',
    operator:    'stepping + ducking',
    base:        'paradox-illusion',
    baseAdd:     3,
    totalAdd:    5,
    derivation:  'stepping(+1) + ducking(+1) + paradox-illusion(3) = 5 ADD ([DEX] + [BOD] + [PDX] + [DEX] + [DEL])',
    operationalNotation: 'CLIP > OP IN [DEX] > DUCK [BOD] > OP OUT [PDX] [DEX] > OP TOE [DEL]',  // FB.org-confirmed. 3-operator-stack compression of stepping ducking paradox illusion.
    provenance:  'Deferred-candidate promotion. Folk-name compression of stepping + ducking + paradox-illusion (a 3-operator-stack reading). stepping = +1 dex-prepending modifier; ducking = +1 midtime body modifier; paradox-illusion = 3 ADD canonical compound in DB. JOB FB.org-confirmed verbatim. FB.org alias "Stepping Ducking Paradox Illusion" wired. Structural twin of spike-hammer: same modifier stack, mirage base instead of illusion (dex direction OP OUT vs OP IN).',
  },
  {
    slug:        'spike_hammer',
    name:        'spike hammer',
    operator:    'stepping + ducking',
    base:        'paradox-mirage',
    baseAdd:     3,
    totalAdd:    5,
    derivation:  'stepping(+1) + ducking(+1) + paradox-mirage(3) = 5 ADD ([DEX] + [BOD] + [PDX] + [DEX] + [DEL])',
    operationalNotation: 'CLIP > OP IN [DEX] > DUCK [BOD] > OP IN [PDX] [DEX] > OP TOE [DEL]',  // FB.org-confirmed. 3-operator-stack compression of stepping ducking paradox mirage.
    provenance:  'Deferred-candidate promotion. Folk-name compression of stepping + ducking + paradox-mirage (a 3-operator-stack reading). stepping = +1 dex-prepending modifier; ducking = +1 midtime body modifier; paradox-mirage = 3 ADD canonical compound in DB. JOB FB.org-confirmed verbatim. FB.org alias "Stepping Ducking Paradox Mirage" wired. Structural twin of avalanche: same modifier stack, illusion base swapped for mirage (dex direction OP IN vs OP OUT).',
  },

  // ── FootbagMoves single-source 8-ADD promotions (torque family). Operators
  //    all defined, math closes at 8, torque base canonical. FM is the sole
  //    source so the structure is uncorroborated and the notation is
  //    sibling-composed (not curator-confirmed); promoted under the
  //    arithmetic-closes policy with honest single-source provenance.
  {
    slug:        'surging_ducking_paradox_torque',
    name:        'surging ducking paradox torque',
    operator:    'surging + ducking + paradox',
    base:        'torque',
    baseAdd:     4,
    totalAdd:    8,
    derivation:  'surging(2) + ducking(1) + paradox(1) + torque(4) = 8 ADD ([BOD] + [PDX] + [DEX] + [BOD] + [DEX] + [BOD] + [XBD] + [DEL])',
    operationalNotation: 'CLIP > (back) SPIN [BOD] > OP IN [PDX] [DEX] > DUCK [BOD] > OP IN [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]',  // sibling-composed from stepping-ducking-torque + a spinning prefix + paradox on the stepping dex; bracket count 8 matches ADD; not curator-confirmed.
    provenance:  'FootbagMoves single-source 8-ADD promotion. surging decomposes to spinning + stepping; ducking is a settled +1 body modifier and paradox a settled +1 dex relationship; torque is a 4-ADD canonical (miraging osis). All operators defined, ADD closes at 8, torque family. FootbagMoves is the only source, so the structure is uncorroborated; promoted under the arithmetic-closes policy with honest single-source provenance. Notation sibling-composed; not curator-confirmed.',
  },
  {
    slug:        'big_apple_sauce',
    name:        'big apple sauce',
    operator:    'spinning + paradox + miraging + symposium',
    base:        'torque',
    baseAdd:     4,
    totalAdd:    8,
    derivation:  'spinning(1) + paradox(1) + miraging(1) + symposium(1) + torque(4) = 8 ADD ([BOD] + [PDX] + [BOD] + [DEX] + [DEX] + [BOD] + [XBD] + [DEL])',
    operationalNotation: 'CLIP > (back) SPIN [BOD] > (no plant while) OP IN [PDX] [BOD] [DEX] > OP IN [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]',  // sibling-composed from spinning-ducking-paradox-symposium-whirl (paradox + symposium on a no-plant dex) + torque terminal; bracket count 8 matches ADD; not curator-confirmed.
    provenance:  'FootbagMoves promotion. Folk name big-apple-sauce; technical reading Spinning Paradox Miraging Symposium Torque. Structural ADD 8 (spinning + paradox + miraging + symposium on torque). FootbagMoves lists 9; published at the structural 8 with the FM-9 over-count recorded as a single-source divergence, consistent with the frequency-is-not-authority and outlier precedent. All operators defined; torque family. FootbagMoves is the only source; structure uncorroborated. Notation sibling-composed; not curator-confirmed.',
  },

  // ── FootbagMoves single-source 7-ADD promotions (ready-now batch). Operators
  //    all defined, math closes, base atoms canonical; FM is the sole source so
  //    structure is uncorroborated and notation sibling-composed (not
  //    curator-confirmed). redwetter publishes at structural 6 with FM-7 as a
  //    documented divergence (big-apple-sauce precedent).
  {
    slug:        'margaritaville',
    name:        'margaritaville',
    operator:    'surging + paradox',
    base:        'blender',
    baseAdd:     4,
    totalAdd:    7,
    derivation:  'surging(2) + paradox(1) + blender(4) = 7 ADD ([BOD] + [DEX] + [PDX] + [DEX] + [BOD] + [XBD] + [DEL])',
    operationalNotation: 'CLIP > (back) SPIN [BOD] > OP IN [DEX] > OP IN [PDX] [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]',  // sibling-composed from spinning-ducking-paradox-blender (ducking -> stepping); bracket count 7 matches ADD; not curator-confirmed.
    provenance:  'FootbagMoves single-source 7-ADD promotion (folk name margaritaville; technical reading Surging Paradox Blender). surging decomposes to spinning + stepping; paradox is a settled +1; blender is a 4-ADD canonical (whirling osis). All operators defined, ADD closes at 7, blender family. FootbagMoves is the only source; structure uncorroborated. Notation sibling-composed; not curator-confirmed.',
  },
  {
    slug:        'swirlwind',
    name:        'swirlwind',
    operator:    'spinning + paradox + symposium + whirling',
    base:        'swirl',
    baseAdd:     3,
    totalAdd:    7,
    derivation:  'spinning(1) + paradox(1) + symposium(1) + whirling(1) + swirl(3) = 7 ADD',
    operationalNotation: 'CLIP > (back) SPIN [BOD] > (no plant while) OP IN [PDX] [BOD] [DEX] > OP BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]',  // sibling-composed from whirling-swirl + the spinning-ducking-paradox-symposium-whirl no-plant-dex pattern; bracket count 7 matches ADD; not curator-confirmed.
    provenance:  'FootbagMoves single-source 7-ADD promotion (folk name swirlwind; technical reading Spinning Paradox Symposium Whirling Swirl). All operators defined (spinning, paradox, symposium, whirling on a 3-ADD swirl atom), ADD closes at 7, swirl family. FootbagMoves is the only source; structure uncorroborated. Notation sibling-composed; not curator-confirmed.',
  },
  {
    slug:        'genuphobia',
    name:        'genuphobia',
    operator:    'fairy + spyro + symposium',
    base:        'torque',
    baseAdd:     4,
    totalAdd:    7,
    derivation:  'fairy(1) + spyro(1) + symposium(1) + torque(4) = 7 ADD',
    operationalNotation: 'TOE > SAME OUT [DEX] > (front) SPIN [BOD] > (no plant while) OP IN [BOD] [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]',  // sibling-composed: fairy entry dex + spyro spin + symposium no-plant dex on a torque chassis; bracket count 7 matches ADD; not curator-confirmed.
    provenance:  'FootbagMoves single-source 7-ADD promotion (folk name genuphobia; technical reading Fairy Spyro Symposium Torque). fairy is a +1 entry-side set; spyro is a 1-ADD body spin; symposium is a +1 no-plant modifier; torque is a 4-ADD canonical. ADD closes at 7, torque family. FootbagMoves is the only source; structure uncorroborated. Notation sibling-composed; not curator-confirmed.',
  },
  {
    slug:        'redwetter',
    name:        'redwetter',
    operator:    'shooting',
    base:        'eggbeater',
    baseAdd:     3,
    totalAdd:    6,
    derivation:  'shooting(3) + eggbeater(3) = 6 ADD',
    operationalNotation: '(shooting set) >> TOE >> OP OUT [DEX] > OP OUT [DEX] > SAME TOE [DEL]',  // eggbeater chassis from DB; the (shooting set) shorthand resolves to the documented Shooting Set Encyclopedia entry (stepping paradox illusion, +3).
    expandedNotation: 'CLIP > OP IN [DEX] > OP OUT [PDX] [DEX] > OP OUT [DEX] > OP OUT [DEX] > SAME TOE [DEL]',  // shooting set spelled out (stepping paradox illusion) merged into the eggbeater chassis; bracket count 6 matches ADD.
    provenance:  'FootbagMoves promotion (folk name redwetter; technical reading Shooting Eggbeater). Structural ADD 6 (shooting +3 set on a 3-ADD eggbeater). FootbagMoves lists 7; published at the structural 6 with the FM-7 over-count recorded as a single-source divergence (big-apple-sauce precedent). eggbeater family. FootbagMoves is the only source for the redwetter name. The shooting set prefix resolves to the documented Shooting Set Encyclopedia entry (stepping paradox illusion).',
  },

  // ── FootbagMoves operator-cleared promotions. big-papa-smurf closes cleanly
  //    at 7. The furious and railing cohorts publish at STRUCTURAL value with
  //    the FM over-count recorded as a documented divergence (the furious/
  //    railing publish-at-structural policy; platform furious=2, railing=2).
  //    Set-prefix JOB tokenization (surfing/furious/railing) is pending; the
  //    structural decomposition and ADD are confirmed.
  {
    slug:        'big_papa_smurf',
    name:        'big papa smurf',
    operator:    'surfing',
    base:        'blender',
    baseAdd:     4,
    totalAdd:    7,
    derivation:  'surfing(3) + blender(4) = 7 ADD',
    operationalNotation: 'TOE > SAME OUT [DEX] > (no plant while) OP IN [BOD] > OP BACK SWIRL [DEX] > OP IN [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]',  // surfing set (fairy entry + no-plant symposium + swirling dex) on the blender chassis; bracket count 7 matches ADD; not curator-confirmed.
    provenance:  'FootbagMoves single-source 7-ADD promotion. surfing resolves to fairy + symposium + swirling (a +3 set); blender is a 4-ADD canonical. ADD closes at 7, blender family, no divergence. FootbagMoves is the only source; notation sibling-composed; not curator-confirmed.',
  },
  {
    slug:        'clown_face',
    name:        'clown face',
    operator:    'furious',
    base:        'eggbeater',
    baseAdd:     3,
    totalAdd:    5,
    derivation:  'furious(2) + eggbeater(3) = 5 ADD',
    operationalNotation: '(furious set) >> TOE >> OP OUT [DEX] > OP OUT [DEX] > SAME TOE [DEL]',  // eggbeater chassis from DB; furious +2 set prefix shown as a marker, tokenization pending; not curator-confirmed.
    provenance:  'FootbagMoves promotion at structural ADD 5 (furious +2 set on a 3-ADD eggbeater). FootbagMoves lists 7; published at the structural 5 with the FM-7 over-count recorded as a documented divergence (the furious-cohort operator-weight divergence; platform furious=2 is anchored by Fury=5). eggbeater family. The furious set-prefix JOB tokenization is pending; not curator-confirmed.',
  },
  {
    slug:        'genesis',
    name:        'genesis',
    operator:    'furious',
    base:        'whirl',
    baseAdd:     3,
    totalAdd:    5,
    derivation:  'furious(2) + whirl(3) = 5 ADD',
    operationalNotation: '(furious set) >> SET > OP IN [DEX] > OP CLIP [XBD] [DEL]',  // whirl chassis from DB; furious +2 set prefix marker, tokenization pending; not curator-confirmed.
    provenance:  'FootbagMoves promotion at structural ADD 5 (furious +2 set on a 3-ADD whirl). FootbagMoves lists 7; published at 5 with FM-7 as a documented furious-cohort divergence. whirl family. Furious set-prefix JOB pending; not curator-confirmed.',
  },
  {
    slug:        'rage',
    name:        'rage',
    operator:    'furious + symposium',
    base:        'mirage',
    baseAdd:     2,
    totalAdd:    5,
    derivation:  'furious(2) + symposium(1) + mirage(2) = 5 ADD',
    operationalNotation: '(furious set) >> SET > (no plant while) OP IN [BOD] [DEX] > OP TOE [DEL]',  // mirage chassis with a no-plant symposium dex; furious +2 set prefix marker, tokenization pending; not curator-confirmed.
    provenance:  'FootbagMoves promotion at structural ADD 5 (furious +2 set + symposium on a 2-ADD mirage). FootbagMoves lists 7; published at 5 with FM-7 as a documented furious-cohort divergence. mirage family. Furious set-prefix JOB pending; not curator-confirmed.',
  },
  {
    slug:        'nebula',
    name:        'nebula',
    operator:    'furious',
    base:        'double-leg-over',
    baseAdd:     3,
    totalAdd:    5,
    derivation:  'furious(2) + double-leg-over(3) = 5 ADD',
    operationalNotation: '(furious set) >> SET > OP IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]',  // double-leg-over chassis from DB; furious +2 set prefix marker, tokenization pending; not curator-confirmed.
    provenance:  'FootbagMoves promotion at structural ADD 5 (furious +2 set on a 3-ADD double-leg-over). FootbagMoves lists 7; published at 5 with FM-7 as a documented furious-cohort divergence. double-leg-over family. Furious set-prefix JOB pending; not curator-confirmed.',
  },
  {
    slug:        'dorshanatrix',
    name:        'dorshanatrix',
    operator:    'railing + symposium',
    base:        'mirage',
    baseAdd:     2,
    totalAdd:    5,
    derivation:  'railing(2) + symposium(1) + mirage(2) = 5 ADD',
    operationalNotation: '(railing set) >> SET > (no plant while) OP IN [BOD] [DEX] > OP TOE [DEL]',  // mirage chassis with a no-plant symposium dex; the (railing set) shorthand resolves to the documented Railing Set Encyclopedia entry (rooted + sailing, +2).
    expandedNotation: 'TOE > SAME IN [DEX] > OP OUT [DEX] (rooted) > (no plant while) OP IN [BOD] [DEX] > OP TOE [DEL]',  // railing set spelled out (rooted sailing) merged into the symposium-mirage chassis; bracket count 5 matches ADD.
    provenance:  'FootbagMoves promotion at structural ADD 5 (railing +2 set + symposium on a 2-ADD mirage). railing = rooted(0) + sailing(2). FootbagMoves lists 7; published at 5 with FM-7 as a documented railing-cohort divergence (the railing twin of the furious operator-weight divergence). mirage family. The railing set prefix resolves to the documented Railing Set Encyclopedia entry (rooted + sailing).',
  },
  {
    slug:        'flying_fish',
    name:        'flying fish',
    operator:    'railing + ducking',
    base:        'mirage',
    baseAdd:     2,
    totalAdd:    5,
    derivation:  'railing(2) + ducking(1) + mirage(2) = 5 ADD',
    operationalNotation: '(railing set) >> CLIP > DUCK [BOD] > OP IN [DEX] > OP TOE [DEL]',  // mirage chassis with a ducking body; the (railing set) shorthand resolves to the documented Railing Set Encyclopedia entry (rooted + sailing, +2).
    expandedNotation: 'TOE > SAME IN [DEX] > OP OUT [DEX] (rooted) > DUCK [BOD] > OP IN [DEX] > OP TOE [DEL]',  // railing set spelled out (rooted sailing) merged into the ducking-mirage chassis; bracket count 5 matches ADD.
    provenance:  'FootbagMoves promotion at structural ADD 5 (railing +2 set + ducking on a 2-ADD mirage). FootbagMoves lists 7; published at 5 with FM-7 as a documented railing-cohort divergence. mirage family. The railing set prefix resolves to the documented Railing Set Encyclopedia entry (rooted + sailing).',
  },
  {
    slug:        'rail_warrior',
    name:        'rail warrior',
    operator:    'railing + ducking',
    base:        'butterfly',
    baseAdd:     3,
    totalAdd:    6,
    derivation:  'railing(2) + ducking(1) + butterfly(3) = 6 ADD',
    operationalNotation: '(railing set) >> CLIP > DUCK [BOD] > OP OUT [DEX] > OP CLIP [XBD] [DEL]',  // butterfly chassis with a ducking body; the (railing set) shorthand resolves to the documented Railing Set Encyclopedia entry (rooted + sailing, +2).
    expandedNotation: 'TOE > SAME IN [DEX] > OP OUT [DEX] (rooted) > DUCK [BOD] > OP OUT [DEX] > OP CLIP [XBD] [DEL]',  // railing set spelled out (rooted sailing) merged into the ducking-butterfly chassis; bracket count 6 matches ADD.
    provenance:  'FootbagMoves promotion at structural ADD 6 (railing +2 set + ducking on a 3-ADD butterfly). FootbagMoves lists 7; published at 6 with FM-7 as a documented railing-cohort divergence. butterfly family. The railing set prefix resolves to the documented Railing Set Encyclopedia entry (rooted + sailing).',
  },

  // ── FootbagMoves recheck-cleared promotions. liquifier is a clean +1
  //    divergence (splicing = gyro + reving). bill-ted dedupes a redundant
  //    symposium (flailing already contains it). oh-wheely takes nuclear at its
  //    base weight because the X-Dex does not fire on a legover base.
  {
    slug:        'liquifier',
    name:        'liquifier',
    operator:    'splicing',
    base:        'blender',
    baseAdd:     4,
    totalAdd:    6,
    derivation:  'splicing(2) + blender(4) = 6 ADD',
    operationalNotation: 'CLIP > (back) SPIN [BOD] > OP OUT [DEX] > OP IN [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]',  // splicing = gyro spin + reving reverse dex on the blender chassis; bracket count 6 matches ADD; not curator-confirmed.
    provenance:  'FootbagMoves promotion at structural ADD 6. splicing resolves to gyro + reving (= reverse whirling), a +2 set; blender is a 4-ADD canonical. FootbagMoves lists 7; published at 6 with the +1 over-count as a documented single-source divergence (redwetter precedent). blender family. Notation sibling-composed; not curator-confirmed.',
  },
  {
    slug:        'floatation',
    name:        'floatation',
    operator:    'floating',
    base:        'butterfly',
    baseAdd:     3,
    totalAdd:    6,
    derivation:  'floating(3) + butterfly(3) = 6 ADD',
    operationalNotation: '(floating set) >> SET > OP OUT [DEX] > OP CLIP [XBD] [DEL]',  // butterfly chassis; the (floating set) shorthand resolves to the documented Floating Set Encyclopedia entry (quantum symposium quantum, +3).
    provenance:  'FootbagMoves promotion at structural ADD 6 (floating +3 set on a 3-ADD butterfly). floating resolves to quantum + symposium + quantum, curator-ruled at 3 ADD. FootbagMoves lists 7; published at 6 with the FM-7 over-count recorded as a single-source divergence. butterfly family. Notation sibling-composed; not curator-confirmed.',
  },
  {
    slug:        'warp',
    name:        'warp',
    operator:    'warping',
    base:        'mirage',
    baseAdd:     2,
    totalAdd:    5,
    derivation:  'warping(3) + mirage(2) = 5 ADD',
    operationalNotation: '(warping set) >> SET > OP IN [DEX] > OP TOE [DEL]',  // downtime-mirage chassis; the (warping set) shorthand resolves to the documented Warping Set Encyclopedia entry (two dexes, second symposium, +3).
    provenance:  'FootbagMoves promotion at structural ADD 5 (warping +3 set on a 2-ADD downtime mirage). warping is a two-dex set whose second dex is a symposium, curator-ruled at 3 ADD. FootbagMoves lists 7; published at 5 with the FM-7 over-count recorded as a single-source divergence. mirage family. Notation sibling-composed; not curator-confirmed.',
  },
  {
    slug:        'stepping_mirage',
    name:        'stepping mirage',
    operator:    'stepping',
    base:        'mirage',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'stepping(+1) + mirage = 3 ADD',
    operationalNotation: 'CLIP > OP IN [DEX] >> OP IN [DEX] > OP TOE [DEL]',  // standard stepping leading-[DEX] chassis; bracket count 3 matches ADD.
    provenance:  'Stepping-chassis promotion. stepping(+1) leading-[DEX] prefix; bracket count 3 matches ADD. Observational (FM/PB).',
  },
  {
    slug:        'stepping_illusion',
    name:        'stepping illusion',
    operator:    'stepping',
    base:        'illusion',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'stepping(+1) + illusion = 3 ADD',
    operationalNotation: 'CLIP > OP IN [DEX] >> OP OUT [DEX] > OP TOE [DEL]',  // standard stepping leading-[DEX] chassis; bracket count 3 matches ADD.
    provenance:  'Stepping-chassis promotion. stepping(+1) leading-[DEX] prefix; bracket count 3 matches ADD. Observational (FM/PB).',
  },
  {
    slug:        'stepping_legover',
    name:        'stepping legover',
    operator:    'stepping',
    base:        'legover',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'stepping(+1) + legover = 3 ADD',
    operationalNotation: 'CLIP > OP IN [DEX] >> OP OUT [DEX] > SAME TOE [DEL]',  // standard stepping leading-[DEX] chassis; bracket count 3 matches ADD.
    provenance:  'Stepping-chassis promotion. stepping(+1) leading-[DEX] prefix; bracket count 3 matches ADD. Observational (FM/PB).',
  },
  {
    slug:        'stepping_butterfly',
    name:        'stepping butterfly',
    operator:    'stepping',
    base:        'butterfly',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'stepping(+1) + butterfly = 4 ADD',
    operationalNotation: 'CLIP > OP IN [DEX] >> SAME OUT [DEX] > OP CLIP [XBD] [DEL]',  // standard stepping leading-[DEX] chassis; bracket count 4 matches ADD.
    provenance:  'Stepping-chassis promotion. stepping(+1) leading-[DEX] prefix; bracket count 4 matches ADD. Observational (FM/PB).',
  },
  {
    slug:        'stepping_blender',
    name:        'stepping blender',
    operator:    'stepping',
    base:        'blender',
    baseAdd:     4,
    totalAdd:    5,
    derivation:  'stepping(+1) + blender = 5 ADD',
    operationalNotation: 'CLIP > OP IN [DEX] >> OP IN [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]',  // standard stepping leading-[DEX] chassis; bracket count 5 matches ADD.
    provenance:  'Stepping-chassis promotion. stepping(+1) leading-[DEX] prefix; bracket count 5 matches ADD. Observational (FM/PB).',
  },
  {
    slug:        'stepping_reaper',
    name:        'stepping reaper',
    operator:    'stepping',
    base:        'reaper',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'stepping(+1) + reaper = 4 ADD',
    operationalNotation: 'CLIP > OP IN [DEX] >> SAME OUT [DEX] > SAME OUT [DEX] > SAME TOE [DEL]',  // standard stepping leading-[DEX] chassis; bracket count 4 matches ADD.
    provenance:  'Stepping-chassis promotion. stepping(+1) leading-[DEX] prefix; bracket count 4 matches ADD. Observational (FB).',
  },
  {
    slug:        'stepping_rev_whirl',
    name:        'stepping rev whirl',
    operator:    'stepping',
    base:        'rev-whirl',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'stepping(+1) + rev-whirl = 4 ADD',
    operationalNotation: 'CLIP > OP IN [DEX] >> OP OUT [DEX] > OP CLIP [XBD] [DEL]',  // standard stepping leading-[DEX] chassis; bracket count 4 matches ADD.
    provenance:  'Stepping-chassis promotion. stepping(+1) leading-[DEX] prefix; bracket count 4 matches ADD. Observational (FB).',
  },
  {
    slug:        'stepping_paradox_torque',
    name:        'stepping paradox torque',
    operator:    'stepping + paradox',
    base:        'torque',
    baseAdd:     4,
    totalAdd:    6,
    derivation:  'stepping(+1) + paradox(+1) + torque = 6 ADD',
    operationalNotation: 'CLIP > OP IN [DEX] >> OP IN [PDX] [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]',  // standard stepping leading-[DEX] chassis; bracket count 6 matches ADD.
    provenance:  'Stepping-chassis promotion. stepping(+1) leading-[DEX] prefix; bracket count 6 matches ADD. Observational (FM).',
  },
  {
    slug:        'stepping_diving_mirage',
    name:        'stepping diving mirage',
    operator:    'stepping + diving',
    base:        'mirage',
    baseAdd:     2,
    totalAdd:    4,
    derivation:  'stepping(+1) + diving(+1) + mirage = 4 ADD',
    operationalNotation: 'CLIP > OP IN [DEX] >> DIVE [BOD] > OP IN [DEX] > OP TOE [DEL]',  // standard stepping leading-[DEX] chassis; bracket count 4 matches ADD.
    provenance:  'Stepping-chassis promotion. stepping(+1) leading-[DEX] prefix; bracket count 4 matches ADD. Observational (SG).',
  },
  {
    slug:        'stepping_diving_butterfly',
    name:        'stepping diving butterfly',
    operator:    'stepping + diving',
    base:        'butterfly',
    baseAdd:     3,
    totalAdd:    5,
    derivation:  'stepping(+1) + diving(+1) + butterfly = 5 ADD',
    operationalNotation: 'CLIP > OP IN [DEX] >> DIVE [BOD] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]',  // standard stepping leading-[DEX] chassis; bracket count 5 matches ADD.
    provenance:  'Stepping-chassis promotion. stepping(+1) leading-[DEX] prefix; bracket count 5 matches ADD. Observational (FM/PB).',
  },
  {
    slug:        'stepping_ducking_drifter',
    name:        'stepping ducking drifter',
    operator:    'stepping + ducking',
    base:        'drifter',
    baseAdd:     3,
    totalAdd:    5,
    derivation:  'stepping(+1) + ducking(+1) + drifter = 5 ADD',
    operationalNotation: 'CLIP > OP IN [DEX] >> DUCK [BOD] > OP IN [DEX] > SAME CLIP [XBD] [DEL]',  // standard stepping leading-[DEX] chassis; bracket count 5 matches ADD.
    provenance:  'Stepping-chassis promotion. stepping(+1) leading-[DEX] prefix; bracket count 5 matches ADD. Observational (PB).',
  },
  {
    slug:        'stepping_ducking_paradox_illusion',
    name:        'stepping ducking paradox illusion',
    operator:    'stepping + ducking + paradox',
    base:        'illusion',
    baseAdd:     2,
    totalAdd:    5,
    derivation:  'stepping(+1) + ducking(+1) + paradox(+1) + illusion = 5 ADD',
    operationalNotation: 'CLIP > OP IN [DEX] >> DUCK [BOD] > OP OUT [PDX] [DEX] > OP TOE [DEL]',  // standard stepping leading-[DEX] chassis; bracket count 5 matches ADD.
    provenance:  'Stepping-chassis promotion. stepping(+1) leading-[DEX] prefix; bracket count 5 matches ADD. Observational (FM).',
  },
  {
    slug:        'stepping_ducking_symposium_eggbeater',
    name:        'stepping ducking symposium eggbeater',
    operator:    'stepping + ducking + symposium',
    base:        'eggbeater',
    baseAdd:     3,
    totalAdd:    6,
    derivation:  'stepping(+1) + ducking(+1) + symposium(+1) + eggbeater = 6 ADD',
    operationalNotation: 'CLIP > OP IN [DEX] >> DUCK [BOD] > (no plant while) OP OUT [BOD] [DEX] > OP OUT [DEX] > SAME TOE [DEL]',  // standard stepping leading-[DEX] chassis; bracket count 6 matches ADD.
    provenance:  'Stepping-chassis promotion. stepping(+1) leading-[DEX] prefix; bracket count 6 matches ADD. Observational (PB).',
  },
  {
    slug:        'spinning_eggbeater',
    name:        'spinning eggbeater',
    operator:    'spinning',
    base:        'eggbeater',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'spinning(+1) + eggbeater(3) = 4 ADD',
    operationalNotation: 'CLIP > (back) SPIN [BOD] > OP OUT [DEX] > OP OUT [DEX] > SAME TOE [DEL]',  // standard spinning back-spin chassis; bracket count 4 matches ADD.
    provenance:  'Spinning-chassis promotion. spinning(+1) back-spin prefix; bracket count 4 matches ADD. Observational (PB).',
  },
  {
    slug:        'spinning_rev_whirl',
    name:        'spinning rev whirl',
    operator:    'spinning',
    base:        'rev-whirl',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'spinning(+1) + rev-whirl(3) = 4 ADD',
    operationalNotation: 'CLIP > (back) SPIN [BOD] > OP OUT [DEX] > OP CLIP [XBD] [DEL]',  // standard spinning back-spin chassis; bracket count 4 matches ADD.
    provenance:  'Spinning-chassis promotion. spinning(+1) back-spin prefix; bracket count 4 matches ADD. Observational (SG).',
  },
  {
    slug:        'spinning_tomahawk',
    name:        'spinning tomahawk',
    operator:    'spinning',
    base:        'tomahawk',
    baseAdd:     5,
    totalAdd:    6,
    derivation:  'spinning(+1) + tomahawk(5) = 6 ADD',
    operationalNotation: 'CLIP > (back) SPIN [BOD] > DUCK [BOD] >> SAME FRONT WHIRL [DEX] [PDX] > OP CLIP [XBD] [DEL]',  // standard spinning back-spin chassis; bracket count 6 matches ADD.
    provenance:  'Spinning-chassis promotion. spinning(+1) back-spin prefix; bracket count 6 matches ADD. Observational (PB).',
  },
  {
    slug:        'spinning_symposium_torque',
    name:        'spinning symposium torque',
    operator:    'spinning',
    base:        'symposium-torque',
    baseAdd:     5,
    totalAdd:    6,
    derivation:  'spinning(+1) + symposium-torque(5) = 6 ADD',
    operationalNotation: 'CLIP > (back) SPIN [BOD] > (no plant while) OP IN [DEX] [BOD] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]',  // standard spinning back-spin chassis; bracket count 6 matches ADD.
    provenance:  'Spinning-chassis promotion. spinning(+1) back-spin prefix; bracket count 6 matches ADD. Observational (PB).',
  },
  {
    slug:        'spinning_whirling_swirl',
    name:        'spinning whirling swirl',
    operator:    'spinning',
    base:        'whirling-swirl',
    baseAdd:     4,
    totalAdd:    5,
    derivation:  'spinning(+1) + whirling-swirl(4) = 5 ADD',
    operationalNotation: 'CLIP > (back) SPIN [BOD] > OP IN [DEX] > OP BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]',  // standard spinning back-spin chassis; bracket count 5 matches ADD.
    provenance:  'Spinning-chassis promotion. spinning(+1) back-spin prefix; bracket count 5 matches ADD. Observational (SG).',
  },
  {
    slug:        'spinning_ducking_drifter',
    name:        'spinning ducking drifter',
    operator:    'spinning',
    base:        'ducking-drifter',
    baseAdd:     4,
    totalAdd:    5,
    derivation:  'spinning(+1) + ducking-drifter(4) = 5 ADD',
    operationalNotation: 'CLIP > (back) SPIN [BOD] > DUCK [BOD] > OP IN [DEX] > SAME CLIP [XBD] [DEL]',  // standard spinning back-spin chassis; bracket count 5 matches ADD.
    provenance:  'Spinning-chassis promotion. spinning(+1) back-spin prefix; bracket count 5 matches ADD. Observational (PB).',
  },
  {
    slug:        'spinning_diving_symposium_whirl',
    name:        'spinning diving symposium whirl',
    operator:    'spinning + diving',
    base:        'symposium-whirl',
    baseAdd:     4,
    totalAdd:    6,
    derivation:  'spinning(+1) + diving(+1) + symposium-whirl(4) = 6 ADD',
    operationalNotation: 'CLIP > (back) SPIN [BOD] > DIVE [BOD] > (no plant while) OP IN [BOD] [DEX] > OP CLIP [XBD] [DEL]',  // standard spinning back-spin chassis; bracket count 6 matches ADD.
    provenance:  'Spinning-chassis promotion. spinning(+1) back-spin prefix; bracket count 6 matches ADD. Observational (PB).',
  },
  {
    slug:        'spinning_ducking_symposium_whirl',
    name:        'spinning ducking symposium whirl',
    operator:    'spinning + ducking',
    base:        'symposium-whirl',
    baseAdd:     4,
    totalAdd:    6,
    derivation:  'spinning(+1) + ducking(+1) + symposium-whirl(4) = 6 ADD',
    operationalNotation: 'CLIP > (back) SPIN [BOD] > DUCK [BOD] > (no plant while) OP IN [BOD] [DEX] > OP CLIP [XBD] [DEL]',  // standard spinning back-spin chassis; bracket count 6 matches ADD.
    provenance:  'Spinning-chassis promotion. spinning(+1) back-spin prefix; bracket count 6 matches ADD. Observational (PB).',
  },
  {
    slug:        'spinning_ducking_superfly',
    name:        'spinning ducking superfly',
    operator:    'spinning + ducking',
    base:        'superfly',
    baseAdd:     5,
    totalAdd:    7,
    derivation:  'spinning(+1) + ducking(+1) + superfly(5) = 7 ADD',
    operationalNotation: 'CLIP > (back) SPIN [BOD] > DUCK [BOD] > (no plant while) SAME OUT [DEX] [BOD] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]',  // standard spinning back-spin chassis; bracket count 7 matches ADD.
    provenance:  'Spinning-chassis promotion. spinning(+1) back-spin prefix; bracket count 7 matches ADD. Observational (PB).',
  },
  {
    slug:        'spinning_symposium_flux',
    name:        'spinning symposium flux',
    operator:    'spinning + symposium',
    base:        'flux',
    baseAdd:     4,
    totalAdd:    6,
    derivation:  'spinning(+1) + symposium(+1) + flux(4) = 6 ADD',
    operationalNotation: 'CLIP > (back) SPIN [BOD] > (no plant while) OP OUT [BOD] [DEX] > (front) SPIN [BOD] > OP CLIP [XBD] [DEL]',  // standard spinning back-spin chassis; bracket count 6 matches ADD.
    provenance:  'Spinning-chassis promotion. spinning(+1) back-spin prefix; bracket count 6 matches ADD. Observational (PB).',
  },
  {
    slug:        'spinning_symposium_whirling_swirl',
    name:        'spinning symposium whirling swirl',
    operator:    'spinning + symposium',
    base:        'whirling-swirl',
    baseAdd:     4,
    totalAdd:    6,
    derivation:  'spinning(+1) + symposium(+1) + whirling-swirl(4) = 6 ADD',
    operationalNotation: 'CLIP > (back) SPIN [BOD] > (no plant while) OP IN [BOD] [DEX] > OP BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]',  // standard spinning back-spin chassis; bracket count 6 matches ADD.
    provenance:  'Spinning-chassis promotion. spinning(+1) back-spin prefix; bracket count 6 matches ADD. Observational (PB).',
  },
  {
    slug:        'spinning_miraging_symposium_torque',
    name:        'spinning miraging symposium torque',
    operator:    'spinning + miraging',
    base:        'symposium-torque',
    baseAdd:     5,
    totalAdd:    7,
    derivation:  'spinning(+1) + miraging(+1) + symposium-torque(5) = 7 ADD',
    operationalNotation: 'CLIP > (back) SPIN [BOD] > OP IN [DEX] > (no plant while) OP IN [DEX] [BOD] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]',  // standard spinning back-spin chassis; bracket count 7 matches ADD.
    provenance:  'Spinning-chassis promotion. spinning(+1) back-spin prefix; bracket count 7 matches ADD. Observational (PB).',
  },
  {
    slug:        'diving_mirage',
    name:        'diving mirage',
    operator:    'diving',
    base:        'mirage',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'diving(+1) + mirage(2) = 3 ADD',
    operationalNotation: 'SET > DIVE [BOD] > OP IN [DEX] > OP TOE [DEL]',  // standard diving DIVE [BOD] chassis; bracket count 3 matches ADD.
    provenance:  'Diving-chassis promotion. diving(+1) DIVE [BOD] insertion; bracket count 3 matches ADD. Observational (PB).',
  },
  {
    slug:        'diving_illusion',
    name:        'diving illusion',
    operator:    'diving',
    base:        'illusion',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'diving(+1) + illusion(2) = 3 ADD',
    operationalNotation: 'SET > DIVE [BOD] > OP OUT [DEX] > OP TOE [DEL]',  // standard diving DIVE [BOD] chassis; bracket count 3 matches ADD.
    provenance:  'Diving-chassis promotion. diving(+1) DIVE [BOD] insertion; bracket count 3 matches ADD. Observational (SG).',
  },
  {
    slug:        'diving_legover',
    name:        'diving legover',
    operator:    'diving',
    base:        'legover',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'diving(+1) + legover(2) = 3 ADD',
    operationalNotation: 'SET > DIVE [BOD] > OP OUT [DEX] > SAME TOE [DEL]',  // standard diving DIVE [BOD] chassis; bracket count 3 matches ADD.
    provenance:  'Diving-chassis promotion. diving(+1) DIVE [BOD] insertion; bracket count 3 matches ADD. Observational (SG).',
  },
  {
    slug:        'diving_pickup',
    name:        'diving pickup',
    operator:    'diving',
    base:        'pickup',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'diving(+1) + pickup(2) = 3 ADD',
    operationalNotation: 'SET > DIVE [BOD] > OP IN [DEX] > SAME TOE [DEL]',  // standard diving DIVE [BOD] chassis; bracket count 3 matches ADD.
    provenance:  'Diving-chassis promotion. diving(+1) DIVE [BOD] insertion; bracket count 3 matches ADD. Observational (SG).',
  },
  {
    slug:        'diving_butterfly',
    name:        'diving butterfly',
    operator:    'diving',
    base:        'butterfly',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'diving(+1) + butterfly(3) = 4 ADD',
    operationalNotation: 'SET > DIVE [BOD] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]',  // standard diving DIVE [BOD] chassis; bracket count 4 matches ADD.
    provenance:  'Diving-chassis promotion. diving(+1) DIVE [BOD] insertion; bracket count 4 matches ADD. Observational (FM).',
  },
  {
    slug:        'diving_whirl',
    name:        'diving whirl',
    operator:    'diving',
    base:        'whirl',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'diving(+1) + whirl(3) = 4 ADD',
    operationalNotation: 'SET > DIVE [BOD] > OP IN [DEX] > OP CLIP [XBD] [DEL]',  // standard diving DIVE [BOD] chassis; bracket count 4 matches ADD.
    provenance:  'Diving-chassis promotion. diving(+1) DIVE [BOD] insertion; bracket count 4 matches ADD. Observational (FM).',
  },
  {
    slug:        'diving_drifter',
    name:        'diving drifter',
    operator:    'diving',
    base:        'drifter',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'diving(+1) + drifter(3) = 4 ADD',
    operationalNotation: 'SET > DIVE [BOD] > OP IN [DEX] > SAME CLIP [XBD] [DEL]',  // standard diving DIVE [BOD] chassis; bracket count 4 matches ADD.
    provenance:  'Diving-chassis promotion. diving(+1) DIVE [BOD] insertion; bracket count 4 matches ADD. Observational (SG).',
  },
  {
    slug:        'diving_osis',
    name:        'diving osis',
    operator:    'diving',
    base:        'osis',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'diving(+1) + osis(3) = 4 ADD',
    operationalNotation: 'SET > DIVE [BOD] > (back or front) SPIN [BOD] > SAME/OP CLIP [XBD] [DEL]',  // standard diving DIVE [BOD] chassis; bracket count 4 matches ADD.
    provenance:  'Diving-chassis promotion. diving(+1) DIVE [BOD] insertion; bracket count 4 matches ADD. Observational (MULTI).',
  },
  {
    slug:        'diving_swirl',
    name:        'diving swirl',
    operator:    'diving',
    base:        'swirl',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'diving(+1) + swirl(3) = 4 ADD',
    operationalNotation: 'CLIP > DIVE [BOD] > SAME BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]',  // standard diving DIVE [BOD] chassis; bracket count 4 matches ADD.
    provenance:  'Diving-chassis promotion. diving(+1) DIVE [BOD] insertion; bracket count 4 matches ADD. Observational (SG).',
  },
  {
    slug:        'diving_eclipse',
    name:        'diving eclipse',
    operator:    'diving',
    base:        'eclipse',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'diving(+1) + eclipse(3) = 4 ADD',
    operationalNotation: 'SET > DIVE [BOD] > JUMP [BOD] > SAME/OP INSIDE [DEL] > OP OUT [DEX] > (land)',  // standard diving DIVE [BOD] chassis; bracket count 4 matches ADD.
    provenance:  'Diving-chassis promotion. diving(+1) DIVE [BOD] insertion; bracket count 4 matches ADD. Observational (SG).',
  },
  {
    slug:        'diving_smudge',
    name:        'diving smudge',
    operator:    'diving',
    base:        'smudge',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'diving(+1) + smudge(3) = 4 ADD',
    operationalNotation: 'TOE > DIVE [BOD] > SAME IN [DEX] > OP OUT [DEX] > OP TOE [DEL]',  // standard diving DIVE [BOD] chassis; bracket count 4 matches ADD.
    provenance:  'Diving-chassis promotion. diving(+1) DIVE [BOD] insertion; bracket count 4 matches ADD. Observational (PB).',
  },
  {
    slug:        'diving_symposium_mirage',
    name:        'diving symposium mirage',
    operator:    'diving',
    base:        'symposium-mirage',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'diving(+1) + symposium-mirage(3) = 4 ADD',
    operationalNotation: 'SET > DIVE [BOD] > (no plant while) OP IN [BOD] [DEX] > OP TOE [DEL]',  // standard diving DIVE [BOD] chassis; bracket count 4 matches ADD.
    provenance:  'Diving-chassis promotion. diving(+1) DIVE [BOD] insertion; bracket count 4 matches ADD. Observational (SG).',
  },
  {
    slug:        'fairy_butterfly',
    name:        'fairy butterfly',
    operator:    'fairy',
    base:        'butterfly',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'fairy(+1) + butterfly(3) = 4 ADD',
    operationalNotation: 'TOE > SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]',  // standard fairy TOE>SAME OUT [DEX] entry chassis; bracket count 4 matches ADD.
    provenance:  'Fairy-chassis promotion. fairy(+1) entry set; bracket count 4 matches ADD. Observational (FB/FM/PB).',
  },
  {
    slug:        'fairy_drifter',
    name:        'fairy drifter',
    operator:    'fairy',
    base:        'drifter',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'fairy(+1) + drifter(3) = 4 ADD',
    operationalNotation: 'TOE > SAME OUT [DEX] > OP IN [DEX] > SAME CLIP [XBD] [DEL]',  // standard fairy TOE>SAME OUT [DEX] entry chassis; bracket count 4 matches ADD.
    provenance:  'Fairy-chassis promotion. fairy(+1) entry set; bracket count 4 matches ADD. Observational (FB/FM).',
  },
  {
    slug:        'fairy_gyro_drifter',
    name:        'fairy gyro drifter',
    operator:    'fairy',
    base:        'gyro-drifter',
    baseAdd:     4,
    totalAdd:    5,
    derivation:  'fairy(+1) + gyro-drifter(4) = 5 ADD',
    operationalNotation: 'TOE > SAME OUT [DEX] > (back) SPIN [BOD] > SAME IN [DEX] > SAME CLIP [XBD] [DEL]',  // standard fairy TOE>SAME OUT [DEX] entry chassis; bracket count 5 matches ADD.
    provenance:  'Fairy-chassis promotion. fairy(+1) entry set; bracket count 5 matches ADD. Observational (SG).',
  },
  {
    slug:        'fairy_gyro_torque',
    name:        'fairy gyro torque',
    operator:    'fairy + gyro',
    base:        'torque',
    baseAdd:     4,
    totalAdd:    6,
    derivation:  'fairy(+1) + gyro(+1) + torque(4) = 6 ADD',
    operationalNotation: 'TOE > SAME OUT [DEX] > (back) SPIN [BOD] > SAME IN [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]',  // standard fairy TOE>SAME OUT [DEX] entry chassis; bracket count 6 matches ADD.
    provenance:  'Fairy-chassis promotion. fairy(+1) entry set; bracket count 6 matches ADD. Observational (PB).',
  },
  {
    slug:        'fairy_illusion',
    name:        'fairy illusion',
    operator:    'fairy',
    base:        'illusion',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'fairy(+1) + illusion(2) = 3 ADD',
    operationalNotation: 'TOE > SAME OUT [DEX] > OP OUT [DEX] > OP TOE [DEL]',  // standard fairy TOE>SAME OUT [DEX] entry chassis; bracket count 3 matches ADD.
    provenance:  'Fairy-chassis promotion. fairy(+1) entry set; bracket count 3 matches ADD. Observational (FM/PB/SG).',
  },
  {
    slug:        'fairy_merkon',
    name:        'fairy merkon',
    operator:    'fairy',
    base:        'merkon',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'fairy(+1) + merkon(3) = 4 ADD',
    operationalNotation: 'TOE > SAME OUT [DEX] > (back) SPIN [BOD] >> OP OUT [DEX] > SAME TOE [DEL]',  // standard fairy TOE>SAME OUT [DEX] entry chassis; bracket count 4 matches ADD.
    provenance:  'Fairy-chassis promotion. fairy(+1) entry set; bracket count 4 matches ADD. Observational (FB).',
  },
  {
    slug:        'fairy_rev_whirl',
    name:        'fairy rev whirl',
    operator:    'fairy',
    base:        'rev-whirl',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'fairy(+1) + rev-whirl(3) = 4 ADD',
    operationalNotation: 'TOE > SAME OUT [DEX] > OP OUT [DEX] > OP CLIP [XBD] [DEL]',  // standard fairy TOE>SAME OUT [DEX] entry chassis; bracket count 4 matches ADD.
    provenance:  'Fairy-chassis promotion. fairy(+1) entry set; bracket count 4 matches ADD. Observational (SG).',
  },
  {
    slug:        'fairy_ripstein',
    name:        'fairy ripstein',
    operator:    'fairy',
    base:        'ripstein',
    baseAdd:     4,
    totalAdd:    5,
    derivation:  'fairy(+1) + ripstein(4) = 5 ADD',
    operationalNotation: 'TOE > SAME OUT [DEX] > SAME BACK SWIRL [DEX] >> SAME BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]',  // standard fairy TOE>SAME OUT [DEX] entry chassis; bracket count 5 matches ADD.
    provenance:  'Fairy-chassis promotion. fairy(+1) entry set; bracket count 5 matches ADD. Observational (PB).',
  },
  {
    slug:        'fairy_spinning_ducking_osis',
    name:        'fairy spinning ducking osis',
    operator:    'fairy',
    base:        'spinning-ducking-osis',
    baseAdd:     5,
    totalAdd:    6,
    derivation:  'fairy(+1) + spinning-ducking-osis(5) = 6 ADD',
    operationalNotation: 'TOE > SAME OUT [DEX] > (back) SPIN [BOD] > DUCK [BOD] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]',  // standard fairy TOE>SAME OUT [DEX] entry chassis; bracket count 6 matches ADD.
    provenance:  'Fairy-chassis promotion. fairy(+1) entry set; bracket count 6 matches ADD. Observational (SG).',
  },
  {
    slug:        'fairy_swirling_swirl',
    name:        'fairy swirling swirl',
    operator:    'fairy + swirling',
    base:        'swirl',
    baseAdd:     3,
    totalAdd:    5,
    derivation:  'fairy(+1) + swirling(+1) + swirl(3) = 5 ADD',
    operationalNotation: 'TOE > SAME OUT [DEX] > OP BACK SWIRL [DEX] > SAME BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]',  // standard fairy TOE>SAME OUT [DEX] entry chassis; bracket count 5 matches ADD.
    provenance:  'Fairy-chassis promotion. fairy(+1) entry set; bracket count 5 matches ADD. Observational (PB).',
  },
  {
    slug:        'fairy_whirl',
    name:        'fairy whirl',
    operator:    'fairy',
    base:        'whirl',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'fairy(+1) + whirl(3) = 4 ADD',
    operationalNotation: 'TOE > SAME OUT [DEX] > OP IN [DEX] > OP CLIP [XBD] [DEL]',  // standard fairy TOE>SAME OUT [DEX] entry chassis; bracket count 4 matches ADD.
    provenance:  'Fairy-chassis promotion. fairy(+1) entry set; bracket count 4 matches ADD. Observational (FB/FM/MULTI/SG).',
  },
  {
    slug:        'barraging_barfly',
    name:        'barraging barfly',
    operator:    'barraging',
    base:        'barfly',
    baseAdd:     4,
    totalAdd:    6,
    derivation:  'barraging(+2) + barfly(4) = 6 ADD',
    operationalNotation: 'CLIP > OP IN [DEX] > SAME IN [DEX] > SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [DEL] [XBD]',  // standard barraging two-dex chassis; bracket count 6 matches ADD.
    provenance:  'Barraging-chassis promotion. barraging(+2) two-dex set; bracket count 6 matches ADD. Observational (FM).',
  },
  {
    slug:        'barraging_butterfly',
    name:        'barraging butterfly',
    operator:    'barraging',
    base:        'butterfly',
    baseAdd:     3,
    totalAdd:    5,
    derivation:  'barraging(+2) + butterfly(3) = 5 ADD',
    operationalNotation: 'CLIP > OP IN [DEX] > SAME IN [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]',  // standard barraging two-dex chassis; bracket count 5 matches ADD.
    provenance:  'Barraging-chassis promotion. barraging(+2) two-dex set; bracket count 5 matches ADD. Observational (FM/PB).',
  },
  {
    slug:        'barraging_eggbeater',
    name:        'barraging eggbeater',
    operator:    'barraging',
    base:        'eggbeater',
    baseAdd:     3,
    totalAdd:    5,
    derivation:  'barraging(+2) + eggbeater(3) = 5 ADD',
    operationalNotation: 'CLIP > OP IN [DEX] > SAME IN [DEX] > OP OUT [DEX] > OP OUT [DEX] > SAME TOE [DEL]',  // standard barraging two-dex chassis; bracket count 5 matches ADD.
    provenance:  'Barraging-chassis promotion. barraging(+2) two-dex set; bracket count 5 matches ADD. Observational (PB).',
  },
  {
    slug:        'barraging_illusion',
    name:        'barraging illusion',
    operator:    'barraging',
    base:        'illusion',
    baseAdd:     2,
    totalAdd:    4,
    derivation:  'barraging(+2) + illusion(2) = 4 ADD',
    operationalNotation: 'CLIP > OP IN [DEX] > SAME IN [DEX] > OP OUT [DEX] > OP TOE [DEL]',  // standard barraging two-dex chassis; bracket count 4 matches ADD.
    provenance:  'Barraging-chassis promotion. barraging(+2) two-dex set; bracket count 4 matches ADD. Observational (PB).',
  },
  {
    slug:        'barraging_legover',
    name:        'barraging legover',
    operator:    'barraging',
    base:        'legover',
    baseAdd:     2,
    totalAdd:    4,
    derivation:  'barraging(+2) + legover(2) = 4 ADD',
    operationalNotation: 'CLIP > OP IN [DEX] > SAME IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]',  // standard barraging two-dex chassis; bracket count 4 matches ADD.
    provenance:  'Barraging-chassis promotion. barraging(+2) two-dex set; bracket count 4 matches ADD. Observational (FM/PB).',
  },
  {
    slug:        'barraging_mirage',
    name:        'barraging mirage',
    operator:    'barraging',
    base:        'mirage',
    baseAdd:     2,
    totalAdd:    4,
    derivation:  'barraging(+2) + mirage(2) = 4 ADD',
    operationalNotation: 'CLIP > OP IN [DEX] > SAME IN [DEX] > OP IN [DEX] > OP TOE [DEL]',  // standard barraging two-dex chassis; bracket count 4 matches ADD.
    provenance:  'Barraging-chassis promotion. barraging(+2) two-dex set; bracket count 4 matches ADD. Observational (PB).',
  },
  {
    slug:        'barraging_pickup',
    name:        'barraging pickup',
    operator:    'barraging',
    base:        'pickup',
    baseAdd:     2,
    totalAdd:    4,
    derivation:  'barraging(+2) + pickup(2) = 4 ADD',
    operationalNotation: 'CLIP > OP IN [DEX] > SAME IN [DEX] > OP IN [DEX] > SAME TOE [DEL]',  // standard barraging two-dex chassis; bracket count 4 matches ADD.
    provenance:  'Barraging-chassis promotion. barraging(+2) two-dex set; bracket count 4 matches ADD. Observational (SG).',
  },
  {
    slug:        'barraging_whirl',
    name:        'barraging whirl',
    operator:    'barraging',
    base:        'whirl',
    baseAdd:     3,
    totalAdd:    5,
    derivation:  'barraging(+2) + whirl(3) = 5 ADD',
    operationalNotation: 'CLIP > OP IN [DEX] > SAME IN [DEX] > OP IN [DEX] > OP CLIP [XBD] [DEL]',  // standard barraging two-dex chassis; bracket count 5 matches ADD.
    provenance:  'Barraging-chassis promotion. barraging(+2) two-dex set; bracket count 5 matches ADD. Observational (PB).',
  },
  {
    slug:        'symposium_atomic_butterfly',
    name:        'symposium atomic butterfly',
    operator:    'symposium',
    base:        'atomic-butterfly',
    baseAdd:     4,
    totalAdd:    5,
    derivation:  'symposium(+1) + atomic-butterfly(4) = 5 ADD',
    operationalNotation: 'TOE > (no plant while) OP OUT [BOD] [DEX] > OP OUT [DEX] > OP CLIP [XBD] [DEL]',  // standard symposium no-plant chassis; bracket count 5 matches ADD.
    provenance:  'Symposium-chassis promotion. symposium(+1) no-plant on the first dex; bracket count 5 matches ADD. Observational (PB).',
  },
  {
    slug:        'symposium_blur',
    name:        'symposium blur',
    operator:    'symposium',
    base:        'blur',
    baseAdd:     4,
    totalAdd:    5,
    derivation:  'symposium(+1) + blur(4) = 5 ADD',
    operationalNotation: 'CLIP > (no plant while) OP IN [BOD] [DEX] >> OP IN [DEX] [PDX] > OP TOE [DEL]',  // standard symposium no-plant chassis; bracket count 5 matches ADD.
    provenance:  'Symposium-chassis promotion. symposium(+1) no-plant on the first dex; bracket count 5 matches ADD. Observational (FB).',
  },
  {
    slug:        'symposium_bubba',
    name:        'symposium bubba',
    operator:    'symposium',
    base:        'bubba',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'symposium(+1) + bubba(2) = 3 ADD',
    operationalNotation: 'CLIP > (no plant while) OP OUT [BOD] [DEX] > OP TOE [DEL]',  // standard symposium no-plant chassis; bracket count 3 matches ADD.
    provenance:  'Symposium-chassis promotion. symposium(+1) no-plant on the first dex; bracket count 3 matches ADD. Observational (SG).',
  },
  {
    slug:        'symposium_mobius',
    name:        'symposium mobius',
    operator:    'symposium',
    base:        'mobius',
    baseAdd:     5,
    totalAdd:    6,
    derivation:  'symposium(+1) + mobius(5) = 6 ADD',
    operationalNotation: 'CLIP >> (back) SPIN [BOD] >> (no plant while) SAME IN [BOD] [DEX] > (front) SPIN [BOD] > OP CLIP [XBD] [DEL]',  // standard symposium no-plant chassis; bracket count 6 matches ADD.
    provenance:  'Symposium-chassis promotion. symposium(+1) no-plant on the first dex; bracket count 6 matches ADD. Observational (PB).',
  },
  {
    slug:        'symposium_swirl',
    name:        'symposium swirl',
    operator:    'symposium',
    base:        'swirl',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'symposium(+1) + swirl(3) = 4 ADD',
    operationalNotation: 'CLIP > (no plant while) SAME BACK SWIRL [BOD] [DEX] > SAME CLIP [XBD] [DEL]',  // standard symposium no-plant chassis; bracket count 4 matches ADD.
    provenance:  'Symposium-chassis promotion. symposium(+1) no-plant on the first dex; bracket count 4 matches ADD. Observational (PB).',
  },
  {
    slug:        'symposium_tomahawk',
    name:        'symposium tomahawk',
    operator:    'symposium',
    base:        'tomahawk',
    baseAdd:     5,
    totalAdd:    6,
    derivation:  'symposium(+1) + tomahawk(5) = 6 ADD',
    operationalNotation: 'CLIP >> DUCK [BOD] >> (no plant while) SAME FRONT WHIRL [BOD] [DEX] [PDX] > OP CLIP [XBD] [DEL]',  // standard symposium no-plant chassis; bracket count 6 matches ADD.
    provenance:  'Symposium-chassis promotion. symposium(+1) no-plant on the first dex; bracket count 6 matches ADD. Observational (FB).',
  },
  {
    slug:        'symposium_whirling_swirl',
    name:        'symposium whirling swirl',
    operator:    'symposium',
    base:        'whirling-swirl',
    baseAdd:     4,
    totalAdd:    5,
    derivation:  'symposium(+1) + whirling-swirl(4) = 5 ADD',
    operationalNotation: 'CLIP > (no plant while) OP IN [BOD] [DEX] > OP BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]',  // standard symposium no-plant chassis; bracket count 5 matches ADD.
    provenance:  'Symposium-chassis promotion. symposium(+1) no-plant on the first dex; bracket count 5 matches ADD. Observational (FB/PB).',
  },
  {
    slug:        'symposium_miraging_mirage',
    name:        'symposium miraging mirage',
    operator:    'symposium + miraging',
    base:        'mirage',
    baseAdd:     2,
    totalAdd:    4,
    derivation:  'symposium(+1) + miraging(+1) + mirage(2) = 4 ADD',
    operationalNotation: 'SET > (no plant while) OP IN [BOD] [DEX] > OP IN [DEX] > OP TOE [DEL]',  // standard symposium no-plant chassis; bracket count 4 matches ADD.
    provenance:  'Symposium-chassis promotion. symposium(+1) no-plant on the first dex; bracket count 4 matches ADD. Observational (PB).',
  },
  {
    slug:        'swirling_butterfly',
    name:        'swirling butterfly',
    operator:    'swirling',
    base:        'butterfly',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'swirling(+1) + butterfly(3) = 4 ADD',
    operationalNotation: 'SET > OP BACK SWIRL [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]',  // standard swirling OP BACK SWIRL [DEX] prefix chassis; bracket count 4 matches ADD.
    provenance:  'Swirling-chassis promotion. swirling(+1) swirl-dex prefix; bracket count 4 matches ADD. Observational (SG).',
  },
  {
    slug:        'swirling_mirage',
    name:        'swirling mirage',
    operator:    'swirling',
    base:        'mirage',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'swirling(+1) + mirage(2) = 3 ADD',
    operationalNotation: 'SET > OP BACK SWIRL [DEX] > OP IN [DEX] > OP TOE [DEL]',  // standard swirling OP BACK SWIRL [DEX] prefix chassis; bracket count 3 matches ADD.
    provenance:  'Swirling-chassis promotion. swirling(+1) swirl-dex prefix; bracket count 3 matches ADD. Observational (SG).',
  },
  {
    slug:        'swirling_paradox_mirage',
    name:        'swirling paradox mirage',
    operator:    'swirling',
    base:        'paradox-mirage',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'swirling(+1) + paradox-mirage(3) = 4 ADD',
    operationalNotation: 'CLIP > OP BACK SWIRL [DEX] > OP IN [PDX] [DEX] > OP TOE [DEL]',  // standard swirling OP BACK SWIRL [DEX] prefix chassis; bracket count 4 matches ADD.
    provenance:  'Swirling-chassis promotion. swirling(+1) swirl-dex prefix; bracket count 4 matches ADD. Observational (SG).',
  },
  {
    slug:        'swirling_swirl',
    name:        'swirling swirl',
    operator:    'swirling',
    base:        'swirl',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'swirling(+1) + swirl(3) = 4 ADD',
    operationalNotation: 'CLIP > OP BACK SWIRL [DEX] > SAME BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]',  // standard swirling OP BACK SWIRL [DEX] prefix chassis; bracket count 4 matches ADD.
    provenance:  'Swirling-chassis promotion. swirling(+1) swirl-dex prefix; bracket count 4 matches ADD. Observational (PB).',
  },
  {
    slug:        'swirling_symposium_whirl',
    name:        'swirling symposium whirl',
    operator:    'swirling',
    base:        'symposium-whirl',
    baseAdd:     4,
    totalAdd:    5,
    derivation:  'swirling(+1) + symposium-whirl(4) = 5 ADD',
    operationalNotation: 'SET > OP BACK SWIRL [DEX] > (no plant while) OP IN [BOD] [DEX] > OP CLIP [XBD] [DEL]',  // standard swirling OP BACK SWIRL [DEX] prefix chassis; bracket count 5 matches ADD.
    provenance:  'Swirling-chassis promotion. swirling(+1) swirl-dex prefix; bracket count 5 matches ADD. Observational (SG).',
  },
  {
    slug:        'swirling_whirl',
    name:        'swirling whirl',
    operator:    'swirling',
    base:        'whirl',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'swirling(+1) + whirl(3) = 4 ADD',
    operationalNotation: 'SET > OP BACK SWIRL [DEX] > OP IN [DEX] > OP CLIP [XBD] [DEL]',  // standard swirling OP BACK SWIRL [DEX] prefix chassis; bracket count 4 matches ADD.
    provenance:  'Swirling-chassis promotion. swirling(+1) swirl-dex prefix; bracket count 4 matches ADD. Observational (SG).',
  },
  {
    slug:        'swirling_whirling_swirl',
    name:        'swirling whirling swirl',
    operator:    'swirling',
    base:        'whirling-swirl',
    baseAdd:     4,
    totalAdd:    5,
    derivation:  'swirling(+1) + whirling-swirl(4) = 5 ADD',
    operationalNotation: 'CLIP > OP BACK SWIRL [DEX] > OP IN [DEX] > OP BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]',  // standard swirling OP BACK SWIRL [DEX] prefix chassis; bracket count 5 matches ADD.
    provenance:  'Swirling-chassis promotion. swirling(+1) swirl-dex prefix; bracket count 5 matches ADD. Observational (SG).',
  },
  {
    slug:        'pixie_dolomite',
    name:        'pixie dolomite',
    operator:    'pixie',
    base:        'dolomite',
    baseAdd:     5,
    totalAdd:    6,
    derivation:  'pixie(+1) + dolomite(5) = 6 ADD',
    operationalNotation: 'TOE > SAME IN [DEX] > (no plant while) OP OUT [DEX] [BOD] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]',  // standard pixie TOE>SAME IN [DEX] entry chassis; bracket count 6 matches ADD.
    provenance:  'Pixie-chassis promotion. pixie(+1) entry set; bracket count 6 matches ADD. Observational (SG).',
  },
  {
    slug:        'pixie_rev_whirl',
    name:        'pixie rev whirl',
    operator:    'pixie',
    base:        'rev-whirl',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'pixie(+1) + rev-whirl(3) = 4 ADD',
    operationalNotation: 'TOE > SAME IN [DEX] > OP OUT [DEX] > OP CLIP [XBD] [DEL]',  // standard pixie TOE>SAME IN [DEX] entry chassis; bracket count 4 matches ADD.
    provenance:  'Pixie-chassis promotion. pixie(+1) entry set; bracket count 4 matches ADD. Observational (SG).',
  },
  {
    slug:        'pixie_spinning_paradox_blender',
    name:        'pixie spinning paradox blender',
    operator:    'pixie',
    base:        'spinning-paradox-blender',
    baseAdd:     6,
    totalAdd:    7,
    derivation:  'pixie(+1) + spinning-paradox-blender(6) = 7 ADD',
    operationalNotation: 'TOE > SAME IN [DEX] > (back) SPIN [BOD] > OP IN [PDX] [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]',  // standard pixie TOE>SAME IN [DEX] entry chassis; bracket count 7 matches ADD.
    provenance:  'Pixie-chassis promotion. pixie(+1) entry set; bracket count 7 matches ADD. Observational (FM).',
  },
  {
    slug:        'pixie_spinning_paradox_symposium_whirl',
    name:        'pixie spinning paradox symposium whirl',
    operator:    'pixie',
    base:        'spinning-paradox-symposium-whirl',
    baseAdd:     6,
    totalAdd:    7,
    derivation:  'pixie(+1) + spinning-paradox-symposium-whirl(6) = 7 ADD',
    operationalNotation: 'TOE > SAME IN [DEX] > (back) SPIN [BOD] > (no plant while) OP IN [PDX] [BOD] [DEX] > OP CLIP [XBD] [DEL]',  // standard pixie TOE>SAME IN [DEX] entry chassis; bracket count 7 matches ADD.
    provenance:  'Pixie-chassis promotion. pixie(+1) entry set; bracket count 7 matches ADD. Observational (FM).',
  },
  {
    slug:        'pixie_spinning_paradox_whirl',
    name:        'pixie spinning paradox whirl',
    operator:    'pixie',
    base:        'spinning-paradox-whirl',
    baseAdd:     5,
    totalAdd:    6,
    derivation:  'pixie(+1) + spinning-paradox-whirl(5) = 6 ADD',
    operationalNotation: 'TOE > SAME IN [DEX] > (back) SPIN [BOD] > OP IN [PDX] [DEX] > OP CLIP [XBD] [DEL]',  // standard pixie TOE>SAME IN [DEX] entry chassis; bracket count 6 matches ADD.
    provenance:  'Pixie-chassis promotion. pixie(+1) entry set; bracket count 6 matches ADD. Observational (FM).',
  },
  {
    slug:        'pixie_symposium_rev_whirl',
    name:        'pixie symposium rev whirl',
    operator:    'pixie + symposium',
    base:        'rev-whirl',
    baseAdd:     3,
    totalAdd:    5,
    derivation:  'pixie(+1) + symposium(+1) + rev-whirl(3) = 5 ADD',
    operationalNotation: 'TOE > SAME IN [DEX] > (no plant while) OP OUT [BOD] [DEX] > OP CLIP [XBD] [DEL]',  // standard pixie TOE>SAME IN [DEX] entry chassis; bracket count 5 matches ADD.
    provenance:  'Pixie-chassis promotion. pixie(+1) entry set; bracket count 5 matches ADD. Observational (SG).',
  },
  {
    slug:        'pixie_symposium_whirling_swirl',
    name:        'pixie symposium whirling swirl',
    operator:    'pixie + symposium',
    base:        'whirling-swirl',
    baseAdd:     4,
    totalAdd:    6,
    derivation:  'pixie(+1) + symposium(+1) + whirling-swirl(4) = 6 ADD',
    operationalNotation: 'TOE > SAME IN [DEX] > (no plant while) OP IN [BOD] [DEX] > OP BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]',  // standard pixie TOE>SAME IN [DEX] entry chassis; bracket count 6 matches ADD.
    provenance:  'Pixie-chassis promotion. pixie(+1) entry set; bracket count 6 matches ADD. Observational (FM).',
  },
  {
    slug:        'tapping_legover',
    name:        'tapping legover',
    operator:    'tapping',
    base:        'legover',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'tapping(+1) + legover(2) = 3 ADD',
    operationalNotation: 'TOE > OP OUT [DEX] >> OP OUT [DEX] > SAME TOE [DEL]',  // standard tapping chassis; bracket count 3 matches ADD.
    provenance:  'Tapping-chassis promotion. tapping(+1); bracket count 3 matches ADD. Observational (PB).',
  },
  {
    slug:        'miraging_symposium_butterfly',
    name:        'miraging symposium butterfly',
    operator:    'miraging',
    base:        'symposium-butterfly',
    baseAdd:     4,
    totalAdd:    5,
    derivation:  'miraging(+1) + symposium-butterfly(4) = 5 ADD',
    operationalNotation: 'SET > OP IN [DEX] > (no plant while) SAME OUT [BOD] [DEX] > OP CLIP [XBD] [DEL]',  // standard miraging chassis; bracket count 5 matches ADD.
    provenance:  'Miraging-chassis promotion. miraging(+1); bracket count 5 matches ADD. Observational (PB).',
  },
  {
    slug:        'miraging_symposium_whirl',
    name:        'miraging symposium whirl',
    operator:    'miraging',
    base:        'symposium-whirl',
    baseAdd:     4,
    totalAdd:    5,
    derivation:  'miraging(+1) + symposium-whirl(4) = 5 ADD',
    operationalNotation: 'SET > OP IN [DEX] > (no plant while) OP IN [BOD] [DEX] > OP CLIP [XBD] [DEL]',  // standard miraging chassis; bracket count 5 matches ADD.
    provenance:  'Miraging-chassis promotion. miraging(+1); bracket count 5 matches ADD. Observational (PB).',
  },
  {
    slug:        'paradox_fusion',
    name:        'paradox fusion',
    operator:    'paradox',
    base:        'fusion',
    baseAdd:     5,
    totalAdd:    6,
    derivation:  'paradox(+1) + fusion(5) = 6 ADD',
    operationalNotation: 'TOE > OP OUT [PDX] [DEX] > OP OUT [DEX] > OP OUT [DEX] > OP CLIP [XBD] [DEL]',  // standard paradox chassis; bracket count 6 matches ADD.
    provenance:  'Paradox-chassis promotion. paradox(+1); bracket count 6 matches ADD. Observational (PB).',
  },
  {
    slug:        'paradox_symposium_illusion',
    name:        'paradox symposium illusion',
    operator:    'paradox',
    base:        'symposium-illusion',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'paradox(+1) + symposium-illusion(3) = 4 ADD',
    operationalNotation: 'SET > (no plant while) OP OUT [PDX] [BOD] [DEX] > OP TOE [DEL]',  // standard paradox chassis; bracket count 4 matches ADD.
    provenance:  'Paradox-chassis promotion. paradox(+1); bracket count 4 matches ADD. Observational (FM).',
  },
  {
    slug:        'whirling_mirage',
    name:        'whirling mirage',
    operator:    'whirling',
    base:        'mirage',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'whirling(+1) + mirage(2) = 3 ADD',
    operationalNotation: 'SET > OP IN [DEX] > SAME IN [DEX] > OP TOE [DEL]',  // whirling OP IN [DEX] prefix with leading-dex parity flip (whirling-swirl precedent); bracket count 3 matches ADD.
    provenance:  'Whirling-chassis promotion. whirling(+1) OP IN [DEX] prefix; bracket count 3 matches ADD. Observational (PB).',
  },
  {
    slug:        'whirling_pickup',
    name:        'whirling pickup',
    operator:    'whirling',
    base:        'pickup',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'whirling(+1) + pickup(2) = 3 ADD',
    operationalNotation: 'SET > OP IN [DEX] > SAME IN [DEX] > SAME TOE [DEL]',  // whirling OP IN [DEX] prefix with leading-dex parity flip (whirling-swirl precedent); bracket count 3 matches ADD.
    provenance:  'Whirling-chassis promotion. whirling(+1) OP IN [DEX] prefix; bracket count 3 matches ADD. Observational (SG).',
  },
  {
    slug:        'whirling_whirl',
    name:        'whirling whirl',
    operator:    'whirling',
    base:        'whirl',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'whirling(+1) + whirl(3) = 4 ADD',
    operationalNotation: 'SET > OP IN [DEX] > SAME IN [DEX] > OP CLIP [XBD] [DEL]',  // whirling OP IN [DEX] prefix with leading-dex parity flip (whirling-swirl precedent); bracket count 4 matches ADD.
    provenance:  'Whirling-chassis promotion. whirling(+1) OP IN [DEX] prefix; bracket count 4 matches ADD. Observational (PB).',
  },
  {
    slug:        'whirling_butterfly',
    name:        'whirling butterfly',
    operator:    'whirling',
    base:        'butterfly',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'whirling(+1) + butterfly(3) = 4 ADD',
    operationalNotation: 'SET > OP IN [DEX] > SAME/OP OUT [DEX] > OP CLIP [XBD] [DEL]',  // whirling OP IN [DEX] prefix; butterfly leading dex is symmetric; bracket count 4 matches ADD.
    provenance:  'Whirling-chassis promotion. whirling(+1) OP IN [DEX] prefix; bracket count 4 matches ADD. Observational (FM).',
  },
  {
    slug:        'whirling_rake',
    name:        'whirling rake',
    operator:    'whirling',
    base:        'rake',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'whirling(+1) + rake(2) = 3 ADD',
    operationalNotation: 'SET > OP IN [DEX] > SWING TOE [DEL]',  // whirling OP IN [DEX] prefix on the rake swing primitive (no base dex to flip); two brackets plus the unbracketed swing element equal 3 ADD.
    provenance:  'Whirling-chassis promotion. whirling(+1) OP IN [DEX] prefix; two brackets plus the unbracketed swing element equal 3 ADD. Observational (FM).',
  },
  {
    slug:        'stepping_guay',
    name:        'stepping guay',
    operator:    'stepping',
    base:        'guay',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'stepping(+1) + guay(2) = 3 ADD',
    operationalNotation: 'CLIP > OP IN [DEX] >> OP IN [DEX] > SAME INSIDE [DEL]',  // stepping chassis on canonical guay; bracket count 3 matches ADD.
    provenance:  'Clean Tier-1 sweep. stepping on canonical guay; bracket count 3 matches ADD. Observational (SG).',
  },
  {
    slug:        'diving_guay',
    name:        'diving guay',
    operator:    'diving',
    base:        'guay',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'diving(+1) + guay(2) = 3 ADD',
    operationalNotation: 'SET > DIVE [BOD] > OP IN [DEX] > SAME INSIDE [DEL]',  // diving chassis on canonical guay; bracket count 3 matches ADD.
    provenance:  'Clean Tier-1 sweep. diving on canonical guay; bracket count 3 matches ADD. Observational (SG).',
  },
  {
    slug:        'tapping_guay',
    name:        'tapping guay',
    operator:    'tapping',
    base:        'guay',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'tapping(+1) + guay(2) = 3 ADD',
    operationalNotation: 'TOE > OP OUT [DEX] >> OP IN [DEX] > SAME INSIDE [DEL]',  // tapping chassis on canonical guay; bracket count 3 matches ADD.
    provenance:  'Clean Tier-1 sweep. tapping on canonical guay; bracket count 3 matches ADD. Observational (PB).',
  },
  {
    slug:        'fairy_guay',
    name:        'fairy guay',
    operator:    'fairy',
    base:        'guay',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'fairy(+1) + guay(2) = 3 ADD',
    operationalNotation: 'TOE > SAME OUT [DEX] > OP IN [DEX] > SAME INSIDE [DEL]',  // fairy chassis on canonical guay; bracket count 3 matches ADD.
    provenance:  'Clean Tier-1 sweep. fairy on canonical guay; bracket count 3 matches ADD. Observational (FM).',
  },
  {
    slug:        'inspinning_guay',
    name:        'inspinning guay',
    operator:    'inspinning',
    base:        'guay',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'inspinning(+1) + guay(2) = 3 ADD',
    operationalNotation: 'CLIP > (front) SPIN [BOD] > SAME IN [DEX] > SAME INSIDE [DEL]',  // inspinning chassis on canonical guay; bracket count 3 matches ADD.
    provenance:  'Clean Tier-1 sweep. inspinning on canonical guay; bracket count 3 matches ADD. Observational (FM).',
  },
  {
    slug:        'pixie_guay',
    name:        'pixie guay',
    operator:    'pixie',
    base:        'guay',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'pixie(+1) + guay(2) = 3 ADD',
    operationalNotation: 'TOE > SAME IN [DEX] > SAME IN [DEX] > SAME INSIDE [DEL]',  // pixie chassis on canonical guay; bracket count 3 matches ADD.
    provenance:  'Clean Tier-1 sweep. pixie on canonical guay; bracket count 3 matches ADD. Observational (SG).',
  },
  {
    slug:        'pixie_mirage',
    name:        'pixie mirage',
    operator:    'pixie',
    base:        'mirage',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'pixie(+1) + mirage(2) = 3 ADD',
    operationalNotation: 'TOE > SAME IN [DEX] > SAME IN [DEX] > OP TOE [DEL]',  // pixie chassis on canonical mirage; bracket count 3 matches ADD.
    provenance:  'Clean Tier-1 sweep. pixie on canonical mirage; bracket count 3 matches ADD. Observational (FM).',
  },
  {
    slug:        'pixie_clipper',
    name:        'pixie clipper',
    operator:    'pixie',
    base:        'clipper-stall',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'pixie(+1) + clipper-stall(2) = 3 ADD',
    operationalNotation: 'TOE > SAME IN [DEX] > SAME CLIP [XBD] [DEL]',  // pixie chassis on the clipper stall (cross-body delay); bracket count 3 matches ADD.
    provenance:  'pixie on the clipper stall; the clipper terminal is the 2-ADD cross-body stall, so bracket count 3 matches ADD. Observational (SG).',
  },
  {
    slug:        'pixie_double_pickup',
    name:        'pixie double pickup',
    operator:    'pixie',
    base:        'double-pickup',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'pixie(+1) + double-pickup(3) = 4 ADD',
    operationalNotation: 'TOE > SAME IN [DEX] > SAME IN [DEX] > OP IN [DEX] > SAME TOE [DEL]',  // pixie chassis on canonical double-pickup; bracket count 4 matches ADD.
    provenance:  'Clean Tier-1 sweep. pixie on canonical double-pickup; bracket count 4 matches ADD. Observational (FM).',
  },
  {
    slug:        'pixie_diving_butterfly',
    name:        'pixie diving butterfly',
    operator:    'pixie',
    base:        'diving-butterfly',
    baseAdd:     4,
    totalAdd:    5,
    derivation:  'pixie(+1) + diving-butterfly(4) = 5 ADD',
    operationalNotation: 'TOE > SAME IN [DEX] > DIVE [BOD] > OP OUT [DEX] > OP CLIP [XBD] [DEL]',  // pixie chassis on canonical diving-butterfly; bracket count 5 matches ADD.
    provenance:  'Clean Tier-1 sweep. pixie on canonical diving-butterfly; bracket count 5 matches ADD. Observational (SG).',
  },
  {
    slug:        'pixie_ducking_butterfly',
    name:        'pixie ducking butterfly',
    operator:    'pixie',
    base:        'ducking-butterfly',
    baseAdd:     4,
    totalAdd:    5,
    derivation:  'pixie(+1) + ducking-butterfly(4) = 5 ADD',
    operationalNotation: 'TOE > SAME IN [DEX] > DUCK [BOD] > SAME IN [DEX] > OP CLIP [XBD] [DEL]',  // pixie chassis on canonical ducking-butterfly; bracket count 5 matches ADD.
    provenance:  'Clean Tier-1 sweep. pixie on canonical ducking-butterfly; bracket count 5 matches ADD. Observational (SG).',
  },
  {
    slug:        'pixie_ducking_mirage',
    name:        'pixie ducking mirage',
    operator:    'pixie',
    base:        'ducking-mirage',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'pixie(+1) + ducking-mirage(3) = 4 ADD',
    operationalNotation: 'TOE > SAME IN [DEX] > DUCK [BOD] > SAME IN [DEX] > OP TOE [DEL]',  // pixie chassis on canonical ducking-mirage; bracket count 4 matches ADD.
    provenance:  'Clean Tier-1 sweep. pixie on canonical ducking-mirage; bracket count 4 matches ADD. Observational (SG).',
  },
  {
    slug:        'pixie_symposium_reverse_whirl',
    name:        'pixie symposium reverse whirl',
    operator:    'pixie',
    base:        'symposium-reverse-whirl',
    baseAdd:     4,
    totalAdd:    5,
    derivation:  'pixie(+1) + symposium-reverse-whirl(4) = 5 ADD',
    operationalNotation: 'TOE > SAME IN [DEX] > (no plant while) SAME OUT [BOD] [DEX] > OP CLIP [XBD] [DEL]',  // pixie chassis on canonical symposium-reverse-whirl; bracket count 5 matches ADD.
    provenance:  'Clean Tier-1 sweep. pixie on canonical symposium-reverse-whirl; bracket count 5 matches ADD. Observational (SG).',
  },
  {
    slug:        'fairy_ducking_mirage',
    name:        'fairy ducking mirage',
    operator:    'fairy',
    base:        'ducking-mirage',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'fairy(+1) + ducking-mirage(3) = 4 ADD',
    operationalNotation: 'TOE > SAME OUT [DEX] > DUCK [BOD] > OP IN [DEX] > OP TOE [DEL]',  // fairy chassis on canonical ducking-mirage; bracket count 4 matches ADD.
    provenance:  'Clean Tier-1 sweep. fairy on canonical ducking-mirage; bracket count 4 matches ADD. Observational (FM).',
  },
  {
    slug:        'fairy_torque',
    name:        'fairy torque',
    operator:    'fairy',
    base:        'torque',
    baseAdd:     4,
    totalAdd:    5,
    derivation:  'fairy(+1) + torque(4) = 5 ADD',
    operationalNotation: 'TOE > SAME OUT [DEX] > OP IN [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]',  // fairy chassis on canonical torque; bracket count 5 matches ADD.
    provenance:  'Clean Tier-1 sweep. fairy on canonical torque; bracket count 5 matches ADD. Observational (FM).',
  },
  {
    slug:        'diving_clipper',
    name:        'diving clipper',
    operator:    'diving',
    base:        'clipper-stall',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'diving(+1) + clipper-stall(2) = 3 ADD',
    operationalNotation: 'SET > DIVE [BOD] > SAME CLIP [XBD] [DEL]',  // diving chassis on the clipper stall (cross-body delay); bracket count 3 matches ADD.
    provenance:  'diving on the clipper stall; the clipper terminal is the 2-ADD cross-body stall, so bracket count 3 matches ADD. Observational (SG).',
  },
  {
    slug:        'diving_toe_stall',
    name:        'diving toe stall',
    operator:    'diving',
    base:        'toe-stall',
    baseAdd:     1,
    totalAdd:    2,
    derivation:  'diving(+1) + toe-stall(1) = 2 ADD',
    operationalNotation: 'SET > DIVE [BOD] > SAME TOE [DEL]',  // diving chassis on canonical toe-stall; bracket count 2 matches ADD.
    provenance:  'Clean Tier-1 sweep. diving on canonical toe-stall; bracket count 2 matches ADD. Observational (SG).',
  },
  {
    slug:        'stepping_barrage',
    name:        'stepping barrage',
    operator:    'stepping',
    base:        'barrage',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'stepping(+1) + barrage(3) = 4 ADD',
    operationalNotation: 'CLIP > OP IN [DEX] >> SAME IN [DEX] > SAME IN [DEX] > OP TOE [DEL]',  // stepping chassis on canonical barrage; bracket count 4 matches ADD.
    provenance:  'Clean Tier-1 sweep. stepping on canonical barrage; bracket count 4 matches ADD. Observational (SG).',
  },
  {
    slug:        'stepping_clipper',
    name:        'stepping clipper',
    operator:    'stepping',
    base:        'clipper-stall',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'stepping(+1) + clipper-stall(2) = 3 ADD',
    operationalNotation: 'CLIP > OP IN [DEX] >> SAME CLIP [XBD] [DEL]',  // stepping chassis on the clipper stall (cross-body delay); bracket count 3 matches ADD.
    provenance:  'stepping on the clipper stall; the clipper terminal is the 2-ADD cross-body stall, so bracket count 3 matches ADD. Observational (SG).',
  },
  {
    slug:        'gyro_clipper',
    name:        'gyro clipper',
    operator:    'gyro',
    base:        'clipper-stall',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'gyro(+1) + clipper-stall(2) = 3 ADD',
    operationalNotation: 'CLIP > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]',  // gyro chassis on the clipper stall (cross-body delay); bracket count 3 matches ADD.
    provenance:  'gyro on the clipper stall; the clipper terminal is the 2-ADD cross-body stall, so bracket count 3 matches ADD. Observational (SG).',
  },
  {
    slug:        'gyro_diving_butterfly',
    name:        'gyro diving butterfly',
    operator:    'gyro',
    base:        'diving-butterfly',
    baseAdd:     4,
    totalAdd:    5,
    derivation:  'gyro(+1) + diving-butterfly(4) = 5 ADD',
    operationalNotation: 'CLIP > (back) SPIN [BOD] > DIVE [BOD] > OP OUT [DEX] > OP CLIP [XBD] [DEL]',  // gyro chassis on canonical diving-butterfly; bracket count 5 matches ADD.
    provenance:  'Clean Tier-1 sweep. gyro on canonical diving-butterfly; bracket count 5 matches ADD. Observational (SG).',
  },
  {
    slug:        'symposium_whirling_mirage',
    name:        'symposium whirling mirage',
    operator:    'symposium',
    base:        'whirling-mirage',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'symposium(+1) + whirling-mirage(3) = 4 ADD',
    operationalNotation: 'SET > (no plant while) OP IN [BOD] [DEX] > SAME IN [DEX] > OP TOE [DEL]',  // symposium chassis on canonical whirling-mirage; bracket count 4 matches ADD.
    provenance:  'Clean Tier-1 sweep. symposium on canonical whirling-mirage; bracket count 4 matches ADD. Observational (FM).',
  },
  {
    slug:        'spinning_butterfly_kick',
    name:        'spinning butterfly kick',
    operator:    'spinning',
    base:        'butterfly-kick',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'spinning(+1) + butterfly-kick(2) = 3 ADD',
    operationalNotation: 'CLIP > (back) SPIN [BOD] > JUMP [BOD] > SAME/OP OUT [DEX]',  // spinning chassis on canonical butterfly-kick; bracket count 3 matches ADD.
    provenance:  'Clean Tier-1 sweep. spinning on canonical butterfly-kick; bracket count 3 matches ADD. Observational (FM).',
  },
  {
    slug:        'barraging_barfly_swirl',
    name:        'barraging barfly swirl',
    operator:    'barraging',
    base:        'barfly-swirl',
    baseAdd:     5,
    totalAdd:    7,
    derivation:  'barraging(+2) + barfly-swirl(5) = 7 ADD',
    operationalNotation: 'CLIP > OP IN [DEX] > SAME IN [DEX] > OP OUT [DEX] > OP OUT [DEX] > SAME BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]',  // barraging chassis on canonical barfly-swirl; bracket count 7 matches ADD.
    provenance:  'Clean Tier-1 sweep. barraging on canonical barfly-swirl; bracket count 7 matches ADD. Observational (SG).',
  },
  {
    slug:        'ducking_symposium_reverse_whirl',
    name:        'ducking symposium reverse whirl',
    operator:    'ducking',
    base:        'symposium-reverse-whirl',
    baseAdd:     4,
    totalAdd:    5,
    derivation:  'ducking(+1) + symposium-reverse-whirl(4) = 5 ADD',
    operationalNotation: 'TOE > DUCK [BOD] > (no plant while) SAME OUT [BOD] [DEX] > OP CLIP [XBD] [DEL]',  // ducking chassis on canonical symposium-reverse-whirl; bracket count 5 matches ADD.
    provenance:  'Clean Tier-1 sweep. ducking on canonical symposium-reverse-whirl; bracket count 5 matches ADD. Observational (SG).',
  },
  {
    slug:        'tapping_double_over_down',
    name:        'tapping double over down',
    operator:    'tapping',
    base:        'double-over-down',
    baseAdd:     4,
    totalAdd:    5,
    derivation:  'tapping(+1) + double-over-down(4) = 5 ADD',
    operationalNotation: 'TOE > OP OUT [DEX] >> OP OUT [DEX] > OP OUT [DEX] > OP CLIP [XBD] [DEL]',  // tapping chassis on canonical double-over-down; bracket count 5 matches ADD.
    provenance:  'Clean Tier-1 sweep. tapping on canonical double-over-down; bracket count 5 matches ADD. Observational (FM).',
  },
  {
    slug:        'gyro_diving_clipper',
    name:        'gyro diving clipper',
    operator:    'gyro',
    base:        'diving-clipper',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'gyro(+1) + diving-clipper(3) = 4 ADD',
    operationalNotation: 'SET > (back) SPIN [BOD] > DIVE [BOD] > SAME CLIP [XBD] [DEL]',  // gyro chassis on canonical diving-clipper; the cross-body clipper catch carries [XBD], so bracket count 4 matches ADD.
    provenance:  'gyro on canonical diving-clipper (3 ADD); the cross-body clipper catch carries [XBD], so the total is 4. Observational (SG).',
  },
  {
    slug:        'bill_ted_s_excellent_adventure',
    name:        'bill ted s excellent adventure',
    operator:    'flailing',
    base:        'eggbeater',
    baseAdd:     3,
    totalAdd:    5,
    derivation:  'flailing(2) + eggbeater(3) = 5 ADD',
    operationalNotation: '(flailing set) >> TOE >> OP OUT [DEX] > OP OUT [DEX] > SAME TOE [DEL]',  // eggbeater chassis from DB; flailing (symposium illusioning) +2 set prefix marker, tokenization pending; not curator-confirmed.
    provenance:  'FootbagMoves promotion at structural ADD 5. flailing = symposium illusioning (+2); the explicit Symposium in the FootbagMoves name is the same symposium (redundant, deduped to a single symposium). flailing(2) + eggbeater(3) = 5. FootbagMoves lists 7; published at 5 with FM-7 as a documented operator-weight divergence. eggbeater family. Flailing set-prefix JOB pending; not curator-confirmed.',
  },
  {
    slug:        'oh_wheely',
    name:        'oh wheely',
    operator:    'nuclear',
    base:        'nova',
    baseAdd:     4,
    totalAdd:    6,
    derivation:  'nuclear(2) + nova(4) = 6 ADD',
    operationalNotation: '(nuclear set) >> TOE >> (no plant while) OP IN [DEX] [BOD] > OP OUT [DEX] > SAME TOE [DEL]',  // nova chassis from DB; nuclear +2 paradox-illusion prefix marker (X-Dex does not fire on the legover base), tokenization pending; not curator-confirmed.
    provenance:  'FootbagMoves promotion at structural ADD 6. nova = symposium double-leg-over (4 ADD, legover family). The nuclear X-Dex triggers only on far miraging or illusioning moves, so on the nova base it does not fire and nuclear contributes its paradox-illusion base weight (+2). nuclear(2) + nova(4) = 6. FootbagMoves lists 7; published at 6 with the +1 over-count as a documented single-source divergence. family corrected to legover (nova terminal-identity). Nuclear set-prefix JOB pending; not curator-confirmed.',
  },
];
