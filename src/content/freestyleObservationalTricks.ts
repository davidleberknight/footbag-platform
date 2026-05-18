/**
 * freestyleObservationalTricks.ts
 * ================================
 *
 * Curator-authored observational-layer trick entries — tricks that exist
 * in external corpora (PassBack / FootbagMoves / Shred Global / Footbag
 * Finland) but have NOT been promoted to canonical curated status.
 *
 * Layer separation contract (per
 * exploration/freestyle-public-coherence-wave-2026-05-18/
 * curated_vs_observational_boundary.md):
 *
 *   - Observational entries NEVER appear on canonical surfaces
 *     (landing core-tricks grid, ADD analysis, glossary terms,
 *     trick-detail pages, family/movement-system/topology views).
 *   - Observational entries NEVER get a #-tag chip (the `#-tag`
 *     convention is canonical-only).
 *   - Observational entries NEVER get media attachments (curator-gated).
 *   - Observational entries NEVER get a /freestyle/tricks/{slug} route
 *     (no trick-detail page).
 *   - Observational entries surface ONLY on the
 *     /freestyle/observational route.
 *
 * Reversibility: TypeScript content module per
 * [[feedback_reversible_content_governance]]. No DB schema, no
 * migrations. Promotion to canonical (per V1+V2 publication contract
 * gate) is a separate curator action: move the row to
 * inputs/curated/tricks/<slug>.txt + re-run loader + remove the
 * observational entry.
 *
 * Provenance: PASSBACK_INGESTION_AUDIT.md Batch B pilot. Seeded with
 * 5 conservative entries (clean operator-stack formulas; no Wave 2
 * dependency; no atomic-family X-dex scope; no barraging / blurry /
 * fairy operator-class questions).
 */

export type ObservationalSourceLabel =
  | 'passback'
  | 'footbagmoves'
  | 'shred-global'
  | 'footbag-finland'
  | 'other';

export type ObservationalStatus =
  | 'pending-review'
  | 'pending-canonicalization'
  | 'rejected';

export interface ObservationalTrick {
  /** Lowercase URL-safe slug derived from the folk name. NEVER reuses a
   *  canonical freestyle_tricks slug — collision check enforced at
   *  shaping time. */
  folkSlug: string;
  /** Display name (folk / external-source form). */
  displayName: string;
  /** Candidate structural readings (≡ lines). Plural because a trick
   *  may have multiple plausible decompositions; curator review picks
   *  one before canonical promotion. */
  proposedReadings: readonly string[];
  /** Candidate ADD formula (if known), shown alongside the readings. */
  proposedAddFormula: string | null;
  /** Candidate ADD total. Rendered as em-dash via addPending when null;
   *  when non-null, rendered with explicit "PB ADD claim" / similar
   *  qualifier (NEVER as a canonical ADD chip). */
  proposedAddTotal: number | null;
  /** Source attribution label. */
  sourceLabel: ObservationalSourceLabel;
  /** Free-form source citation. */
  sourceCitation: string;
  /** Current curator-review status. */
  status: ObservationalStatus;
  /** Optional curator-authored note. */
  curatorNote: string | null;
  /** Wave 2 / curator blockers preventing canonicalization. */
  unresolvedBlockers: readonly string[];
}

// ─────────────────────────────────────────────────────────────────────────
// Batch B pilot seed (2026-05-18). Five conservative entries from
// exploration/freestyle-public-coherence-wave-2026-05-18/
// observational_candidate_queue.csv. All formulas use IFPA-canonical
// operators (stepping / whirling / pixie / ducking + positional far);
// none touch Wave 2 questions (barraging / blurry / atomic-family X-dex /
// fairy weight / compression intent / hidden-vs-flat).
// ─────────────────────────────────────────────────────────────────────────

export const OBSERVATIONAL_TRICKS: readonly ObservationalTrick[] = [
  {
    folkSlug:           'blizzard',
    displayName:        'Blizzard',
    proposedReadings:   ['Stepping far Illusion'],
    proposedAddFormula: 'stepping(+1) + illusion(2) = 3 ADD (proposed)',
    proposedAddTotal:   3,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'blaze',
    displayName:        'Blaze',
    proposedReadings:   ['Whirling far Mirage'],
    proposedAddFormula: 'whirling(+1) + mirage(2) = 3 ADD (proposed)',
    proposedAddTotal:   3,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        'Whirling operator added to Movement System axes 2026-05-18 (post-inheritance); reading uses post-inheritance vocabulary.',
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'assassin',
    displayName:        'Assassin',
    proposedReadings:   ['Pixie Ducking far Mirage'],
    proposedAddFormula: 'pixie(+1) + ducking(+1) + mirage(2) = 4 ADD (proposed)',
    proposedAddTotal:   4,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'bedwetter',
    displayName:        'Bedwetter',
    proposedReadings:   ['Stepping far Eggbeater', 'stepping atomic legover (per pt4 eggbeater decomposition)'],
    proposedAddFormula: 'stepping(+1) + eggbeater(3) = 4 ADD (proposed; eggbeater per pt4 = atomic legover)',
    proposedAddTotal:   4,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        'Eggbeater decomposition settled by pt4 (atomic legover); Bedwetter stacks stepping on top.',
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'sole-survivor',
    displayName:        'Sole Survivor',
    proposedReadings:   ['Spinning far Symp. Whirl'],
    proposedAddFormula: 'spinning(+1) + symposium(+1) + whirl(3) = 5 ADD (proposed)',
    proposedAddTotal:   5,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
];

/**
 * Filter observational entries by status. Useful for the surface to
 * render only pending-review entries (the default view); other surfaces
 * could later filter to pending-canonicalization or rejected as
 * separate sub-views.
 */
export function listObservationalByStatus(
  status: ObservationalStatus,
): readonly ObservationalTrick[] {
  return OBSERVATIONAL_TRICKS.filter(t => t.status === status);
}
