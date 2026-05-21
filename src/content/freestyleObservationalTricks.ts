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
 * Provenance: PASSBACK_INGESTION_AUDIT.md Batch B pilot. Initially
 * seeded with 5 conservative curator-authored entries (clean operator-
 * stack formulas; no Wave 2 dependency; no atomic-family X-dex scope;
 * no barraging / blurry / fairy operator-class questions). Expanded
 * 2026-05-18 with 65 additional observational-safe entries drawn from
 * observational_candidate_queue.csv (observational_safe=y rows; Wave-2-
 * blocker rows excluded). The 65 expansion entries carry null
 * proposedAddFormula (curator-pending per-component decomposition) and
 * proposedAddTotal from PassBack's claim column. Curator may enrich
 * proposedAddFormula + curatorNote per row as part of Phase A.4
 * selective promotion to canonical.
 */

export type ObservationalSourceLabel =
  | 'passback'
  | 'footbagmoves'
  | 'shred-global'
  | 'footbag-finland'
  | 'fborg'         // footbag.org /newmoves corpus; structurally clean compounds awaiting curator promotion
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
  // 'assassin' removed 2026-05-18 — promoted to canonical via FM Slice X
  // Path B pilot canonical 2026-05-17 (slug='assassin' in freestyle_tricks
  // with adds=4, base_trick='mirage'). The observational entry was stale
  // because the promotion process did not include the documented
  // observational-removal step.
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
  // ─────────────────────────────────────────────────────────────────────────
  // Batch B observational-safe expansion (2026-05-18). 65 entries from
  // exploration/freestyle-public-coherence-wave-2026-05-18/
  // observational_candidate_queue.csv (observational_safe=y rows; Bladerunner
  // duplicate merged into one entry with two readings). All entries:
  //   - proposedAddFormula=null (curator-pending per-component decomposition)
  //   - proposedAddTotal from PassBack 'PB ADD claim' column (null where empty)
  //   - status='pending-review' (curator-confirmation gate)
  //   - unresolvedBlockers=[] (these are the post-Wave-2-safe cohort)
  // Curator may enrich proposedAddFormula + curatorNote per row as part of
  // Phase A.4 selective promotion to canonical.
  // ─────────────────────────────────────────────────────────────────────────
  {
    folkSlug:           'anonymous',
    displayName:        'Anonymous',
    proposedReadings:   ['Spinning far Miraging Symp. Miraging Refraction'],
    proposedAddFormula: null,
    proposedAddTotal:   3,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  // 'big-apple' skipped 2026-05-18 — already canonical via FM Slice X
  // Path B pilot 2026-05-17 (slug='big-apple' in freestyle_tricks with
  // adds=6, base_trick='torque'). Source PB readings cited in the
  // canonical row's red_additions entry.
  {
    folkSlug:           'big-orange',
    displayName:        'Big Orange',
    proposedReadings:   [
      'Spinning near Symp. Flux',
      'Rev. Big Apple',
    ],
    proposedAddFormula: null,
    proposedAddTotal:   1,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'bladerunner',
    displayName:        'Bladerunner',
    proposedReadings:   [
      'Atomic far Eggbeater',
      'Atomic Eggbeater',
    ],
    proposedAddFormula: null,
    proposedAddTotal:   3,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'bling-blang',
    displayName:        'Bling Blang',
    proposedReadings:   ['(uptime) Whirling near Whip'],
    proposedAddFormula: null,
    proposedAddTotal:   2,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'blurrage',
    displayName:        'Blurrage',
    proposedReadings:   ['Stepping far Barrage'],
    proposedAddFormula: null,
    proposedAddTotal:   3,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'blurrier',
    displayName:        'Blurrier',
    proposedReadings:   ['Stepping near Double Down'],
    proposedAddFormula: null,
    proposedAddTotal:   3,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'cold-fusion',
    displayName:        'Cold Fusion',
    proposedReadings:   [
      'Nuclear far Double Down',
      'Pdx. Fusion',
    ],
    proposedAddFormula: null,
    proposedAddTotal:   3,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'colossus',
    displayName:        'Colossus',
    proposedReadings:   ['Spinning Diving near Symp. Whirl'],
    proposedAddFormula: null,
    proposedAddTotal:   1,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'darkwalk',
    displayName:        'Darkwalk',
    proposedReadings:   ['Pixie Diving near Butterfly'],
    proposedAddFormula: null,
    proposedAddTotal:   2,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'dimmier',
    displayName:        'Dimmier',
    proposedReadings:   ['Pixie near Double Down'],
    proposedAddFormula: null,
    proposedAddTotal:   3,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'dimmiest',
    displayName:        'Dimmiest',
    proposedReadings:   ['Pixie far Double Down'],
    proposedAddFormula: null,
    proposedAddTotal:   3,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'flare',
    displayName:        'Flare',
    proposedReadings:   ['Symp. Whirling far Mirage'],
    proposedAddFormula: null,
    proposedAddTotal:   2,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'flurricane',
    displayName:        'Flurricane',
    proposedReadings:   ['Gyro Flurry'],
    proposedAddFormula: null,
    proposedAddTotal:   3,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'gary-coleman',
    displayName:        'Gary Coleman',
    proposedReadings:   [
      'BS Reactor',
      'Atomic far Symp. Whirl',
    ],
    proposedAddFormula: null,
    proposedAddTotal:   2,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'gdlo',
    displayName:        'GDLO',
    proposedReadings:   ['Gyro DLO'],
    proposedAddFormula: null,
    proposedAddTotal:   2,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'ghost',
    displayName:        'Ghost',
    proposedReadings:   ['Whirling Rake'],
    proposedAddFormula: null,
    proposedAddTotal:   null,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'golden-shower',
    displayName:        'Golden Shower',
    proposedReadings:   ['Stepping Ducking far Symp. Eggbeater'],
    proposedAddFormula: null,
    proposedAddTotal:   3,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'goliath',
    displayName:        'Goliath',
    proposedReadings:   [
      'Pixie Ducking far DLO',
      'Alpine Smog',
    ],
    proposedAddFormula: null,
    proposedAddTotal:   3,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'green-eggs-and-ham',
    displayName:        'Green Eggs and Ham',
    proposedReadings:   ['Stepping Ducking far Swivel'],
    proposedAddFormula: null,
    proposedAddTotal:   2,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'gybas',
    displayName:        'GYBAS',
    proposedReadings:   ['Stepping far Dyno'],
    proposedAddFormula: null,
    proposedAddTotal:   2,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'id',
    displayName:        'Id',
    proposedReadings:   [
      'Atomic Ducking far Double Down',
      'Alpine Fusion',
    ],
    proposedAddFormula: null,
    proposedAddTotal:   null,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'irish-cream',
    displayName:        'Irish Cream',
    proposedReadings:   [
      'Atomic Gyro Torque',
      'Tapping Mobius',
    ],
    proposedAddFormula: null,
    proposedAddTotal:   2,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'jackknife',
    displayName:        'Jackknife',
    proposedReadings:   [
      'Stepping Diving ss Butterfly',
      'Alpine Sidewalk',
    ],
    proposedAddFormula: null,
    proposedAddTotal:   2,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'johnny-vodka',
    displayName:        'Johnny Vodka',
    proposedReadings:   ['Pixie Mobius'],
    proposedAddFormula: null,
    proposedAddTotal:   null,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'king-koopa',
    displayName:        'King Koopa',
    proposedReadings:   [
      'Spinning Ducking far Symp.Torque',
      'Alpine Super Mario',
    ],
    proposedAddFormula: null,
    proposedAddTotal:   1,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'kiwi',
    displayName:        'Kiwi',
    proposedReadings:   ['Tapping Double Down'],
    proposedAddFormula: null,
    proposedAddTotal:   null,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'legbreaker',
    displayName:        'Legbreaker',
    proposedReadings:   [
      'Flailing far Butterfly',
      'Symp. Atomic far Butterfly',
    ],
    proposedAddFormula: null,
    proposedAddTotal:   2,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'leviathon',
    displayName:        'Leviathon',
    proposedReadings:   ['Stepping Ducking far Double Down'],
    proposedAddFormula: null,
    proposedAddTotal:   3,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'locomotion',
    displayName:        'Locomotion',
    proposedReadings:   ['Stepping far Motion'],
    proposedAddFormula: null,
    proposedAddTotal:   3,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'maelstrom',
    displayName:        'Maelstrom',
    proposedReadings:   [
      'Spinning Ducking far Whirl',
      'Alpine Spinning Whirl',
      'Spinning Tomahawk',
    ],
    proposedAddFormula: null,
    proposedAddTotal:   1,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  // 'mantis' skipped 2026-05-18 — already canonical via FM Slice X
  // Path B pilot 2026-05-17 (slug='mantis' in freestyle_tricks with
  // adds=4, base_trick='eggbeater', trick_family='legover'). Source PB
  // reading 'Spinning near Eggbeater' cited in the canonical row.
  {
    folkSlug:           'moby-dick',
    displayName:        'Moby Dick',
    proposedReadings:   [
      'Mobiusscrew',
      'Gyro Torquescrew',
    ],
    proposedAddFormula: null,
    proposedAddTotal:   2,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'monster',
    displayName:        'Monster',
    proposedReadings:   ['Symp. Swirling Gyro Inside'],
    proposedAddFormula: null,
    proposedAddTotal:   null,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'morpheus',
    displayName:        'Morpheus',
    proposedReadings:   [
      'Spinning Ducking far Drifter',
      'Alpine Void',
    ],
    proposedAddFormula: null,
    proposedAddTotal:   1,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'mortal-kombat',
    displayName:        'Mortal Kombat',
    proposedReadings:   ['Stepping Ducking far Grifter'],
    proposedAddFormula: null,
    proposedAddTotal:   2,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'motion-sickness',
    displayName:        'Motion Sickness',
    proposedReadings:   ['Spinning far Motion'],
    proposedAddFormula: null,
    proposedAddTotal:   2,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'pandemonium',
    displayName:        'Pandemonium',
    proposedReadings:   [
      'Pixie far Symp. Eggbeater',
      'BS Pigbeater',
    ],
    proposedAddFormula: null,
    proposedAddTotal:   3,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'pandora-s-box',
    displayName:        'Pandora\'s Box',
    proposedReadings:   ['Gyro Pickup'],
    proposedAddFormula: null,
    proposedAddTotal:   1,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'pod',
    displayName:        'POD',
    proposedReadings:   [
      'Pixie DOD',
      'Pixie near Double Down',
    ],
    proposedAddFormula: null,
    proposedAddTotal:   3,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'predator',
    displayName:        'Predator',
    proposedReadings:   ['Atomic far DLO'],
    proposedAddFormula: null,
    proposedAddTotal:   3,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'reactor',
    displayName:        'Reactor',
    proposedReadings:   ['Atomic far Whirl'],
    proposedAddFormula: null,
    proposedAddTotal:   2,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'ripcurl',
    displayName:        'Ripcurl',
    proposedReadings:   [
      'Stepping near Butterfly Swirl',
      'Sidewalk Swirl',
    ],
    proposedAddFormula: null,
    proposedAddTotal:   2,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'ripped-warrior',
    displayName:        'Ripped Warrior',
    proposedReadings:   [
      'Stepping Ducking Butterfly',
      'Alpine Ripwalk',
    ],
    proposedAddFormula: null,
    proposedAddTotal:   2,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'riptide',
    displayName:        'Riptide',
    proposedReadings:   [
      'Stepping far Butterfly Swirl',
      'Ripwalk Swirl',
    ],
    proposedAddFormula: null,
    proposedAddTotal:   2,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'rotor',
    displayName:        'Rotor',
    proposedReadings:   ['(downtime) Swirling Gyro Inside Stall'],
    proposedAddFormula: null,
    proposedAddTotal:   null,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'schmoe',
    displayName:        'Schmoe',
    proposedReadings:   ['Stepping near Legover'],
    proposedAddFormula: null,
    proposedAddTotal:   2,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'scorpion-s-tail',
    displayName:        'Scorpion\'s Tail',
    proposedReadings:   ['Spinning far Double Down'],
    proposedAddFormula: null,
    proposedAddTotal:   2,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'shooting-star',
    displayName:        'Shooting Star',
    proposedReadings:   [
      'Shooting far Double Down',
      'Pogo Nuclear far Double Down',
    ],
    proposedAddFormula: null,
    proposedAddTotal:   4,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'skullsmasher',
    displayName:        'Skullsmasher',
    proposedReadings:   [
      'Atomic Ducking far Mirage',
      'Alpine Atomsmasher',
    ],
    proposedAddFormula: null,
    proposedAddTotal:   2,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'slapdown',
    displayName:        'Slapdown',
    proposedReadings:   ['Quantum near Butterfly'],
    proposedAddFormula: null,
    proposedAddTotal:   2,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'spanishfly',
    displayName:        'Spanishfly',
    proposedReadings:   ['Clipper Ducking far Double Down'],
    proposedAddFormula: null,
    proposedAddTotal:   2,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'spikehammer',
    displayName:        'Spikehammer',
    proposedReadings:   ['Stepping Ducking Mirage'],
    proposedAddFormula: null,
    proposedAddTotal:   2,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'super-mario',
    displayName:        'Super Mario',
    proposedReadings:   [
      'Spinning far Symp. Torque',
      'Symp. Marius',
    ],
    proposedAddFormula: null,
    proposedAddTotal:   1,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'superdeeduperfly',
    displayName:        'Superdeeduperfly',
    proposedReadings:   [
      'Spinning Ducking Superfly',
      'Alpine Superduperfly',
    ],
    proposedAddFormula: null,
    proposedAddTotal:   2,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'superduperfly',
    displayName:        'Superduperfly',
    proposedReadings:   ['Spinning Superfly'],
    proposedAddFormula: null,
    proposedAddTotal:   2,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'swifter',
    displayName:        'Swifter',
    proposedReadings:   ['Stepping far Swirl'],
    proposedAddFormula: null,
    proposedAddTotal:   2,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'swirlwind',
    displayName:        'Swirlwind',
    proposedReadings:   [
      'Spinning far Symp. Whirling Swirl',
      'Whirlwind Swirl',
    ],
    proposedAddFormula: null,
    proposedAddTotal:   2,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'tobius',
    displayName:        'Tobius',
    proposedReadings:   [
      'Toe Mobius',
      'Toe Spinning near Torque',
    ],
    proposedAddFormula: null,
    proposedAddTotal:   1,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'torch-r-rack',
    displayName:        'Torch-R-Rack',
    proposedReadings:   [
      'Stepping far Symp. Double Down',
      'BS Blurriest',
    ],
    proposedAddFormula: null,
    proposedAddTotal:   3,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'trixie',
    displayName:        'Trixie',
    proposedReadings:   [
      '(midtime) Toe near Triage',
      'triple-dex "Pixie"',
    ],
    proposedAddFormula: null,
    proposedAddTotal:   3,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'wauxspin',
    displayName:        'Wauxspin',
    proposedReadings:   ['Butterfly Gyro Toe'],
    proposedAddFormula: null,
    proposedAddTotal:   null,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'whirlwalk',
    displayName:        'Whirlwalk',
    proposedReadings:   ['Whirling far Whirl'],
    proposedAddFormula: null,
    proposedAddTotal:   2,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'whirlygig',
    displayName:        'Whirlygig',
    proposedReadings:   ['Stepping far Symp. Whirl'],
    proposedAddFormula: null,
    proposedAddTotal:   2,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'your-mom',
    displayName:        'Your Mom',
    proposedReadings:   [
      'Atomic far Symp. Double Down',
      'BS Fusion',
    ],
    proposedAddFormula: null,
    proposedAddTotal:   3,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dicrionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },

  // ─────────────────────────────────────────────────────────────────────
  // footbag.org /newmoves batch (2026-05-20). Twelve high-confidence
  // structural compounds verbatim from the FB.org Paradox Moves listing,
  // proposed for canonical promotion pending curator review. Each row
  // uses Red-settled operators (paradox / spinning / inspinning /
  // stepping / ducking / symposium) on Red-settled bases (mirage /
  // illusion / whirl / legover / drifter / blender). ADD math agrees
  // with FB.org per pure +1-stack arithmetic; no Wave 2 doctrine
  // dependency.
  //
  // Source: exploration/fborg/paradoxMoves.txt + fundamentalmoves.txt.
  // Provenance: FB.org /newmoves/list/{4..7} pages, 2003 corpus.
  // Curator action on each: promote to canonical (move to
  // legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv) +
  // remove this observational entry. Follow
  // [[feedback_observational_canonical_promotion_cleanup]].
  // ─────────────────────────────────────────────────────────────────────
  {
    folkSlug:           'inspinning-paradox-mirage',
    displayName:        'Inspinning Paradox Mirage',
    proposedReadings:   ['inspinning paradox mirage'],
    proposedAddFormula: 'inspinning(+1) + paradox(+1) + mirage(2) = 4 ADD (proposed)',
    proposedAddTotal:   4,
    sourceLabel:        'fborg',
    sourceCitation:     'footbag.org /newmoves — Paradox Moves listing (2003)',
    status:             'pending-review',
    curatorNote:        'Inspinning is direction-distinct from Spinning per pt3; clean structural compound.',
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'inspinning-paradox-illusion',
    displayName:        'Inspinning Paradox Illusion',
    proposedReadings:   ['inspinning paradox illusion'],
    proposedAddFormula: 'inspinning(+1) + paradox(+1) + illusion(2) = 4 ADD (proposed)',
    proposedAddTotal:   4,
    sourceLabel:        'fborg',
    sourceCitation:     'footbag.org /newmoves — Paradox Moves listing (2003)',
    status:             'pending-review',
    curatorNote:        'Sibling of inspinning-paradox-mirage; mirror dex direction.',
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'spinning-paradox-mirage',
    displayName:        'Spinning Paradox Mirage',
    proposedReadings:   ['spinning paradox mirage'],
    proposedAddFormula: 'spinning(+1) + paradox(+1) + mirage(2) = 4 ADD (proposed)',
    proposedAddTotal:   4,
    sourceLabel:        'fborg',
    sourceCitation:     'footbag.org /newmoves — Paradox Moves listing (2003)',
    status:             'pending-review',
    curatorNote:        'Both operators settled; mirage is canonical 2-ADD atom.',
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'spinning-paradox-illusion',
    displayName:        'Spinning Paradox Illusion',
    proposedReadings:   ['spinning paradox illusion'],
    proposedAddFormula: 'spinning(+1) + paradox(+1) + illusion(2) = 4 ADD (proposed)',
    proposedAddTotal:   4,
    sourceLabel:        'fborg',
    sourceCitation:     'footbag.org /newmoves — Paradox Moves listing (2003)',
    status:             'pending-review',
    curatorNote:        'Mirror of spinning-paradox-mirage on illusion base.',
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'spinning-paradox-whirl',
    displayName:        'Spinning Paradox Whirl',
    proposedReadings:   ['spinning paradox whirl'],
    proposedAddFormula: 'spinning(+1) + paradox(+1) + whirl(3) = 5 ADD (proposed)',
    proposedAddTotal:   5,
    sourceLabel:        'fborg',
    sourceCitation:     'footbag.org /newmoves — Paradox Moves listing (2003)',
    status:             'pending-review',
    curatorNote:        'Rotational base (whirl); both operators non-rotational +1.',
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'paradox-double-leg-over',
    displayName:        'Paradox Double Leg Over',
    proposedReadings:   ['paradox double legover'],
    proposedAddFormula: 'paradox(+1) + double-legover(3) = 4 ADD (proposed; equiv paradox(+1) + legover(2) + 1 extra dex)',
    proposedAddTotal:   4,
    sourceLabel:        'fborg',
    sourceCitation:     'footbag.org /newmoves — Paradox Moves listing (2003) — "Paradox Mirage with an extra legover at the end"',
    status:             'pending-review',
    curatorNote:        'Per FB.org description: "A paradox mirage with an extra leg over at the end."',
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'paradox-barrage',
    displayName:        'Paradox Barrage',
    proposedReadings:   ['paradox barrage', 'paradox + two same-side dexes'],
    proposedAddFormula: 'paradox(+1) + barrage(3) = 4 ADD (proposed; barrage settled pt12 SS resolution)',
    proposedAddTotal:   4,
    sourceLabel:        'fborg',
    sourceCitation:     'footbag.org /newmoves — Paradox Moves listing (2003)',
    status:             'pending-review',
    curatorNote:        'Barraging operator settled by pt12 (SS=+0); barrage base = 3 ADD.',
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'paradox-blizzard',
    displayName:        'Paradox Blizzard',
    proposedReadings:   ['paradox blizzard', 'paradox + stepping-paradox-illusion'],
    proposedAddFormula: 'paradox(+1) + blizzard(3) = 4 ADD (proposed)',
    proposedAddTotal:   4,
    sourceLabel:        'fborg',
    sourceCitation:     'footbag.org /newmoves — Paradox Moves listing (2003)',
    status:             'pending-review',
    curatorNote:        'Composite of paradox + stepping-paradox-illusion (Blizzard). Requires Blizzard canonicalization first.',
    unresolvedBlockers: ['blizzard not yet canonical'],
  },
  {
    folkSlug:           'paradox-symposium-mirage',
    displayName:        'Paradox Symposium Mirage',
    proposedReadings:   ['paradox symposium mirage'],
    proposedAddFormula: 'paradox(+1) + symposium(+1) + mirage(2) = 4 ADD (proposed)',
    proposedAddTotal:   4,
    sourceLabel:        'fborg',
    sourceCitation:     'footbag.org /newmoves — Paradox Moves listing (2003)',
    status:             'pending-review',
    curatorNote:        'Multi-operator stack on mirage; both operators +1.',
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'paradox-high-plains-drifter',
    displayName:        'Paradox High Plains Drifter',
    proposedReadings:   ['paradox high-plains-drifter', 'paradox double drifter'],
    proposedAddFormula: 'paradox(+1) + high-plains-drifter(4) = 5 ADD (proposed)',
    proposedAddTotal:   5,
    sourceLabel:        'fborg',
    sourceCitation:     'footbag.org /newmoves — Paradox Moves listing (2003) — alias "Paradox Double Drifter"',
    status:             'pending-review',
    curatorNote:        'Drifter resolved pt11 (miraging clipper); HPD is the double-dex variant.',
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'spinning-paradox-blender',
    displayName:        'Spinning Paradox Blender',
    proposedReadings:   ['spinning paradox blender'],
    proposedAddFormula: 'spinning(+1) + paradox(+1) + blender(4) = 6 ADD (proposed)',
    proposedAddTotal:   6,
    sourceLabel:        'fborg',
    sourceCitation:     'footbag.org /newmoves — Paradox Moves listing (2003)',
    status:             'pending-review',
    curatorNote:        'Blender resolved pt11 (whirling osis); rotational base.',
    unresolvedBlockers: [],
  },
  {
    folkSlug:           'stepping-ducking-paradox-blender',
    displayName:        'Stepping Ducking Paradox Blender',
    proposedReadings:   ['stepping ducking paradox blender'],
    proposedAddFormula: 'stepping(+1) + ducking(+1) + paradox(+1) + blender(4) = 7 ADD (proposed)',
    proposedAddTotal:   7,
    sourceLabel:        'fborg',
    sourceCitation:     'footbag.org /newmoves — Paradox Moves listing (2003)',
    status:             'pending-review',
    curatorNote:        'Triple-operator stack on blender; highest-ADD compound in the FB.org corpus that decomposes cleanly via +1 arithmetic.',
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
