# FB.org INSERT — Curator Selection Queue — 2026-05-21

A non-doctrinal sort of the **77** FB.org INSERT candidates not yet
promoted, into five review groups, so the curator can pick promotion
batches efficiently. No doctrine decided; no rows promoted.

Companion CSV: `FBORG_CURATOR_SELECTION_QUEUE_2026-05-21.csv`
(77 rows, `selection_group` column + decision context).

Scope: of the 82-row staging queue — 4 are promoted (`accept`), 1 is
resolved document-only (`clipper-kick`, see
`CLIPPER_KICK_NAMING_NOTE`). The 77 here have `curator_decision` blank.

---

## 1. Grouping heuristic (advisory, non-doctrinal)

Each row is assigned ONE group by transparent rules, first match wins.
The groups are a **review sort order**, not canonical claims — re-bucket
freely.

| Rule | Group |
|---|---|
| ADD ≥ 6 (deepest compounds) | Red-gated/defer |
| idiosyncratic folk name (curated list) | historical oddity |
| ADD ≤ 3, transparent structural name | foundational/pedagogical |
| ADD = 4, transparent structural name | topology-critical |
| ADD = 5, transparent structural name | already-live-adjacent |

Note: none of the 77 is *strictly* Red-gated — all are settled-doctrine
(`first_class_ready`). "Red-gated/defer" here is the residual defer
bucket (deepest compounds, lowest priority while the Red packet is out).

## 2. Group counts

| Group | Count | Promotion posture |
|---|---:|---|
| foundational/pedagogical | 9 | Highest value; promote-soonest |
| topology-critical | 33 | Family-completer batches; promote by family |
| already-live-adjacent | 13 | Sibling extensions of live rows |
| historical oddity | 16 | Folk curios; low priority |
| Red-gated/defer | 6 | Deepest; defer |
| **Total** | **77** | |

## 3. foundational/pedagogical (9)

Low-ADD, single-concept compounds — each cleanly teaches one operator.
Strong promote-next candidates once prose is authored.

`around-the-world-kick` · `inspinning-same-side-illusion` ·
`inspinning-same-side-mirage` · `paradox-illusion` · `pixie-leg-over` ·
`symposium-pixie` · `tapping-illusion` · `tapping-legover` ·
`toe-blizzard`

## 4. topology-critical (33)

4-ADD operator-on-base compounds that complete family/operator cells
the live DB partially carries. The natural SCALE-pilot **family
batches** — e.g. the inspinning set, the paradox set, the symposium
set, the pixie set, the quantum set.

`atomic-eclipse` · `backside-symposium-smear` ·
`backside-symposium-toe-blizzard` · `backside-symposium-toe-blur` ·
`butterfly-swirl` · `da-da-curve` · `double-over-down` ·
`down-double-down` · `gyro-butterfly` · `inspinning-butterfly` ·
`inspinning-paradox-illusion` · `inspinning-paradox-mirage` ·
`inspinning-same-side-butterfly` · `miraging-eclipse` ·
`paradox-barrage` · `paradox-blizzard` · `paradox-double-leg-over` ·
`paradox-symposium-mirage` · `pixie-eclipse` · `pixie-swirl` ·
`pixie-whirl` · `quantum-drifter` · `quantum-whirl` ·
`spinning-paradox-illusion` · `spinning-paradox-mirage` ·
`stepping-ducking-mirage` · `stepping-eggbeater` ·
`symposium-double-leg-over` · `symposium-eggbeater` ·
`symposium-reverse-whirl` · `terraging-opposite-clipper` ·
`terraging-same-clipper` · `toe-ripwalk`

## 5. already-live-adjacent (13)

5-ADD compounds that extend tricks already in the live DB — sibling
extensions; promote alongside their family batch.

`barfly-swirl` · `double-over-down-swirl` · `paradon-swirl` ·
`paradox-da-da-curve` · `paradox-high-plains-drifter` ·
`paradox-ripwalk` · `paradox-whirling-swirl` · `pixie-double-over-down` ·
`pixie-paradon` · `spinning-paradox-whirl` · `stepping-whirling-swirl` ·
`symposium-torque` · `symposium-whirling-swirl`

## 6. historical oddity (16)

Folk-named curios — idiosyncratic names, observational interest, low
promotion priority.

`bubba` · `flux` · `twirl` · `blizzard` · `avalanche` · `barroque` ·
`bedwetter` · `down-diver` · `ducking-barfly` · `flurricane` · `lotus` ·
`ricochet` · `scorpions-tail` · `spike-hammer` · `spyro-gyro` · `yoda`

## 7. Red-gated/defer (6)

Deepest 6–7 ADD compounds — defer; lowest promotion priority.

`paratoxic` · `spinning-paradox-blender` ·
`spinning-symposium-down-double-down` · `torch-r-rack` ·
`stepping-ducking-paradox-blender` · `stepping-ducking-ps-whirl`

## 8. Recommended curator path

1. **First batch:** the 9 foundational/pedagogical rows — highest
   teaching value, simplest to author prose for.
2. **Then:** topology-critical, promoted as **family batches**
   (inspinning / paradox / symposium / pixie / quantum sets) per the
   SCALE-pilot model — author `short_description` / `execution_summary`
   per trick before promotion.
3. **already-live-adjacent** rides along with each family batch.
4. **historical oddity** + **Red-gated/defer** — leave in the
   observational layer; revisit only if a pedagogical need appears.
5. Promotion still goes through `promote_fborg_inserts.py` (fill
   `curator_decision=accept` in the staging queue first).
