# PassBack Alias Review (PASSBACK-GRAMMAR-2 / Part A)

Companion review packet for `PASSBACK_ALIAS_CANDIDATES.csv`. Identifies
PassBack/FM observational-grammar terms that map to existing IFPA rows, to
recursive modifier compositions, or to FM-vocab observational-only entries.

## Scope and constraints

- **Documentation-only**. No DB writes, no alias-table inserts, no parser changes.
- **IFPA canonical authority preserved**. PassBack terms are folk-language evidence.
- **SS resolved**: `ss` carries +0 ADD per Red 2026-05-11. Applied throughout.

## Pool inventory

PassBack/FM inventory: 573 rows. Mapping against IFPA dictionary (160 active rows + 124 existing alias entries):

| state | count | meaning |
|---|---|---|
| Already aliased | 93 | FM display name already present in IFPA `aliases_json` |
| Safe alias candidates | 6 | FM display name maps to existing IFPA slug via tech_name; ADD agrees; not yet aliased |
| Conflict (ADD delta) | 3 | FM display name slug-matches IFPA but FM ADD ≠ IFPA ADD (Omelette, Terrage, Fury) |
| Observational only (FM-vocab) | 472 | FM tech_name uses Q4-class modifier (fairy, gyro, etc.) or doesn't map to IFPA |
| Unresolved | varies | edge cases (Slicing polysemy, FM-derived variants) |

## Three alias types separated

The user's framing distinguishes three alias categories. The CSV's
`alias_type` column captures this:

### 1. Trick aliases (18 entries)

A PassBack display name that points to a specific IFPA trick row. Most
useful for direct `aliases_json` insertion.

| passback_term | → IFPA target | category |
|---|---|---|
| Blender (same side) | blender | safe_alias |
| Flurry (toe set) | flurry | safe_alias |
| Drifter (same-side) | drifter | safe_alias |
| Grifter | reverse-drifter | safe_alias |
| Grifter (same side) | reverse-drifter | safe_alias |
| Barroque | barraging-osis | safe_alias |
| Omelette (FM) | omelette | conflict (FM=4 vs IFPA=3) |
| Terrage (FM) | terrage | conflict (FM=3 vs IFPA=4) |
| Fury (FM) | fury | conflict (FM=6 vs IFPA=5) |
| Atomic ss Osis (FM display) | tapping-osis (per FM tech) | unresolved (target not in dict) |
| Dyno (far) / Dyno (same side) | dyno | unresolved (display variant resolution) |
| (+ 6 observational-only examples) | — | observational_only |

### 2. Modifier aliases (15 entries)

A PassBack set-name that resolves to a composition of other modifiers per the
Sets-tab. These are NOT trick aliases — they're alternate names for modifier
**compositions**. Useful for an educational glossary, not for `aliases_json`.

| passback_term | resolves to | risk |
|---|---|---|
| Sailing | pixie + atomic | low |
| Frantic | pixie + quantum | low |
| Phasing | fairy + ss + spinning | medium (fairy Q4) |
| Leaning | stepping + inspinning | low |
| Hyper | rooted + pixie | low |
| Pogo | uptime + ATW | low |
| Inspinning | front-spin direction | low |
| Spinning | back-spin direction | low (already modifier) |
| Quantum (FM) | toe + miraging | low (FM-side def only) |
| Atomic (FM) | toe + illusioning | low (FM-side def only) |
| Quasi | clipper + far + miraging | medium (references unresolved far) |
| Slaying | symp + sailing → symp + pixie + atomic | low (3-deep recursion) |
| **Slicing** | **AMBIGUOUS** (Gyro Rev. Swirling OR Blurry Quasi) | **HIGH** — FM data conflict |
| Riffing | symp + blurriest | medium (blurriest pt12) |
| Smiling | swirling + ss + stepping | medium (swirling unresolved) |

### 3. Recursive operator aliases (5 entries)

Alternate names for `<modifier> ss` compositions per the Sets tab. These are
the load-bearing pattern: a Sets-tab Set X has an Alternate Name `Y ss Z`,
where `Y ss Z` is a different way of writing X.

| passback_term | alias_of |
|---|---|
| Spinning ss | Gyro |
| Quantum ss | Slapping |
| Atomic ss | Tapping |
| Pdx Tapping | Nuclear ss |
| Pdx Stepping | Quasi ss (likely) |

Under the SS=+0 ruling, none of these affect ADD math. They're descriptive
parallels between same-side body-direction commitments and named alternate
sets. Educational value: shows that FM has a systematic synonymy convention
between `<set> ss` and a different set-name.

## Risk-graded recommendations

### Insert now (LOW risk; safe_alias category)

The 6 safe-alias trick entries can be inserted into IFPA `aliases_json`
without ontology impact:

- `blender.aliases_json` += `"blender (same side)"`
- `flurry.aliases_json` += `"flurry (toe set)"`
- `drifter.aliases_json` += `"drifter (same-side)"`, `"drifter (same side)"`
- `reverse-drifter.aliases_json` += `"grifter"`, `"grifter (same side)"`
- `barraging-osis.aliases_json` += `"barroque"`

**Action**: subject to human approval, this is a one-row-per-target alias-table
patch (5 IFPA rows updated, 6 alias strings added). Done via the existing
`legacy_data/inputs/curated/tricks/*` patching workflow or a small targeted
SQL UPDATE under `db-write-safety` rules. **Not auto-executed in this phase.**

### Glossary-only (modifier_alias category)

The 15 modifier-composition aliases should NOT be inserted into `aliases_json`
on trick rows. They're alternate names for *compositions*, not for specific
tricks. Appropriate surface: a future educational glossary
(`/freestyle/glossary`) entry per set name, with the composition shown.

### Defer pending Red (conflict + unresolved categories)

3 conflicts + 3 unresolved entries need additional input:

- **Omelette** (FM=4 vs IFPA=3) — see Red Q1 candidate in `RED_PACKET_PRIORITY_QUEUE.md`
- **Terrage** (FM=3 vs IFPA=4) — see Red Q2 candidate
- **Fury** (FM=6 vs IFPA=5) — accept as documented divergence per pt6; no further Red needed
- **Slicing** — FM curation review (not IFPA's concern)
- **Atomic ss Osis** display → tapping-osis target — depends on whether IFPA wants `tapping-osis` as a canonical row (currently absent)
- **Dyno (far) / Dyno (same side)** — both display variants of IFPA's `dyno`; alias both once display-disambiguation policy is decided

### Document-only (observational_only)

The 472 FM tech_name rows that use FM-vocab modifiers (fairy/gyro/blazing/
surging/furious/barraging/railing/flailing/etc.) remain observational-only
until the Q4 vocabulary question is adjudicated. The CSV captures 6
representative examples; the full set is preserved in
`legacy_data/out/footbagmoves_inventory.csv`.

## What this review does NOT do

- Does not insert any alias into the IFPA DB.
- Does not propose modifier-table additions for FM-vocab modifiers.
- Does not adopt FM ADD values for the 3 conflict rows.
- Does not resolve Slicing's two-definition polysemy.
- Does not specify a glossary surface for the modifier-composition aliases.

## Files referenced

- `exploration/footbagmoves-federation/PASSBACK_ALIAS_CANDIDATES.csv` (machine-readable, 38 entries)
- `legacy_data/out/footbagmoves_inventory.csv` (authoritative FM inventory)
- `exploration/footbagmoves-federation/FM_GRAMMAR_PHASE1.md` (operator inventory + transformation patterns)
- `exploration/footbagmoves-federation/FM_MATH_DIVERGENCES.csv` (the 18 SS-ruling-affected rows)
