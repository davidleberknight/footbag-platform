/**
 * freestyleResolvedFormulas.ts
 * =============================
 *
 * Curator-published compact formulas for mechanically-derivable
 * compound tricks. Sprints accumulate here as the curator burn-down
 * proceeds.
 *
 * Sprint 1 (15 rows): pure +1-stack pattern — operator(+1) + base(N)
 *                     where both operator and base are Red-settled.
 *
 * Sprint 2 (7 rows): pattern expansion — pt-ruled compounds, positional
 *                    modifiers (reverse = +0), the first multi-operator
 *                    chain (paradox-symposium-whirl), and folk-name
 *                    resolutions whose decomposition is curator-locked.
 *
 * Sprint 3 (3 rows): targeted folk-name resolutions — smear (PIX +
 *                    MIRAGE), ripwalk (STEP + BUTTERFLY) per the
 *                    operator-board lede, plus rev-up (most-defensible
 *                    positional reading with curator-uncertainty note).
 *
 * Every row continues to satisfy the V1+V2 publication contract:
 *
 *   - Operator is in the settled +1 inventory (paradox, spinning,
 *     ducking, symposium, stepping, atomic, whirling)
 *   - Base is a Red-settled core atom or settled compound (mirage 2,
 *     whirl 3, butterfly 3, osis 3, swirl 3, torque 4, blender 4)
 *   - DB ADD value matches the arithmetic (N+1)
 *   - Zero Wave 2 dependency (no barraging, no blurry transitivity,
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
 * worked-example expansion — the table is reference-density.
 *
 * Reversibility: TypeScript content module per
 * [[feedback_reversible_content_governance]]. To extend in Sprint 2:
 * add more rows; to reclassify a row out (e.g., if a Wave 2 ruling
 * later complicates it): remove the row.
 *
 * After this sprint lands, formula_gap_classification.csv reclassifies
 * these 15 rows from `curator_pending` → `resolved`.
 */

// ─────────────────────────────────────────────────────────────────────────
// DUAL-CONVENTION SEMANTIC RULE (forever-rule, 2026-05-23):
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
//      qualifiers. Used by FM-sourced folk-name promotions starting with
//      Slice 7-OBS-A (bladerunner, bling-blang, cold-fusion, flurricane,
//      golden-shower, goliath, gybas, motion-sickness, pandemonium).
//
// FOREVER-RULE: The JOB-notation punctuation style determines its
// counting convention. (parens) → FM dex-count. [brackets] → canonical
// full-token-count. The conventions describe the same physical movement
// under different counting models; both are recognized scoring layers.
// Rewriting an FM-parens JOB into canonical brackets (or vice versa) is
// doctrine work that may change the implied ADD — it is not transcription.
//
// See exploration/scalable-publication-2026-05-23/PUBLICATION_STANDARDS.md
// for the full framing and the dual-convention calibration table.
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
   *  JOB notation has been authored — the DB column stays authoritative. */
  operationalNotation?: string | null;
}

export const RESOLVED_FORMULAS_FRAMING_PROSE =
  "Mechanically-derivable compound formulas: pure +1 operator stacks, " +
  "pt-ruled compounds, positional modifiers (reverse=+0), folk-name " +
  "resolutions with curator-locked decomposition, and the first multi-" +
  "operator chain. Each row's derivation is verifiable from the " +
  "settled operator + base inventory; no Wave 2 dependencies; no " +
  "curator-judgment cases. Burn-down progress lives in " +
  "formula_review_queue.md.";

