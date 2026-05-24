# Wave Alpha Phase 2 — Implementation Report (2026-05-23)

Implements the remaining curator-translatable Wave Alpha promotion
candidates. **Additions authored + applied to local DB via the loader;
4,122 tests passing.**

## What was implemented

16 new canonical-row promotions covering the 17-row Phase 2 pool minus
1 deferral. Filter cascade:

- All in Tier 1 Wave Alpha
- 14 Stanford-shorthand candidates translated to canonical-bracket form
  via the documented `STANFORD_TOKEN_DICT.md` + registered modifier
  arithmetic
- 1 fborg typo fix (`paradox-illusion`)
- 1 FM-parens → canonical-bracket translation per the dual-convention
  forever-rule (`pixie-osis`)

Each translation has ADD-math verified per row: `[TOKEN]` bracket count
in the canonical form equals the modifier-arithmetic ADD value, which
also equals at least one cross-source ADD claim.

## Deferred (1 row)

| Slug | Reason |
|---|---|
| `inspinning-osis` | `inspinning` modifier not registered in `freestyle_trick_modifiers`; FM (3) and Stanford (4) disagree on ADD; doctrine adjudication required before promotion. |

## The 16 Phase 2 promotions

### Stanford-shorthand → canonical-bracket translations (14)

| Slug | ADD | Stanford | Canonical-bracket op_notation |
|---|---:|---|---|
| `fairy-eggbeater` | 4 | `Z+0.-0-0+Z` | `TOE > SAME OUT [DEX] > OP OUT [DEX] > OP OUT [DEX] > SAME TOE [DEL]` |
| `pixie-eggbeater` | 4 | `Z+1.-0-0+Z` | `TOE > SAME IN [DEX] > OP OUT [DEX] > OP OUT [DEX] > SAME TOE [DEL]` |
| `ducking-illusion` | 3 | `Z^-0-Z` | `TOE > DUCK [BOD] > OP OUT [DEX] > OP TOE [DEL]` |
| `nuclear-illusion` | 4 | `X+0.-0-Z` | `CLIP > SAME OUT [PDX] [DEX] > OP OUT [DEX] > OP TOE [DEL]` |
| `fairy-legover` | 3 | `Z+0.-0+Z` | `TOE > SAME OUT [DEX] > OP OUT [DEX] > SAME TOE [DEL]` |
| `ducking-legover` | 3 | `Z^-0+Z` | `TOE > DUCK [BOD] > OP OUT [DEX] > SAME TOE [DEL]` |
| `nuclear-legover` | 4 | `X+0.-0+Z` | `CLIP > SAME OUT [PDX] [DEX] > OP OUT [DEX] > SAME TOE [DEL]` |
| `pixie-legover` | 3 | `Z+1.-0+Z` | `TOE > SAME IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]` |
| `ducking-mirage` | 3 | `Z^-1-Z` | `TOE > DUCK [BOD] > OP IN [DEX] > OP TOE [DEL]` |
| `ducking-pickup` | 3 | `Z^-1+Z` | `TOE > DUCK [BOD] > OP IN [DEX] > SAME TOE [DEL]` |
| `fairy-pickup` | 3 | `Z+0.-1+Z` | `TOE > SAME OUT [DEX] > OP IN [DEX] > SAME TOE [DEL]` |
| `nuclear-pickup` | 4 | `X+0.-1+Z` | `CLIP > SAME OUT [PDX] [DEX] > OP IN [DEX] > SAME TOE [DEL]` |
| `pixie-pickup` | 3 | `Z+1.-1+Z` | `TOE > SAME IN [DEX] > OP IN [DEX] > SAME TOE [DEL]` |
| `pixie-whirl` | 4 | `Z+1.-1-X` | `TOE > SAME IN [DEX] > OP IN [DEX] > OP CLIP [XBD] [DEL]` |

### fborg typo fix (1)

| Slug | ADD | Original fborg (typo) | Fixed canonical-bracket form |
|---|---:|---|---|
| `paradox-illusion` | 3 | `CLIP > SAME OUT [PDX[DEX] > OP TOE [DEL]` (unclosed bracket) | `CLIP > SAME OUT [PDX] [DEX] > OP TOE [DEL]` |

### FM-parens → canonical-bracket translation (1)

| Slug | ADD | FM-parens source | Canonical-bracket form |
|---|---:|---|---|
| `pixie-osis` | 4 | `Toe > Same In (DEX) >> (front) Spin (BOD) > Op Clip (XBD)(DEL)` | `TOE > SAME IN [DEX] >> (FRONT) SPIN [BOD] > OP CLIP [XBD] [DEL]` |

## Translation methodology

**Stanford → canonical-bracket** translation rule (per `STANFORD_TOKEN_DICT.md`):

