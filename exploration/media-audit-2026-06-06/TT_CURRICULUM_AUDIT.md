# Part B — Tricks of the Trade (Kenny Shults) Curriculum Audit

TT is an **educational curriculum**, not just a gallery: the lessons run a deliberate beginner→advanced ladder (stalls → kicks → orbit → dex atoms → compounds). It currently rides the `tt_youtube` source (TUTORIAL tier). The TT number + title live in each item's `caption` ("`NN - Title`"); `source_filename` is empty.

## B1. Numbering completeness
- Present in DB: **TT02–TT42 = 40 lessons.**
- **Missing: TT01 and TT34.** TT01 is presumably the intro/overview (no single trick); **TT34 is a genuine gap** in an otherwise contiguous run and should be located/backfilled.
- Community inventory lists the WorldFootbag channel at 42 TT clips (#1–#42); reconcile against that list when backfilling.

## B2. Mapping table

| TT | Title (caption) | Intended trick | Current `#tag` | Recommended `#tag` | Notes |
|---:|---|---|---|---|---|
| 01 | _(missing)_ | intro/overview | — | — | Likely no trick; confirm + add as curriculum intro card. |
| 02 | Toe Stall | toe stall | `#toe-stall` | `#toe-stall` | ✓ |
| 03 | Inside Stall | inside stall | `#inside-stall` | `#inside-stall` | ✓ |
| 04 | Outside Stall | outside stall | `#outside-stall` | `#outside-stall` | ✓ |
| 05 | Knee Stall | knee stall | `#knee-stall` | `#knee-stall` | ✓ |
| 06 | Spin | spin kick | `#spin` | `#spin` | ✓ (dual-role; resolves to kind='trick') |
| 07 | Flying Outside | flying outside | `#flying-outside` | `#flying-outside` | ✓ |
| 08 | Flying Inside | flying inside | `#flying-inside` | `#flying-inside` | ✓ |
| 09 | Clipper | clipper **kick** | `#clipper` | `#clipper` (verify) | ⚠ `clipper` is `kind='surface'` (hidden from trick-browse). Lesson teaches the clipper *kick*. Confirm `#clipper` surfaces where intended, or that the kick has a browseable home. |
| 10 | Sole | sole kick | `#sole-kick` | `#sole-kick` | ✓ |
| 11 | Cloud | cloud kick | `#cloud-kick` | `#cloud-kick` | ✓ |
| 12 | Forehead Stall | forehead stall | `#forehead-stall` | `#forehead-stall` | ✓ |
| 13 | Neck Catch | neck stall | `#neck-stall` | `#neck-stall` | ✓ |
| 14 | Around The World | ATW **kick** (no catch) | `#around-the-world` | needs distinct target | ⚠ **Collision with TT15.** `#around-the-world` is the 2-ADD orbit **stall** atom (= TT15). TT14 is the kick/orbit motion without the catch. Either add an `around-the-world-kick` target or keep both on `#around-the-world` with caption disambiguation. |
| 15 | Around The World Toe Stall | ATW stall | `#around-the-world` | `#around-the-world` | ✓ for the stall; resolves the TT14 collision once TT14 is retargeted. |
| 16 | Leg-Over Stall | legover | `#legover` | `#legover` | ✓ |
| 17 | Mirage Stall | mirage | `#mirage` | `#mirage` | ✓ |
| 18 | Clipper Stall | clipper-stall | `#clipper-stall` | `#clipper-stall` | ✓ (distinct from TT09's `#clipper`) |
| 19 | Hop-Over | hop-over | `#hop-over` | `#hop-over` | ✓ |
| 20 | Flying Clipper | flying-clipper | `#flying-clipper` | `#flying-clipper` | ✓ |
| 21 | Dragonfly | dragonfly-kick | `#dragonfly-kick` | `#dragonfly-kick` | ✓ |
| 22 | Sole Stall | sole-stall | `#sole-stall` | `#sole-stall` | ✓ |
| 23 | Squeeze | squeeze | `#squeeze` | `#squeeze` | ✓ |
| 24 | Cross-Body Sole | cross-body-sole-stall | `#cross-body-sole-stall` | `#cross-body-sole-stall` | ✓ |
| 25 | Pendulum | pendulum | `#pendulum` | `#pendulum` | ✓ |
| 26 | Butterfly Stall | butterfly | `#butterfly` | `#butterfly` | ✓ |
| 27 | Whirl Stall | whirl | `#whirl` | `#whirl` | ✓ |
| 28 | Osis Stall | osis | `#osis` | `#osis` | ✓ |
| 29 | Double Around the World | double-around-the-world | `#double-around-the-world` | `#double-around-the-world` | ✓ |
| 30 | Double Leg-Over Stall | double-leg-over | `#double-leg-over` | `#double-leg-over` | ✓ |
| 31 | Symposium Mirage Stall | symposium-mirage | `#symposium-mirage` | `#symposium-mirage` | ✓ |
| 32 | Paradox Mirage Stall | paradox-mirage | `#paradox-mirage` | `#paradox-mirage` | ✓ |
| 33 | Drifter Stall | drifter | `#drifter` | `#drifter` | ✓ |
| 34 | _(missing)_ | ? | — | — | ⚠ Genuine gap — locate the clip + intended trick. |
| 35 | Torque Stall | torque | `#torque` | `#torque` | ✓ |
| 36 | Spinning Osis Stall | spinning-osis | `#spinning-osis` | `#spinning-osis` | ✓ |
| 37 | Swirl Stall | swirl | `#swirl` | `#swirl` | ✓ |
| 38 | Spinning Butterfly | spinning-butterfly | `#spinning-butterfly` | `#spinning-butterfly` | ✓ |
| 39 | Blur Stall | blur | `#blur` | `#blur` | ✓ |
| 40 | Dada Curve | dada-curve | `#dada-curve` | `#dada-curve` | ✓ |
| 41 | Whirling Swirl Stall | whirling-swirl | `#whirling-swirl` | `#whirling-swirl` | ✓ |
| 42 | Symposium Whirl | symposium-whirl | `#symposium-whirl` | `#symposium-whirl` | ✓ |

## B3. Findings summary
- **Mapping quality is high:** 38/40 present lessons map correctly to an active trick slug. Only **2 issues**: the TT14/TT15 `#around-the-world` collision, and the TT09 `#clipper` surface-slug verification.
- **2 missing lessons:** TT01 (intro) and TT34 (gap).
- **Progression is intact and valuable:** TT02–13 (stalls + basic kicks) → TT14–28 (orbit, dex atoms, the 6 foundational families) → TT29–42 (doubles, modifier compounds). This is the strongest existing "Learn Freestyle" ladder on the platform and is currently buried inside a flat gallery (see `MEDIA_LANDING_REDESIGN.md`).

## B4. Recommended fixes (no edits made — Dave-owned writes)
1. Retarget **TT14** away from `#around-the-world` (kick vs stall); keep TT15 on `#around-the-world`.
2. Verify **TT09 `#clipper`** surfaces on the intended page (it's `kind='surface'`).
3. Backfill **TT01** (intro card) and **TT34** (locate clip + slug).
4. Promote the TT ladder to a first-class "Learn Freestyle / Trick Tutorials" path on `/media`.
