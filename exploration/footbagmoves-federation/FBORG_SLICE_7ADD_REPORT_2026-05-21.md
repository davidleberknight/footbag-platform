# FB.org 7-ADD Master Ingest + Round 1 Completeness — Report — 2026-05-21

Derived view of `exploration/footbagmoves-federation/SYMBOLIC_GRAMMAR_MASTER.csv`
after the FB.org 7-ADD ingest slice — **the final FB.org ADD tier**.
This report covers the 7-ADD slice and a whole-master completeness
summary for the full Round 1 ingest (1-ADD through 7-ADD).

---

# Part A — 7-ADD slice

## A.1 Total trick counts

| Layer | Count |
|---|---:|
| Pre-7-ADD master rows | 850 |
| FB.org 7-ADD source entries (`fborg-7add.txt`) | 6 |
| → UPDATEs to existing canonical rows | 2 |
| → APPENDs as new fborg rows | 4 |
| **Final master total** | **854 rows × 42 cols** |

## A.2 Classification

| Field | Count (of 6) |
|---|---:|
| first_class=true | 3 |
| first_class=false | 3 |
| curator_review_needed=true | 3 |

No cross-source ADD divergences (both UPDATE matches were
`footbagmoves/7add`, agreeing at 7).

## A.3 Entry disposition

| Move | Disposition | first_class | Note |
|---|---|:---:|---|
| Gauntlet | UPDATE | true | live-DB flagship-density pilot (Stepping Ducking Paradox Torque) |
| Stepping Ducking PS Whirl | UPDATE | true | stepping+ducking+paradox+symposium+whirl |
| Stepping Ducking Paradox Blender | APPEND | true | stepping+ducking+paradox-blender |
| Shooting Star | APPEND | false | pt9 shooting=+3 reconcile with stepping-paradox reading |
| Shooting Torque | APPEND | false | pt9 shooting=+3 reconcile |
| Stepping P.S. Whirling x-body Rake | APPEND | false | non-standard "X-BODY RAKE" terminator — see below |

## A.4 Notable — non-standard terminator

**Stepping P.S. Whirling x-body Rake** ends in an unusual
`OP X-BODY RAKE [XBD] [DEL] [DEX]` token — a cross-body rake-style
finish carrying both a `[DEL]` and a trailing `[DEX]`. This does not
fit the standard surface-terminator grammar. Preserved verbatim in
`symbolic_notation_raw`; `parser_notes` flags the rake terminator;
`curator_review_needed=true`. Consistent with the trick-termination
rule's expectation that non-core-atom terminators need curator
adjudication.

---

# Part B — FB.org Round 1 ingest completeness (1-ADD → 7-ADD)

## B.1 The full ingest

All seven FB.org ADD tiers are now ingested into the master.

| Tier | Source file | Entries | UPDATE | APPEND |
|---|---|---:|---:|---:|
| 1-ADD | `fborg-1add.txt` (+1 manual) | 18 | 0 | 18 |
| 2-ADD | `fborg-2add.txt` | 26 | 0 | 26 |
| 3-ADD | `fborg-3add.txt` | 60 | 26 | 34 |
| 4-ADD | `fborg-4add.txt` | 90 | 39 | 51 |
| 5-ADD | `fborg-5add.txt` | 59 | 29 | 30 |
| 6-ADD | `fborg-6add.txt` | 22 | 10 | 12 |
| 7-ADD | `fborg-7add.txt` | 6 | 2 | 4 |
| **Total** | | **281** | **106** | **175** |

## B.2 Master state

| Metric | Value |
|---|---:|
| Total rows | 854 |
| Total columns | 42 (26 original + 16 governance) |
| Pre-ingest rows (footbagmoves + passback) | 679 |
| FB.org APPEND rows (`source='fborg'`) | 174 |
| Manual curator addition (`source='curator'`) | 1 |
| FB.org UPDATE confirmations on existing rows | 106 |
| Rows with governance columns populated | 281 |

Source distribution: footbagmoves 573 · passback 106 · fborg 174 ·
curator 1.

## B.3 Governance rollup (281 governance-populated rows)

| Field | Count |
|---|---:|
| first_class=true | 195 |
| first_class=false | 86 |
| curator_review_needed=true | 83 |
| doctrine_status=hedged | 73 |
| documented cross-source ADD divergences | 6 |

## B.4 Cross-source divergence register (6)

All preserved per the Red 2026-05-21 Doctrine B (per-source
`source_adds` untouched; divergence in `provenance_notes`;
`doctrine_status='hedged'`):

