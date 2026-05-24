# Wave Alpha Phase 3 — Notation-Backfill Completion (2026-05-24)

Completes the mechanical-translation subset of the original 38-row Wave
Alpha notation-backfill checklist. **Corrections authored + applied to
local DB via the existing loader; 4,122 tests passing.**

## What was implemented

20 notation backfills to existing canonical rows. All use mechanical
translation rules (no curator-judgment authoring). Distribution:

- **7 copy-as-is fborg** (canonical-bracket source; minor cleanups only)
- **9 FM-parens → canonical-bracket** translations (dual-convention rule)
- **4 Stanford → canonical-bracket** translations (per
  `STANFORD_TOKEN_DICT` + registered-modifier arithmetic)

Each translation verified: `[TOKEN]` bracket count == `official_add`.

## The 20 Phase 3 backfills

### Copy-as-is fborg (7)

| Slug | ADD | Op-notation | Note |
|---|---:|---|---|
| `around-the-world` | 2 | `TOE > SAME IN/OUT [DEX] > SAME TOE [DEL]` | clean |
| `reaper` | 3 | `CLIP > SAME OUT [DEX] > SAME OUT [DEX] > SAME TOE [DEL]` | trailing period stripped |
| `paradox-blizzard` | 4 | `CLIP > SAME IN [PDX] [DEX] > OP OUT [DEX] > OP TOE [DEL]` | trailing period stripped |
| `pickup` | 2 | `SET > OP IN [DEX] > SAME TOE [DEL]` | clean |
| `pixie` | 2 | `TOE > SAME IN [DEX] > OP TOE [DEL]` | clean |
| `whirling-swirl` | 4 | `CLIP > OP IN [DEX] > OP BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]` | clean |
| `stepping-ducking-paradox-blender` | 7 | `CLIP > OP IN [PDX] [DEX] > DUCK [BOD] > OP IN [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]` | curator-paced [PDX] insertion (resolves mini-wave deferral) |

The `stepping-ducking-paradox-blender` resolution: original fborg
notation had 6 bracket tokens versus official `adds=7`. The missing
token is [PDX] — paradox's structural signature on the first OP IN dex.
The insertion follows the spinning-paradox-blender precedent (already
in canonical DB), where [PDX] attaches to the OP IN dex from paradox.
Bracket count is now 7 == adds=7.

### FM-parens → canonical-bracket (9)

Per the dual-convention forever-rule: `(TOKEN)` → `[TOKEN]`, structural
elements upper-cased, parenthetical state qualifiers (e.g.
`(no plant while)`, `(back)`) preserved as muted lowercase descriptors.

| Slug | ADD | FM-parens source | Canonical-bracket |
|---|---:|---|---|
| `nova` | 4 | `Toe >> (no plant while) Op In (DEX)(BOD) > Op Out (DEX) > Same Toe (DEL)` | `TOE >> (no plant while) OP IN [DEX] [BOD] > OP OUT [DEX] > SAME TOE [DEL]` |
| `sidewalk` | 4 | `Clip > Op In (DEX) >> Same Out (DEX) > Op Clip (XBD)(DEL)` | `CLIP > OP IN [DEX] >> SAME OUT [DEX] > OP CLIP [XBD] [DEL]` |
| `surgery` | 6 | `Clip > (back) Spin (BOD) > Same In (DEX) >> (no plant while) Op Back Whirl (DEX)(BOD) > Op Clip (XBD)(DEL)` | `CLIP > (back) SPIN [BOD] > SAME IN [DEX] >> (no plant while) OP BACK WHIRL [DEX] [BOD] > OP CLIP [XBD] [DEL]` |
| `eggbeater` | 3 | `Toe >> Op Out (DEX) > Op Out (DEX) > Same Toe (DEL)` | `TOE >> OP OUT [DEX] > OP OUT [DEX] > SAME TOE [DEL]` |
| `flurry` | 4 | `Clip > Op In (DEX) > Same In (DEX) >> Op Out (DEX) > Same Toe (DEL)` | `CLIP > OP IN [DEX] > SAME IN [DEX] >> OP OUT [DEX] > SAME TOE [DEL]` |
| `magellan` | 3 | `Toe > Same In (DEX) >> Same Out (DEX) > Same Toe (DEL)` | `TOE > SAME IN [DEX] >> SAME OUT [DEX] > SAME TOE [DEL]` |
| `smear` | 3 | `Toe > Same In (DEX) >> Op In (DEX) > Op Toe (DEL)` | `TOE > SAME IN [DEX] >> OP IN [DEX] > OP TOE [DEL]` |
| `smog` | 4 | `Toe > Same In (DEX) >> Op In (DEX) > Op Out (DEX) > Same Toe (DEL)` | `TOE > SAME IN [DEX] >> OP IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]` |
| `smudge` | 3 | `Toe > Same In (DEX) > Op Out (DEX) > Op Toe (DEL)` | `TOE > SAME IN [DEX] > OP OUT [DEX] > OP TOE [DEL]` |

