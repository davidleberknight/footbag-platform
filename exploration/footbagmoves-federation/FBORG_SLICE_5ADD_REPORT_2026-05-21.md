# FB.org 5-ADD Master Ingest — Report — 2026-05-21

Derived view of `exploration/footbagmoves-federation/SYMBOLIC_GRAMMAR_MASTER.csv`
after the FB.org 5-ADD ingest slice. Master is the source of truth.
First slice to operate under the Red 2026-05-21 historical-ontology
doctrine (divergence preservation is now Red-validated).

---

## 1. Total trick counts

| Layer | Count |
|---|---:|
| Pre-5-ADD master rows | 808 |
| FB.org 5-ADD source entries (`fborg-5add.txt`) | 59 |
| → UPDATEs to existing canonical rows | 29 |
| → APPENDs as new fborg rows | 30 |
| **Final master total** | **838 rows × 42 cols** |

Source distribution: footbagmoves 573 · passback 106 · fborg 158 ·
curator 1.

## 2. Classification distribution

| Field | Count (of 59) |
|---|---:|
| first_class=true | 44 |
| first_class=false | 15 |
| curator_review_needed=true | 16 |

## 3. Cross-source ADD divergences captured (4)

Handled per Red 2026-05-21 Doctrine B (divergence preservation):
per-source `source_adds` left untouched; FB.org's claim recorded in
`provenance_notes`; `doctrine_status='hedged'` where material.

| Move | FB.org | FM | Master handling |
|---|:---:|:---:|---|
| **Fury** | 5 | 6 | UPDATE on FM/6add row; `source_adds` stays 6; FB.org=5 (= IFPA pt6) in provenance. **Also a decomposition-name divergence** — see §4. |
| **Voodoo** | 5 | 6 | UPDATE on FM/6add row; `source_adds` stays 6; FB.org=5 in provenance; `doctrine_status=hedged` |
| **Blurrage** | 5 | 6 | UPDATE on FM/6add row; `source_adds` stays 6; FB.org=5 in provenance; `doctrine_status=hedged` |
| **Double Spinning Osis** | 5 | 4 | UPDATE on FM/4add row; `source_adds` stays 4; FB.org=5 in provenance (the auto-appended confirmation line records the 5 against a 4-row) |

This is the first slice where Red's doctrine is explicitly load-bearing:
all four divergences are preserved as legitimate historical record, not
collapsed.

## 4. Decomposition-name divergence — Fury

The most interesting divergence in this slice is not numeric. FB.org
names Fury **"Barraging Paradox Mirage"**; IFPA pt6 ruled it
**"Furious Paradox Mirage"**. Both readings total 5 ADD — the
divergence is the *first operator*:

| Source | First operator | Total |
|---|---|:---:|
| FB.org 5-ADD | barraging | 5 |
| IFPA pt6 | furious (+2 rotational) | 5 |
| FM | (6-ADD reading) | 6 |

Master handling: UPDATE on the FM/6add row; `add_formula` carries the
IFPA pt6 reading (`furious + paradox + mirage`); `parser_notes`
documents the barraging-vs-furious first-operator divergence;
`curator_review_needed=true`; `unresolved_questions` flags it. This is
exactly the kind of historical divergence Red's 2026-05-21 guidance
says to preserve rather than silently pick a winner.

## 5. UPDATE report (29 rows)

Existing canonical rows that received FB.org 5-ADD governance metadata
+ a `provenance_notes` confirmation:

Fury · Double Spinning Osis · Down Diver · PS Whirl · Ricochet · Yoda ·
Superfly · Fusion · Voodoo · Blurrage · Fog · Blurry Drifter ·
Bedwetter · Blurry Whirl · Tomahawk · Barroque · Spyro Gyro ·
Flurricane · Mobius · Plasma · Scorpion's Tail · Lotus · Bullwhip ·
Blurrier · Grave Digger · Blurriest · Avalanche · Bigwalk · Surge

## 6. APPEND report (30 rows)

New fborg rows, grouped:

- **Paradox family (8)**: Paradox Blender, Paradox Da Da Curve, Paradox
  High Plains Drifter, Paradox Ripwalk, Paradox Torque, Paradox Blurry
  Whirl, Paradox Whirling Swirl, Nuclear Whirl
- **Pogo family (5)**: Pogo Barfly, Pogo Paradox Barrage, Pogo Paradox
  Drifter, Pogo Paradox Whirl, Pogo Paradox Eggbeater — all
  first_class=false (pogo modifier mechanics pending)
- **Symposium family (4)**: Symposium Torque, Symposium Whirling Swirl,
  Symposium Blizzard, Symposium Blur
