# FB.org 4-ADD Master Ingest — Report — 2026-05-21

Derived view of `exploration/footbagmoves-federation/SYMBOLIC_GRAMMAR_MASTER.csv`
after the FB.org 4-ADD ingest slice. Master is the source of truth.

---

## 1. Total trick counts

| Layer | Count |
|---|---:|
| Pre-4-ADD master rows | 757 |
| FB.org 4-ADD source entries (`fborg-4add.txt`) | 90 |
| → UPDATEs to existing canonical rows | 39 |
| → APPENDs as new fborg rows | 51 |
| **Final master total** | **808 rows × 42 cols** |

Source distribution: footbagmoves 573 · passback 106 · fborg 128 · curator 1.

UPDATE-vs-APPEND policy applied per curator instruction (prefer UPDATE
when a stable canonical row exists). 39 of 90 found a master match.

## 2. Classification distribution

| Field | Count (of 90) |
|---|---:|
| first_class=true | 67 |
| first_class=false | 23 |
| curator_review_needed=true | 23 |

## 3. Cross-source ADD divergences captured

| Move | FB.org | Other source | IFPA canonical | Master handling |
|---|:---:|:---:|:---:|---|
| **Witchdoctor** | 4 | FM=4 | **5** (R1 2026-05-20 ruling) | UPDATE on FM row; `doctrine_status=hedged`; add_formula carries IFPA 5-ADD reading; parser_notes + provenance_notes document FB.org 4 vs IFPA 5 (atomic-rotational +2 on rotational base) |
| **Triage** | 4 | FM=6 | (unsettled) | UPDATE on FM/6add row; `source_adds` stays 6; provenance flags FB.org=4 |
| **S&M Smasher** | 4 | FM=6 | (likely 5 via pt1 X-Dex) | UPDATE on FM/6add row; `source_adds` stays 6; provenance flags FB.org=4 |

Witchdoctor is the load-bearing divergence: FB.org reads it as a flat
4-ADD "backside symposium atom smasher"; the R1 2026-05-20 convergence-
rule extension ruled 5 ADD (atomic earns its +2 rotational bonus on a
rotational base, plus symposium +1, plus mirage 2). The master keeps
`source_adds` per-source and records the canonical 5 in `add_formula` +
`unresolved_questions`.

## 4. UPDATE report (39 rows)

Existing canonical master rows that received FB.org 4-ADD governance
metadata + a `provenance_notes` confirmation entry:

Barfly · Blender · Butterfly Swirl · High Plains Drifter · Paradon ·
Royale · Ripstein · Symposium Eggbeater · Triage · Twirl · Whirling
Swirl · Whirr · S&M Smasher · Legbeater · Flux · Witchdoctor · Blizzard ·
Blur · Ducking Butterfly · Ducking Osis · Flog · Fairy Symposium Mirage ·
Flurry · Gyro Butterfly · Vortex · Inspinning Butterfly · Smoke · Smog ·
Dimwalk · Parkwalk · Pixie Whirl · Spinning Butterfly · Spinning Osis ·
Sidewalk · Haze · Tombstone · Stepping Osis · Torque · Ripwalk

Three of these are at non-4-ADD source rows: Triage + S&M Smasher
(footbagmoves/6add) and Butterfly Swirl + Whirr (also passback/4add).
The `source_adds` field stays at each row's original per-source value;
FB.org's 4-ADD claim is recorded in `provenance_notes`.

## 5. APPEND report (51 rows)

New fborg rows for tricks not yet in master. Grouped by family:

- **Paradox family (8)**: Paradox Drifter, Paradox Barrage, Paradox
  Blizzard, Paradox Blur, Paradox Double Leg Over, Paradox Symposium
  Mirage, Paradox Whirl, Paradox Drifter — all first_class=true
- **Symposium family (3)**: Symposium Double Leg Over, Symposium Reverse
  Whirl, Symposium Whirl — first_class=true
- **Spinning family (4)**: Spinning Butterfly Kick, Spinning Paradox
  Illusion, Spinning Paradox Mirage, (Spinning Butterfly/Osis UPDATEd)
- **Inspinning family (3)**: Inspinning Same Side Butterfly, Inspinning
  Paradox Illusion, Inspinning Paradox Mirage — first_class=true
- **Fairy family (6)**: Fairy Drifter, Fairy Butterfly, Fairy Same Side
  Whirl, Fairy Merkon, Fairy Spyro Mirage, Fairy Whirl — all
  first_class=false, curator_review_needed=true (pt12 Q4 pending)
- **Quantum family (4)**: Toe Ripwalk, Quantum Drifter, Backside
  Symposium Toe Blizzard, Backside Symposium Toe Blur, Quantum Whirl
- **Stepping family (4)**: Stepping Ducking Mirage, Stepping Eggbeater,
  Stepping Opposite Reaper, Stepping Opposite Side Reverse Whirl, Da Da
  Curve
- **Pixie family (3)**: Pixie Eclipse, Pixie Swirl, Backside Symposium
  Smear
