# SCALE-9 Prose Cadence QC

Post-load cadence audit for the 12-row SCALE-9 batch. Surfaced two violations on first pass; applied 7 targeted rewrites; re-audit clean.

**Date:** 2026-05-12
**Batch:** 12 rows (barfly + superfly + nemesis + sumo + vortex + whirling-swirl + tapping-whirl + plasma + surreal + illusion + double-leg-over + dyno)
**Outcome:** Cadence-clean after 7 rewrites. This is the first non-zero-rewrite batch since SCALE-1 / SCALE-5 (the prior 5 batches — SCALE-2, SCALE-5b, SCALE-6, SCALE-7, SCALE-8 — all closed with zero post-load rewrites).

---

## 1. Initial post-load audit findings

| Pattern | Cap | First-pass count | Disposition |
|---|--:|--:|---|
| `From a toe set` OPENER | 0 | **1** (barfly.execution_summary) | FAIL — required rewrite |
| `(The/A) common miss is` | ≤3 | **9** of 12 rows | WARN — required rewrite of 6 instances |
| Other patterns (Practitioners-X tells, tend-to-verb, is-the-foundation, pt##, Red, federation language, cohort-opener celebration, extends-bridge-to-Y formulas) | 0 each | 0 each | PASS |

**Pre-load self-audit error:** I claimed in the draft document that "From a toe set" was used "once mid-sentence in barfly §execution; opener-free." This was wrong — the barfly execution_summary actually opened with that phrase. The miscount only surfaced in the programmatic post-load audit. Lesson: trust the regex, not the eyeballed count.

**Templated-tell drift:** the `(The/A) common miss is` phrasing migrated into a default failure-mode framing across 9 of 12 rows. This is a new pattern — it had not appeared frequently in prior batches (SCALE-6+ counted it under "≤3 per batch" but I had not seen it spread before).

---

## 2. Rewrite plan (Option A — targeted)

7 rewrites across 7 rows. 3 instances of `common miss` retained (barfly + plasma + dyno) where the failure-mode framing is the load-bearing coaching device.

| # | Row.field | Replacement strategy | Replacement vocabulary |
|--:|---|---|---|
| 1 | barfly.execution_summary | Lead with body-mechanics, drop opener | "On the opening set, the kicking foot traces…" |
| 2 | superfly.learning_notes | When-X construction | "When the body closes toward neutral between the loops…" |
| 3 | nemesis.learning_notes | Direct error statement | "The error is to apply furious's +1 non-rotational commitment…" |
| 4 | sumo.learning_notes | Direct active voice (no framing word) | "Execute a clean nuclear mirage with the body-line intensity correct…, and the trick stops at 4 ADD" |
| 5 | tapping-whirl.learning_notes | Watch-for construction | "Watch for taps rushing at the rotation's opening beat…" |
| 6 | illusion.learning_notes | What-goes-wrong construction | "What goes wrong: the foot reaches across without completing…" |
| 7 | double-leg-over.learning_notes | Direct wrong-move statement | "The wrong move is letting the second leg-pass arrive…" |

Replacement-vocabulary diversity: 7 distinct phrasings across 7 rewrites. Each phrasing used exactly once in the batch (no new templated tells emerging).

---

## 3. Post-fix audit (re-run)

| Pattern | Cap | Post-fix count | Status |
|---|--:|--:|---|
| `From a toe set` OPENER | 0 | 0 | PASS ✓ |
| `From a toe set` ANY | ≤3 | 0 | PASS ✓ |
| `(The/A) common miss is` | ≤3 | 3 | PASS ✓ |
| `Practitioners with clean` | 0 | 0 | PASS ✓ |
| `Practitioners coming from` | 0 | 0 | PASS ✓ |
| `tend to` verb form | ≤3 | 0 | PASS ✓ |
| `is the foundation` (exact) | 0 | 0 | PASS ✓ |
| pt## | 0 | 0 | PASS ✓ |
| Red ruled / Red said | 0 | 0 | PASS ✓ |
| federation-not-adoption | 0 | 0 | PASS ✓ |
| curator-reviewed | 0 | 0 | PASS ✓ |
| `extends the X bridge to Y` opener | 0 | 0 | PASS ✓ |
| Cohort-opener celebration | 0 | 0 | PASS ✓ |
| `The error is` (new vocab) | ≤2 | 1 | PASS ✓ |
| `Watch for` (new vocab) | ≤2 | 1 | PASS ✓ |
| `The wrong move is` (new vocab) | ≤2 | 1 | PASS ✓ |
| `What goes wrong:` (new vocab) | ≤2 | 1 | PASS ✓ |
| `When the X` (new vocab) | ≤4 | 1 | PASS ✓ |

barfly.execution_summary now opens: `"On the opening set, the kicking foot traces an arc..."` — mechanic-led, no banned opener.

---

## 4. Artifact paths

| File | Purpose |
|---|---|
| `legacy_data/reports/scale9/scale9_load_audit_pre.csv` | Pre-load state (all 12 rows × 4 prose columns NULL) |
| `legacy_data/reports/scale9/scale9_load_rollback.sql` | Restore batch to NULL (unwind whole SCALE-9) |
| `legacy_data/reports/scale9/scale9_cadence_audit_pre.csv` | Post-load / pre-fix state of the 7 rewritten fields |
| `legacy_data/reports/scale9/scale9_cadence_rollback.sql` | Restore to post-load / pre-fix prose (unwind cadence fix only) |
| `exploration/freestyle-notation-grammar/SCALE9_PROSE_DRAFTS.md` | Source-of-truth drafts (updated with the 7 rewrites) |
| `exploration/freestyle-notation-grammar/SCALE9_PROSE_APPLY.csv` | Apply CSV generated from drafts (still reflects pre-rewrite prose; not load-bearing post-fix) |
| `scripts/scale9_load.py` | Initial load script |
| `scripts/scale9_cadence_fix.py` | Cadence-fix script with hardcoded 7 rewrites |

---

## 5. Methodology comparison

| Batch | Rows | Post-load rewrites | Pattern surfaced |
|---|--:|--:|---|
| SCALE-1 | 10 | 11 | Originated the avoid-list (templated tells, opener patterns) |
| SCALE-2 | 10 | 0 | First zero-rewrite batch; pre-write design validated |
| SCALE-3 (blender mini) | 2 | 0 | |
| SCALE-4 (pixie-bridge mini) | 2 | 0 | |
| SCALE-5 | 10 | 4 | "Practitioners with clean X tend to…" + "tend to" verb spam |
| SCALE-5b | 6 | 0 | Pattern propagation methodology proven |
| SCALE-6 | 10 | 0 | |
| SCALE-7 | 10 | 0 | |
| SCALE-7 (mobius mini) | 1 | 0 | |
| SCALE-8 | 10 | 0 | |
| **SCALE-9** | **12** | **7** | "(The/A) common miss is" coaching framing |

5 consecutive zero-rewrite batches (SCALE-5b through SCALE-8) ended with SCALE-9 — the largest batch attempted, and the first with explicit pre-write awareness of multiple templated-tell risks. The 7 rewrites are smaller in scope than SCALE-1's 11 (originating the entire avoid-list system) but larger than SCALE-5's 4.

Two structural observations:
- **Batch size matters.** SCALE-9 at 12 rows generated more failure-mode framings than any prior batch; pattern drift scales with batch size. The `common miss` framing felt natural per-row but compounded into a tell across the batch.
- **Replacement vocabulary needs deliberate diversification.** Single-phrase replacement (the SCALE-5 fix used 1 replacement pattern across 4 rewrites) creates a NEW tell. SCALE-9 used 6 distinct replacement phrasings + retained 3 instances of the original — preserves diversity.

---

## 6. Carry-forward for SCALE-10

Add to the pre-write avoid list for next batch:

| Pattern | Cap | Rationale |
|---|--:|---|
| `(The/A) common miss is` | ≤3 | Surfaced in SCALE-9; cap holds going forward |
| `common miss` (any) | ≤4 | Broader phrase check |
| `The error is` / `The wrong move is` / `Watch for` / `What goes wrong:` / `When the X` | ≤2 each | New replacement vocab; must not become next tell |

The full updated avoid list (SCALE-1 through SCALE-9 lessons combined):
- `Practitioners with clean X tend to…` — 0
- `Practitioners coming from X tend to…` — 0
- `tend to` verb form — cap ≤3 batch
- `is the foundation` exact phrase — 0
- `From a toe set` opener (sentence start) — 0
- `From a toe set` anywhere — cap ≤3 batch
- `(The/A) common miss is` — cap ≤3 batch *(new)*
- `extends the X bridge to Y` formulaic opener — 0
- Cohort-opener celebration ("first X pilot") — 0
- pt## / Red / adjudication / federation-not-adoption / curator-reviewed — 0
- Single replacement vocabulary used >2x per batch — cap ≤2 each *(new)*

---

## 7. Cross-references

- `SCALE9_PROSE_DRAFTS.md` — source drafts (updated with 7 rewrites)
- `SCALE1_PROSE_CADENCE_QC.md` — first cadence QC; originated the avoid-list
- `SCALE5_PROSE_CADENCE_QC.md` — second cadence QC; "Practitioners with clean" tell
- `feedback_phased_scope_control.md` — phased workflow discipline
- `feedback_public_facing_prose.md` — public-facing prose hygiene
- `.claude/rules/db-write-safety.md` — audit + rollback requirement
