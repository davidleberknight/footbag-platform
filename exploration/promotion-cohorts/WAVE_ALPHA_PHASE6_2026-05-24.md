# Wave Alpha Phase 6 — Tier-2 Foundational-Atom Backfill (2026-05-24)

Backfills `operational_notation` for 11 foundational base-trick atoms
that previously sat in Tier-2 (`divergence_large`) due to PassBack-vs-
IFPA ADD claim disagreement. Per project doctrine, PassBack is
observational and does NOT define canonical ADD; this slice
operationalizes that doctrine to unblock high-value backfills.

**4,122 tests passing.**

## The PassBack divergence story

These 11 rows were filtered out of Phases 1–5 because the Wave Alpha
frontier classified them as `divergence_large` (ADD-claim spread ≥ 2
across sources). The divergence is concentrated in PassBack's
dex-count metric, which treats only (DEX) tokens as ADD-contributing.
PassBack's dex-count for these rows is consistently lower than the
canonical-bracket convention (which counts every `[TOKEN]`).

Per the project's existing doctrine (memory:
[[feedback_frequency_not_authority]]; also from CLAUDE.md skill: "Public-
facing trick descriptions are neutral and instructional. No 'per Red',
no 'per X'..."), PassBack is observational/provenance data, not a
canonical ADD authority. `canonical_db` + `fm` + `fborg` consistently
agree on each row's official ADD; PassBack is the divergent outlier.

Phase 6 operationalizes this by backfilling the 11 rows where:

- The row is already in `canonical_db` with an official ADD
- `canonical_db = fm = fborg` ADD claims agree
- PassBack is the sole source of divergence
- A canonical-bracket fborg notation exists with `bracket_count ==
  official_add`

## The 11 foundational atoms

| Slug | ADD | Operational notation (canonical-bracket form) |
|---|---:|---|
| `illusion` | 2 | `SET > OP OUT [DEX] > OP TOE [DEL]` |
| `mirage` | 2 | `SET > OP IN [DEX] > OP TOE [DEL]` |
| `osis` | 3 | `SET > (back or front) SPIN [BOD] > SAME or OP CLIP [XBD] [DEL]` |
| `whirl` | 3 | `SET > OP IN [DEX] > OP CLIP [XBD] [DEL]` |
| `swirl` | 3 | `CLIP > SAME BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]` |
| `butterfly` | 3 | `SET > SAME or OP OUT [DEX] > OP CLIP [XBD] [DEL]` |
| `drifter` | 3 | `SET > OP IN [DEX] > SAME CLIP [XBD] [DEL]` |
| `blender` | 4 | `SET > OP IN [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]` |
| `dyno` | 4 | `SET > OP OUT [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]` |
| `atomic-butterfly` | 4 | `TOE > OP OUT [DEX] > OP OUT [DEX] > OP CLIP [XBD] [DEL]` |
| `nemesis` | 6 | `CLIP > OP IN [DEX] > SAME IN [DEX] > OP OUT [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]` |

These are **the foundational anchors** — `illusion`, `mirage`, `osis`,
`whirl`, `swirl`, `butterfly`, `drifter` are the base-trick families
that almost every compound row in the dictionary descends from. Their
op_notation was conspicuously absent before Phase 6.

## Deferred from this slice (3 rows)

Three additional Tier-2 candidates with fborg-bracket source had
genuine ADD-math mismatches (not just PassBack divergence — actual
disagreement between bracket count and official ADD):

| Slug | Official ADD | fborg brackets | Issue |
|---|---:|---:|---|
| `blizzard` | 3 | 5 | fborg notation has extra `[BOD] [DEX] [BOD]` segment; FM=4 vs IFPA=3 vs fborg=5. Three-way disagreement. |
| `ripwalk` | 4 | 5 | fborg notation includes `[PDX]` token; if ripwalk is structurally paradox-based, official ADD might be 5, not 4. |
| `torque` | 4 | 5 | Same `[PDX]` pattern; if torque is paradox-osis decomposition, ADD might be 5. |

These need curator doctrine adjudication on whether the existing
official ADD is correct or whether the structural reading (via bracket
count) should override. Deferred to a future curator-paced slice.

## What changed in the repo

`legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv` — +22 rows:

- 11 `operational_notation` rows
- 11 `operational_notation_source` rows

No additions (these are existing canonical rows).

## Verification performed

1. **ADD-math sanity.** All 11 satisfy `bracket_count == official_add`.
2. **Cross-source verification.** Each row has `canonical_db`, `fm`,
   AND `fborg` agreeing on the official ADD; PassBack is the divergent
   source (per the project doctrine, non-authoritative).
3. **Loader applied.** `19_load_red_additions.py` ran cleanly. 473
   corrections applied (451 from Phase 5 baseline + 22 new). Only
   pre-existing skips.
4. **DB state verified.** All 11 slugs now carry the new
   `operational_notation` values.
5. **Tests.** `npm test` → 4,122 tests passing; no regressions.

## Doctrine note

This slice formalizes the *operationalization* of an existing project
rule: PassBack ADD claims are observational provenance, not canonical
authority. Wave Alpha's automated `divergence_large` filter
(implemented in `analyze_publication_frontier.py`) conservatively
flagged any slug where ADD claims spread ≥ 2, regardless of source
identity. Phase 6 demonstrates that when `canonical_db + fm + fborg`
agree (and only PassBack diverges), the slug is safely backfillable
per the documented doctrine.

A future iteration of the frontier analyzer could classify divergence
by **which source is divergent** — when PassBack is the outlier,
treat as `divergence_passback_only` (low-priority blocker); when FM
or fborg disagrees with canonical_db, treat as `divergence_serious`
(curator-blocking). That refinement is recommended for the next
analyzer pass.

## Cumulative Wave Alpha state

| Slice | Operation | Count | Cumulative |
|---|---|---:|---:|
| Mini-Wave | foundational backfill (Tier-1) | 15 | 15 |
| Phase 1 | safest copy-as-is promotions | 13 | 28 |
| Phase 2 | translatable promotions | 16 | 44 |
| Phase 3 | mechanical backfill translations | 20 | 64 |
| Phase 4 | Wave Beta + completion | 14 | 78 |
| Phase 5 | folk-named FM-parens wave | 19 | 97 |
| Phase 6 | Tier-2 foundational-atom backfill | 11 | **108** |

**108 canonical rows touched.** Breakdown:

- 47 notation backfills (15 mini-wave + 20 P3 + 1 P4 + 11 P6) → existing canonical rows gain op_notation
- 61 new canonical-row promotions (13 P1 + 16 P2 + 13 P4 + 19 P5)

The 11 Phase 6 backfills are disproportionately impactful: they
populate the **dictionary's structural anchors** that all compound
rows reference. Every existing compound that descends from
`illusion`, `mirage`, `osis`, `whirl`, `swirl`, `butterfly`,
`drifter`, `blender`, `dyno`, `nemesis`, or `atomic-butterfly` can
now display its parent's structural notation alongside its own.

## What this slice does NOT do

- ❌ No UI changes
- ❌ No schema migrations
- ❌ No modifications to `freestyle_trick_modifiers` registry
- ❌ No PassBack data removal — PassBack claims preserved as provenance
- ❌ No doctrine creation (only operationalizes an existing rule)
- ❌ No work on `blizzard` / `ripwalk` / `torque` (deferred for
  curator adjudication on bracket-count-vs-official-ADD)
