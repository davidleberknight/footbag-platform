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
}

export const RESOLVED_FORMULAS_FRAMING_PROSE =
  "Mechanically-derivable compound formulas — pure +1 operator stacks, " +
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
    derivation:  'reverse(+0) + whirl(3) = 3 ADD',
    provenance:  'reverse = positional direction marker (+0 per Red 2026-05-11 + 2026-05-15); whirl = 3 ADD core atom',
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
    provenance:  'Folk-name resolution per operator-board lede + glossary §3 + §8: STEP + BUTTERFLY → RIPWALK. stepping = +1 set modifier (foot relocation); butterfly = 3 ADD core atom.',
  },
  {
    slug:        'rev-up',
    name:        'rev up',
    operator:    'reverse',
    base:        'whirl',
    baseAdd:     3,
    totalAdd:    3,
    derivation:  'reverse(+0) + whirl(3) = 3 ADD',
    provenance:  'reverse = positional direction marker (+0 per Red 2026-05-11); whirl = 3 ADD core atom. Curator note: rev-up and rev-whirl are distinct canonical rows in freestyle_tricks (both base=whirl, both ADD=3); the folk distinction is preserved at the row level. The decomposition reading published here is identical for both rows — if rev-up has a structurally distinct reading the curator should override',
  },

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
  // Flying-modifier: the `flying` body component contributes +1 to the
  // base trick's ADD. flying-clipper = flying(+1) + clipper(1) = 2 ADD,
  // matching the DB row. flying-inside and flying-outside are NOT
  // included here — they are 1 ADD body primitives where the flying
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
    derivation:  'flying(+1) + clipper(1) = 2 ADD',
    provenance:  'Curator-locked flying-modifier doctrine 2026-05-19: flying-X = flying(+1) + base trick. The `flying` body component contributes +1 ADD to the base trick. Here: flying + clipper kick (1 ADD body primitive, not clipper-stall surface). Distinct from flying-inside and flying-outside, which are themselves 1 ADD body primitives (the flying motion as the trick, not a +1 stack on a separate base).',
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
    provenance:  'Direction-variant companion of pendulum (Sprint 5). Same swing-element doctrine; swing > toe order (vs pendulum toe > swing). FootbagMoves lists rake at 3 ADD; IFPA treats it as 2 per curator-locked swing-element doctrine — Red review pending.',
  },
];
