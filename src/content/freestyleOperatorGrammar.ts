/**
 * freestyleOperatorGrammar.ts
 * ============================
 *
 * Observational grammar registry for freestyle modifier operators.
 * Each entry codifies the structural transformation a single operator
 * applies to a base trick's operational notation, as observed from
 * resolved sibling pairs in the dictionary.
 *
 * Companion to the derivation audit.
 *
 * The audit classifies unresolved tricks against the rules captured
 * here, surfaces candidate JOB rows, and isolates true doctrine
 * ambiguities. This module is the inspectable code-level companion to
 * §1 of that audit.
 *
 * LAYER SEPARATION (forever-rule):
 *   - This module is OBSERVATIONAL. It records the patterns the
 *     dictionary already exhibits in resolved op_notation rows.
 *   - It does NOT auto-derive new operational_notation. The decision
 *     to apply a derived candidate row is curator territory.
 *   - There is intentionally no `applyOperator()` function here.
 *     Adding one without curator approval would constitute auto-
 *     derivation and is out of scope for the pre-Red governance pass.
 *
 * CONFIDENCE LADDER (mirrors audit §4):
 *   high        : 3+ resolved sibling precedents on different bases
 *   medium-high : 2 sibling precedents; one variation noted
 *   medium      : 1 sibling precedent; structurally clean
 *   low         : observed inconsistently; folk-name path only
 *
 * FOREVER-RULES:
 *   - Each entry names the operator's slug, observed signature, ADD
 *     contribution, and at least one resolved sibling precedent.
 *     Operators with zero precedents do not appear here.
 *   - Operators that resolve to other operators in doctrine
 *     (e.g., surging = spinning + stepping per Red pt2;
 *     blurry = stepping per Red 2026-05-20) are captured via a
 *     `decomposesTo` field.
 *   - Red rulings are cited inline (pt#, date).
 *   - No individual names per the public-prose depersonalization rule.
 *   - When a rule has known base-specific variations (e.g., paradox
 *     direction-flip on whirl/illusion/dlo vs OP-IN retention on
 *     mirage), the variation is named, never silently averaged away.
 *
 * STATUS: First-draft observational registry. Curator
 * review required before any candidate JOB row sourced from this
 * grammar is applied to the dictionary.
 */

export type OperatorConfidence = 'high' | 'medium-high' | 'medium' | 'low';

export interface OperatorPrecedent {
  /** Base trick the precedent demonstrates the operator on. */
  baseSlug: string;
  /** Base trick's operational notation (the input). */
  baseOp: string;
  /** Resolved compound's slug. */
  compoundSlug: string;
  /** Resolved compound's operational notation (the output). */
  compoundOp: string;
}

export interface OperatorVariation {
  /** Short label for the variation. */
  label: string;
  /** Bases on which this variation applies. */
  appliesToBases: readonly string[];
  /** Plain-English explanation. */
  note: string;
}

export interface OperatorGrammarEntry {
  /** Operator slug (e.g., 'paradox', 'ducking'). */
  slug: string;
  /** Human-readable signature describing the transformation. */
  signature: string;
  /** ADD contribution per occurrence (some are base-dependent). */
  addContribution: string;
  /** Resolved sibling pairs demonstrating the rule. */
  precedents: readonly OperatorPrecedent[];
  /** Named base-specific variations within the rule. */
  variations: readonly OperatorVariation[];
  /** Confidence per the audit ladder. */
  confidence: OperatorConfidence;
  /** Optional decomposition note (operator → operator). */
  decomposesTo?: string;
  /** Optional cross-references to Red rulings or curator decisions. */
  notes?: string;
}

