/**
 * Doctrine-divergence registry — operationalizes the 5-category taxonomy
 * documented at exploration/doctrine_divergence_framework_2026-05-23.md.
 *
 * Distinguishes the executable IFPA-grammar derivation (parser-canonical;
 * what `freestyle_tricks.adds` carries) from external-source claims (PB,
 * FB.org) or pending Red rulings. Preserves the zero-mismatch invariant:
 * registered slugs publish with their IFPA-derived `adds` value; the
 * registry carries provenance metadata documenting WHY a community/source
 * scoring differs from the published value.
 *
 * Architectural insight: movement-language decomposition (the structural
 * reading) and ADD accounting (the math layer) are formally separable
 * systems. The decomposition is single-canonical; the ADD scoring is
 * potentially multi-system (PB / IFPA / Red-adjudicated). The registry
 * names that separability.
 *
 * Public-facing rendering: trick-detail pages only (per
 * feedback_landing_vs_reference_boundary). Browse cards stay clean.
 *
 * Reversible TS content module per
 * [[feedback_reversible_content_governance]]; add or revise an entry
 * by editing the map below.
 */

/** Five-category taxonomy from §2 of the framework doc. The
 *  `folk-compressed` axis is orthogonal and tracked separately via
 *  SUI_GENERIS_SELF_TOKEN_SLUGS + freestyleSymbolicEquivalences chains;
 *  doctrine category here is the primary classification. */
export type DoctrineCategory =
  | 'historical-divergence'   // community/external source ADD differs from IFPA-derivation; stable disagreement
  | 'doctrine-sensitive'      // pending Red ruling; temporary status
  | 'alternate-accounting';   // IFPA-grammar-internal disagreement (e.g., MODIFIER_COMPOSITIONS carve-out)

/** Note visibility — controls per-surface rendering. */
export type NoteVisibility =
  | 'public'        // always render on trick-detail (default for historical-divergence + doctrine-sensitive)
  | 'advanced'      // collapsed by default; reveal on demand (for dense edge cases)
  | 'curator-only'; // never rendered; internal QC text

/** Status — tracks where the entry sits in the publication lifecycle. */
export type DoctrineEntryStatus =
  | 'published'     // entry is live; canonical row exists; renderer surfaces note
  | 'pending'       // not yet promoted (e.g., still observational); registry pre-staged
  | 'retired';      // canonical row removed; entry kept for historical reference

/**
 * Doctrine-divergence registry entry. One row per slug carrying any
 * non-default divergence semantics.
 */
export interface DoctrineDivergenceEntry {
  /** Canonical slug (FK to freestyle_tricks.slug when status='published'). */
  slug: string;

  /** Primary doctrine category. */
  category: DoctrineCategory;

  /** Name of the external/community source making a divergent claim.
   *  Examples: 'PassBack', 'FB.org /newmoves', 'Red pt6 ruling'.
   *  null when the entry doesn't carry an external claim (rare for
   *  historical-divergence; common for doctrine-sensitive). */
  sourceSystem: string | null;

  /** The OTHER source's ADD claim for this trick. Compared against
   *  canonicalValue. null when no specific numeric claim is being
   *  documented. */
  sourceClaim: number | null;

  /** The published canonical ADD value (matches freestyle_tricks.adds).
   *  Stated explicitly here so the registry is self-documenting and
   *  any future drift between DB and registry can be detected by QC. */
  canonicalValue: number;

  /** Rendering visibility level. Defaults to 'public' for
   *  historical-divergence + doctrine-sensitive; 'advanced' for
   *  most alternate-accounting; 'curator-only' for interim notes. */
  noteVisibility: NoteVisibility;

  /** The factual provenance note rendered on the trick-detail page
   *  when noteVisibility = 'public' or 'advanced' (expanded). Tone:
   *  factual, source-attributed, brief, neutral. One or two
   *  sentences. */
  provenanceNote: string;

  /** Curator-internal QC note. Never rendered publicly. Used for
   *  detailed reasoning, audit context, links to discussion threads. */
  internalNote: string;

  /** Linked Red queue question ID, if the divergence is connected to
   *  an open Red question. References question_id from
   *  RED_QUESTION_STATUS_MATRIX.csv. null when not Red-linked. */
  relatedRedQuestion: string | null;

  /** Publication lifecycle status. */
  status: DoctrineEntryStatus;
}

