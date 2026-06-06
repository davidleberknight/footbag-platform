/**
 * freestyleObservationalTricks.ts
 * ================================
 *
 * Curator-authored observational-layer trick entries: tricks that exist
 * in external corpora (PassBack / FootbagMoves / Shred Global / Footbag
 * Finland) but have NOT been promoted to canonical curated status.
 *
 * Layer separation contract:
 *
 *   - Observational entries NEVER appear on canonical surfaces
 *     (landing core-tricks grid, ADD analysis, glossary terms,
 *     trick-detail pages, family/movement-system/topology views).
 *   - Observational entries carry a visually distinct "tracked tag"
 *     (#folk-slug, dashed style) for discoverability, NOT a canonical
 *     hashtag chip. The distinct style must never imply official status.
 *   - Observational entries NEVER get media attachments (curator-gated).
 *   - Observational entries NEVER get a /freestyle/tricks/{slug} route
 *     (no trick-detail page).
 *   - Observational entries surface ONLY on the
 *     /freestyle/observational route.
 *
 * Reversibility: TypeScript content module. No DB schema, no
 * migrations. Promotion to canonical (per V1+V2 publication contract
 * gate) is a separate curator action: move the row to
 * inputs/curated/tricks/<slug>.txt + re-run loader + remove the
 * observational entry.
 *
 * Provenance: external folk-name corpora (PassBack and similar). Entries
 * are observational-safe: clean operator-stack formulas, no
 * unresolved-doctrine dependency (no atomic-family X-dex scope; no
 * barraging / blurry / fairy operator-class questions). Expansion entries
 * carry null proposedAddFormula (curator-pending per-component
 * decomposition) and proposedAddTotal from PassBack's claim column.
 * Curator may enrich proposedAddFormula + curatorNote per row as part of
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

/**
 * Explicit governance lane for an observational entry.
 * The lane is curator-authored, NOT keyword-heuristic-derived. Default
 * lane for new entries is 'source-only'. Curator hand-promotes entries
 * by editing this field.
 *
 * Lanes:
 *   - 'source-only'      : known name from a documented corpus without
 *                          enough verified structure for promotion review
 *   - 'formula-review'   : has a proposed decomposition but the ADD /
 *                          formula reading is inconsistent or unresolved
 *   - 'promotion-queue'  : source-backed name with plausible JOB notation
 *                          + ADD accounting; near-ready after final
 *                          curator review
 *   - 'doctrine-blocked' : blocked by an unresolved doctrine issue
 *                          (paradox, x-dex, nuclear/atomic, inspinning,
 *                          shooting, backside, fairy/orbit reading, etc.)
 */
export type ObservationalGovernanceLane =
  | 'source-only'
  | 'formula-review'
  | 'promotion-queue'
  | 'doctrine-blocked';

export interface ObservationalTrick {
  /** Lowercase URL-safe slug derived from the folk name. NEVER reuses a
   *  canonical freestyle_tricks slug; collision check enforced at
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
  /** Doctrine / curator blockers preventing canonicalization. */
  unresolvedBlockers: readonly string[];
  /** Explicit governance lane (curator-authored; see ObservationalGovernanceLane).
   *  Optional in the type for backwards-compatibility with rows authored
   *  before the governance-lane field existed; shaping layer defaults
   *  missing values to 'source-only'. */
  governanceLane?: ObservationalGovernanceLane;
}

// ─────────────────────────────────────────────────────────────────────────
// Conservative seed entries. All formulas use IFPA-canonical operators
// (stepping / whirling / pixie / ducking + positional far); none touch
// unresolved-doctrine questions (barraging / blurry / atomic-family X-dex /
// fairy weight / compression intent / hidden-vs-flat).
// ─────────────────────────────────────────────────────────────────────────

