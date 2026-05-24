# Publication Frontier + Notation Backfill Wave (2026-05-23)

Sharpens the prior cohort analysis by using the 4,178-row comprehensive corpus and prioritizing slugs that appear in **≥4 source systems** (the strong cross-source signal). Read-only. Curator-paced. No DB writes; no promotions.

## Funnel

| Stage | Count |
|---|---:|
| Total unique canonical_slugs in corpus | 1679 |
| Slugs in ≥4 source systems (the "gold" set) | 393 |
| Tier 1 — safest publication frontier (all filters pass) | 236 |
| Tier 2 — curator review (single filter fails) | 156 |
| Tier 3 — deferred (multiple filters fail) | 1 |
| Notation-backfill wave candidates (canonical, no op_notation, ≥1 source) | 117 |

## Tier 1 filter cascade

A slug is **Tier 1 (safest publication frontier)** when ALL of:

1. `raw_source_count >= 4` (the user's gold-signal floor)
2. Has notation in at least one source family
3. `parser_status` is `parser-clean` or `no-stanford` (no parser failure)
4. `doctrine_divergence_tier` is `none` or `small` (ADD-claim spread ≤ 1)
5. `composite_modifier_flag` is 0 (slug does NOT contain blurry/surging/furious/gyro)

These filters are conservative on purpose. The user's framing was
"safest large-scale publication frontier" — the cascade narrows the
393 multi-source pool to the rows where curator-time is most likely
to convert cleanly into canonical promotions.

## Tier 1 breakdown

| Metric | Count |
|---|---:|
| Already in canonical_db with op_notation (publish_as_is) | 11 |
| In canonical_db, missing op_notation (backfill_canonical_op_notation) | 38 |
| NOT in canonical_db, has notation (promote_with_notation) | 187 |
| NOT in canonical_db, no notation (promote_pending_notation) | 0 |

Doctrine-divergence distribution within Tier 1:

| Spread tier | Count |
|---|---:|
| none | 196 |
| small | 40 |

## Top 30 — safest frontier (publish-as-is + backfill-canon)

These are already in canonical_db. The first table needs nothing;
the second is the notation-backfill wave anchor.

### Already complete — `publish_as_is` (top 15)

| Slug | Display | Sources | ADD | Op-notation |
|---|---|---:|---|---|
| `barrage` | barrage | 7 | 3 | `CLIP > SAME IN [DEX] > SAME IN [DEX] > OP TOE [DEL]` |
| `double-around-the-world` | double around the world | 5 | 3 | `TOE > SAME IN [DEX] > SAME IN [DEX] > SAME TOE [DEL]` |
| `double-leg-over` | double leg over | 5 | 3 | `SET > OP IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]` |
| `flying-clipper` | flying clipper | 4 | 2 | `flying > clipper` |
| `guay` | guay | 4 | 2 | `[set] > leggy in dex > ss inside` |
| `legeater` | legeater | 5 | 3 | `TOE > OP IN [DEX] >> OP IN [DEX] > SAME TOE [DEL]` |
| `paste` | paste | 6 | 3 | `TOE > SAME IN [DEX] >> OP IN [DEX] > SAME TOE [DEL]` |
| `pendulum` | pendulum | 4 | 2 | `SET > TOE SWING [DEL]` |
| `pigbeater` | pigbeater | 5 | 4 | `TOE > SAME IN [DEX] >> OP OUT [DEX] > OP OUT [DEX] > SAME TOE [DEL]` |
| `scrambled-eggbeater` | scrambled eggbeater | 4 | 3 | `TOE > OP OUT [DEX] >> OP IN [DEX] > SAME TOE [DEL]` |
| `tap` | tap | 5 | 3 | `TOE > OP OUT [DEX] >> SAME IN [DEX] > OP TOE [DEL]` |

(11 total publish_as_is — full list in `publication_frontier_2026-05-23.csv`.)

### Notation-backfill wave anchor — `backfill_canonical_op_notation` (top 15)

| Slug | Sources | Official ADD | Best candidate (source) | Notation |
|---|---:|---|---|---|
| `around-the-world` | 6 | 2 | fborg | `TOE > SAME IN/OUT [DEX] > SAME TOE [DEL]` |
| `ducking-butterfly` | 5 | 4 | fborg | `SET > (DUCK) [BOD] > SAME/OP OUT [DEX] > OP CLIP [XBD] [DEL]` |
| `ducking-clipper` | 4 | 3 | stanford | `Z^+X` |
| `ducking-osis` | 5 | 4 | fborg | `SET > DUCK [BOD] > SAME or OP OSIS [BOD] [XBD] [DEL]` |
| `eggbeater` | 6 | 3 | fm | `Toe >> Op Out (DEX) > Op Out (DEX) > Same Toe (DEL)` |
| `fairy` | 4 | 2 | fborg | `TOE > SAME OUT [DEX] > OP TOE [DEL]` |
| `flurry` | 6 | 4 | fm | `Clip > Op In (DEX) > Same In (DEX) >> Op Out (DEX) > Same Toe (DEL)` |
| `legover` | 4 | 2 | passback | `(downtime) leggy out dex>ss toe` |
| `magellan` | 5 | 3 | fm | `Toe > Same In (DEX) >> Same Out (DEX) > Same Toe (DEL)` |
| `nova` | 5 | 4 | fm | `Toe >> (no plant while) Op In (DEX)(BOD) > Op Out (DEX) > Same Toe (DEL)` |
| `paradox-barrage` | 6 | 4 | fborg | `CLIP > SAME IN [PDX] [DEX] > SAME IN [DEX] > OP TOE [DEL]` |
| `paradox-blizzard` | 6 | 4 | fborg | `CLIP > SAME IN [PDX] [DEX] > OP OUT [DEX] > OP TOE [DEL].` |
| `paradox-double-leg-over` | 5 | 4 | fborg | `CLIP > SAME IN [PDX] [DEX] > OP OUT [DEX] > SAME TOE [DEL]` |
| `paradox-high-plains-drifter` | 5 | 5 | fborg | `CLIP > SAME IN [PDX] [DEX] > SAME IN [DEX] > SAME CLIP [XBD] [DEL]` |
| `paradox-symposium-mirage` | 5 | 4 | fborg | `CLIP (plant) > (no plant while) SAME IN [PDX] [BOD] [DEX] > OP TOE [DEL]` |

(38 total — see `notation_backfill_wave_2026-05-23.csv`.)

## Top 20 — Tier 2 (single-filter failures, curator review)

| Slug | Sources | Failure | Display |
|---|---:|---|---|
| `assassin` | 5 | divergence_large | assassin |
| `atom-smasher` | 5 | divergence_large | atom smasher |
| `atomic-butterfly` | 5 | divergence_large | atomic butterfly |
| `barfly` | 7 | divergence_large | barfly |
| `barraging-osis` | 4 | divergence_large | barraging osis |
| `bedwetter` | 6 | divergence_large | bedwetter |
| `big-apple` | 5 | divergence_large | big apple |
| `blaze` | 6 | divergence_large | blaze |
| `blender` | 7 | divergence_large | blender |
| `blizzard` | 8 | divergence_large | blizzard |
| `blur` | 7 | divergence_large | blur |
| `blurrage` | 6 | divergence_large | blurrage |
| `blurriest` | 6 | divergence_large | blurriest |
| `blurry-whirl` | 4 | composite_modifier | blurry whirl |
| `bullwhip` | 6 | divergence_large | bullwhip |
| `butterfly` | 7 | divergence_large | butterfly |
| `clipper` | 6 | divergence_large | clipper |
| `dada-curve` | 5 | divergence_large | dada curve |
| `dimwalk` | 6 | divergence_large | dimwalk |
| `drifter` | 7 | divergence_large | drifter |

(156 total — full list in publication_frontier CSV.)

## Top 20 — Tier 3 (deferred, multi-filter)

| Slug | Sources | Failures |
|---|---:|---|
| `snowflake` | 5 | parser_unclean,divergence_large |

(1 total — full list in publication_frontier CSV.)

## Notation-backfill wave — readiness distribution

Canonical-DB rows missing `operational_notation` that have a candidate from at least one other source. Best-candidate preference order: fborg > fm > passback > stanford > internal_ts (cleanest-convention first; never auto-translated).

| Readiness | Count |
|---|---:|
| high | 114 |
| medium | 3 |
| low | 0 |

| Best-candidate source | Count |
|---|---:|
| fm | 65 |
| fborg | 40 |
| passback | 8 |
| stanford | 4 |

| Doctrine divergence | Count |
|---|---:|
| large | 55 |
| none | 42 |
| small | 20 |

## Methodology — source-family collapse

The 10 source_systems in the comprehensive corpus collapse into 6 families:

| Family | Source systems |
|---|---|
| canonical | canonical_db |
| fm | fm_inventory, fm_symbolic_grammar |
| fborg | fborg_insert_staging, fborg_text |
| passback | passback_intake, passback_source_links |
| stanford | stanford_corpus |
| internal_ts | observational_ts, tracked_names_ts |

The user's "≥4 source systems" framing operates on the **raw** 10-system count (the 393 figure cited). Both `raw_source_count` and `source_family_count` are preserved in the frontier CSV; the curator can re-filter on either.

## What this slice does NOT do

- ❌ No DB writes
- ❌ No UI changes
- ❌ No automatic promotions
- ❌ No auto-translation between notation conventions
- ❌ No doctrine adjudication (large-divergence rows surfaced, not resolved)
- ❌ PassBack ADD claims still treated as observational, not canonical

## Suggested curator workflow

1. Open `publication_frontier_2026-05-23.csv`, filter `frontier_tier == 1_safest`
   AND `recommended_action == backfill_canonical_op_notation`. That's the
   notation-backfill wave shortlist (concrete next-action set).
2. For each row, open `notation_backfill_wave_2026-05-23.csv` to see the
   per-source candidates side-by-side.
3. Pick the cleanest candidate (fborg-bracket form preferred). Author the
   final canonical-bracket form into `red_corrections_2026_04_20.csv` (or
   the active corrections file).
4. Treat Tier 2 rows as a parallel curator-review queue (single-filter
   failures usually resolve with a quick judgment call).
5. Defer Tier 3 until the relevant doctrine question (e.g. blurry-family
   composition) lands.