// ─────────────────────────────────────────────────────────────────────────
// Wave 7 pilot batch (2026-05-23): three gap=1 PassBack rows promoted from
// observational → canonical via the doctrine-divergence framework. Each
// row's IFPA-derived ADD differs by +1 from the PassBack-source claim;
// the divergence is documented as historical-divergence.
//
// Selection rationale (from exploration/doctrine_divergence_framework_
// 2026-05-23.md §5): gap=1 is the lowest-risk publication batch. If Red
// later rules differently via Q7 (implicit-operator hypothesis), the
// 1-ADD revision is small and reversible.
// ─────────────────────────────────────────────────────────────────────────

export const DOCTRINE_DIVERGENCE_REGISTRY: ReadonlyMap<string, DoctrineDivergenceEntry> = new Map([
  ['blurrage', {
    slug:               'blurrage',
    category:           'historical-divergence',
    sourceSystem:       'PassBack',
    sourceClaim:        3,
    canonicalValue:     4,
    noteVisibility:     'public',
    provenanceNote:     'PassBack historically lists blurrage at 3 ADD. The executable IFPA-grammar derivation yields 4 ADD via stepping(+1) + barrage(3); the 1-ADD divergence is part of a systemic pattern under Red review.',
    internalNote:       'Wave 7 pilot publication 2026-05-23. PB-claim 3 vs IFPA-derived 4. Gap=1; cleanest divergence pattern. Promotion from observational corpus per the framework doc §5 pilot evaluation. Cross-ref: exploration/pb_semantic_ratification_findings_2026-05-23.md.',
    relatedRedQuestion: 'Q7',
    status:             'published',
  }],
  ['predator', {
    slug:               'predator',
    category:           'historical-divergence',
    sourceSystem:       'PassBack',
    sourceClaim:        3,
    canonicalValue:     4,
    noteVisibility:     'public',
    provenanceNote:     'PassBack historically lists predator at 3 ADD. The executable IFPA-grammar derivation yields 4 ADD via atomic(+1 non-rotational) + dlo(3); the 1-ADD divergence may reflect pt10\'s implicit paradox-atomic framing under Red review.',
    internalNote:       'Wave 7 pilot publication 2026-05-23. PB-claim 3 vs IFPA-derived 4. Strongest single-row evidence for Q7 hypothesis (B): IFPA\'s `Atomic X` may read as `Paradox Atomic X` per pt10 framing, making the implicit paradox the source of the +1 gap.',
    relatedRedQuestion: 'Q7',
    status:             'published',
  }],
  ['schmoe', {
    slug:               'schmoe',
    category:           'historical-divergence',
    sourceSystem:       'PassBack',
    sourceClaim:        2,
    canonicalValue:     3,
    noteVisibility:     'public',
    provenanceNote:     'PassBack historically lists schmoe at 2 ADD. The executable IFPA-grammar derivation yields 3 ADD via stepping(+1) + legover(2); the 1-ADD divergence reflects the systemic gap under Red review.',
    internalNote:       'Wave 7 pilot publication 2026-05-23. PB-claim 2 vs IFPA-derived 3. Gap=1; same shape as blurrage. Reading `Stepping near Legover` carries positional `near` which is +0 per current convention.',
    relatedRedQuestion: 'Q7',
    status:             'published',
  }],
]);

/** Convenience lookup. Returns null when the slug carries no divergence
 *  metadata (the default case for ~99% of canonical slugs). */
export function getDoctrineDivergence(slug: string): DoctrineDivergenceEntry | null {
  return DOCTRINE_DIVERGENCE_REGISTRY.get(slug) ?? null;
}

/** True when a slug should render a public-facing scoring-notes section
 *  on its trick-detail page. */
export function hasPublicScoringNote(slug: string): boolean {
  const entry = DOCTRINE_DIVERGENCE_REGISTRY.get(slug);
  return entry !== undefined
    && entry.status === 'published'
    && (entry.noteVisibility === 'public' || entry.noteVisibility === 'advanced');
}