- **Down / doubling family (5)**: Double-Over Down, Down Double-Down,
  Double Around the World Heel, Triple Around The World, Toe Double
  Drifter, Toe Whirr
- **Other compounds**: Pogo Butterfly, Hop Over Swirl, Miraging
  Eclipse, Atomic Eclipse, Leg-Over Flapper Stall, Pogo Paradox Mirage,
  Spyro Whirl

## 6. Curator-review queue (23 rows)

| Move | Reason |
|---|---|
| Witchdoctor | FB.org 4 vs IFPA canonical 5 ADD divergence |
| Triage | FB.org 4 vs FM 6 ADD divergence |
| S&M Smasher | FB.org 4 vs FM 6 ADD divergence |
| Fairy Drifter / Butterfly / Same Side Whirl / Merkon / Spyro Mirage / Whirl / Symposium Mirage / Flog | pt12 Q4 batch pending (fairy-as-modifier weight) — 8 rows |
| Spyro Whirl | spyro-as-modifier status not formally adjudicated |
| Pogo Butterfly / Pogo Paradox Mirage | pogo modifier mechanics + no-plant-while interaction |
| Hop Over Swirl | canonical-trick vs hop-over-into-swirl variant |
| Double Around the World Heel | canonical vs heel-stall variant of DATW |
| Leg-Over Flapper Stall | canonical vs flapper-finish variant of butterfly |
| Toe Double Drifter / Toe Whirr / Whirr | toe-set / double-X naming-convention questions |
| Triple Around The World | canonical 4-ADD trick vs multiplicity modifier alias |
| Spinning Butterfly Kick | kick-form variant (no stall terminator) |
| Stepping Opposite Reaper | Reaper base is UNRESOLVED_COMPOUNDS member |
| Stepping Opposite Side Reverse Whirl | notation conflict — source notation byte-identical to Ripwalk but description specifies reverse-whirl |

### Notable notation conflict

**Stepping Opposite Side Reverse Whirl** and **Ripwalk** carry the
*identical* source notation `CLIP > OP IN [DEX] > OP OUT [DEX] > OP CLIP
[XBD] [DEL]` in fborg-4add.txt, but their descriptions differ (one
specifies a reverse-whirl finish, the other a butterfly). Preserved both
rows verbatim per "preserve source truth"; flagged for curator.

## 7. Alternate names preserved (selected)

Far Double Over Down (Barfly) · Atomic Barrage (S&M Smasher) · Atomic
Butterfly (Legbeater) · Atomic Osis (Flux) · Atomic Symposium Mirage
(Witchdoctor) · Stepping Paradox Illusion (Blizzard) · Stepping Paradox
Mirage (Blur) · Paradox Reverse Drifter (Royale) · Double Swirl
(Ripstein) · Gyro Drifter (Vortex) · Pixie Drifter (Smoke) · Pixie
Double Legover (Smog) · Pixie Opposite/Same Side Butterfly (Dimwalk /
Parkwalk) · Stepping Butterfly (Sidewalk) · Stepping Double Legover
(Haze) · Stepping Drifter (Tombstone) · Stepping Opposite Osis (Torque) ·
Stepping Opposite Side Butterfly (Ripwalk) · Quantum Butterfly (Toe
Ripwalk) · Quantum Symposium Illusion/Mirage (Backside Symposium Toe
Blizzard / Blur) · Fairy Double Legover (Flog) · Fairy Spinning Legover
(Fairy Merkon) · Pixie Symposium Mirage (Backside Symposium Smear).

## 8. Suggested next slice — 5-ADD ingestion

`exploration/fborg/fborg-5add.txt` is next. Anticipated:

- Heaviest cross-source-divergence slice yet — 5-ADD is where atomic-
  rotational, hidden-X-Dex, and symposium-stacking divergences cluster.
- Heavy overlap with `footbagmoves-5adds.txt` (139 rows) +
  `footbagmoves-5-6adds.txt` (84 rows) already in master.
- Includes flagship live-DB compounds: fury, surreal, mobius,
  paradox-symposium-whirl, gauntlet.

**Carry-over questions:**

1. The Witchdoctor pattern (UPDATE on FM row; `source_adds` stays at
   per-source value; canonical ADD in `add_formula`; divergence in
   `provenance_notes` + `unresolved_questions`) — confirm this as the
   standard divergence-handling template for 5-ADD?
2. The 24 fairy-family rows now spread across 3-ADD + 4-ADD slices all
   sit `curator_review_needed=true` pending pt12 Q4. Triage as a batch
   once 5-ADD lands, or sooner?
3. Pre-slice rows still have empty governance columns (the 573
   footbagmoves + 106 passback that this slice did not touch). Backfill
   pass, or continue strict per-slice population?

## Files changed

```
modified  exploration/footbagmoves-federation/SYMBOLIC_GRAMMAR_MASTER.csv
            (757 → 808 rows; 42 cols preserved; 39 UPDATEs + 51 APPENDs)
new       exploration/footbagmoves-federation/FBORG_SLICE_4ADD_REPORT_2026-05-21.md
```