- **Swirl-finish compounds (4)**: Barfly Swirl, Double-Over Down Swirl,
  Paradon Swirl, Stepping Whirling Swirl
- **Spinning / blistering (3)**: Blistering Whirl, Spinning Paradox
  Whirl, Double Blender
- **Pixie / down compounds (3)**: Pixie Paradon, Pixie Double Over
  Down, Shooting Mirage
- **Other (3)**: Jani Walker, Ducking Barfly, Spike Hammer

## 7. Curator-review queue (16 rows)

| Move | Reason |
|---|---|
| Fury | barraging-vs-furious first-operator divergence (FB.org vs IFPA pt6) |
| Voodoo / Blurrage | FB.org 5 vs FM 6 ADD divergence |
| Tomahawk | UNRESOLVED_COMPOUNDS member |
| Pogo Barfly / Pogo Paradox Barrage / Drifter / Whirl / Eggbeater | pogo modifier mechanics + no-plant-while interaction (5 rows) |
| Symposium Blizzard / Symposium Blur | double-`[BOD]` notation; symposium + blurry/stepping stacking |
| Double Blender / Double Spinning Osis | multiplicity-compound canonical-vs-modifier question |
| Paradox Blurry Whirl | blurry/stepping layer naming per Red 2026-05-21 |
| Shooting Mirage | pt9 shooting=+3 rotational vs stepping-paradox compositional reading |

## 8. Blurry/stepping doctrine applied (Red 2026-05-21 Doctrine C)

This slice is dense with blurry/stepping-family rows. Per Doctrine C
(blurry = historically-compressed layer; stepping = later explicit
layer; both coexist), the following rows carry a `parser_notes`
blurry/stepping coexistence framing rather than an alias-of or
supersedes framing:

- Blurry Whirl (= Stepping Paradox Whirl) — Red 2026-05-15 ruled 5 ADD
- Blurry Drifter (= Stepping Paradox Drifter)
- Fog (= Stepping Paradox DLO) — "Blur with extra legover" historical
  framing vs explicit layer
- Blurrier (= Stepping Down Double Down)
- Blurriest (= "stepping opposite side barfly")
- Paradox Blurry Whirl

`doctrine_status` on the blurry-named rows is `hedged` where the
two-layer framing is not yet per-row curator-confirmed (per Doctrine C
guidance: prefer `hedged` over `settled` for blurry/stepping pairs
until curator confirmation).

## 9. Notable canonical anchors confirmed

5-ADD is where several live-DB flagship compounds sit. FB.org confirms:

- **Mobius** (= Gyro Torque) — Red 2026-05-15 federation equivalence;
  multi-description recursive showcase. `doctrine_status=hedged`.
- **Surge** (= Surging Paradox Mirage) — SCALE-8 flagship pilot.
- **Bigwalk** (= Surging Butterfly) — pt2 ruling.
- **Barroque** (= Baroque / Barraging Osis) — Red 2026-05-20
  two-dex+osis ruling. FB.org double-r spelling preserved;
  single-r "Baroque" is the alternate.
- **Bullwhip** (= Spyro Double Down) — pt8 gyro family; §3.2 stated-ADD
  trio.
- **Jani Walker** (= Barraging Butterfly) — §3.2 stated-ADD trio.

## 10. Suggested next slice — 6-ADD ingestion

`exploration/fborg/fborg-6add.txt` next. Anticipated:

- Heaviest UPDATE proportion yet — 6-ADD overlaps the existing
  `footbagmoves-5-6adds.txt` (84 rows) + `footbagmoves-6add.txt`.
- More cross-source divergence: 6-ADD is where the FM-over-counts
  (Genesis, Enterrage) and the deepest atomic/symposium stacks cluster.
- Includes flagship compounds: gauntlet, surreal-adjacent depth.

**Carry-over questions:**

1. Fury-style decomposition-name divergence (barraging vs furious for
   the same move) — should the master carry both readings in
   `parser_notes`, or eventually pick the IFPA reading as primary once
   the curator confirms? Currently both preserved per Red doctrine.
2. The pogo-family rows (now 5 from this slice + 2 from 4-ADD) all sit
   `curator_review_needed=true` pending a pogo-modifier-mechanics
   ruling. Batch-triage candidate.
3. Pre-slice 679 footbagmoves/passback rows still have empty governance
   columns. Backfill pass after 6/7-ADD completes, or per-slice only?

## Files changed

```
modified  exploration/footbagmoves-federation/SYMBOLIC_GRAMMAR_MASTER.csv
            (808 → 838 rows; 42 cols; 29 UPDATEs + 30 APPENDs)
new       exploration/footbagmoves-federation/FBORG_SLICE_5ADD_REPORT_2026-05-21.md
```
