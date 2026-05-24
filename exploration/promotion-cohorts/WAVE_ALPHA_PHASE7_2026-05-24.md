# Wave Alpha Phase 7 — Tier-2 FM-Parens Backfill Wave (2026-05-24)

Extends the Phase 6 PassBack-doctrine operationalization to the Tier-2
candidates whose notation source is FM-parens (not fborg-bracket).
27 existing canonical-DB rows gain `operational_notation` via the
documented FM-parens → canonical-bracket dual-convention translation
rule. **4,122 tests passing.**

## What was implemented

Phase 6 demonstrated that Tier-2 `divergence_large` candidates are
safely backfillable when only PassBack diverges. Phase 7 applies the
same doctrine to the next layer of Tier-2: rows where the safe
notation source is FM-parens rather than fborg-bracket. Translation
mechanics are identical to Phase 3 and Phase 5.

Filter cascade:
- `frontier_tier = 2_curator_review`
- failure mode = `divergence_large` (NOT `composite_modifier` or `parser_unclean`)
- already in `canonical_db`
- `operational_notation` empty
- FM-parens source available
- After translation: `bracket_count == official_add`
- `canonical_db ADD == fm ADD` (PassBack as sole divergent source)

Pool size: 34 candidates. 27 verified clean. 7 deferred for genuine
bracket-vs-official mismatch.

## The 27 Phase 7 backfills

These are major freestyle tricks that previously lacked structural
notation on the public dictionary:

| Slug | ADD | Operational notation (canonical-bracket form) |
|---|---:|---|
| `assassin` | 4 | `TOE > SAME IN [DEX] >> DUCK [BOD] >> OP IN [DEX] > OP TOE [DEL]` |
| `big-apple` | 6 | `CLIP >> (back) SPIN [BOD] > (no plant while) SAME IN [DEX] [BOD] ...` |
| `blaze` | 3 | `CLIP > OP FRONT WHIRL [DEX] >> OP IN [DEX] > OP TOE [DEL]` |
| `blurriest` | 5 | `CLIP > OP IN [DEX] >> OP OUT [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]` |
| `bullwhip` | 5 | `CLIP >> (back) SPIN [BOD] >> SAME OUT [DEX] > SAME OUT [DEX] ...` |
| `dada-curve` | 4 | `SET >> OP IN [DEX] > (no plant while) OP OUT [DEX] > OP CLIP ...` |
| `dimwalk` | 4 | `TOE > SAME IN [DEX] >> OP OUT [DEX] > OP CLIP [XBD] [DEL]` |
| `fog` | 5 | `CLIP > OP IN [DEX] >> OP IN [DEX] [PDX] > OP OUT [DEX] > SAME ...` |
| `food-processor` | 6 | `CLIP > OP IN [DEX] >> OP FRONT WHIRL [DEX] [PDX] > (back) SPIN ...` |
| `gauntlet` | 7 | `CLIP > OP IN [DEX] >> DUCK [BOD] >> OP IN [DEX] [PDX] > (back) ...` |
| `grave-digger` | 5 | `CLIP > OP IN [DEX] >> SAME IN [DEX] > (back) SPIN [BOD] > OP ...` |
| `mantis` | 4 | `CLIP >> (back) SPIN [BOD] >> SAME OUT [DEX] > OP OUT [DEX] > ...` |
| `merkon` | 3 | `CLIP >> (back) SPIN [BOD] >> OP OUT [DEX] > SAME TOE [DEL]` |
| `mobius` | 5 | `CLIP >> (back) SPIN [BOD] >> SAME IN [DEX] > (front) SPIN [BOD] ...` |
| `parkwalk` | 4 | `TOE > SAME IN [DEX] >> SAME OUT [DEX] > OP CLIP [XBD] [DEL]` |
| `ripstein` | 4 | `CLIP >> SAME BACK SWIRL [DEX] >> SAME BACK SWIRL [DEX] > SAM ...` |
| `royale` | 4 | `CLIP >> SAME OUT [DEX] [PDX] >> SAME CLIP [XBD] [DEL]` |
| `smoke` | 4 | `TOE > SAME IN [DEX] >> OP IN [DEX] > SAME CLIP [XBD] [DEL]` |
| `sumo` | 5 | `CLIP > SAME OUT [DEX] [PDX] >> OP IN [DEX] [XDEX] > OP TOE [DEL]` |
| `superfly` | 5 | `CLIP >> (no plant while) SAME OUT [DEX] [BOD] > SAME OUT [DEX] ...` |
| `surge` | 5 | `CLIP > (back) SPIN [BOD] > SAME IN [DEX] >> OP IN [DEX] [PDX] ...` |
| `surreal` | 6 | `CLIP > (back) SPIN [BOD] > SAME IN [DEX] >> OP FRONT WHIRL [DEX] ...` |
| `tapdown` | 4 | `TOE > OP OUT [DEX] >> SAME OUT [DEX] > OP CLIP [XBD] [DEL]` |
| `tomahawk` | 5 | `CLIP >> DUCK [BOD] >> SAME FRONT WHIRL [DEX] [PDX] > OP CLIP ...` |
| `tombstone` | 4 | `CLIP > OP IN [DEX] >> SAME IN [DEX] > SAME CLIP [XBD] [DEL]` |
| `venom` | 6 | `CLIP > (back) SPIN [BOD] > SAME IN [DEX] >> OP OUT [DEX] > S ...` |
| `vortex` | 4 | `CLIP >> (back) SPIN [BOD] >> SAME IN [DEX] > SAME CLIP [XBD] ...` |

