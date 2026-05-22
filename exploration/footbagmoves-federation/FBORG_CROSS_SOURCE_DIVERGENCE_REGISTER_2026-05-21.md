# Cross-Source ADD Divergence Register — 2026-05-21

A consolidated review of every documented cross-source ADD or
decomposition divergence in the master spreadsheet
`exploration/footbagmoves-federation/SYMBOLIC_GRAMMAR_MASTER.csv`,
surfaced during the FB.org 1–7 ADD ingest.

Purpose: prep the curator-adjudication decision. Each divergence is
currently preserved per Red 2026-05-21 Doctrine B (per-source
`source_adds` untouched; `doctrine_status='hedged'`). This register
does not change the master — it organizes the divergences for a
curator pass and recommends per-row dispositions.

**11 genuine divergences.** (The earlier "6" count was a narrow grep
of `provenance_notes` only; the full set includes divergences recorded
in `parser_notes` and `unresolved_questions`. `Barfly` is a false
positive — FM=IFPA=4, agreement — and is excluded.)

---

## 1. The register

| # | Move | FB.org | FM | PB | IFPA canonical | Master `source_adds` | Status |
|--:|---|:--:|:--:|:--:|:--:|:--:|---|
| 1 | Atom Smasher | 3 | 3 | — | **4** (pt1+pt2) | 3 (fborg row) | hedged |
| 2 | Omelette | 3 | 4 | — | **3** (pt2) | 4 (FM row) | settled |
| 3 | Witchdoctor | 4 | 4 | — | **5** (R1 2026-05-20) | 4 (FM row) | hedged |
| 4 | Triage | 4 | 6 | — | — | 6 (FM row) | hedged |
| 5 | S&M Smasher | 4 | 6 | — | ~5 (pt1 X-Dex, likely) | 6 (FM row) | hedged |
| 6 | Fury | 5 | 6 | — | **5** (pt6) | 6 (FM row) | hedged |
| 7 | Voodoo | 5 | 6 | — | — | 6 (FM row) | hedged |
| 8 | Blurrage | 5 | 6 | — | — | 6 (FM row) | hedged |
| 9 | Rake | 2 | 3 | — | **2** (swing-element doctrine) | 2 (fborg row) | hedged |
| 10 | Double Spinning Osis | 5 | 4 | 5 | — | 4 (FM) / 5 (PB) | mixed |
| 11 | Toe Blur | 3 | — | 4 | **3** (pt2) | 4 (PB row) | settled |

## 2. Pattern analysis

The 11 divergences are not random — they cluster into three mechanisms,
exactly as Red's 2026-05-21 doctrine predicts (divergence clusters at
specific reinterpretation points, not uniformly).

### Pattern A — FM systematic over-count (6 of 11)

**Omelette, Triage, S&M Smasher, Fury, Voodoo, Blurrage** — FootbagMoves
reads each one ADD *higher* than FB.org (and, where IFPA is known,
higher than IFPA too). All six sit in the 5–6 ADD band. This is the
single largest pattern: FM's counting convention runs hot on deep
compounds. FB.org and IFPA agree against FM in every case where IFPA
is known (Omelette 3, Fury 5).

**Likely cause:** FM appears to count an operator that FB.org/IFPA
fold into the base. Consistent with the `FM_MATH_DIVERGENCES.csv`
"FM-over" direction already catalogued in the federation track.

### Pattern B — IFPA hidden-X-Dex up-count (2–3 of 11)

**Atom Smasher** (IFPA 4 vs 3), **Witchdoctor** (IFPA 5 vs 4), and
probably **S&M Smasher** (IFPA ~5) — here IFPA reads *higher* than both
FB.org and FM, because IFPA's pt1+pt2 doctrine credits a hidden X-Dex
(or atomic-rotational bonus) that the other sources' flat-stacking does
not see. This is the X-Dex reinterpretation class Red explicitly named
as the historical exception where ADD values genuinely moved.

### Pattern C — isolated cases (2 of 11)

- **Rake** — FM 3 vs FB.org/IFPA 2; a swing-element trick. IFPA's
  swing-element doctrine settles it at 2.
- **Double Spinning Osis** — FM 4 vs FB.org 5 vs PB 5; FM is the
  low outlier here (FM-under, the opposite of Pattern A).
- **Toe Blur** — PB 4 vs FB.org/IFPA 3; an isolated PassBack over-count.

## 3. Per-divergence disposition

### Resolved — IFPA canonical is known (6)

These need no curator *ruling*; they need a `doctrine_status` cleanup
so the master reflects that IFPA has a settled value.