### Stanford → canonical-bracket (4)

| Slug | ADD | Stanford | Canonical-bracket |
|---|---:|---|---|
| `ducking-clipper` | 3 | `Z^+X` | `TOE > DUCK [BOD] > SAME CLIP [XBD] [DEL]` |
| `spinning-butterfly` | 4 | `X.\-0-X` | `CLIP > (back) SPIN [BOD] > OP OUT [DEX] > OP CLIP [XBD] [DEL]` |
| `spinning-clipper` | 3 | `X.\+X` | `CLIP > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]` |
| `stepping-osis` | 4 | `X-1.\+X` | `CLIP > OP IN [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]` |

## Verification performed

1. **ADD-math sanity check.** Pre-write Python check confirmed all 20
   translations satisfy `bracket_count(notation) == official_add`.
2. **CSV append.** 40 corrections rows appended to
   `red_corrections_2026_04_20.csv` (20 candidates × 2 fields).
3. **Loader applied.** `19_load_red_additions.py` ran cleanly. 370
   corrections applied total (330 from Phase 2 baseline + 40 new).
   Only pre-existing skips (`double-knee.*` / `peak-delay.*`).
4. **DB state verified.** All 20 slugs now carry the new
   operational_notation values.
5. **Parser populated.** Stable at 51 exact_self_atom, 0 unresolved
   (parser reads `notation` not `operational_notation`, so these
   backfills don't shift parser counts).
6. **Tests.** `npm test` → 4,122 passing across 230 test files;
   no regressions.

## Still-deferred candidates (4 rows)

| Slug | Reason | Action class |
|---|---|---|
| `walk-over` | Passback source is pedagogical prose ("Inside Stall>place foot on ground>step over into Clipper") not structural notation | Curator authors canonical-bracket form |
| `rake` | Passback source is descriptive ("Toe Stall dragged from Xbd position") not structural notation | Curator authors canonical-bracket form |
| `legover` | Passback source is fragmentary ("(downtime) leggy out dex>ss toe") not full canonical form | Curator authors canonical-bracket form |
| `inspinning-osis` | `inspinning` modifier not registered in `freestyle_trick_modifiers`; FM (3) and Stanford (4) disagree on ADD | Doctrine adjudication: register modifier + reconcile ADD |

These remain in `wave_alpha_notation_backfill_2026-05-23.csv` for
future curator-paced work.

## Cumulative Wave Alpha state (final)

| Slice | Operation | Count | Cumulative |
|---|---|---:|---:|
| Mini-Wave | foundational notation backfill | 15 | 15 |
| Phase 1 | safest copy-as-is promotions | 13 | 28 |
| Phase 2 | translatable promotions (Stanford / FM / typo-fix) | 16 | 44 |
| Phase 3 | mechanical-translation backfills | 20 | **64** |

**64 canonical rows touched.** Breakdown by operation type:

- 35 notation backfills (15 mini-wave + 20 Phase 3) → existing canonical rows gain `operational_notation`
- 29 new canonical-row promotions (13 Phase 1 + 16 Phase 2) → new compound entries with full notation

## What was the closing surface area

Of the original 393-slug ≥4-source frontier (the "gold" set), Wave Alpha
sequence touched 64 canonical rows. The remaining ~329 slugs in that
frontier are now in three states:

1. Already canonical with op_notation (pre-existing) — no work needed
2. Tier-2 single-filter-fail (mostly `divergence_large` from PassBack vs
   IFPA ADD) — needs curator doctrine adjudication, deferred
3. Genuinely new-promotion candidates beyond Wave Alpha — available for
   a future "Wave Beta" pass

## What this slice does NOT do

- ❌ No UI changes
- ❌ No schema migrations
- ❌ No new modifiers registered in `freestyle_trick_modifiers`
  (inspinning remains unregistered)
- ❌ No passback-prose-to-canonical-bracket authoring (walk-over,
  rake, legover deferred)
- ❌ No new automatic-translation rules introduced (all translations
  follow pre-documented STANFORD_TOKEN_DICT + dual-convention rule +
  registered-modifier arithmetic + ADD-math verification)
