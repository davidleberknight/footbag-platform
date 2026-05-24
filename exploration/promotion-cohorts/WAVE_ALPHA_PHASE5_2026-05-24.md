# Wave Alpha Phase 5 — Folk-Named FM-Parens Wave (2026-05-24)

Tackles the FM-parens-only candidate pool (87 candidates), promoting
the safest folk-named tricks where FM-corpus technical decomposition
verifies cleanly against modifier-arithmetic + cross-source ADD
consensus. **4,122 tests passing.**

## What was implemented

19 new canonical-row promotions, all folk-named tricks from the
FootbagMoves corpus. Each translation follows the established
mechanical rules:

- FM-parens → canonical-bracket per dual-convention forever-rule
  (`(TOKEN)` → `[TOKEN]`, uppercase structural, lowercase state qualifiers)
- Modifier arithmetic verified from `freestyle_trick_modifiers`
- Cross-source ADD agreement (`spread = 0`)
- Bracket count == official ADD

Programmatic FM extraction prevented manual transcription errors;
pre-write ADD-math sanity check confirmed all 19 pass.

## The 19 Phase 5 promotions

| Slug | ADD | Base | FM technical decomposition | ADD math |
|---|---:|---|---|---|
| `aeon-flux` | 5 | osis | Nuclear Osis | nuclear(+2) + osis(3) = 5 |
| `anoxia` | 6 | paradox-symposium-mirage | Spinning Ducking Paradox Symposium Mirage | spinning(+1) + ducking(+1) + ps-mirage(4) = 6 |
| `blister` | 4 | mirage | Whirling Gyro Mirage | whirling(+1) + gyro(+1) + mirage(2) = 4 |
| `blue-widow` | 7 | paradox-symposium-whirl | Pixie Spinning Paradox Symposium Whirl | pixie(+1) + spinning(+1) + ps-whirl(5) = 7 |
| `dark-avenue` | 5 | butterfly | Fairy Diving Butterfly | fairy(+1) + diving(+1) + butterfly(3) = 5 |
| `fender` | 5 | blender | Fairy Blender | fairy(+1) + blender(4) = 5 |
| `fender-bender` | 6 | blender | Fairy Ducking Blender | fairy(+1) + ducking(+1) + blender(4) = 6 |
| `feral` | 4 | whirl | Fairy Whirl | fairy(+1) + whirl(3) = 4 |
| `forque` | 5 | torque | Fairy Torque | fairy(+1) + torque(4) = 5 |
| `fume` | 4 | drifter | Fairy Drifter | fairy(+1) + drifter(3) = 4 |
| `guillotine` | 4 | ducking-mirage | Fairy Ducking Mirage | fairy(+1) + ducking-mirage(3) = 4 |
| `lotus` | 5 | drifter | Spinning Pdx Drifter | spinning(+1) + paradox(+1) + drifter(3) = 5 |
| `overlord` | 7 | spinning-paradox-blender | Pixie Spinning Paradox Blender | pixie(+1) + sp-blender(6) = 7 |
| `parallax` | 3 | legover | Gyro Legover | gyro(+1) + legover(2) = 3 |
| `puck` | 4 | ducking-legover | Pixie Ducking Legover | pixie(+1) + ducking-legover(3) = 4 |
| `quagmire` | 4 | mirage | Quantum Gyro Mirage | quantum(+1) + gyro(+1) + mirage(2) = 4 |
| `quantanamera` | 5 | butterfly | Quantum Weaving Butterfly | quantum(+1) + weaving(+1) + butterfly(3) = 5 |
| `slapstick` | 6 | spinning-paradox-whirl | Pixie Spinning Paradox Whirl | pixie(+1) + sp-whirl(5) = 6 |
| `yoda` | 5 | butterfly | Pixie Quantum Butterfly | pixie(+1) + quantum(+1) + butterfly(3) = 5 |

Notable patterns:
- 6 rows use Phase 1+2 promotions as base (anoxia, blue-widow, overlord,
  puck, slapstick, guillotine) — the Wave Alpha foundation chains
  productively into Wave Beta.
