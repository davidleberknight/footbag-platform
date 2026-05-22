# FB.org 6-ADD Master Ingest — Report — 2026-05-21

Derived view of `exploration/footbagmoves-federation/SYMBOLIC_GRAMMAR_MASTER.csv`
after the FB.org 6-ADD ingest slice. Master is the source of truth.

---

## 1. Total trick counts

| Layer | Count |
|---|---:|
| Pre-6-ADD master rows | 838 |
| FB.org 6-ADD source entries (`fborg-6add.txt`) | 22 |
| → UPDATEs to existing canonical rows | 10 |
| → APPENDs as new fborg rows | 12 |
| **Final master total** | **850 rows × 42 cols** |

Source distribution: footbagmoves 573 · passback 106 · fborg 170 ·
curator 1.

## 2. Classification distribution

| Field | Count (of 22) |
|---|---:|
| first_class=true | 13 |
| first_class=false | 9 |
| curator_review_needed=true | 9 |

## 3. Cross-source ADD divergences

**None this slice.** All 10 UPDATE matches were `footbagmoves/6add`
rows — FM and FB.org agree on 6 ADD across the board. This contrasts
with the 5-ADD slice (4 divergences) and confirms the expectation from
the Red 2026-05-21 doctrine that divergence clusters at specific
re-interpretation points (X-Dex, atomic-rotational) rather than being
uniform.

## 4. UPDATE report (10 rows)

All matched `footbagmoves/6add`; received FB.org 6-ADD governance
metadata + a `provenance_notes` confirmation:

Nemesis · Paratoxic · Food Processor · Big Apple · Whirlwind · Marius ·
Torch-r Rack · Venom · Surreal · Surgery

## 5. APPEND report (12 rows)

- **Pogo family (5)**: Pogo Paradox Blender, Pogo Paradox Da Da Curve,
  Pogo Paradox Torque, Pogo Paradox Whirling Swirl, Pogo Voodoo — all
  first_class=false (pogo modifier mechanics pending)
- **Blurry/stepping family (3)**: Blurry Symposium Whirl, Blurry
  Torque, Blurry Whirling Swirl
- **Spinning family (2)**: Spinning Paradox Blender, Spinning Symposium
  Down Double Down
- **Other (2)**: Symposium Tomahawk, Shooting Butterfly

## 6. Curator-review queue (9 rows)

| Move | Reason |
|---|---|
| Pogo Paradox Blender / Da Da Curve / Torque / Whirling Swirl / Voodoo | pogo modifier mechanics pending (5 rows) |
| Symposium Tomahawk | Tomahawk base is an UNRESOLVED_COMPOUNDS member |
| Shooting Butterfly | pt9 shooting=+3 rotational vs stepping-paradox compositional reading |
| Surreal | UNRESOLVED_COMPOUNDS member (SCALE-9 flagship) |
| Surgery | UNRESOLVED_COMPOUNDS member (SCALE-8 flagship) |

## 7. Individual-name asides in source (preserved + flagged)

Two source descriptions in `fborg-6add.txt` contain jokey
individual-name asides:

| Move | Aside |
|---|---|
| Pogo Paradox Torque | "...catching the bag on a left foot osis - **or just ask Tuan Vu**" |
| Pogo Paradox Whirling Swirl | "...complete a left foot swirl - **or just ask Kenny Shults**" |

**Handling.** Per the FB.org ingest rule "preserve descriptive text" +
the Red 2026-05-21 hard constraint "do not retroactively correct old
sources," the `source_description` is preserved **verbatim** at the
intake/staging layer — the master CSV is not a public view. Both rows'
`parser_notes` carry an explicit flag: the aside **must be stripped at
publication time** per the no-individual-names-on-freestyle-public-views
forever-rule. The intake layer records source truth; the publication
layer enforces the names rule. The two layers are kept distinct rather
than corrupting the intake record.

## 8. Blurry/stepping doctrine applied (Red 2026-05-21 Doctrine C)

This slice is the 6-ADD blurry-family band:

- **Food Processor** (= Blurry Blender = Stepping Paradox Blender) —
  Red 2026-05-15 ruled 6 ADD. `equivalent_to` links the live-DB row;
  `parser_notes` carries the blurry/stepping coexistence framing.
- **Blurry Torque** (= Stepping Paradox Torque) — Red 2026-05-15 ruled
  6 ADD.
- **Blurry Symposium Whirl** (= Stepping Paradox Symposium Whirl).
- **Blurry Whirling Swirl** (= Stepping Paradox Whirling Swirl).

All four carry `doctrine_status='hedged'` and a `parser_notes`
blurry/stepping coexistence note (historical-compressed layer vs
explicit layer), not an alias-of/supersedes framing.

## 9. Canonical anchors confirmed

6-ADD is the flagship-compound band. FB.org confirms:

- **Surreal** (= Surging Paradox Whirl) — SCALE-9 flagship;
  UNRESOLVED_COMPOUNDS.
- **Surgery** (= Surging Symposium Reverse Whirl) — SCALE-8 flagship;
  UNRESOLVED_COMPOUNDS.
- **Venom** (= Surging Barfly) — SCALE-8 pilot.
- **Nemesis** (= Barraging Barfly) — §3.2 stated-ADD trio.
- **Big Apple** (= Gyro Symposium Torque) — FM Slice X Path B
  promotion.
- **Whirlwind**, **Marius** — spinning-paradox flagship compounds.

## 10. Suggested next slice — 7-ADD ingestion (final FB.org tier)

`exploration/fborg/fborg-7add.txt` is the last FB.org ADD tier. It
completes the FB.org master ingest. After 7-ADD, the carry-over
questions accumulated across all six slices come due:

1. **Pogo-family batch triage.** Pogo-family rows now total 12 across
   4/5/6-ADD slices, all `curator_review_needed=true` pending a
   pogo-modifier-mechanics ruling. A dedicated triage slice is
   warranted once 7-ADD lands.
2. **Fury-style decomposition-name divergences.** The barraging-vs-
   furious (and similar) naming divergences want a curator pass.
3. **Governance backfill for the pre-slice 679 rows.** The original
   footbagmoves + passback rows still carry empty governance columns.
   Post-7-ADD backfill decision.
4. **Blurry/stepping per-row coexistence triage** (recommended
   doctrine slice 2 from the Red 2026-05-21 ingest) — now has a full
   blurry-family cohort across the 4/5/6-ADD slices to triage.
5. **Master-spreadsheet completeness report.** After 7-ADD, a
   whole-master summary: total rows, source distribution, first-class
   counts, the full curator-review queue, the full divergence
   register.

## Files changed

```
modified  exploration/footbagmoves-federation/SYMBOLIC_GRAMMAR_MASTER.csv
            (838 → 850 rows; 42 cols; 10 UPDATEs + 12 APPENDs)
new       exploration/footbagmoves-federation/FBORG_SLICE_6ADD_REPORT_2026-05-21.md
```