export const OPERATOR_GRAMMAR_ENTRIES: readonly OperatorGrammarEntry[] = [

  // ── paradox ────────────────────────────────────────────────────────
  {
    slug: 'paradox',
    signature:
      "Adds a `[PDX]` tag attached to the first `[DEX]` token; entry shifts `SET` → `CLIP`; first-dex direction often flips `OP` → `SAME`.",
    addContribution: '+1 universal (body modifier; hip pivot)',
    precedents: [
      {
        baseSlug:     'mirage',
        baseOp:       'SET > OP IN [DEX] > OP TOE [DEL]',
        compoundSlug: 'paradox-mirage',
        compoundOp:   'CLIP > OP IN [PDX] [DEX] > OP TOE [DEL]',
      },
      {
        baseSlug:     'whirl',
        baseOp:       'SET > OP IN [DEX] > OP CLIP [XBD] [DEL]',
        compoundSlug: 'paradox-whirl',
        compoundOp:   'CLIP > SAME IN [PDX] [DEX] > OP CLIP [XBD] [DEL]',
      },
      {
        baseSlug:     'illusion',
        baseOp:       'SET > OP OUT [DEX] > OP TOE [DEL]',
        compoundSlug: 'paradox-illusion',
        compoundOp:   'CLIP > SAME OUT [PDX] [DEX] > OP TOE [DEL]',
      },
      {
        baseSlug:     'barrage',
        baseOp:       'CLIP > SAME IN [DEX] > SAME IN [DEX] > OP TOE [DEL]',
        compoundSlug: 'paradox-barrage',
        compoundOp:   'CLIP > SAME IN [PDX] [DEX] > SAME IN [DEX] > OP TOE [DEL]',
      },
      {
        baseSlug:     'double-leg-over',
        baseOp:       'SET > OP IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]',
        compoundSlug: 'paradox-double-leg-over',
        compoundOp:   'CLIP > SAME IN [PDX] [DEX] > OP OUT [DEX] > SAME TOE [DEL]',
      },
    ],
    variations: [
      {
        label:          'Direction-flip variation',
        appliesToBases: ['whirl', 'illusion', 'barrage', 'double-leg-over'],
        note:
          "Paradox flips first-dex direction `OP` → `SAME` on these bases. paradox-mirage is the exception: retains `OP IN`. Curator authority over this distinction; do not apply blindly to unknown bases.",
      },
    ],
    confidence: 'high',
  },

  // ── ducking ────────────────────────────────────────────────────────
  {
    slug: 'ducking',
    signature:
      "Prepends a `DUCK [BOD]` body-modifier moment after the entry token. Entry typically `TOE` (sometimes `SET`).",
    addContribution: '+1 per occurrence (body modifier)',
    precedents: [
      {
        baseSlug:     'mirage',
        baseOp:       'SET > OP IN [DEX] > OP TOE [DEL]',
        compoundSlug: 'ducking-mirage',
        compoundOp:   'TOE > DUCK [BOD] > OP IN [DEX] > OP TOE [DEL]',
      },
      {
        baseSlug:     'clipper-stall',
        baseOp:       '[set] > clipper',
        compoundSlug: 'ducking-clipper',
        compoundOp:   'TOE > DUCK [BOD] > SAME CLIP [XBD] [DEL]',
      },
      {
        baseSlug:     'osis',
        baseOp:       'SET > (back or front) SPIN [BOD] > SAME or OP CLIP [XBD] [DEL]',
        compoundSlug: 'ducking-osis',
        compoundOp:   'SET > DUCK [BOD] > SAME or OP OSIS [BOD] [XBD] [DEL]',
      },
    ],
    variations: [
      {
        label:          'Osis-collapsed terminal',
        appliesToBases: ['osis'],
        note:
          "ducking-osis collapses the dex + spin into a single `OSIS [BOD]` token rather than retaining the full spin-into-clipper terminal. Osis-specific compaction; other bases use the cleaner prepend-DUCK rule.",
      },
    ],
    confidence: 'medium-high',
  },

  // ── spinning ───────────────────────────────────────────────────────
  {
    slug: 'spinning',
    signature:
      "Prepends a `(back) SPIN [BOD]` body-modifier moment; entry shifts `SET` → `CLIP`. When the base already carries a spin (osis), the result is a double-spin pattern.",
    addContribution: '+1 non-rotational / +2 rotational base',
    precedents: [
      {
        baseSlug:     'clipper-stall',
        baseOp:       '[set] > clipper',
        compoundSlug: 'spinning-clipper',
        compoundOp:   'CLIP > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]',
      },
      {
        baseSlug:     'pickup',
        baseOp:       'SET > OP IN [DEX] > SAME TOE [DEL]',
        compoundSlug: 'spinning-pickup',
        compoundOp:   'CLIP > (back) SPIN [BOD] > OP IN [DEX] > SAME TOE [DEL]',
      },
      {
        baseSlug:     'osis',
        baseOp:       'SET > (back or front) SPIN [BOD] > SAME or OP CLIP [XBD] [DEL]',
        compoundSlug: 'spinning-osis',
        compoundOp:   'CLIP > (back) SPIN [BOD] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]',
      },
    ],
    variations: [
      {
        label:          'Double-spinning on rotational chassis',
        appliesToBases: ['osis'],
        note:
          "Osis already carries one spin in its base op; layering spinning produces a double-spin sequence. Apply the prepend-spin rule directly when the base does NOT carry a spin already.",
      },
    ],
    confidence: 'high',
  },

  // ── stepping ───────────────────────────────────────────────────────
  {
    slug: 'stepping',
    signature:
      "Duplicates the first dex moment with a `>>` separator between the two; second dex direction typically flips (`OP IN` → `SAME IN`); entry typically `CLIP`.",
    addContribution: '+1 universal',
    precedents: [
      {
        baseSlug:     'drifter',
        baseOp:       'SET > OP IN [DEX] > SAME CLIP [XBD] [DEL]',
        compoundSlug: 'tombstone',
        compoundOp:   'CLIP > OP IN [DEX] >> SAME IN [DEX] > SAME CLIP [XBD] [DEL]',
      },
      {
        baseSlug:     'osis',
        baseOp:       'SET > (back or front) SPIN [BOD] > SAME or OP CLIP [XBD] [DEL]',
        compoundSlug: 'stepping-osis',
        compoundOp:   'CLIP > OP IN [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]',
      },
    ],
    variations: [
      {
        label:          'Osis-collapsed stepping',
        appliesToBases: ['osis'],
        note:
          "stepping-osis inserts a single new dex BEFORE the osis spin-terminal rather than duplicating the dex pattern. The osis base has no native dex to duplicate; the stepping operator instead introduces the dex moment that other bases would already carry.",
      },
    ],
    confidence: 'medium-high',
  },

  // ── pixie ──────────────────────────────────────────────────────────
  {
    slug: 'pixie',
    signature:
      "Opening `TOE > SAME IN [DEX] >>` template; preserves the base's full dex pattern with directional alternation on subsequent dex tokens.",
    addContribution: '+1 (set treatment / opening compression)',
    precedents: [
      {
        baseSlug:     'butterfly',
        baseOp:       'SET > SAME or OP OUT [DEX] > OP CLIP [XBD] [DEL]',
        compoundSlug: 'dimwalk',
        compoundOp:   'TOE > SAME IN [DEX] >> OP OUT [DEX] > OP CLIP [XBD] [DEL]',
      },
      {
        baseSlug:     'drifter',
        baseOp:       'SET > OP IN [DEX] > SAME CLIP [XBD] [DEL]',
        compoundSlug: 'smoke',
        compoundOp:   'TOE > SAME IN [DEX] >> OP IN [DEX] > SAME CLIP [XBD] [DEL]',
      },
      {
        baseSlug:     'pickup',
        baseOp:       'SET > OP IN [DEX] > SAME TOE [DEL]',
        compoundSlug: 'paste',
        compoundOp:   'TOE > SAME IN [DEX] >> OP IN [DEX] > SAME TOE [DEL]',
      },
      {
        baseSlug:     'double-leg-over',
        baseOp:       'SET > OP IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]',
        compoundSlug: 'smog',
        compoundOp:   'TOE > SAME IN [DEX] >> OP IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]',
      },
      {
        baseSlug:     'eggbeater',
        baseOp:       'TOE >> OP OUT [DEX] > OP OUT [DEX] > SAME TOE [DEL]',
        compoundSlug: 'pigbeater',
        compoundOp:   'TOE > SAME IN [DEX] >> OP OUT [DEX] > OP OUT [DEX] > SAME TOE [DEL]',
      },
    ],
    variations: [],
    confidence: 'high',
  },

  // ── atomic ─────────────────────────────────────────────────────────
  {
    slug: 'atomic',
    signature:
      "Adds an outside-then-inside (X-Dex) sequence to the base pattern. Entry can be `TOE` or `CLIP` depending on chassis.",
    addContribution: '+1 non-rotational / +2 rotational base',
    precedents: [
      {
        baseSlug:     'pickup',
        baseOp:       'SET > OP IN [DEX] > SAME TOE [DEL]',
        compoundSlug: 'scrambled-eggbeater',
        compoundOp:   'TOE > OP OUT [DEX] >> OP IN [DEX] > SAME TOE [DEL]',
      },
      {
        baseSlug:     'legover',
        baseOp:       'SET > OP OUT [DEX] > SAME TOE [DEL]',
        compoundSlug: 'eggbeater',
        compoundOp:   'TOE >> OP OUT [DEX] > OP OUT [DEX] > SAME TOE [DEL]',
      },
    ],
    variations: [],
    confidence: 'medium',
    notes:
      "Atomic also acts as a set primitive (standalone 2 ADD); as a modifier, it carries the X-Dex character. Compound-of-canonicals atomic (e.g., atomic-torque, atomic double-over-down) require curator review per the audit Bucket C.",
  },

  // ── symposium ──────────────────────────────────────────────────────
  {
    slug: 'symposium',
    signature:
      "Adds a `(no plant while) [BOD] [DEX]` suspension-constraint moment. The setting foot does not plant during the dex.",
    addContribution: '+1 universal (suspension)',
    precedents: [
      {
        baseSlug:     'whirl',
        baseOp:       'SET > OP IN [DEX] > OP CLIP [XBD] [DEL]',
        compoundSlug: 'symposium-whirl',
        compoundOp:   'SET > (no plant while) OP IN [BOD] [DEX] > OP CLIP [XBD] [DEL]',
      },
      {
        baseSlug:     'double-leg-over',
        baseOp:       'SET > OP IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]',
        compoundSlug: 'nova',
        compoundOp:   'TOE >> (no plant while) OP IN [DEX] [BOD] > OP OUT [DEX] > SAME TOE [DEL]',
      },
    ],
    variations: [],
    confidence: 'medium-high',
  },

  // ── whirling ───────────────────────────────────────────────────────
  {
    slug: 'whirling',
    signature:
      "Adds a front-whirl dex moment as an operator. Operates as the dex-side canonical in compound-of-canonicals readings (e.g., whirling osis = blender).",
    addContribution: '+1 (operator instance)',
    precedents: [
      {
        baseSlug:     'swirl',
        baseOp:       'CLIP > SAME BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]',
        compoundSlug: 'whirling-swirl',
        compoundOp:   'CLIP > OP IN [DEX] > OP BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]',
      },
      {
        baseSlug:     'osis',
        baseOp:       'SET > (back or front) SPIN [BOD] > SAME or OP CLIP [XBD] [DEL]',
        compoundSlug: 'blender',
        compoundOp:   'SET > OP IN [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]',
      },
    ],
    variations: [],
    confidence: 'medium-high',
  },

  // ── gyro ───────────────────────────────────────────────────────────
  {
    slug: 'gyro',
    signature:
      "Prepends a `(back) SPIN [BOD]` body-modifier moment (often as a doubled spin or paired with `(no plant while)` for symposium combos). Distinct from spinning by emphasis on the rotational entry.",
    addContribution: '+1 universal (body modifier; gyrating)',
    precedents: [
      {
        baseSlug:     'drifter',
        baseOp:       'SET > OP IN [DEX] > SAME CLIP [XBD] [DEL]',
        compoundSlug: 'vortex',
        compoundOp:   'CLIP >> (back) SPIN [BOD] >> SAME IN [DEX] > SAME CLIP [XBD] [DEL]',
      },
      {
        baseSlug:     'eggbeater',
        baseOp:       'TOE >> OP OUT [DEX] > OP OUT [DEX] > SAME TOE [DEL]',
        compoundSlug: 'mantis',
        compoundOp:   'CLIP >> (back) SPIN [BOD] >> SAME OUT [DEX] > OP OUT [DEX] > SAME TOE [DEL]',
      },
      {
        baseSlug:     'torque',
        baseOp:       '(pending — torque op_notation not yet authored)',
        compoundSlug: 'big-apple',
        compoundOp:   'CLIP >> (back) SPIN [BOD] > (no plant while) SAME IN [DEX] [BOD] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]',
      },
    ],
    variations: [
      {
        label:          'Symposium-paired gyro',
        appliesToBases: ['torque'],
        note:
          "gyro + symposium combos (e.g., big-apple = gyro symposium torque) layer a `(no plant while)` segment between the gyro spins. The gyro alone does not require the suspension constraint.",
      },
    ],
    confidence: 'high',
  },

  // ── surging ────────────────────────────────────────────────────────
  {
    slug: 'surging',
    signature:
      "Adds a `(back) SPIN [BOD]` opening + extended multi-dex sequence threading the underlying base + paradox character. Per Red pt2 modeling rule, surging decomposes informally as spinning + stepping.",
    addContribution: '2 ADD primitive (standalone); +2 rotational / +1 non-rotational when acting as modifier',
    precedents: [
      {
        baseSlug:     'mirage',
        baseOp:       'SET > OP IN [DEX] > OP TOE [DEL]',
        compoundSlug: 'surge',
        compoundOp:   'CLIP > (back) SPIN [BOD] > SAME IN [DEX] >> OP IN [DEX] [PDX] > OP TOE [DEL]',
      },
      {
        baseSlug:     'whirl',
        baseOp:       'SET > OP IN [DEX] > OP CLIP [XBD] [DEL]',
        compoundSlug: 'surreal',
        compoundOp:   'CLIP > (back) SPIN [BOD] > SAME IN [DEX] >> OP FRONT WHIRL [DEX] [PDX] > OP CLIP [XBD] [DEL]',
      },
      {
        baseSlug:     'barfly',
        baseOp:       'CLIP >> SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [DEL] [XBD]',
        compoundSlug: 'venom',
        compoundOp:   'CLIP > (back) SPIN [BOD] > SAME IN [DEX] >> OP OUT [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]',
      },
    ],
    variations: [],
    confidence: 'high',
    decomposesTo: 'spinning + stepping',
    notes:
      "Red pt2: Surging Modeling Rule. Surging decomposes informally as spinning + stepping but is NOT in the modifier table — it operates as its own primitive at 2 ADD (standalone) and as +1/+2 (modifier).",
  },

  // ── furious ────────────────────────────────────────────────────────
  {
    slug: 'furious',
    signature:
      "Adds an extended multi-dex sequence; structurally similar to a stepping-paradox stack but operates as a single named operator. Resolved precedents combine forward/backward dex direction in a doubled-then-doubled pattern.",
    addContribution: '+1 non-rotational / +2 rotational base (parallel to atomic)',
    precedents: [
      {
        baseSlug:     'barfly',
        baseOp:       'CLIP >> SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [DEL] [XBD]',
        compoundSlug: 'nemesis',
        compoundOp:   'CLIP > OP IN [DEX] > SAME IN [DEX] > OP OUT [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]',
      },
    ],
    variations: [],
    confidence: 'medium',
    notes:
      "Red pt6 2026-05-04: Fury = Furious Paradox Mirage (replaces pt4 paradox + barraging + mirage decomposition). fury op_notation is pending; nemesis is the one resolved furious-base precedent.",
  },

  // ── barraging ──────────────────────────────────────────────────────
  {
    slug: 'barraging',
    signature:
      "Prepends a same-side doubled-dex segment (parallel to the barrage atom's doubled-dex pattern) onto a base trick. Often pairs with paradox or other modifiers (e.g., flurry = barraging legover; fury = furious paradox mirage via earlier doctrine read as barraging paradox mirage).",
    addContribution: '+1 universal',
    precedents: [
      {
        baseSlug:     'legover',
        baseOp:       'SET > OP OUT [DEX] > SAME TOE [DEL]',
        compoundSlug: 'flurry',
        compoundOp:   'CLIP > OP IN [DEX] > SAME IN [DEX] >> OP OUT [DEX] > SAME TOE [DEL]',
      },
      {
        baseSlug:     'osis',
        baseOp:       'SET > (back or front) SPIN [BOD] > SAME or OP CLIP [XBD] [DEL]',
        compoundSlug: 'barraging-osis',
        compoundOp:   'CLIP > OP IN [DEX] > SAME IN [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]',
      },
    ],
    variations: [],
    confidence: 'medium-high',
    notes:
      "barraging is structurally similar to barrage (the standalone atom); the naming-disambiguation case is captured in the barrage Tier A entry. Red 2026-05-15 ratified barraging as a +1 operator distinct from the standalone trick.",
  },

  // ── blurry ─────────────────────────────────────────────────────────
  {
    slug: 'blurry',
    signature:
      "Per Red 2026-05-20: blurry = stepping (the prior \"blurry implies stepping-paradox\" reading was retired). Operates as a stepping-class operator under the current doctrine.",
    addContribution: '+1 universal (per Red 2026-05-20 retired the +2 stepping-paradox reading)',
    precedents: [],
    variations: [],
    confidence: 'medium',
    decomposesTo: 'stepping',
    notes:
      "Red 2026-05-20: blurry no longer implies paradox. Compounds using the blurry folk name (ripwalk, food-processor, blurriest, blurry-whirl, blurry-torque, blurrage) have their structural decomposition under review per the audit Bucket B. Existing chain entries that previously read as 'stepping paradox X' are being normalized; some chains carry curatorConfirmPending=true.",
  },

  // ── tapping ────────────────────────────────────────────────────────
  {
    slug: 'tapping',
    signature:
      "Inconsistent structural signature across resolved siblings. spinal-tap (tapping torque) and tap (per chain 'atomic near mirage', not tapping) demonstrate divergent patterns. tapdown carries `curatorConfirmPending=true` in the chain registry.",
    addContribution: '+1 universal (per Red 2026-05-15 pt3)',
    precedents: [
      {
        baseSlug:     'torque',
        baseOp:       '(pending — torque op_notation not yet authored)',
        compoundSlug: 'spinal-tap',
        compoundOp:   'TOE > OP OUT [DEX] >> SAME IN [DEX] > (FRONT) SPIN [BOD] > OP CLIP [XBD] [DEL]',
      },
      {
        baseSlug:     'butterfly',
        baseOp:       'SET > SAME or OP OUT [DEX] > OP CLIP [XBD] [DEL]',
        compoundSlug: 'tapdown',
        compoundOp:   'TOE > OP OUT [DEX] >> SAME OUT [DEX] > OP CLIP [XBD] [DEL]',
      },
    ],
    variations: [],
    confidence: 'low',
    notes:
      "Tapping derivation is unsafe without curator input. spinal-tap shows an extra SPIN moment that is not in tapdown; structurally these are not the same modifier signature. Bucket B audit entry tapping-whirl explicitly flags this as requiring curator review.",
  },

] as const;

/**
 * Look up an operator's grammar by slug. Returns null when no entry is
 * registered (i.e., no resolved sibling precedent exists for the operator).
 * O(n) is fine at the current corpus size (~13 entries).
 */
export function getOperatorGrammar(slug: string): OperatorGrammarEntry | null {
  const normalized = slug.trim().toLowerCase();
  return OPERATOR_GRAMMAR_ENTRIES.find(e => e.slug === normalized) ?? null;
}

/**
 * List operators grouped by confidence tier. Useful for surfacing
 * which operators are safe to mechanically derive against (high /
 * medium-high) vs which require curator input (medium / low).
 */
export function groupOperatorsByConfidence(): Readonly<Record<OperatorConfidence, readonly OperatorGrammarEntry[]>> {
  const groups: Record<OperatorConfidence, OperatorGrammarEntry[]> = {
    'high':        [],
    'medium-high': [],
    'medium':      [],
    'low':         [],
  };
  for (const entry of OPERATOR_GRAMMAR_ENTRIES) {
    groups[entry.confidence].push(entry);
  }
  return groups;
}