// Resolved formulas accumulator (Sprint 1: 15 rows; Sprint 2: 7 rows).
// All from formula_gap_classification.csv where the row was classified
// `curator_pending` and the composition is mechanically derivable.
export const RESOLVED_FORMULAS_SPRINT_1: readonly ResolvedFormula[] = [
  {
    slug:        'paradox-mirage',
    name:        'paradox mirage',
    operator:    'paradox',
    base:        'mirage',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'paradox(+1) + mirage(2) = 3 ADD',
    provenance:  'paradox = +1 body modifier (canonical inventory); mirage = 2 ADD core atom',
  },
  {
    slug:        'symposium-mirage',
    name:        'symposium mirage',
    operator:    'symposium',
    base:        'mirage',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'symposium(+1) + mirage(2) = 3 ADD',
    operationalNotation: 'SET > (no plant while) OP IN [BOD] [DEX] > OP TOE [DEL]',  // Bucket A sibling-derivation per DERIVATION_AUDIT.md (2026-05-25); symposium-whirl precedent + mirage base; not Red-confirmed.
    provenance:  'symposium = +1 no-plant body modifier; mirage = 2 ADD core atom',
  },
  {
    slug:        'atomic-butterfly',
    name:        'atomic butterfly',
    operator:    'atomic',
    base:        'butterfly',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'atomic(+1) + butterfly(3) = 4 ADD',
    provenance:  'atomic = +1 on non-rotational bases; butterfly = 3 ADD core atom',
  },
  {
    slug:        'ducking-butterfly',
    name:        'ducking butterfly',
    operator:    'ducking',
    base:        'butterfly',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'ducking(+1) + butterfly(3) = 4 ADD',
    provenance:  'ducking = +1 midtime body modifier; butterfly = 3 ADD core atom',
  },
  {
    slug:        'ducking-osis',
    name:        'ducking osis',
    operator:    'ducking',
    base:        'osis',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'ducking(+1) + osis(3) = 4 ADD',
    provenance:  'ducking = +1 midtime body modifier; osis = 3 ADD core atom',
  },
  {
    slug:        'ducking-whirl',
    name:        'ducking whirl',
    operator:    'ducking',
    base:        'whirl',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'ducking(+1) + whirl(3) = 4 ADD',
    operationalNotation: 'TOE > DUCK [BOD] > OP IN [DEX] > OP CLIP [XBD] [DEL]',  // Bucket A sibling-derivation per DERIVATION_AUDIT.md (2026-05-25); ducking-mirage precedent + whirl base; not Red-confirmed.
    provenance:  'ducking = +1 midtime body modifier; whirl = 3 ADD core atom',
  },
  {
    slug:        'spinning-butterfly',
    name:        'spinning butterfly',
    operator:    'spinning',
    base:        'butterfly',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'spinning(+1) + butterfly(3) = 4 ADD',
    provenance:  'spinning = +1 midtime body modifier; butterfly = 3 ADD core atom',
  },
  {
    slug:        'spinning-osis',
    name:        'spinning osis',
    operator:    'spinning',
    base:        'osis',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'spinning(+1) + osis(3) = 4 ADD',
    provenance:  'spinning = +1 midtime body modifier; osis = 3 ADD core atom',
  },
  {
    slug:        'stepping-osis',
    name:        'stepping osis',
    operator:    'stepping',
    base:        'osis',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'stepping(+1) + osis(3) = 4 ADD',
    provenance:  'stepping = +1 set modifier (foot relocation); osis = 3 ADD core atom',
  },
  {
    slug:        'stepping-whirl',
    name:        'stepping whirl',
    operator:    'stepping',
    base:        'whirl',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'stepping(+1) + whirl(3) = 4 ADD',
    operationalNotation: 'CLIP > OP IN [DEX] >> SAME IN [DEX] > OP CLIP [XBD] [DEL]',  // Bucket A sibling-derivation per DERIVATION_AUDIT.md (2026-05-25); tombstone (stepping drifter) precedent + whirl base; not Red-confirmed.
    provenance:  'stepping = +1 set modifier; whirl = 3 ADD core atom',
  },
  {
    slug:        'symposium-whirl',
    name:        'symposium whirl',
    operator:    'symposium',
    base:        'whirl',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'symposium(+1) + whirl(3) = 4 ADD',
    provenance:  'symposium = +1 no-plant body modifier; whirl = 3 ADD core atom',
  },
  {
    slug:        'whirling-swirl',
    name:        'whirling swirl',
    operator:    'whirling',
    base:        'swirl',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'whirling(+1) + swirl(3) = 4 ADD',
    provenance:  'whirling = +1 midtime body modifier (post-2026-05-18 Movement System inheritance); swirl = 3 ADD core atom',
  },
  {
    slug:        'paradox-blender',
    name:        'paradox blender',
    operator:    'paradox',
    base:        'blender',
    baseAdd:     4,
    totalAdd:    5,
    derivation:  'paradox(+1) + blender(4) = 5 ADD',
    operationalNotation: 'CLIP > SAME IN [PDX] [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]',  // Bucket A sibling-derivation per DERIVATION_AUDIT.md (2026-05-25); paradox-whirl direction-flip precedent + blender base; not Red-confirmed.
    provenance:  'paradox = +1 body modifier; blender = 4 ADD compound (whirling osis)',
  },
  {
    slug:        'paradox-torque',
    name:        'paradox torque',
    operator:    'paradox',
    base:        'torque',
    baseAdd:     4,
    totalAdd:    5,
    derivation:  'paradox(+1) + torque(4) = 5 ADD',
    operationalNotation: 'CLIP > SAME IN [PDX] [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]',  // Bucket A sibling-derivation per DERIVATION_AUDIT.md (2026-05-25); paradox-whirl direction-flip precedent + torque (miraging osis) base; not Red-confirmed.
    provenance:  'paradox = +1 body modifier; torque = 4 ADD compound (miraging osis, pt11)',
  },
  {
    slug:        'spinning-torque',
    name:        'spinning torque',
    operator:    'spinning',
    base:        'torque',
    baseAdd:     4,
    totalAdd:    5,
    derivation:  'spinning(+1) + torque(4) = 5 ADD',
    operationalNotation: 'CLIP > (back) SPIN [BOD] > OP IN [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]',  // Bucket A sibling-derivation per DERIVATION_AUDIT.md (2026-05-25); spinning-osis double-spin pattern + torque (miraging osis) base; not Red-confirmed.
    provenance:  'spinning = +1 midtime body modifier; torque = 4 ADD compound (miraging osis, pt11)',
  },

  // ─── Sprint 2 (2026-05-18) ────────────────────────────────────────────
  // Pattern expansion beyond Sprint 1's pure +1-stacks: pt-ruled
  // compounds, positional modifiers (reverse=+0), the first multi-
  // operator chain, and folk-name resolutions whose decomposition is
  // curator-locked.

  {
    slug:        'eggbeater',
    name:        'eggbeater',
    operator:    'atomic',
    base:        'legover',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'atomic(+1) + legover(2) = 3 ADD',
    provenance:  'pt4 settled: eggbeater = atomic legover. atomic = +1 on non-rotational; legover = 2 ADD core atom',
  },
  {
    slug:        'ducking-clipper',
    name:        'ducking clipper',
    operator:    'ducking',
    base:        'clipper-stall',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'ducking(+1) + clipper-stall(2) = 3 ADD',
    provenance:  'ducking = +1 midtime body modifier; clipper-stall = 2 ADD core atom (xbody + stall)',
  },
  {
    slug:        'spinning-clipper',
    name:        'spinning clipper',
    operator:    'spinning',
    base:        'clipper-stall',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'spinning(+1) + clipper-stall(2) = 3 ADD',
    provenance:  'spinning = +1 midtime body modifier; clipper-stall = 2 ADD core atom',
  },
  {
    slug:        'rev-whirl',
    name:        'rev whirl',
    operator:    'reverse',
    base:        'whirl',
    baseAdd:     3,
    totalAdd:    3,
    derivation:  'xbody(1) + dex(1) + stall(1) = 3 ADD',
    operationalNotation: 'CLIP > OP OUT [DEX] > OP CLIP [XBD] [DEL]',
    provenance:  'Structural ADD decomposition: rev-whirl is structurally a whirl atom (1 dex + 1 cross-body + 1 stall = 3); the reverse(+0) + whirl(3) reading is the ALT interpretation (reverse-pair transform). 2026-05-23 curator-rendered-output audit: ADD row carries the structural form; ALT row carries the reverse-pair reading.',
  },
  {
    slug:        'orbit',
    name:        'orbit',
    operator:    'reverse',
    base:        'around-the-world',
    baseAdd:     2,
    totalAdd:    2,
    derivation:  'reverse(+0) + around-the-world(2) = 2 ADD',
    provenance:  'reverse = positional direction marker (+0 per Red 2026-05-11); ATW = 2 ADD core atom (full-orbit dex + stall). orbit is the canonical slug per CORE-ATOM-CANONICAL-RECONCILE-1 (2026-05-15); reverse-around-the-world and reverse-atw are aliases. Slug aligned to canonical `orbit` 2026-05-19 alongside DB row activation (red_additions_2026_04_20.csv + loader 19).',
  },
  {
    slug:        'paradox-symposium-whirl',
    name:        'paradox symposium whirl',
    operator:    'paradox + symposium',
    base:        'whirl',
    baseAdd:     3,
    totalAdd:    5,
    derivation:  'paradox(+1) + symposium(+1) + whirl(3) = 5 ADD',
    provenance:  'paradox = +1 body modifier; symposium = +1 no-plant body modifier (the "PS X" shorthand per glossary §6); whirl = 3 ADD core atom. First multi-operator chain in the resolved set',
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

  // ─── Sprint 3 (2026-05-18) — three additional folk-name resolutions ──
  // Targeted batch: the operator-board lede explicitly maps two of these
  // (PIX + MIRAGE → SMEAR, STEP + BUTTERFLY → RIPWALK). The third
  // (rev-up) publishes the most-defensible positional reading; see the
  // provenance note for the curator-uncertainty caveat.

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
    operationalNotation: 'CLIP > SAME IN [DEX] >> OP OUT [DEX] > OP CLIP [XBD] [DEL]',  // Bucket A sibling-derivation per DERIVATION_AUDIT.md (2026-05-25); dimwalk (pixie butterfly) dex-direction model + tombstone (stepping drifter) stepping pattern; not Red-confirmed.
    provenance:  'Folk-name resolution per operator-board lede + glossary §3 + §8: STEP + BUTTERFLY → RIPWALK. stepping = +1 set modifier (foot relocation); butterfly = 3 ADD core atom.',
  },
  // 'rev-up' resolved-formula entry removed 2026-05-24 per curator
  // rendered-output QC: rev-up is structurally distinct from rev-whirl
  // (NOT the same trick despite shared base=whirl + ADD=3). The prior
  // entry incorrectly applied rev-whirl's reverse-pair derivation. The
  // rev-up canonical row is now is_active=0 (red_corrections) until a
  // curator-authored structural reading is published.

  // ─── Sprint 4 (2026-05-19) — atomic-specific x-dex contribution ───────
  // First entry to publish an atomic-modifier formula where the +1 atomic
  // contribution is augmented by a doctrine-locked atomic-specific
  // x-dex (paradox-like) contribution from the toe-start position. Red
  // 2026-05-15: "Atom Smasher carries x-dex like paradox from a toe."
  // The extra +1 is part of atomic's structural identity in this
  // compound, not a separate operator. External sources (FootbagMoves)
  // list 3 ADD by collapsing atomic into the base; IFPA treats it as 4
  // because atomic contributes its own +1 AND brings the x-dex/paradox-
  // like contribution from toe.

  {
    slug:        'atom-smasher',
    name:        'atom smasher',
    operator:    'atomic + x-dex',
    base:        'mirage',
    baseAdd:     2,
    totalAdd:    4,
    derivation:  'atomic(+1) + mirage(2) + x-dex/paradox-like contribution(+1) = 4 ADD',
    operationalNotation: 'TOE > SAME OUT [DEX] >> OP IN [DEX] > OP TOE [DEL]',  // Bucket A sibling-derivation per DERIVATION_AUDIT.md (2026-05-25); scrambled-eggbeater (atomic-pickup X-Dex) pattern + mirage base; not Red-confirmed (Red 2026-05-15 ruled the ADD-math but not the operational notation).
    provenance:  'Red 2026-05-15 ruling: Atom Smasher carries x-dex/paradox-like extra difficulty from toe. FootbagMoves lists 3 ADD; IFPA treats it as 4. The extra +1 is an atomic-specific x-dex/paradox-like contribution, not a separate ducking operator. Chain reading remains "atomic mirage" per freestyleSymbolicEquivalences.ts.',
  },

  // ─── Sprint 5 (2026-05-19) — movement-element components ──────────────
  // Adds two new resolved-formula entries for the swing-element doctrine
  // (pendulum) and the flying-modifier doctrine (flying-clipper). Both
  // extend the +1 modifier-stack pattern with movement-element components
  // distinct from the named operator modifiers in Sprints 1-2 (paradox,
  // spinning, ducking, symposium, stepping, atomic, whirling, pixie).
  //
  // Swing-element pair: pendulum = toe(1) + swing(1) = 2 ADD; rake reads
  // the same arithmetic in reverse element order (swing then toe). Only
  // pendulum is published here — rake has no active freestyle_tricks row
  // yet. Canonicalization of rake (red_additions_2026_04_20.csv + DB
  // reload) is a separate curator step before its resolved-formula entry
  // can land. The chain reading for pendulum stays implicit; the
  // freestyle_tricks.notation field carries the structural form.
  //
  // Flying-modifier: the `flying` body component is a body-modifier
  // bucket (BOD) contributing +1 ADD to the base trick. ADD accounting
  // renders as BOD(1) — flying-clipper = BOD(1) + clipper(1) = 2 ADD,
  // matching the DB row's adds=2. flying-inside and flying-outside are
  // NOT included here — they are 1 ADD body primitives where the flying
  // motion IS the trick (irreducible; no compound +1 stack), parallel
  // to spin / double-spin / hop-over.

  {
    slug:        'pendulum',
    name:        'pendulum',
    operator:    'swing',
    base:        'toe-stall',
    baseAdd:     1,
    totalAdd:    2,
    derivation:  'toe(1) + swing(1) = 2 ADD',
    provenance:  'Curator-locked swing-element doctrine 2026-05-19: pendulum decomposes to a toe-stall start position plus a swing movement element (+1). The "swing" component is a structural movement element (not a named operator modifier) contributing +1 ADD. Companion trick rake reads the same arithmetic with reversed element order (swing > toe); rake awaits canonical row before its resolved-formula entry lands.',
  },
  {
    slug:        'flying-clipper',
    name:        'flying clipper',
    operator:    'flying',
    base:        'clipper',
    baseAdd:     1,
    totalAdd:    2,
    derivation:  'BOD(1) + clipper(1) = 2 ADD',
    provenance:  'Curator-locked flying-modifier doctrine 2026-05-19: flying-X = flying body modifier (BOD bucket; +1 ADD) + base trick. ADD accounting renders as BOD(1) per the body-modifier bucket convention. Here: flying + clipper kick (1 ADD body primitive, not clipper-stall surface). Distinct from flying-inside and flying-outside, which are themselves 1 ADD body primitives (the flying motion as the trick, not a +1 stack on a separate base).',
  },

  // ─── Sprint 6 (2026-05-19) — rake (direction-variant companion to pendulum) ─
  // Closes the swing-element pair opened in Sprint 5. With rake now active
  // in freestyle_tricks (red_additions_2026_04_20.csv row + loader 19
  // reload), the second half of the direction-variant pair lands here.
  // Arithmetic is identical to pendulum (toe + swing = 2 ADD); element
  // order is reversed (swing > toe). FootbagMoves lists rake at 3 ADD;
  // IFPA treats it as 2 — Red review of the discrepancy pending.

  {
    slug:        'rake',
    name:        'rake',
    operator:    'swing',
    base:        'toe-stall',
    baseAdd:     1,
    totalAdd:    2,
    derivation:  'swing(1) + toe(1) = 2 ADD',
    operationalNotation: 'SET > SWING TOE [DEL]',
    provenance:  'Direction-variant companion of pendulum (Sprint 5). Same swing-element doctrine; swing > toe order (vs pendulum toe > swing). FootbagMoves lists rake at 3 ADD; IFPA treats it as 2 per curator-locked swing-element doctrine (Red review pending).',
  },

  // ─── Sprint 7 (2026-05-19) — fury + fog (Red pt6-locked folk compounds) ────
  // Closes two folk-named compounds from the workbook missing-IFPA queue.
  // Both have Red pt6 2026-05-04 rulings published in red_additions_2026_04_20
  // and modifier_links registered on the DB rows. The gap was missing
  // resolved-formula derivation entries.
  //
  // fury: Red pt6 2026-05-04 overrode pt4 (paradox+barraging+mirage)
  // with the cleaner furious-paradox-mirage reading. furious is +2 on
  // rotational bases (mirage is rotational), +1 on non-rotational.
  //
  // fog: Red pt6 2026-05-04 MODEL_CHANGE — Fog does NOT contain an
  // eggbeater (Bedwetter does). Decomposition uses dlo (double-leg-over)
  // as base with stepping+paradox operator stack.

  {
    slug:        'fury',
    name:        'fury',
    operator:    'furious + paradox',
    base:        'mirage',
    baseAdd:     2,
    totalAdd:    5,
    derivation:  'furious(+2 rotational) + paradox(+1) + mirage(2) = 5 ADD',
    operationalNotation: 'CLIP > SAME IN [DEX] >> OP IN [PDX] [DEX] > OP TOE [DEL]',  // Bucket A sibling-derivation per DERIVATION_AUDIT.md (2026-05-25); furious multi-dex pattern (nemesis precedent) + paradox-mirage stack; not Red-confirmed (Red pt6 ruled the chain reading but not the operational notation).
    provenance:  'Red pt6 2026-05-04: Fury = Furious Paradox Mirage (replaces pt4 paradox+barraging+mirage decomposition; ADD 5 unchanged). furious modifier is +1 non-rotational / +2 rotational; applied to mirage (rotational base) yields +2. Chain reading published in freestyleSymbolicEquivalences.ts.',
  },
  {
    slug:        'fog',
    name:        'fog',
    operator:    'stepping + paradox',
    base:        'double-leg-over',
    baseAdd:     3,
    totalAdd:    5,
    derivation:  'stepping(+1) + paradox(+1) + dlo(3) = 5 ADD',
    provenance:  'Red pt6 2026-05-04 MODEL_CHANGE: Fog does NOT contain an eggbeater (Bedwetter does). Decomposition is stepping+paradox+dlo with double-leg-over as the 3-ADD base. Folk aliases blurry dlo and blurry dim walk preserved on DB row.',
  },

  // ── Wave 1 low-risk compound promotions (2026-05-22). Each derivation
  //    is mechanically verifiable from the modifier × base ADD table.
  //    No composite-modifier expansion, no doctrine block, no folk-name
  //    ambiguity. Promoted into FIRST_CLASS_TIER_2 (JOB chain pending;
  //    ADD curator-locked).
  {
    slug:        'atomic-torque',
    name:        'atomic torque',
    operator:    'atomic',
    base:        'torque',
    baseAdd:     4,
    totalAdd:    6,
    derivation:  'atomic(+2 rotational) + torque(4) = 6 ADD',
    provenance:  'atomic = +1 non-rotational / +2 rotational set modifier; torque = 4 ADD rotational compound base. Wave 1 audit derivation 2026-05-22.',
  },
  {
    slug:        'ducking-mirage',
    name:        'ducking mirage',
    operator:    'ducking',
    base:        'mirage',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'ducking(+1) + mirage(2) = 3 ADD',
    provenance:  'ducking = +1 midtime body modifier; mirage = 2 ADD core atom (rotational). Wave 1 audit derivation 2026-05-22.',
  },
  {
    slug:        'paradox-drifter',
    name:        'paradox drifter',
    operator:    'paradox',
    base:        'drifter',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'paradox(+1) + drifter(3) = 4 ADD',
    operationalNotation: 'CLIP > SAME IN [PDX] [DEX] > SAME CLIP [XBD] [DEL]',  // Bucket A sibling-derivation per DERIVATION_AUDIT.md (2026-05-25); paradox-whirl direction-flip precedent + drifter base; not Red-confirmed.
    provenance:  'paradox = +1 body modifier; drifter = 3 ADD rotational compound base. Wave 1 audit derivation 2026-05-22.',
  },
  {
    slug:        'spinning-pickup',
    name:        'spinning pickup',
    operator:    'spinning',
    base:        'pickup',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'spinning(+1) + pickup(2) = 3 ADD',
    provenance:  'spinning = +1 midtime body modifier; pickup = 2 ADD core atom (non-rotational). Wave 1 audit derivation 2026-05-22.',
  },
  {
    slug:        'tapping-whirl',
    name:        'tapping whirl',
    operator:    'tapping',
    base:        'whirl',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'tapping(+1) + whirl(3) = 4 ADD',
    provenance:  'tapping = +1 body modifier; whirl = 3 ADD core atom (rotational). Wave 1 audit derivation 2026-05-22.',
  },

  // ── Wave 3 audit-derived promotions (2026-05-22). Each entry is a
  //    parser-validated modifier × base derivation (the audit's
  //    "real-compound" path). Closes most of the remaining promotion-
  //    candidate pool from the read-only audit. No composite-modifier
  //    expansion in this batch; the blurry-* / haze / food-processor /
  //    mantis / nova compounds remain non-first-class until their
  //    composite-derivation entries are curator-authored.
  {
    slug:        'cross-body-sole-stall',
    name:        'cross-body sole stall',
    operator:    'xbody',
    base:        'sole-stall',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'xbody(+1) + sole-stall(2) = 3 ADD',
    provenance:  'cross-body normalizes to xbody bucket per curator 2026-05-22; sole-stall = 2 ADD unusual-surface stall.',
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
    slug:        'reverse-drifter',
    name:        'reverse-drifter',
    operator:    'reverse (directional)',
    base:        'drifter',
    baseAdd:     3,
    totalAdd:    3,
    derivation:  '[directional: rev] + drifter(3) = 3 ADD',
    provenance:  'rev/reverse is directional notation (zero-ADD); drifter = 3 ADD core compound. Curator 2026-05-22: rev/reverse is alternate directional notation, not an ADD operator.',
  },
  {
    slug:        'scrambled-eggbeater',
    name:        'scrambled eggbeater',
    operator:    'atomic',
    base:        'pickup',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'atomic(+1) + pickup(2) = 3 ADD',
    provenance:  'atomic = +1 non-rotational set modifier; pickup = 2 ADD core atom.',
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
    provenance:  'Folk-name resolution (≡ stepping paradox mirage). stepping = +1 body modifier; paradox = +1 body modifier; mirage = 2 ADD core atom.',
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
    slug:        'paradox-whirl',
    name:        'paradox whirl',
    operator:    'paradox',
    base:        'whirl',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'paradox(+1) + whirl(3) = 4 ADD',
    provenance:  'paradox = +1 body modifier; whirl = 3 ADD rotational core atom.',
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
    slug:        'spinning-whirl',
    name:        'spinning whirl',
    operator:    'spinning',
    base:        'whirl',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'spinning(+1) + whirl(3) = 4 ADD',
    operationalNotation: 'CLIP > (back) SPIN [BOD] > OP IN [DEX] > OP CLIP [XBD] [DEL]',  // Bucket A sibling-derivation per DERIVATION_AUDIT.md (2026-05-25); spinning-pickup / spinning-clipper precedents + whirl base; not Red-confirmed.
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
    slug:        'spinal-tap',
    name:        'spinal tap',
    operator:    'tapping',
    base:        'torque',
    baseAdd:     4,
    totalAdd:    5,
    derivation:  'tapping(+1) + torque(4) = 5 ADD',
    provenance:  'tapping = +1 body modifier; torque = 4 ADD rotational compound base. Folk-name resolution (≡ tapping torque).',
  },
  {
    slug:        'spinning-symposium-whirl',
    name:        'spinning symposium whirl',
    operator:    'spinning + symposium',
    base:        'whirl',
    baseAdd:     3,
    totalAdd:    5,
    derivation:  'spinning(+1) + symposium(+1) + whirl(3) = 5 ADD',
    operationalNotation: 'CLIP > (back) SPIN [BOD] > (no plant while) OP IN [BOD] [DEX] > OP CLIP [XBD] [DEL]',  // Bucket A sibling-derivation per DERIVATION_AUDIT.md (2026-05-25); clean compose of spinning + symposium-whirl precedents on whirl base; not Red-confirmed.
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
    operationalNotation: 'CLIP > (no plant while) SAME OUT [BOD] [DEX] >> OP IN [DEX] > OP TOE [DEL]',  // Bucket A sibling-derivation per DERIVATION_AUDIT.md (2026-05-25); atom-smasher (atomic-mirage X-Dex) + symposium-whirl no-plant pattern; not Red-confirmed (Red 2026-05-20 ruled the ADD-math but not the operational notation).
    provenance:  'Red 2026-05-20 adjudication: Atomic Mirage already 4 (Atom Smasher canonical); witchdoctor = Atomic Mirage + Symposium = 5 ADD. Composite reading (COMPOSITE_DERIVATIONS) — atom-smasher as the curator-canonical 4-ADD composite base.',
  },
  {
    slug:        'mind-bender',
    name:        'mind bender',
    operator:    'ducking + paradox',
    base:        'blender',
    baseAdd:     4,
    totalAdd:    6,
    derivation:  'ducking(+1) + paradox(+1) + blender(4) = 6 ADD',
    provenance:  'ducking = +1 body modifier; paradox = +1 body modifier; blender = 4 ADD rotational compound. Folk-name resolution.',
  },
  {
    slug:        'mullet',
    name:        'mullet',
    operator:    'ducking + paradox + symposium',
    base:        'whirl',
    baseAdd:     3,
    totalAdd:    6,
    derivation:  'ducking(+1) + paradox(+1) + symposium(+1) + whirl(3) = 6 ADD',
    provenance:  'ducking = +1 body modifier; paradox = +1 body modifier; symposium = +1 no-plant body modifier; whirl = 3 ADD rotational core atom. Folk-name resolution.',
  },
  {
    slug:        'spender',
    name:        'spender',
    operator:    'spinning + paradox',
    base:        'blender',
    baseAdd:     4,
    totalAdd:    6,
    derivation:  'spinning(+1) + paradox(+1) + blender(4) = 6 ADD',
    provenance:  'spinning = +1 body modifier; paradox = +1 body modifier; blender = 4 ADD rotational compound. Folk-name resolution (≡ spinning paradox blender).',
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

  // ── Wave 4-B mechanical notation back-fill promotions (2026-05-22).
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
    operationalNotation: 'SET > (no plant while) OP OUT [BOD] [DEX] > OP TOE [DEL]',  // Bucket A sibling-derivation per DERIVATION_AUDIT.md (2026-05-25); symposium-whirl no-plant pattern + illusion base; not Red-confirmed.
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
    operationalNotation: 'CLIP > OP IN [DEX] >> SAME IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]',  // Bucket A sibling-derivation per DERIVATION_AUDIT.md (2026-05-25); tombstone (stepping drifter) stepping pattern + double-leg-over base; not Red-confirmed.
    provenance:  'stepping = +1 body modifier; double-leg-over (dlo) = 3 ADD compound base. DB description "Stepping-modified double leg over." Folk-name resolution.',
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
    provenance:  'paradox = +1 body modifier; reverse-drifter = 3 ADD compound (Wave 3 promotion). DB description "Paradox-modified reverse drifter."',
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
    provenance:  'stepping = +1 body modifier; drifter = 3 ADD rotational compound base. DB description "Stepping-modified drifter."',
  },
  {
    slug:        'blurriest',
    name:        'blurriest',
    operator:    'blurry',
    base:        'barfly',
    baseAdd:     4,
    totalAdd:    5,
    derivation:  'blurry(+1) + barfly(4) = 5 ADD',
    provenance:  'blurry = +1 flat (post Red 2026-05-20 retraction; "blurry just implies stepping"); barfly = 4 ADD compound (Wave 3 promotion, ATAM-derived). Per build_trick_reconciliation_workbook.py MODIFIER_COMPOSITIONS allowlist comment: blurriest specifically uses blurry as +1 flat, NOT as the stepping+paradox carve-out applied to blur/blurry-whirl/blurry-torque/food-processor.',
  },
  {
    slug:        'grave-digger',
    name:        'grave digger',
    operator:    'stepping',
    base:        'torque',
    baseAdd:     4,
    totalAdd:    5,
    derivation:  'stepping(+1) + torque(4) = 5 ADD',
    provenance:  'stepping = +1 body modifier; torque = 4 ADD rotational compound base. DB description "Stepping-modified same-side torque." Folk-name resolution.',
  },
  {
    slug:        'tomahawk',
    name:        'tomahawk',
    operator:    'ducking',
    base:        'paradox-whirl',
    baseAdd:     4,
    totalAdd:    5,
    derivation:  'ducking(+1) + paradox-whirl(4) = 5 ADD',
    provenance:  'ducking = +1 midtime body modifier; paradox-whirl = 4 ADD compound (Wave 3 promotion). DB description "Ducking-modified paradox whirl." Folk-name resolution. Shallow-readable derivation per composite-modifier framework §6.1: treats paradox-whirl as the published 4-ADD base rather than recursively expanding to ducking(+1)+paradox(+1)+whirl(3).',
  },
  {
    slug:        'big-apple',
    name:        'big apple',
    operator:    'gyro + symposium',
    base:        'torque',
    baseAdd:     4,
    totalAdd:    6,
    derivation:  'gyro(+1) + symposium(+1) + torque(4) = 6 ADD',
    provenance:  'gyro = +1 body modifier; symposium = +1 no-plant body modifier; torque = 4 ADD rotational compound base. DB description "Gyro-and-symposium modified torque." Folk-name resolution.',
  },

  // ── Wave 5 observational→canonical promotions (2026-05-22). 14 entries
  //    moved from OBSERVATIONAL_TRICKS module into canonical
  //    freestyle_tricks rows via the audit-validated promotion frontier.
  //    9 FB.org + 4 PassBack + 1 stepwise FB.org (paradox-blizzard
  //    depends on blizzard, both land in this slice). Per layer-
  //    separation contract (feedback_observational_canonical_promotion_cleanup),
  //    each row's observational entry is removed in the same change-set.
  {
    slug:        'blizzard',
    name:        'blizzard',
    operator:    'stepping',
    base:        'illusion',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'stepping(+1) + illusion(2) = 3 ADD',
    provenance:  'stepping = +1 body modifier; illusion = 2 ADD core atom. PassBack folk-name resolution (Stepping far Illusion). Wave 5 observational→canonical promotion 2026-05-22.',
  },
  {
    slug:        'blaze',
    name:        'blaze',
    operator:    'whirling',
    base:        'mirage',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'whirling(+1) + mirage(2) = 3 ADD',
    provenance:  'whirling = +1 body modifier; mirage = 2 ADD core atom (rotational). PassBack folk-name resolution (Whirling far Mirage). Whirling operator settled per Movement System axes 2026-05-18.',
  },
  {
    slug:        'bedwetter',
    name:        'bedwetter',
    operator:    'stepping',
    base:        'eggbeater',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'stepping(+1) + eggbeater(3) = 4 ADD',
    provenance:  'stepping = +1 body modifier; eggbeater = 3 ADD compound (≡ atomic legover per pt4). PassBack folk-name resolution. Wave 5 promotion 2026-05-22.',
  },
  {
    slug:        'sole-survivor',
    name:        'sole survivor',
    operator:    'spinning + symposium',
    base:        'whirl',
    baseAdd:     3,
    totalAdd:    5,
    derivation:  'spinning(+1) + symposium(+1) + whirl(3) = 5 ADD',
    provenance:  'spinning = +1 midtime body modifier; symposium = +1 no-plant body modifier; whirl = 3 ADD core atom (rotational). PassBack folk-name resolution.',
  },
  {
    slug:        'spinning-paradox-mirage',
    name:        'spinning paradox mirage',
    operator:    'spinning + paradox',
    base:        'mirage',
    baseAdd:     2,
    totalAdd:    4,
    derivation:  'spinning(+1) + paradox(+1) + mirage(2) = 4 ADD',
    provenance:  'spinning = +1 body modifier; paradox = +1 body modifier; mirage = 2 ADD core atom. FB.org /newmoves Paradox Moves listing (2003).',
  },
  {
    slug:        'spinning-paradox-illusion',
    name:        'spinning paradox illusion',
    operator:    'spinning + paradox',
    base:        'illusion',
    baseAdd:     2,
    totalAdd:    4,
    derivation:  'spinning(+1) + paradox(+1) + illusion(2) = 4 ADD',
    provenance:  'spinning = +1 body modifier; paradox = +1 body modifier; illusion = 2 ADD core atom. FB.org /newmoves Paradox Moves listing (2003).',
  },
  {
    slug:        'spinning-paradox-whirl',
    name:        'spinning paradox whirl',
    operator:    'spinning + paradox',
    base:        'whirl',
    baseAdd:     3,
    totalAdd:    5,
    derivation:  'spinning(+1) + paradox(+1) + whirl(3) = 5 ADD',
    provenance:  'spinning = +1 body modifier; paradox = +1 body modifier; whirl = 3 ADD core atom (rotational). FB.org /newmoves (2003).',
  },
  {
    slug:        'paradox-double-leg-over',
    name:        'paradox double leg over',
    operator:    'paradox',
    base:        'double-leg-over',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'paradox(+1) + dlo(3) = 4 ADD',
    provenance:  'paradox = +1 body modifier; double-leg-over (dlo) = 3 ADD compound base. FB.org /newmoves description: "A paradox mirage with an extra leg over at the end."',
  },
  {
    slug:        'paradox-barrage',
    name:        'paradox barrage',
    operator:    'paradox',
    base:        'barrage',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'paradox(+1) + barrage(3) = 4 ADD',
    provenance:  'paradox = +1 body modifier; barrage = 3 ADD compound (Wave 3 promotion; SS=+0 per pt12 ruling). FB.org /newmoves (2003).',
  },
  {
    slug:        'paradox-symposium-mirage',
    name:        'paradox symposium mirage',
    operator:    'paradox + symposium',
    base:        'mirage',
    baseAdd:     2,
    totalAdd:    4,
    derivation:  'paradox(+1) + symposium(+1) + mirage(2) = 4 ADD',
    provenance:  'paradox = +1 body modifier; symposium = +1 no-plant body modifier; mirage = 2 ADD core atom. FB.org /newmoves (2003).',
  },
  {
    slug:        'paradox-high-plains-drifter',
    name:        'paradox high-plains-drifter',
    operator:    'paradox',
    base:        'high-plains-drifter',
    baseAdd:     4,
    totalAdd:    5,
    derivation:  'paradox(+1) + high-plains-drifter(4) = 5 ADD',
    provenance:  'paradox = +1 body modifier; high-plains-drifter = 4 ADD compound (Wave 3 promotion; pt11 = miraging clipper). FB.org /newmoves; alias Paradox Double Drifter.',
  },
  {
    slug:        'spinning-paradox-blender',
    name:        'spinning paradox blender',
    operator:    'spinning + paradox',
    base:        'blender',
    baseAdd:     4,
    totalAdd:    6,
    derivation:  'spinning(+1) + paradox(+1) + blender(4) = 6 ADD',
    provenance:  'spinning = +1 body modifier; paradox = +1 body modifier; blender = 4 ADD compound (rotational; pt11 = whirling osis). FB.org /newmoves (2003).',
  },
  {
    slug:        'stepping-ducking-paradox-blender',
    name:        'stepping ducking paradox blender',
    operator:    'stepping + ducking + paradox',
    base:        'blender',
    baseAdd:     4,
    totalAdd:    7,
    derivation:  'stepping(+1) + ducking(+1) + paradox(+1) + blender(4) = 7 ADD',
    provenance:  'Three-modifier stack on blender. All modifiers = +1 body modifiers; blender = 4 ADD rotational compound base. FB.org /newmoves (2003). Highest-ADD compound in the FB.org corpus that decomposes cleanly via +1 arithmetic.',
  },
  {
    slug:        'paradox-blizzard',
    name:        'paradox blizzard',
    operator:    'paradox',
    base:        'blizzard',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'paradox(+1) + blizzard(3) = 4 ADD',
    provenance:  'paradox = +1 body modifier; blizzard = 3 ADD compound (canonicalized in this slice; was stepping illusion). Stepwise dependency resolved 2026-05-22 within Wave 5. FB.org /newmoves (2003).',
  },

  // ── Wave 7 doctrine-divergence pilot batch (2026-05-23). Three rows
  //    promoted from the observational corpus under the doctrine-
  //    divergence framework. Each row's IFPA-grammar derivation
  //    differs from PassBack's source claim by +1 ADD; the published
  //    canonical value matches the IFPA derivation, and the
  //    divergence is documented as historical-divergence in
  //    DOCTRINE_DIVERGENCE_REGISTRY. Linked to Red queue Q7
  //    (implicit-operator hypothesis).
  {
    slug:        'blurrage',
    name:        'blurrage',
    operator:    'stepping',
    base:        'barrage',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'stepping(+1) + barrage(3) = 4 ADD',
    operationalNotation: 'CLIP > SAME IN [DEX] >> OP IN [DEX] > SAME IN [DEX] > OP TOE [DEL]',  // Bucket A sibling-derivation per DERIVATION_AUDIT.md (2026-05-25); tombstone (stepping drifter) stepping pattern + barrage doubled-dex base; medium confidence (stepping-on-barrage stack pattern is unprecedented); not Red-confirmed.
    provenance:  'stepping = +1 body modifier; barrage = 3 ADD compound (Wave 3 promotion via ATAM bracket-flag count). PassBack source claims 3 ADD; the +1 gap is documented as historical-divergence under Red Q7 (Wave 7 doctrine-divergence pilot 2026-05-23).',
  },
  {
    slug:        'predator',
    name:        'predator',
    operator:    'atomic',
    base:        'double-leg-over',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'atomic(+1 non-rotational) + dlo(3) = 4 ADD',
    provenance:  'atomic = +1 non-rotational set modifier; double-leg-over (dlo) = 3 ADD compound base (dlo not in FIRST_CLASS_ROTATIONAL_BASES). PassBack source claims 3 ADD; the +1 gap may reflect pt10\'s implicit paradox-atomic framing per Red Q7. Wave 7 doctrine-divergence pilot.',
  },
  {
    slug:        'schmoe',
    name:        'schmoe',
    operator:    'stepping',
    base:        'legover',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'stepping(+1) + legover(2) = 3 ADD',
    provenance:  'stepping = +1 body modifier; legover = 2 ADD core atom. PassBack source claims 2 ADD (reading: Stepping near Legover); the +1 gap is the same systemic pattern as blurrage. Wave 7 doctrine-divergence pilot 2026-05-23, Red Q7.',
  },

  // ── 2026-05-23 — productive-multiplicity base entries (DATW + DLO) ─────
  // Top-level JOB + ADD entries for the two community-stabilized
  // productive-multiplicity compounds (per freestyle-dictionary skill's
  // productive multiplicity exception list). Both base operational forms
  // come from the footbag.org corpus; ADD breakdown decomposes through
  // dex events and stall delay.
  {
    slug:        'double-around-the-world',
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
    slug:        'double-leg-over',
    name:        'double leg over',
    operator:    'double',
    base:        'legover',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'dex(2) + stall(1) = 3 ADD',
    operationalNotation: 'SET > OP IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]',
    provenance:  'footbag.org corpus base operational form. Opposite-side inside dex into opposite-side outside dex into a same-side toe stall. ADD decomposes as two dex events (1 each) plus the terminal stall (1). Alias forms (double legover, dlo) collapse to the canonical double-leg-over slug.',
  },

  // ─── Bucket A derivation backfill (2026-05-25) ────────────────────────────
  // Three new ResolvedFormula entries from the pre-Red derivation audit
  // (exploration/derivation-audit-2026-05-25/DERIVATION_AUDIT.md §2.1
  // Bucket A). Slugs had neither a ResolvedFormula entry nor an
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
    derivation:  'surging(+2 = spinning + stepping per Red pt2) + butterfly(3) = 5 ADD',
    operationalNotation: 'CLIP > (back) SPIN [BOD] > SAME IN [DEX] >> OP OUT [DEX] > OP CLIP [XBD] [DEL]',  // Bucket A sibling-derivation per DERIVATION_AUDIT.md (2026-05-25); surging pattern (surge / surreal / venom) + butterfly base; not Red-confirmed.
    provenance:  'surging primitive (2 ADD; decomposes to spinning + stepping per Red pt2); butterfly = 3 ADD core atom. Chain reading "surging butterfly" per freestyleSymbolicEquivalences.ts. Bucket A derivation backfill 2026-05-25.',
  },
  {
    slug:        'torque',
    name:        'torque',
    operator:    'miraging',
    base:        'osis',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'miraging(+1) + osis(3) = 4 ADD',
    operationalNotation: 'SET > OP IN [DEX] > (back or front) SPIN [BOD] > OP CLIP [XBD] [DEL]',  // Bucket A sibling-derivation per DERIVATION_AUDIT.md (2026-05-25); compound-of-canonicals (mirage dex + osis spin-terminal); chain reading "miraging osis" pt11-locked; not Red-confirmed for operational notation.
    provenance:  'pt11-locked chain reading "miraging osis": torque = mirage operator (+1 dex on the osis chassis) + osis = 4 ADD. The operational notation composes mirage\'s in-to-out dex with osis\'s spin-into-clipper terminal. Bucket A derivation backfill 2026-05-25.',
  },
  {
    slug:        'omelette',
    name:        'omelette',
    operator:    'atomic',
    base:        'illusion',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'atomic(+1 non-rotational) + illusion(2) = 3 ADD',
    operationalNotation: 'SET > OP OUT [DEX] >> OP IN [DEX] > OP TOE [DEL]',  // Bucket A sibling-derivation per DERIVATION_AUDIT.md (2026-05-25); chain reading "atomic illusion" (pt2 + followup-2026-04 locked) drives the derivation despite DB base_trick=pickup; structural conflict noted in audit; not Red-confirmed for operational notation.
    provenance:  'Chain reading "atomic illusion" per freestyleSymbolicEquivalences.ts (pt2 + followup-2026-04 locked) — derivation follows the chain, NOT the DB base_trick=pickup. Structural conflict between chain reading and DB base flagged in audit Bucket A (medium confidence). atomic = +1 non-rotational set modifier; illusion = 2 ADD core atom. Bucket A derivation backfill 2026-05-25.',
  },
];
