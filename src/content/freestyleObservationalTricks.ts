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
 *   - Observational entries carry a visually distinct "tracked tag"
 *     (#folk-slug, dashed style) for discoverability — NOT a canonical
 *     hashtag chip. The distinct style must never imply official status.
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
  // 'assassin' removed 2026-05-18 — promoted to canonical via FM Slice X
  // Path B pilot canonical 2026-05-17 (slug='assassin' in freestyle_tricks
  // with adds=4, base_trick='mirage'). The observational entry was stale
  // because the promotion process did not include the documented
  // observational-removal step.
  //
  // Wave 5 observational→canonical promotions 2026-05-22: blizzard, blaze,
  // bedwetter, sole-survivor (PassBack folk-name resolutions) moved to
  // canonical freestyle_tricks rows with curator-locked RESOLVED_FORMULAS
  // derivations and FIRST_CLASS_TIER_2 membership. Per
  // feedback_observational_canonical_promotion_cleanup the observational
  // entries are removed in the same change-set.
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
  // 'bladerunner' removed 2026-05-23 — promoted canonical via Slice
  // 7-OBS-A under FM dex-count convention (PB claim 3 ADD published
  // as canonical). Per feedback_observational_canonical_promotion_cleanup.
  // 'bling-blang' removed 2026-05-23 — promoted canonical via Slice 7-OBS-A
  // under FM dex-count convention (PB claim 2 ADD published as canonical).
  // 'blurrage' removed 2026-05-23 — promoted to canonical via Wave 7
  // doctrine-divergence pilot. IFPA-derived ADD 4 (stepping + barrage);
  // PB-source claim 3 documented as historical-divergence in
  // DOCTRINE_DIVERGENCE_REGISTRY (linked to Red Q7).
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
  // 'cold-fusion' removed 2026-05-23 — promoted canonical via Slice 7-OBS-A
  // under FM dex-count convention (PB claim 3 ADD published as canonical).
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
  // 'flurricane' removed 2026-05-23 — promoted canonical via Slice 7-OBS-A
  // under FM dex-count convention (PB claim 3 ADD published as canonical).
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
  // 'golden-shower' removed 2026-05-23 — promoted canonical via Slice 7-OBS-A
  // under FM dex-count convention (PB claim 3 ADD published as canonical).
  // 'goliath' removed 2026-05-23 — promoted canonical via Slice 7-OBS-A
  // under FM dex-count convention (PB claim 3 ADD published as canonical).
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
  // 'gybas' removed 2026-05-23 — promoted canonical via Slice 7-OBS-A
  // under FM dex-count convention (PB claim 2 ADD published as canonical;
  // G.Y.B.A.S. alias preserved on the canonical row).
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
  // 'motion-sickness' removed 2026-05-23 — promoted canonical via Slice 7-OBS-A
  // under FM dex-count convention (PB claim 2 ADD published as canonical).
  // 'pandemonium' removed 2026-05-23 — promoted canonical via Slice 7-OBS-A
  // under FM dex-count convention (PB claim 3 ADD published as canonical).
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
  // 'predator' removed 2026-05-23 — promoted to canonical via Wave 7
  // doctrine-divergence pilot. IFPA-derived ADD 4 (atomic + dlo);
  // PB-source claim 3 documented as historical-divergence (strongest
  // single-row evidence for Q7 hypothesis B: pt10 implicit paradox-
  // atomic framing).
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
  // 'schmoe' removed 2026-05-23 — promoted to canonical via Wave 7
  // doctrine-divergence pilot. IFPA-derived ADD 3 (stepping + legover);
  // PB-source claim 2 documented as historical-divergence.
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
  // Wave 5 observational→canonical promotions 2026-05-22: 10 FB.org
  // entries (spinning-paradox-mirage / spinning-paradox-illusion /
  // spinning-paradox-whirl / paradox-double-leg-over / paradox-barrage /
  // paradox-blizzard / paradox-symposium-mirage / paradox-high-plains-
  // drifter / spinning-paradox-blender / stepping-ducking-paradox-blender)
  // moved to canonical freestyle_tricks rows with curator-locked
  // RESOLVED_FORMULAS derivations and FIRST_CLASS_TIER_2 membership.
  // paradox-blizzard's stepwise dependency (blizzard) is also promoted
  // same slice. Per feedback_observational_canonical_promotion_cleanup
  // the observational entries are removed in the same change-set.
  //
  // The 2 inspinning-paradox-* entries remain observational pending the
  // `inspinning` modifier-vocabulary decision (composite-framework slice).
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