| Move | Divergence | Tier |
|---|---|---|
| Atom Smasher | FB.org 3 vs IFPA 4 (hidden X-Dex per pt1+pt2) | 3-ADD |
| Omelette | FM 4 vs IFPA/FB.org 3 | 3-ADD |
| Witchdoctor | FB.org 4 vs IFPA canonical 5 (R1 2026-05-20) | 4-ADD |
| Triage | FB.org 4 vs FM 6 | 4-ADD |
| S&M Smasher | FB.org 4 vs FM 6 | 4-ADD |
| Fury / Voodoo / Blurrage / Double Spinning Osis | FB.org vs FM (5-vs-6, 5-vs-4); Fury also a barraging-vs-furious decomposition-name divergence | 5-ADD |

(Toe Blur FM=4 vs IFPA=3 also recorded during 3-ADD; the register
above lists the load-bearing cases per slice report.)

## B.5 Outstanding curator-review queue (83 rows)

The 83 `curator_review_needed=true` rows cluster into recurring
themes — candidates for batch-triage slices:

- **Pogo-family (12 rows)** — pogo modifier mechanics + no-plant-while
  interaction; spans 4/5/6-ADD. Single-ruling triage candidate.
- **Fairy-family (~14 rows)** — fairy-as-modifier ADD weight; pt12 Q4
  batch pending; spans 3/4-ADD.
- **Spyro-family (~5 rows)** — spyro-as-modifier status unsettled.
- **Cross-source divergences (6)** — see B.4.
- **Multiplicity compounds** — triple-spin, double-spin, double-pickup,
  triple-ATW, double-blender, etc.
- **UNRESOLVED_COMPOUNDS members** — reaper, surreal, surgery, tomahawk
  (+ symposium-tomahawk).
- **Shooting-family** — pt9 shooting=+3 rotational vs stepping-paradox
  compositional reading reconciliation.
- **Folk/observational one-offs** — dragon, probe, wrap, hop-over,
  etc. (mostly 2-ADD).

## B.6 Hard constraints honored throughout

- **Spreadsheet-first governance** — `SYMBOLIC_GRAMMAR_MASTER.csv` is
  the authoritative master; reports are derived views.
- **Source-truth preservation** — original notation kept verbatim
  (including source typos like `[PDX[DEX]`, byte-identical
  Ripwalk/Stepping-Opposite-Side-Reverse-Whirl notation, and the
  individual-name asides in 6-ADD pogo rows — the last flagged for
  publication-time stripping, not deleted at intake).
- **No silent normalization** — divergences preserved, not collapsed.
- **UPDATE-first policy** — existing canonical rows updated in place;
  source-attribution columns never overwritten.
- **Red 2026-05-21 doctrine** — divergence preservation, blurry/stepping
  coexistence framing, ADD-persistence decoupling all applied from the
  5-ADD slice onward.
- **Reversible governance** — documentation + CSV only; no schema, no
  SQL, no public-surface mutation.

## B.7 Recommended next slices (post-ingest)

The FB.org ADD-tier ingest is complete. Forward work:

1. **Pogo-family batch triage** — 12 rows, one decision (pogo modifier
   mechanics). Highest-leverage single triage.
2. **Fairy-family triage** — pt12 Q4 batch; ~14 rows; curator-gated.
3. **Cross-source divergence adjudication** — the 6-row register;
   decide per-row whether the master should eventually mark an IFPA
   reading primary or keep both indefinitely (Red doctrine currently
   says keep both).
4. **Blurry/stepping per-row coexistence triage** — recommended
   doctrine slice 2 from the Red 2026-05-21 ingest; the full
   blurry-family cohort now spans 4/5/6-ADD.
5. **Governance backfill for the pre-ingest 679 rows** — the original
   footbagmoves + passback rows still carry empty governance columns.
   Decide: backfill pass, or leave as honest intake state until
   per-row review.
6. **Other FB.org source files** — `exploration/fborg/` also holds
   `footbag-sets-fborg.txt`, `fundamentalmoves.txt`, `blurryMoves.txt`,
   `gyroMoves.txt`, `paradoxMoves.txt`, `pixieMoves.txt`,
   `JobsNotation.txt`, `Add-Categories-move-elements.txt`,
   `moves-on-video.txt`, `paradox-tutorial.txt` — not ADD-tier lists;
   separate ingest scope if the curator wants them.

## Files changed

```
modified  exploration/footbagmoves-federation/SYMBOLIC_GRAMMAR_MASTER.csv
            (850 → 854 rows; 42 cols; 2 UPDATEs + 4 APPENDs)
new       exploration/footbagmoves-federation/FBORG_SLICE_7ADD_REPORT_2026-05-21.md
```
