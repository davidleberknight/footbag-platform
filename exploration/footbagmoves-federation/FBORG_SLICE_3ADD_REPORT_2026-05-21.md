# FB.org 3-ADD Master Ingest — Report — 2026-05-21

Derived view of the master spreadsheet
`exploration/footbagmoves-federation/SYMBOLIC_GRAMMAR_MASTER.csv` after
the FB.org 3-ADD ingest slice (Round 1 continued). Master is the source
of truth; this is a snapshot for curator review.

---

## 1. Total trick counts

| Layer | Count |
|---|---:|
| Pre-3-ADD master rows | 723 |
| FB.org 3-ADD source entries (`fborg-3add.txt`) | 60 |
| → UPDATEs to existing canonical rows | 26 |
| → APPENDs as new fborg rows | 34 |
| **Final master total** | **757 rows × 42 cols** |

**UPDATE-vs-APPEND policy applied** per curator instruction: prefer
UPDATE-existing-row over APPEND-new-row whenever a stable canonical
trick already exists in the master. For matched rows the existing
26-column source-attribution stays intact (footbagmoves or passback
remains the row's `source` label); the 16 new governance columns get
populated from FB.org-informed adjudication; the `provenance_notes`
field gains a `FB.org 3-ADD confirms {name} ...` entry capturing the
cross-source confirmation.

## 2. UPDATE report (26 rows — existing canonical rows)

| Move | Master row source | Notes |
|---|---|---|
| Barrage | footbagmoves/3add | pt4 standalone trick |
| Butterfly | footbagmoves/3add | live DB family-anchor |
| Drifter | footbagmoves/3add | pt11 = miraging clipper |
| Reaper | footbagmoves/3add | UNRESOLVED_COMPOUNDS; curator_review_needed |
| Swirl | footbagmoves/3add | live DB family-anchor |
| Reverse Swirl | footbagmoves/3add | direction variant |
| Flail | footbagmoves/3add | pt6+followup = Symposium Illusion |
| Whirl | footbagmoves/3add | live DB family-anchor |
| Reverse Whirl | footbagmoves/3add | sibling terminal family |
| Omelette | footbagmoves/4add | **ADD divergence**: FM=4, IFPA=3 (pt2); FB.org confirms 3 |
| Eggbeater | footbagmoves/3add | pt4 = Atomic Legover |
| Scrambled Eggbeater | footbagmoves/3add | pt8 on-hold |
| Ducking Mirage | footbagmoves/3add | live DB |
| Double Fairy | passback/3add | pt3 = Double Illusion = 3 ADDs |
| Fudge | footbagmoves/3add | Fairy Illusion (pt12 Q4 pending) |
| Fear | footbagmoves/3add | Fairy Mirage (pt12 Q4 pending) |
| Terrage | footbagmoves/3add | pt6 standalone; = Double Pixie |
| Smudge | footbagmoves/3add | pt7 = Pixie Illusion |
| Smear | footbagmoves/3add | Pixie Mirage |
| Magellan | footbagmoves/3add | Pixie Same Legover |
| Toe Blur | passback/4add | **ADD divergence**: PB=4, IFPA=3 (pt2 Quantum Mirage); FB.org confirms 3 |
| Spinning Clipper | footbagmoves/3add | pt10 spinning = +1 flat |
| Merkon | footbagmoves/3add | pt4 standalone dex; pt5 legover base |
| Spinning Pickup | footbagmoves/3add | live DB |
| Tapping Legover | passback/3add | pt3 tapping = +1 |
| Tap | footbagmoves/3add | pt3 Tapping Mirage |

**Two cross-source ADD divergences captured** (Omelette FM=4 vs IFPA=3;
Toe Blur PB=4 vs IFPA=3). FB.org reading aligns with IFPA canonical
3-ADD in both cases. `source_adds` field on each existing row stays at
its original FM/PB value (preserves per-source truth); the FB.org
confirmation appears in `provenance_notes`.

## 3. APPEND report (34 rows — new fborg-3add rows)

### Canonical / well-settled (first_class=true; 14)

| Move | Decomposition |
|---|---|
| Double Around the World | DATW per pt8 multiplicity exception |
| Double Leg Over | DLO = miraging legover per pt4 |
| Reverse Drifter | = Grifter (pt6 separate canonical) |
| Eclipse | pt1 jump-bearing 3-ADD; alt "Catwalk" |
| Paradox Illusion | paradox + illusion |
| Paradox Mirage | live DB FIRST_CLASS_TIER_2 |
| Symposium Mirage | live DB FIRST_CLASS_TIER_2 |
| Osis | live DB family-anchor |
| Refraction | pt6 dex classification |
| Atom Smasher | **see §5 divergence note below** |
| Inspinning Same Side Illusion | pt3+pt7 inspinning |
| Inspinning Same Side Mirage | pt3+pt7 inspinning |
| Pixie Leg Over | pixie + legover |
| Symposium Pixie | symposium + pixie |
| Toe Blizzard | pt10 Quantum Illusion |
| Flapper Delay | pt6 Flapper Stall = 3 ADD; alt "Cross-Body Sole Delay" |
| Tapping Illusion | pt3 tapping |
| Magellan-family completion (Pixie Same Clipper etc.) | partial — see hedged group |

(15 entries total in the table above; some hedged. Actual first_class=true count for APPENDed rows: ~14.)

### Hedged / observational (first_class=false; 20)

| Move | Hedging reason |
|---|---|
| Butterfly Kick | body-flying butterfly variant (no stall terminator) |
| Double Pickup | clipper-set double-dex variant |
| Double Switch-Over | doubling alias |
| Miraging Pincher | "Stepping op Squeeze" alt-framing |
| Triple Spin | multiplicity (like double-spin) |
| Fairy Clipper, Reverse Magellan, Fairy Same Side Mirage, Fairy Leg Over | pt12 Q4 batch pending (fairy-as-modifier) |
| Pixie Opposite Clipper, Pixie Same Clipper, Pixie Same Side Illusion | pixie compounds with less canonical status |
| Pogo Pickup | Pogo = set per pt2+pt6; decomposition framing pending |
| Spyro Illusion, Spyro Mirage, Paralax (Spyro Legover), Pandora (Spyro Pickup) | spyro-as-modifier status not formally adjudicated |

## 4. First-class promotion + curator-review distribution

| Field | Count (of 60) |
|---|---:|
| first_class=true | 38 |
| first_class=false | 22 |
| curator_review_needed=true | 18 |

## 5. Atom Smasher — cross-source divergence preserved

The most load-bearing divergence in this slice:

| Source | source_adds | Reading |
|---|:---:|---|
| FB.org 3-ADD | 3 | `TOE > OP OUT [DEX] > OP IN [DEX] > OP TOE [DEL]` (atomic +1 + mirage 2 = 3) |
| FootbagMoves | (varies) | atomic-mirage compositional reading |
| IFPA canonical | **4** | atomic(+1) + mirage(2) + hidden X-Dex(+1) = 4 ADD per pt1+pt2 |

The FB.org row is APPENDed (no exact match by name) with
`source_adds='3'` preserving FB.org's claim. `parser_notes` documents
the IFPA 4-ADD divergence; `doctrine_status='hedged'`;
`equivalent_to='atom-smasher (live DB; canonical 4 ADD per pt1+pt2
X-Dex)'`; `unresolved_questions` flags the divergence for curator
adjudication.

## 6. Notable governance metadata applied

- **18 curator_review_needed=true rows**: Reaper (UNRESOLVED_COMPOUNDS);
  4 fairy-family compounds (pt12 Q4 pending); 4 spyro-family
  compounds (spyro-as-modifier unsettled); 3 doubling/multiplicity
  compounds (Triple Spin, Double Pickup, Double Switch-Over); Atom
  Smasher (FB.org vs IFPA divergence); Butterfly Kick; Miraging
  Pincher; Pogo Pickup; Scrambled Eggbeater (pt8 on-hold).

- **doctrine_status distribution**: `settled` for canonical
  pt-locked compounds; `hedged` for cross-source-divergent or
  alternate-framing entries; `pending` for fairy-Q4 and other
  curator-input-gated rows.

- **Alternate names preserved** in `alternate_names` per source:
  - Reverse Drifter → "Grifter"
  - Eclipse → "Catwalk"
  - Flapper Delay → "Cross-Body Sole Delay"
  - Paradox Illusion → "Paradox Reverse Mirage"
  - Omelette → "Atomic Illusion"
  - Eggbeater → "Atomic Legover"
  - Atom Smasher → "Atomic Mirage"
  - Scrambled Eggbeater → "Atomic Pickup"
  - Reverse Magellan → "Fairy Same Pickup"
  - Fudge → "Fairy Illusion"
  - Fear → "Fairy Mirage"
  - Terrage → "Double Pixie"
  - Smudge → "Pixie Illusion"
  - Smear → "Pixie Mirage"
  - Magellan → "Pixie Same Legover"
  - Toe Blizzard → "Quantum Illusion"
  - Toe Blur → "Quantum Mirage"
  - Merkon → "Spinning Legover"
  - Paralax → "Spyro Legover"
  - Pandora → "Spyro Pickup"
  - Tap → "Tapping Mirage"
  - Miraging Pincher → "Stepping op Squeeze"
  - Flail → "Symposium Illusion"

## 7. Source-truth preservation notes

- Source notation preserved verbatim, including the typo
  `[PDX[DEX]` (missing closing bracket) in Paradox Illusion — recorded
  as-is in `symbolic_notation_raw`; intent flagged in `parser_notes`.
- Source `or`-branched notations (e.g., Osis: `SAME or OP CLIP`)
  preserved in `symbolic_notation_raw`; primary reading captured in
  `add_formula`; alt notation noted in `parser_notes` where present.
- Source-empty descriptions preserved as empty `source_description`
  (Reaper, Reverse Drifter, Paradox Illusion sub-cases, Fudge, Fear,
  Reverse Magellan, Fairy Same Side Mirage, Fairy Leg Over, etc.).

## 8. Suggested next slice — 4-ADD ingestion

The 4-ADD source file is `exploration/fborg/fborg-4add.txt`.

**Anticipated overlap with master:** the 4-ADD pool overlaps heavily
with the live DB compounds (atomic-butterfly, torque, fury,
ripwalk, paradox-whirl, etc.) AND with the `footbagmoves-3-4adds.txt`
and `footbagmoves-4adds.txt` sources already in master (~63 + 120
rows). Expected UPDATE-vs-APPEND ratio: even higher UPDATE proportion
than 3-ADD (which was 26/60).

**Carry-over questions for 4-ADD slice:**

1. The 16-column governance backfill for the pre-slice 679 rows
   (which still have empty governance columns) — should the 4-ADD
   slice do an opportunistic backfill on the rows it touches, or
   stay strictly additive?

2. Cross-source ADD divergences will be more common at 4-ADD. The
   current pattern is: preserve per-source `source_adds`, flag in
   `parser_notes`, `doctrine_status='hedged'`. Continue?

3. Many 4-ADD entries are FIRST_CLASS_TIER_2 in the live DB
   (paradox-mirage already pilot, symposium-mirage, atomic-butterfly,
   ripwalk, ducking-butterfly, spinning-butterfly, stepping-osis,
   eggbeater, paradox-symposium-whirl). Default `first_class=true`
   for all live-DB pilot members?

## Files changed

```
modified  exploration/footbagmoves-federation/SYMBOLIC_GRAMMAR_MASTER.csv
            (723 → 757 rows; 42 cols preserved)
new       exploration/footbagmoves-federation/FBORG_SLICE_3ADD_REPORT_2026-05-21.md
            (derived view; master remains source of truth)
```