- 6 rows use modifier `fairy` in mnemonic naming (fender, fender-bender,
  feral, forque, fume, guillotine) — the FM corpus has an internal
  pattern of "f"-prefix names for fairy compounds.
- 4 rows use the gyro modifier (blister, quagmire, parallax… and
  others elsewhere) — first Wave Alpha appearance of `gyro`.

## Trick_family overrides (11 rows)

Per loader-19 no-transitive-inheritance forever-rule:

| Slug | base_trick | base.trick_family | override applied |
|---|---|---|---|
| `lotus` | drifter | clipper-stall | clipper-stall |
| `anoxia` | paradox-symposium-mirage | mirage | mirage |
| `blue-widow` | paradox-symposium-whirl | whirl | whirl |
| `fender` | blender | osis | osis |
| `fender-bender` | blender | osis | osis |
| `forque` | torque | osis | osis |
| `fume` | drifter | clipper-stall | clipper-stall |
| `guillotine` | ducking-mirage | mirage | mirage |
| `overlord` | spinning-paradox-blender | blender | blender |
| `puck` | ducking-legover | legover | legover |
| `slapstick` | spinning-paradox-whirl | whirl | whirl |

## What changed in the repo

`legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv` — +19 rows.

`legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv` — +49 rows:

- 19 `operational_notation` rows
- 19 `operational_notation_source` rows
- 11 `trick_family` overrides

## Verification performed

1. **Programmatic FM extraction.** FM strings pulled directly from the
   comprehensive corpus by canonical_slug → translated mechanically
   per dual-convention rule → bracket-count verified per row.
2. **Pre-write ADD-math sanity.** All 19 satisfy
   `bracket_count(notation) == official_add`. Process caught two
   manual-transcription errors (`fender`, `fender-bender`) on the
   initial run; the corrected programmatic translations passed.
3. **Loader applied.** `19_load_red_additions.py` ran cleanly. 208
   total Red additions (189 from Phase 4 baseline + 19 new); 451
   corrections applied. Only pre-existing skips.
4. **DB state verified.** All 19 slugs present with correct
   `adds`/`base_trick`/`trick_family`/`operational_notation`. All 11
   family overrides applied.
5. **Tests.** `npm test` → 4,122 passing across 230 test files;
   no regressions.

## Deferred from Phase 5 candidate pool

- `fairy-symposium-mirage` — slug-FM mismatch (FM calls this trick
  "Fairy Flail"). No FM operational_notation under the IFPA slug.
  Curator decision needed on whether to alias the slug or promote
  with an authored canonical-bracket form.
- 67 remaining FM-parens candidates with more complex structure or
  unregistered modifiers (e.g. "Frantic", "Neutron"). Future curator-
  paced waves.

## Cumulative Wave Alpha state

| Slice | Operation | Count | Cumulative |
|---|---|---:|---:|
| Mini-Wave | foundational backfill | 15 | 15 |
| Phase 1 | safest copy-as-is promotions | 13 | 28 |
| Phase 2 | translatable promotions | 16 | 44 |
| Phase 3 | mechanical backfill translations | 20 | 64 |
| Phase 4 | Wave Beta + completion | 14 | 78 |
| Phase 5 | folk-named FM-parens wave | 19 | **97** |

**97 canonical rows touched.** Breakdown:

- 36 notation backfills (15 mini-wave + 20 Phase 3 + 1 Phase 4)
- 61 new canonical-row promotions (13 P1 + 16 P2 + 13 P4 + 19 P5)

Modifiers exercised across the wave: fairy, pixie, quantum, ducking,
tapping, spinning, stepping, symposium, atomic, nuclear, miraging,
weaving, diving, gyro, whirling, paradox. 16 of the 27 registered
modifiers.

## What this slice does NOT do

- ❌ No UI changes
- ❌ No schema migrations
- ❌ No new modifiers registered (gyro/weaving etc. already in registry)
- ❌ No doctrine adjudication on unregistered modifiers
  (`blistering`, `inspinning`, `frantic`, `neutron` still parked)
- ❌ No new automatic-translation rules introduced