| Stanford token | Canonical-bracket render |
|---|---|
| `Z` | `TOE` (entry) / `[DEL]` (terminal — toe stall = delay) |
| `X` | `CLIP` (entry) / `[XBD] [DEL]` (terminal — clipper stall = cross-body + delay) |
| `L` | `INSIDE` / `[XBD] [DEL]` (inside stall) |
| `+` | `SAME` (side) |
| `-` | `OP` (side) |
| `0` | `OUT [DEX]` (out-in dex; one DEX bracket) |
| `1` | `IN [DEX]` (in-out dex; one DEX bracket) |
| `.` | (peak — implicit; no bracket) |
| `^` | `DUCK [BOD]` (body duck; one BOD bracket) |
| `&` | `DIVE [BOD]` |
| `/` | `(FRONT) SPIN [BOD]` (forward spin; one BOD bracket) |
| `\` | `(BACK) SPIN [BOD]` (backward spin; one BOD bracket) |
| `!` | `(NO PLANT WHILE) [BOD]` (symposium) |

**FM-parens → canonical-bracket** translation rule (per the
dual-convention forever-rule 2026-05-23): change `(TOKEN)` → `[TOKEN]`
and normalize casing to UPPER on the structural elements; preserve
parenthetical movement-state descriptors (e.g. `(front)`, `(plant)`)
in lowercase as muted qualifiers. ADD count is then derived from the
canonical-bracket convention (each `[BRACKET]` = +1).

**Modifier arithmetic** (from `freestyle_trick_modifiers` table):

- `fairy`, `pixie`, `quantum`, `ducking`, `tapping`, `spinning`,
  `stepping`, `symposium`: +1 universally
- `atomic`: +1 non-rotational / +2 rotational
- `nuclear`: +2 universally (= `paradox` + `atomic`); introduces a
  `[PDX]` token plus surface-swap from default entry

## What changed in the repo

`legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv` — +16 rows.

`legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv` — +34 rows:

- 16 `operational_notation` rows (canonical-bracket form)
- 16 `operational_notation_source` rows (per-row provenance citation
  naming the Stanford / fborg / FM source)
- 2 `trick_family` overrides (`fairy-eggbeater` and `pixie-eggbeater`
  → `legover`, per the loader-19 no-transitive-inheritance forever-rule)

## Verification performed

1. **CSV append.** Pre-load conflict check confirmed zero existing
   rows for the 16 slugs in red_additions.
2. **Loader applied.** `19_load_red_additions.py` ran cleanly; 176
   total Red additions (160 from Phase 1 baseline + 16 new); 330
   corrections applied. One pre-existing skip (`ducking-mirage.notation`)
   resolved automatically — Phase 2 added the canonical row for it.
3. **DB state verified.** All 16 new rows present with correct
   `adds` / `base_trick` / `trick_family` / `operational_notation`.
   `fairy-eggbeater` and `pixie-eggbeater` correctly carry
   `trick_family=legover` per the override.
4. **Parser populated.**
   `python3 scripts/parse_freestyle_notation.py --apply` re-ran cleanly.
   Coverage: 2 `approximate`, 0 `unresolved`, 8 `policy_dependent`
   (was 5; the +3 are the 3 nuclear-* compounds, correctly flagged
   because nuclear's +2 ADD math is curator-policy, not parser-derived).
5. **Tests.** `npm test` → 4,122 tests passing across 230 test files;
   no regressions.

## Cumulative Wave Alpha state

| Slice | Promotions | Cumulative |
|---|---:|---:|
| Mini-Wave (foundational backfill) | 15 backfills | 15 |
| Wave Alpha Phase 1 | 13 promotions | 28 |
| Wave Alpha Phase 2 | 16 promotions | 44 |

Total touched: **44** (15 backfills + 29 new canonical rows across 6
families: illusion, pickup, eggbeater, legover, whirl, mirage, osis).
Legover family now has 4 Phase 2 members (the family had no Phase 1
representation).

## What's still pending

- `inspinning-osis` — deferred for doctrine adjudication on
  `inspinning` modifier registration + ADD reconciliation.
- The remainder of the 393-row ≥4-source frontier (post-Wave-Alpha)
  remains for future curator-paced waves; `publication_frontier_2026-05-23.csv`
  and `notation_backfill_wave_2026-05-23.csv` are the next-pass inputs.

## What this slice does NOT do

- ❌ No UI changes
- ❌ No schema migrations
- ❌ No doctrine adjudication (deferred row `inspinning-osis` surfaced)
- ❌ No `freestyle_trick_modifiers` table edits (modifier registry
  unchanged; `inspinning` remains unregistered)
- ❌ No new automatic-translation rules introduced (all translations
  follow pre-documented STANFORD_TOKEN_DICT + dual-convention rule +
  registered-modifier arithmetic)
- ❌ Did not modify any pre-existing canonical row in Phase 2 (this
  slice is new-row additions + new-row corrections only)
