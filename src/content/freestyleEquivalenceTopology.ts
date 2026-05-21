/**
 * freestyleEquivalenceTopology.ts
 *
 * Curator-authored alternate-derivation entries for compound freestyle
 * tricks whose canonical reading admits a structurally distinct path
 * that converges arithmetically. Additive observational layer; never
 * overrides canonical published readings.
 *
 * Distinct from freestyleSymbolicEquivalences.ts:
 *   - Equivalences = compression ladder (single decomposition, multiple
 *     depths). One structural decomposition rendered shallow → deep.
 *   - Topology    = alternate-derivation paths (structurally distinct
 *     decompositions, same arithmetic). Two or more derivation paths
 *     that reach the same canonical trick by different operator
 *     topology.
 *
 * Phase 1 (2026-05-21): schema + one pilot entry (flurry). No public-
 * rendering surface; module is curator-internal until ratification.
 * Design doc:
 *   exploration/equivalence-topology-phase-1-2026-05-21/DESIGN.md
 *
 * Forever-rules:
 *   - Index 0 of every entry's derivations[] is the canonical-primary
 *     reading; never overrides freestyle_trick_modifier_links or the
 *     canonical compressed name.
 *   - All addBreakdown totals (where present) MUST equal the canonical
 *     ADD. Mismatches are governance failures, not data.
 *   - Each slug appears at most once in the array.
 *   - curatorConfirmPending: true entries are observational and never
 *     surface publicly until curator flips the flag.
 *   - Reversible by deletion. No SQL hardening, no schema migration,
 *     no auto-derivation of entries.
 *   - Per feedback_no_individual_names_freestyle_views: source labels
 *     in publishedIn cite modules, rulings (e.g. "Red 2026-05-20"), or
 *     archival sources; never name individuals beyond codified
 *     ruling-attribution exceptions.
 */

/**
 * Five-pattern classification from DESIGN.md §3. Phase 1 ships only
 * the first two active; the others are typed so future curator entries
 * can tag consistently.
 */
export type EquivalencePattern =
  | 'modifier-stack-vs-paradox-stack'
  | 'flat-stack-vs-composite-base'
  | 'folk-name-vs-structural'
  | 'rotational-reinterpretation'
  | 'hidden-component';

/**
 * The role a derivation path plays in the equivalence-topology for its
 * trick. Index 0 of derivations[] is always 'canonical-primary'.
 */
export type DerivationRole =
  | 'canonical-primary'
  | 'alternate-equivalent'
  | 'historical'
  | 'doctrine-locked-alternate'
  | 'deprecated';

/**
 * Provenance label for the derivation path. Maps to the source-label
 * enum already used by freestyleDerivationPilot.ts; kept distinct so
 * the two modules can evolve independently.
 */
export type DerivationSource =
  | 'curator-derived'
  | 'historical'
  | 'community'
  | 'structural';

/**
 * Resolution state. 'pending-curator' is the default for Phase 1
 * authored entries; ratification flips to 'confirmed'.
 */
export type DerivationStatus =
  | 'pending-curator'
  | 'confirmed'
  | 'wave-2-gated'
  | 'doctrine-locked';

export interface DerivationPath {
  readonly role:           DerivationRole;
  readonly source:         DerivationSource;
  readonly status:         DerivationStatus;
  /** Short structural reading; curator-authored verbatim. */
  readonly reading:        string;
  /** Optional executable ADD breakdown using §8 vocabulary. When
   *  present, MUST agree arithmetically with the canonical ADD. */
  readonly addBreakdown?:  string;
  /** Optional provenance citation: which module / source / ruling
   *  publishes this path. Surfaced to curator only in Phase 1. */
  readonly publishedIn?:   string;
}

export interface EquivalenceTopologyEntry {
  /** Canonical trick slug. Must match a row in freestyle_tricks. */
  readonly slug:                  string;
  /** Display name (canonical compressed form). */
  readonly displayName:           string;
  /** Pattern classification per DESIGN.md §3. */
  readonly pattern:               EquivalencePattern;
  /** One-line context note. */
  readonly summary:               string;
  /** Ordered derivation paths. Index 0 = canonical-primary. */
  readonly derivations:           readonly DerivationPath[];
  /** When true, entry never surfaces publicly; awaits curator flip. */
  readonly curatorConfirmPending: boolean;
  /** Optional curator-internal commentary; never publicly rendered. */
  readonly curatorNote?:          string;
}