/**
 * Cohort-level (operator-keyed) source-divergence policy.
 *
 * Where the per-slug DOCTRINE_DIVERGENCE_REGISTRY documents one trick's
 * disagreement with an external source, this documents a SYSTEMATIC
 * over-count attached to a set operator: FootbagMoves scores every trick
 * built on the operator higher than the platform's structurally-anchored
 * weight, consistently across the whole cohort. A single trick can be a
 * miscount; an entire cohort moving together in one direction is a
 * convention. The platform publishes the structural value and records the
 * source convention as a divergence, rather than adopting a weight the
 * platform grammar does not support.
 *
 * Documentation/registry only: this construct is NOT consulted by the
 * per-trick scoring-note render path. Cohort members publish their
 * structural value with no per-trick scoring note; the divergence lives in
 * each row's provenance, as with the single-trick Big Apple Sauce and
 * redwetter cases. Because the structural weight is independently anchored
 * and the over-counting source is the non-authoritative single source, no
 * expert adjudication is required to publish under this policy.
 */
export interface OperatorWeightDivergencePolicy {
  /** Set operator the policy governs (e.g. 'furious', 'railing'). */
  operator: string;

  /** Platform structural ADD weight for the operator. */
  structuralWeight: number;

  /** How the structural weight is anchored, in plain words. */
  structuralAnchor: string;

  /** External source that over-counts the operator. */
  sourceSystem: string;

  /** Inclusive ADD over-count range the source applies across the cohort. */
  sourceOverCountRange: readonly [number, number];

  /** Canonical slugs published under this policy. */
  affectedSlugs: readonly string[];

  /** Factual, source-attributed publication policy. Neutral tone. */
  policyNote: string;

  /** Curator-internal reasoning; never rendered. */
  internalNote: string;

  /** Publication lifecycle status. */
  status: DoctrineEntryStatus;
}

export const OPERATOR_WEIGHT_DIVERGENCE_POLICY: ReadonlyMap<string, OperatorWeightDivergencePolicy> = new Map([
  ['furious', {
    operator:             'furious',
    structuralWeight:     2,
    structuralAnchor:     'Fury (Furious Paradox Mirage) is a settled 5 ADD, so furious = 5 minus paradox(1) minus mirage(2) = 2.',
    sourceSystem:         'FootbagMoves',
    sourceOverCountRange: [1, 2],
    affectedSlugs:        ['clown-face', 'genesis', 'rage', 'nebula'],
    policyNote:           'Furious tricks publish at the platform structural value, with furious weighted at 2. FootbagMoves scores the cohort one to two ADD higher; that figure is recorded as a single-source divergence in each row provenance. The structural weight is anchored independently by Fury and FootbagMoves is the non-authoritative single source, so no expert adjudication is required.',
    internalNote:         'FootbagMoves scores every furious trick about two ADD high (Furious Whirl 7 vs structural 5, Furious Eggbeater 7 vs 5, and so on across the family). The systematic cohort-wide direction marks a source convention, not a per-trick miscount. Promoted cohort at structural 5: clown-face, genesis, rage, nebula. Single-trick precedent: Big Apple Sauce (source 9 / structural 8).',
    status:               'published',
  }],
  ['railing', {
    operator:             'railing',
    structuralWeight:     2,
    structuralAnchor:     'railing = rooted(0) + sailing(2) = 2; rooted is a 0-ADD set, like pogo.',
    sourceSystem:         'FootbagMoves',
    sourceOverCountRange: [1, 2],
    affectedSlugs:        ['dorshanatrix', 'flying-fish', 'rail-warrior'],
    policyNote:           'Railing tricks publish at the platform structural value, with railing weighted at 2. FootbagMoves scores the cohort one to two ADD higher; that figure is recorded as a single-source divergence in each row provenance. The structural weight is anchored independently by rooted(0) plus sailing(2) and FootbagMoves is the non-authoritative single source, so no expert adjudication is required.',
    internalNote:         'Independent second instance of the furious pattern: FootbagMoves scores railing tricks about two ADD high across the cohort (Railing Symposium Mirage 7 vs structural 5, Railing Ducking Mirage 7 vs 5, Railing Ducking Butterfly 7 vs 6). Promoted cohort: dorshanatrix (5), flying-fish (5), rail-warrior (6).',
    status:               'published',
  }],
]);

/** Cohort-level operator-weight divergence policy lookup. Returns null
 *  when the operator carries no registered divergence policy (the default
 *  for nearly every operator). */
export function getOperatorWeightDivergence(operator: string): OperatorWeightDivergencePolicy | null {
  return OPERATOR_WEIGHT_DIVERGENCE_POLICY.get(operator) ?? null;
}