| Move | IFPA | Recommendation |
|---|:--:|---|
| Atom Smasher | 4 | IFPA canonical settled (pt1+pt2). The fborg row keeps `source_adds=3` (FB.org's claim); `add_formula` already states IFPA 4. Can move `doctrine_status` → `settled` — the *divergence* is settled even though the sources differ. |
| Omelette | 3 | Already `settled`. FM-over-count; no action. |
| Witchdoctor | 5 | R1 2026-05-20 ruled 5. Currently `hedged`. The ruling is firm — recommend `settled`; the FB.org=4 reading is a recorded historical divergence, not an open question. |
| Fury | 5 | pt6 ruled 5. **See §4 — the "name divergence" is not real.** Recommend `settled`. |
| Rake | 2 | IFPA swing-element doctrine settles it at 2. Currently `hedged` with "Red review pending" — verify against `RED_RESOLVED_CANON`; if confirmed, `settled`. |
| Toe Blur | 3 | pt2 ruled Quantum Mirage = 3. Already `settled`. PB-over-count; no action. |

### Open — needs Red or curator (5)

| Move | Question |
|---|---|
| Triage | FB.org 4 vs FM 6. No IFPA ruling. Triple-dex compound — does the third dex count, and does the set count? Curator/Red. |
| S&M Smasher | FB.org 4 vs FM 6; IFPA likely ~5 via pt1 X-Dex but not explicitly ruled. Needs an IFPA ruling. |
| Voodoo | FB.org 5 vs FM 6. No IFPA ruling. Deep symposium-paradox stack. |
| Blurrage | FB.org 5 vs FM 6. No IFPA ruling. **Also** has the duplicate-row issue (§5). |
| Double Spinning Osis | FB.org 5 vs FM 4 vs PB 5. FM is the outlier. Two-spin multiplicity compound — does each spin count? Ties into the broader multiplicity question in the Red packet (Q5). |

## 4. Correction surfaced — Fury is NOT a name divergence

The master currently flags Fury with a "decomposition-name divergence:
FB.org names it 'Barraging Paradox Mirage', IFPA pt6 'Furious Paradox
Mirage'." **This framing is wrong** and should be corrected.

`footbag-sets-fborg.txt` (Chris Holden's set vocabulary) defines:

> `Furious (Barraging Paradox Miraging)`

So in FB.org's own grammar, **Furious is *defined as* Barraging
Paradox Miraging**. "Barraging Paradox Mirage" and "Furious Paradox
Mirage" are therefore the *same statement* — barraging is a *component*
of furious, not a competing operator. There is no name divergence; FB.org
is internally consistent.

**Recommended master edit** (not applied here — flagged for approval):
Fury's `parser_notes` should drop the "decomposition-name divergence"
language and instead read: "FB.org's set vocabulary defines Furious =
Barraging Paradox Miraging; the FB.org and IFPA pt6 names are
equivalent. Genuine divergence is ADD only: FB.org/IFPA 5 vs FM 6."
`unresolved_questions` (currently "barraging vs furious") can be
cleared. `doctrine_status` → `settled` (pt6 ruling + name resolved).

## 5. Data quirk inside the register — duplicate Blurrage

Blurrage (#8) has a second issue beyond its ADD divergence: the
footbagmoves source contains **two byte-identical "Blurrage" rows**
(documented in the blurry/stepping triage, 2026-05-21). The
divergence-adjudication for Blurrage should be done *after* the
duplicate is resolved, so a ruling lands on one row, not two.

## 6. Recommended next actions

1. **`doctrine_status` cleanup — APPLIED 2026-05-21.** Atom Smasher,
   Witchdoctor, and Fury moved `hedged` → `settled` (IFPA value firm).
   Omelette and Toe Blur were already `settled`. **Rake stays
   `hedged`** — `RED_RESOLVED_CANON` has no Rake / Pendulum /
   swing-element ruling, so the IFPA=2 value is not Red-confirmed.
2. **Fury correction — APPLIED 2026-05-21.** `parser_notes` rewritten
   to drop the false "barraging vs furious name divergence" framing;
   `unresolved_questions` cleared; `curator_review_needed` → false.
   Atom Smasher and Witchdoctor also had their now-answered
   `unresolved_questions` cleared (the divergence stays recorded in
   `provenance_notes` per §7).
3. **Fold the 5 open divergences (§3) into the curator/Red queue.**
   Triage / S&M Smasher / Voodoo / Blurrage / Double Spinning Osis are
   genuine open ADD questions. They are *not* in the current Red
   2026-05-21 packet — that packet is family-governance-level. If the
   curator wants these adjudicated, they need either a short
   trick-level addendum or inclusion in the next packet. Double
   Spinning Osis specifically connects to the packet's Q5
   (multiplicity).
4. **Resolve the duplicate Blurrage row** before adjudicating its ADD.

## 7. Doctrine note

Every divergence in this register is preserved, not collapsed — per
Red 2026-05-21 Doctrine B. Even where IFPA has a firm value, the FB.org
/ FM / PB readings stay recorded in `source_adds` as legitimate
historical record. "Resolved" in §3 means *the curator knows which
value is canonical*, not *the other sources were wrong* — older
sources counted by the understanding of their era. Moving a row to
`doctrine_status='settled'` records that the canonical value is known;
it does not erase the divergence.

## Files

```
new   exploration/footbagmoves-federation/FBORG_CROSS_SOURCE_DIVERGENCE_REGISTER_2026-05-21.md
mod   exploration/footbagmoves-federation/SYMBOLIC_GRAMMAR_MASTER.csv  (§6.1 + §6.2 applied 2026-05-21)
```

Master row/column count unchanged (854 × 42). The §6.1 `doctrine_status`
cleanup (3 rows → `settled`) and §6.2 Fury correction were applied
2026-05-21 on curator approval. No ADD values or `source_adds` changed —
the cleanup only records that the IFPA canonical value is firm; the
cross-source divergences remain preserved in `provenance_notes` per §7.