(Full notation strings are in `red_corrections_2026_04_20.csv`.)

## Translation hygiene

The mechanical FM → canonical-bracket translator now performs two
additional normalizations beyond the Phase 5 pass:

1. **Adjacent-bracket spacing.** `][` → `] [` to match the existing
   canonical-bracket convention used in red_corrections. Example:
   `[DEX][PDX]` → `[DEX] [PDX]`.
2. **Source-typo fix.** FM-corpus typo `FORNT WHIRL` → `FRONT WHIRL`
   (caught in `tomahawk`).

Both normalizations are deterministic and stay within the curator-paced
dual-convention rule — no doctrine invention.

## Deferred from this slice (7 rows)

| Slug | Issue |
|---|---|
| (Various) | 7 candidates where translated FM bracket-count ≠ official_add. These need curator review on which value is correct (FM-corpus over-tokenization vs IFPA official ADD). |

(I don't enumerate the 7 here because the relevant signal — same bracket-vs-official-ADD inconsistency pattern as Phase 6's blizzard/ripwalk/torque — is already documented. These 7 join the deferred queue for a curator-paced doctrine pass.)

## Cumulative Wave Alpha state

| Slice | Operation | Count | Cumulative |
|---|---|---:|---:|
| Mini-Wave | foundational backfill (Tier-1) | 15 | 15 |
| Phase 1 | safest copy-as-is promotions | 13 | 28 |
| Phase 2 | translatable promotions | 16 | 44 |
| Phase 3 | mechanical backfill translations | 20 | 64 |
| Phase 4 | Wave Beta + completion | 14 | 78 |
| Phase 5 | folk-named FM-parens wave | 19 | 97 |
| Phase 6 | Tier-2 foundational-atom backfill | 11 | 108 |
| Phase 7 | Tier-2 FM-parens backfill | 27 | **135** |

**135 canonical rows touched.** Breakdown:

- 74 notation backfills (15 mini-wave + 20 P3 + 1 P4 + 11 P6 + 27 P7)
- 61 new canonical-row promotions (13 P1 + 16 P2 + 13 P4 + 19 P5)

The 27 Phase 7 rows include several CRITICAL named tricks
(`assassin`, `big-apple`, `mantis`, `mobius`, `tomahawk`, `vortex`,
`sumo`, `surge`, `gauntlet`, `food-processor`) that are immediately
visible on the public dictionary surface.

## Verification performed

1. **Sanity check.** All 27 satisfy `bracket_count == official_add`
   (mechanical Python check before CSV write).
2. **Doctrine compliance.** Each row has `canonical_db = fm` on ADD
   (sole PassBack divergence treated as non-authoritative per Phase 6
   doctrine).
3. **Loader applied.** `19_load_red_additions.py` ran cleanly; 527
   corrections applied (473 from Phase 6 baseline + 54 new).
4. **DB state verified.** All 27 slugs carry the new
   `operational_notation` values.
5. **Tests.** `npm test` → 4,122 passing across 230 files;
   no regressions.

## What this slice does NOT do

- ❌ No UI changes
- ❌ No schema migrations
- ❌ No new modifiers registered
- ❌ No PassBack data removal (preserved as provenance)
- ❌ No doctrine invention (operationalizes Phase 6's PassBack rule)
- ❌ No bracket-vs-official-ADD adjudication on the 7 deferred rows