// ─────────────────────────────────────────────────────────────────────────
// Ratified entries
//
// Phase 2 (2026-05-21): flurry ratified; witchdoctor authored. Both
// entries are eligible for public render through the service-layer
// gate (curatorConfirmPending: false).
// ─────────────────────────────────────────────────────────────────────────

export const EQUIVALENCE_TOPOLOGY: readonly EquivalenceTopologyEntry[] = [
  {
    slug:        'flurry',
    displayName: 'Flurry',
    pattern:     'modifier-stack-vs-paradox-stack',
    summary:
      'Flurry admits two structurally distinct derivations that both ' +
      'yield 4 ADD: a barraging-stack reading anchored at pt4, and a ' +
      'paradox-stack reading published in the derivation atlas. Both ' +
      'are pedagogically live.',
    derivations: [
      {
        role:         'canonical-primary',
        source:       'historical',
        status:       'confirmed',
        reading:      'barraging legover',
        addBreakdown: 'barraging(+2) + legover(2) = 4 ADD',
        publishedIn:
          'freestyleSymbolicEquivalences.ts (pt4-locked 2026-05-02; ' +
          'barraging weight 2 per Red 2026-05-20)',
      },
      {
        role:         'alternate-equivalent',
        source:       'curator-derived',
        status:       'confirmed',
        reading:      'paradox + paradox legover',
        addBreakdown: 'paradox(+1) + paradox-legover(3) = 4 ADD',
        publishedIn:
          'freestyleDerivationPilot.ts (derivation-atlas pilot 2026-05-20)',
      },
    ],
    curatorConfirmPending: false,
  },
  {
    slug:        'witchdoctor',
    displayName: 'Witchdoctor',
    pattern:     'flat-stack-vs-composite-base',
    summary:
      'Witchdoctor admits two structurally distinct derivations that ' +
      'both yield 5 ADD: a composite-base reading anchored at Red ' +
      '2026-05-20 (atom-smasher as the structural base + symposium ' +
      'modifier), and a flat-stack reading that walks atomic + ' +
      'symposium over a mirage atom. The composite reading is the ' +
      'current canonical interpretation; the flat-stack reading ' +
      'remains pedagogically useful for showing how the composite ' +
      'compresses.',
    derivations: [
      {
        role:         'canonical-primary',
        source:       'structural',
        status:       'confirmed',
        reading:      'atom-smasher + symposium',
        addBreakdown: 'atom-smasher(4) + symposium(+1) = 5 ADD',
        publishedIn:
          'freestyleService.ts COMPOSITE_DERIVATIONS (Red 2026-05-20; ' +
          'convergence-rule supported via R1b)',
      },
      {
        role:         'historical',
        source:       'historical',
        status:       'confirmed',
        reading:      'atomic symposium mirage',
        addBreakdown: 'atomic(+1) + symposium(+1) + mirage(2) = 4 ADD',
        publishedIn:
          'freestyleSymbolicEquivalences.ts (FM-only; predates the ' +
          'composite-base ruling)',
      },
    ],
    curatorConfirmPending: false,
    curatorNote:
      'The alternate flat-stack reading\'s naïve total (4) differs ' +
      'from the canonical ADD (5); the 1-component gap is what the ' +
      'composite-base reading resolves (atom-smasher already carries ' +
      'an X-dex from a toe, contributing the additional +1). The ' +
      'alternate is preserved as historical/pedagogical context, not ' +
      'as a competing arithmetic claim.',
  },
];

/**
 * Returns the equivalence-topology entry for a slug, or null when no
 * alternate-derivation entry is authored. Read-only accessor; never
 * mutates the module.
 */
export function getEquivalenceTopologyFor(
  slug: string,
): EquivalenceTopologyEntry | null {
  return EQUIVALENCE_TOPOLOGY.find(e => e.slug === slug) ?? null;
}

/**
 * Returns only entries that are NOT curatorConfirmPending. The intended
 * consumer is a future public-render surface (Phase 2+); Phase 1 has
 * no callers because no public surface ships.
 */
export function getRatifiedEquivalenceTopology(): readonly EquivalenceTopologyEntry[] {
  return EQUIVALENCE_TOPOLOGY.filter(e => !e.curatorConfirmPending);
}