export const OBSERVATIONAL_TRICKS: readonly ObservationalTrick[] = [
  // Some PassBack folk names are absent here because they are promoted to
  // canonical freestyle_tricks rows (e.g. assassin, blizzard, blaze,
  // bedwetter, sole-survivor) with curator-locked RESOLVED_FORMULAS
  // derivations. When an observational entry is promoted, it is removed
  // here in the same change-set.
  // ─────────────────────────────────────────────────────────────────────────
  // Observational-safe expansion entries (Bladerunner duplicate merged into
  // one entry with two readings). All entries:
  //   - proposedAddFormula=null (curator-pending per-component decomposition)
  //   - proposedAddTotal from PassBack 'PB ADD claim' column (null where empty)
  //   - status='pending-review' (curator-confirmation gate)
  //   - unresolvedBlockers=[] (the unresolved-doctrine-safe cohort)
  // Curator may enrich proposedAddFormula + curatorNote per row as part of
  // selective promotion to canonical.
  // ─────────────────────────────────────────────────────────────────────────
  {
    folkSlug:           'anonymous',
    displayName:        'Anonymous',
    proposedReadings:   ['Spinning far Miraging Symp. Miraging Refraction'],
    proposedAddFormula: null,
    proposedAddTotal:   3,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dictionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  // 'big-apple' is omitted: already canonical in freestyle_tricks
  // (adds=6, base_trick='torque'). Source PB readings are cited in the
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
    sourceCitation:     'PassBack dictionary (passback-dictionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  // 'bladerunner' is kept observational: a dex-count canonical publication
  // created confusion in rendered dictionary surfaces, so the curator
  // reverted it and keeps this row in Emerging Vocabulary until a
  // canonical-bracket reading is authored.
  // 'bling-blang' is omitted: now canonical in freestyle_tricks.
  // 'blurrage' is omitted: promoted to canonical via the
  // doctrine-divergence pilot. IFPA-derived ADD 4 (stepping + barrage);
  // the PB-source claim of 3 is documented as historical-divergence in
  // DOCTRINE_DIVERGENCE_REGISTRY (linked to Red Q7).
  {
    folkSlug:           'blurrier',
    displayName:        'Blurrier',
    proposedReadings:   ['Stepping near Double Down'],
    proposedAddFormula: null,
    proposedAddTotal:   3,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dictionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  // 'cold-fusion' is kept observational pending a canonical-bracket reading.
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
    sourceCitation:     'PassBack dictionary (passback-dictionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  // 'darkwalk' is omitted: now canonical in freestyle_tricks.
  {
    folkSlug:           'dimmier',
    displayName:        'Dimmier',
    proposedReadings:   ['Pixie near Double Down'],
    proposedAddFormula: null,
    proposedAddTotal:   3,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dictionary.txt)',
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
    sourceCitation:     'PassBack dictionary (passback-dictionary.txt)',
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
    sourceCitation:     'PassBack dictionary (passback-dictionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  // 'flurricane' is kept observational pending a canonical-bracket reading.
  // 'flurricane' is omitted: now canonical in freestyle_tricks.
  {
    folkSlug:           'gdlo',
    displayName:        'GDLO',
    proposedReadings:   ['Gyro DLO'],
    proposedAddFormula: null,
    proposedAddTotal:   2,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dictionary.txt)',
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
    sourceCitation:     'PassBack dictionary (passback-dictionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  // 'golden-shower' + 'goliath' are kept observational pending a canonical-bracket reading.
  {
    folkSlug:           'golden-shower',
    displayName:        'Golden Shower',
    proposedReadings:   ['Stepping Ducking far Symp. Eggbeater'],
    proposedAddFormula: null,
    proposedAddTotal:   3,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dictionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  // 'goliath' is omitted: now canonical in freestyle_tricks.
  {
    folkSlug:           'green-eggs-and-ham',
    displayName:        'Green Eggs and Ham',
    proposedReadings:   ['Stepping Ducking far Swivel'],
    proposedAddFormula: null,
    proposedAddTotal:   2,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dictionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  // 'gybas' is kept observational pending a canonical-bracket reading.
  {
    folkSlug:           'gybas',
    displayName:        'GYBAS',
    proposedReadings:   ['Stepping far Dyno'],
    proposedAddFormula: null,
    proposedAddTotal:   2,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dictionary.txt)',
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
    sourceCitation:     'PassBack dictionary (passback-dictionary.txt)',
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
    sourceCitation:     'PassBack dictionary (passback-dictionary.txt)',
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
    sourceCitation:     'PassBack dictionary (passback-dictionary.txt)',
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
    sourceCitation:     'PassBack dictionary (passback-dictionary.txt)',
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
    sourceCitation:     'PassBack dictionary (passback-dictionary.txt)',
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
    sourceCitation:     'PassBack dictionary (passback-dictionary.txt)',
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
    sourceCitation:     'PassBack dictionary (passback-dictionary.txt)',
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
    sourceCitation:     'PassBack dictionary (passback-dictionary.txt)',
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
    sourceCitation:     'PassBack dictionary (passback-dictionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  // 'maelstrom' is omitted: now canonical in freestyle_tricks.
  // 'mantis' is omitted: already canonical in freestyle_tricks (adds=4,
  // base_trick='eggbeater', trick_family='legover'). Source PB reading
  // 'Spinning near Eggbeater' is cited in the canonical row.
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
    sourceCitation:     'PassBack dictionary (passback-dictionary.txt)',
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
    sourceCitation:     'PassBack dictionary (passback-dictionary.txt)',
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
    sourceCitation:     'PassBack dictionary (passback-dictionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  // 'motion-sickness' + 'pandemonium' are kept observational pending a canonical-bracket reading.
  {
    folkSlug:           'motion-sickness',
    displayName:        'Motion Sickness',
    proposedReadings:   ['Spinning far Motion'],
    proposedAddFormula: null,
    proposedAddTotal:   2,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dictionary.txt)',
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
    sourceCitation:     'PassBack dictionary (passback-dictionary.txt)',
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
    sourceCitation:     'PassBack dictionary (passback-dictionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  // 'predator' is omitted: promoted to canonical via the
  // doctrine-divergence pilot. IFPA-derived ADD 4 (atomic + dlo); the
  // PB-source claim of 3 is documented as historical-divergence (strongest
  // single-row evidence for Q7 hypothesis B: pt10 implicit paradox-atomic
  // framing).
  // 'reactor' is omitted: now canonical in freestyle_tricks.
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
    sourceCitation:     'PassBack dictionary (passback-dictionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  // 'ripped-warrior' is omitted: now canonical in freestyle_tricks.
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
    sourceCitation:     'PassBack dictionary (passback-dictionary.txt)',
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
    sourceCitation:     'PassBack dictionary (passback-dictionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  // 'schmoe' is omitted: promoted to canonical via the doctrine-divergence
  // pilot. IFPA-derived ADD 3 (stepping + legover); the PB-source claim of
  // 2 is documented as historical-divergence.
  {
    folkSlug:           'scorpion-s-tail',
    displayName:        'Scorpion\'s Tail',
    proposedReadings:   ['Spinning far Double Down'],
    proposedAddFormula: null,
    proposedAddTotal:   2,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dictionary.txt)',
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
    sourceCitation:     'PassBack dictionary (passback-dictionary.txt)',
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
    sourceCitation:     'PassBack dictionary (passback-dictionary.txt)',
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
    sourceCitation:     'PassBack dictionary (passback-dictionary.txt)',
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
    sourceCitation:     'PassBack dictionary (passback-dictionary.txt)',
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
    sourceCitation:     'PassBack dictionary (passback-dictionary.txt)',
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
    sourceCitation:     'PassBack dictionary (passback-dictionary.txt)',
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
    sourceCitation:     'PassBack dictionary (passback-dictionary.txt)',
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
    sourceCitation:     'PassBack dictionary (passback-dictionary.txt)',
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
    sourceCitation:     'PassBack dictionary (passback-dictionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  // 'swirlwind' is omitted: now canonical in freestyle_tricks.
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
    sourceCitation:     'PassBack dictionary (passback-dictionary.txt)',
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
    sourceCitation:     'PassBack dictionary (passback-dictionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },
  // 'trixie' is omitted: now canonical in freestyle_tricks.
  {
    folkSlug:           'wauxspin',
    displayName:        'Wauxspin',
    proposedReadings:   ['Butterfly Gyro Toe'],
    proposedAddFormula: null,
    proposedAddTotal:   null,
    sourceLabel:        'passback',
    sourceCitation:     'PassBack dictionary (passback-dictionary.txt)',
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
    sourceCitation:     'PassBack dictionary (passback-dictionary.txt)',
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
    sourceCitation:     'PassBack dictionary (passback-dictionary.txt)',
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
    sourceCitation:     'PassBack dictionary (passback-dictionary.txt)',
    status:             'pending-review',
    curatorNote:        null,
    unresolvedBlockers: [],
  },

  // ─────────────────────────────────────────────────────────────────────
  // footbag.org /newmoves batch. Twelve high-confidence structural
  // compounds verbatim from the FB.org Paradox Moves listing, proposed for
  // canonical promotion pending curator review. Each row uses Red-settled
  // operators (paradox / spinning / inspinning / stepping / ducking /
  // symposium) on Red-settled bases (mirage / illusion / whirl / legover /
  // drifter / blender). ADD math agrees with FB.org per pure +1-stack
  // arithmetic; no unresolved-doctrine dependency.
  //
  // Provenance: FB.org /newmoves/list/{4..7} pages, 2003 corpus. Curator
  // action on each: promote to canonical (move to
  // legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv) +
  // remove this observational entry.
  // ─────────────────────────────────────────────────────────────────────
  // 'inspinning-paradox-mirage' is omitted: now canonical in freestyle_tricks.
  // 'inspinning-paradox-illusion' is omitted: now canonical in freestyle_tricks.
  // Ten FB.org entries (spinning-paradox-mirage / spinning-paradox-illusion /
  // spinning-paradox-whirl / paradox-double-leg-over / paradox-barrage /
  // paradox-blizzard / paradox-symposium-mirage / paradox-high-plains-
  // drifter / spinning-paradox-blender / stepping-ducking-paradox-blender)
  // are omitted: promoted to canonical freestyle_tricks rows with
  // curator-locked RESOLVED_FORMULAS derivations. paradox-blizzard's
  // stepwise dependency (blizzard) is promoted alongside them. When an
  // observational entry is promoted, it is removed here in the same
  // change-set.
  //
  // The 2 inspinning-paradox-* entries remain observational pending the
  // `inspinning` modifier-vocabulary decision.
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
