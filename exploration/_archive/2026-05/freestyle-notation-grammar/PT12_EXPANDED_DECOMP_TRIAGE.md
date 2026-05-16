# pt12 expanded-decomposition triage

**Status:** Phase 1 — hypothesis development. READ-only.
**Date:** 2026-05-12
**Scope:** the 4 in-DB rows + 1 FM-only term flagged by the parser-population pass + pt11 audit as expanded-decomposition class. Each is a single-token folk name whose IFPA canonical reading is multi-modifier.
**Precedent:** pt11 Red ruling **Blur = Stepping Paradox Mirage** (folk "Blurry Mirage" → canonical 3-modifier expansion; +1+1+2=4). The same pattern resolved ripwalk = Stepping Butterfly (pt11 #6). This audit asks whether the pt11 blurry-expansion is transitive.

---

## 1. Current state

| Row | Asserted | Computed | Current links | Math gap | Parser status |
|---|--:|--:|---|--:|---|
| `blurry-whirl` | 5 | 4 | blurry(+1) + whirl(3) | +1 | approximate |
| `blurry-torque` | 6 | 5 | blurry(+1) + torque(4) | +1 | approximate |
| `barraging-osis` | 5 | 4 | barraging(+1) + osis(3) | +1 | approximate |
| `food-processor` | 6 | 6 | none (self-atom) | n/a (decomposition not yet attempted) | exact_self_atom |
| `whirlygig` (FM-only) | n/a | FM=6 vs IFPA-expected 5 | n/a | -1 vs FM | not in dictionary |

Notes:
- `food-processor` carries description `"Blurry-modified blender."` — same folk-blurry shape as the other 3. The `blurry` modifier link IS already present at the editorial layer (`red_additions_2026_04_20.csv` line 89 + `freestyle_trick_modifier_links` join row both populated). The parser still reports `exact_self_atom` because the parser reads `canonical_name` only (forever-rule per `feedback_parser_editorial_separation.md`) and "food processor" tokenizes to no recognized (modifier, base) pair. Same shape as `blur`: the folk name is opaque to the parser; editorial layer carries the math. No modifier-link backfill needed.
- `whirlygig` is not in `freestyle_tricks`. FM source documents it as "Blurry Symposium Whirl" — same blurry-folk shape; whether it ever needs a dictionary row is a separate federation question.

---

## 2. Pt11 precedent + hypothesis pattern

Pt11 Red letter rulings (`legacy_data/inputs/curated/tricks/red-correction-pt11.txt`):

| Folk name | IFPA canonical decomp (Red) | ADD math |
|---|---|--:|
| Blur | Stepping Paradox Mirage | +1 + +1 + 2 = 4 |
| Ripwalk | Stepping Butterfly | +1 + 3 = 4 |
| Mobius | Spinning Torque | +1 + 4 = 5 |
| Torque | Miraging Osis | +1 + 3 = 4 |
| Blender | Whirling Osis | +1 + 3 = 4 |
| Barfry | Nuclear ss Butterfly (later resolved ss=+0) | +2 + 3 + 0 = 5 |

The Blur ruling is the load-bearing precedent here: a folk-named compound that includes the word "blurry" was decomposed by Red as **Stepping Paradox + base**, not as `blurry(+1) + base`. The single `blurry` modifier-link on Blur in the modifier table is a parser convenience (gives matching ADD) but is editorial-truth-overridden by the explicit Stepping Paradox decomposition.

**Hypothesis under test:** the pt11 Blur expansion is **transitive** — every folk-named "Blurry X" trick decomposes canonically as Stepping Paradox X. If true, this single rule clears 3 in-DB rows + 1 FM-only term in one stroke.

---

## 3. Per-row hypotheses

### 3.1 `blurry-whirl` — asserted 5

| Candidate | Math | Notes |
|---|---|---|
| **Stepping Paradox Whirl** *(primary)* | stepping(+1) + paradox(+1) + whirl(3) = **5** ✓ | Direct transitive application of pt11 Blur ruling. Pt11 audit Q1 already proposed this candidate explicitly. |
| Spinning Paradox Whirl | spinning(+1) + paradox(+1) + whirl(3) = 5 ✓ | Internally consistent but no pt11 precedent for spinning-substitution. |
| Stepping Symposium Whirl | stepping(+1) + symposium(+1) + whirl(3) = 5 ✓ | Internally consistent. Less precedent-aligned. |

**Recommendation:** Stepping Paradox Whirl, contingent on Red ruling on transitivity (§4 Q1).

### 3.2 `blurry-torque` — asserted 6

| Candidate | Math | Notes |
|---|---|---|
| **Stepping Paradox Torque** *(primary)* | stepping(+1) + paradox(+1) + torque(4) = **6** ✓ | Direct transitive application. Pt11 audit Q2 + `project_freestyle_state.md` both note "internally consistent." |
| (expanded form) Stepping Paradox Miraging Osis | +1 + +1 + +1 + osis(3) = 6 ✓ | Equivalent to primary under Torque = Miraging Osis (pt11). Worth noting as the deep-structural form. |
| Spinning Paradox Torque | spinning(+1) + paradox(+1) + torque(4) = 6 ✓ | No pt11 precedent. |

**Recommendation:** Stepping Paradox Torque, contingent on Q1.

### 3.3 `food-processor` — asserted 6

Description: "Blurry-modified blender." Blender base (4) per pt11 = Whirling Osis (deep form: +1 + osis(3) = 4).

| Candidate | Math | Notes |
|---|---|---|
| **Stepping Paradox Blender** *(primary)* | stepping(+1) + paradox(+1) + blender(4) = **6** ✓ | Direct transitive application via blender base. |
| (expanded form) Stepping Paradox Whirling Osis | +1 + +1 + +1 + osis(3) = 6 ✓ | Equivalent in deep form. |
| Spinning Paradox Blender | +1 + +1 + 4 = 6 ✓ | No precedent. |

**Recommendation:** Stepping Paradox Blender, contingent on Q1. No modifier-link backfill needed (verified 2026-05-12): `blurry` link already present at editorial layer; `exact_self_atom` parser status is honest per layer-separation rule (canonical name "food processor" doesn't tokenize to a recognized modifier+base pair — same shape as `blur`).

### 3.4 `barraging-osis` — asserted 5

Distinct class. Per `CANONICALIZATION_POLICY.md §3` + `PHASE5E_EDITORIAL_DATA_CLEANUP_PLAN.md` B2 + `SEMANTIC_AUDIT_FINDINGS.md` line 275, this row is positioned as the **canonical "baroque legacy" worked example** — a stable accepted asserted-vs-computed divergence (asserted is community editorial truth; computed is parser diagnostic; both shown; no closure forced).

| Candidate | Math | Notes |
|---|---|---|
| **Keep as baroque legacy divergence** *(status-quo)* | barraging(+1) + osis(3) = 4 (computed) ≠ 5 (asserted); divergence-by-design | Documented pattern in CANONICALIZATION_POLICY §3. Removes from pt12 queue without Red round-trip. |
| Stepping Barraging Osis | stepping(+1) + barraging(+1) + osis(3) = **5** ✓ | Hypothesis: barraging is itself a stepping-flavored modifier and the missing +1 is the implicit stepping. No pt11 precedent. |
| Spinning Barraging Osis | spinning(+1) + barraging(+1) + osis(3) = 5 ✓ | Hypothesis: barraging is rotational-flavored. No precedent. |
| (FM "Arch Nemesis" tech: Barraging ss Double Double Down = 6) | barraging(+1) + dbl-dbl-down(?) + ss(+0) | FM uses barraging with `ss` semantics; unrelated to the IFPA barraging-osis decomp question. Currently `unresolved_other_reason` in `FM_MATH_DIVERGENCES.csv`. |

**Recommendation:** Status-quo (baroque legacy) is the load-bearing convention; do NOT bundle into the blurry-transitivity Q1. If escalated to Red, frame as a separate optional question (§4 Q2). Note: a stale comment in `FM_MATH_DIVERGENCES.csv` says "barraging modifier not in IFPA table" — incorrect (barraging is in the modifier table with +1/+1). Minor doc-sync item.

### 3.5 `whirlygig` (FM-only)

FM tech: "Blurry Symposium Whirl"; FM ADD = 6; IFPA-expected under flat-blurry = blurry(+1) + symposium(+1) + whirl(3) = 5.

Under Q1=YES (transitive blurry-expansion):
- Canonical IFPA decomp = Stepping Paradox Symposium Whirl = +1 + +1 + +1 + 3 = **6** ✓
- FM=6 becomes consistent with IFPA canonical, not divergent.
- Whirlygig is RECLASSIFIED out of the "needs federation divergence registry entry" class; if it ever enters the dictionary, it lands with the 4-modifier decomp.

Under Q1=NO:
- Whirlygig stays a federation_math_divergence candidate (-1 vs FM); slot into `FM_MATH_DIVERGENCES.csv` alongside Hurl/Barfry/Godzilla pattern.

No dictionary action required either way; whirlygig is not a current row.

---

## 4. Self-resolvable vs Red-required split

| Row | Class | Why |
|---|---|---|
| `blurry-whirl` | **Red-required (single transitive Q)** | Multiple internally-consistent decompositions exist; pt11 Blur precedent strongly suggests Stepping Paradox Whirl but transitivity is itself the open question. |
| `blurry-torque` | **Red-required (same single transitive Q)** | Same reasoning. |
| `food-processor` | **Red-required (same single transitive Q)** | Same reasoning. Bundles with blurry-whirl/blurry-torque under one Q. |
| `barraging-osis` | **Self-resolvable as status-quo (baroque legacy)** OR optional Red Q if escalated | Documented divergence-by-design. Default = keep. Surface to James for the keep-vs-escalate call. |
| `whirlygig` | **Derivative of Q1** | Resolution propagates from blurry-* transitivity ruling. No standalone Red question needed. |

**Net Red packet (pt12 incremental):** 1 mandatory question (transitive blurry-expansion) + 1 optional question (barraging-osis status-quo vs canonical expansion). No DB writes pending in this triage.

---

## 5. Proposed pt12 Red questions (draft text)

**Q1 (mandatory).** Pt11 ruled `Blur = Stepping Paradox Mirage` (canonical IFPA decomposition of the folk name "Blurry Mirage" → 3-modifier compound; math closes at +1+1+2=4). Does this expansion apply transitively to the other "Blurry X" folk-named rows in the dictionary?

- Blurry Whirl (asserted ADD 5) → candidate: **Stepping Paradox Whirl** (1+1+3=5)
- Blurry Torque (asserted ADD 6) → candidate: **Stepping Paradox Torque** (1+1+4=6) [equivalent deep form: Stepping Paradox Miraging Osis = 1+1+1+3=6 under pt11 Torque = Miraging Osis]
- Food Processor (current dictionary row; description "Blurry-modified blender"; asserted ADD 6) → candidate: **Stepping Paradox Blender** (1+1+4=6) [equivalent deep form: Stepping Paradox Whirling Osis = 1+1+1+3=6 under pt11 Blender = Whirling Osis]

Answer choices:
1. Yes — transitive; apply Stepping Paradox + base to all three rows.
2. Per-row — each blurry-named row needs its own canonical decomposition; do not assume transitivity.
3. Other — please provide the canonical decomposition(s) you'd accept.

**Q2 (optional; surface only if James escalates).** Pt11 + earlier conventions left `barraging-osis` (asserted ADD 5) as a documented "baroque legacy" asserted-vs-computed divergence (computed = barraging+osis = 4). Two options:

- (a) Keep as documented divergence — barraging-osis ADD=5 stays asserted; computed 4 surfaced honestly in the parser diagnostic panel; no canonical multi-modifier reading.
- (b) Resolve canonically — provide an expanded decomposition (e.g. Stepping Barraging Osis = 1+1+3=5, or another form).

Which do you prefer?

---

## 6. Recommended next steps (post-Phase-1)

This artifact closes Phase 1. Next phase decisions are for James:

- **A. Convert §5 into a pt12 Red packet draft.** Pure audit-only artifact under `legacy_data/inputs/curated/tricks/red-correction-pt12.txt` skeleton. No DB writes. Surfaces Q1 + Q2 to Red on next batch.
- **B. Defer barraging-osis** — drop Q2 entirely; leave as status-quo. Q1 stays.
- **C. Escalate barraging-osis** — keep Q2.
- **D. ~~Add missing `blurry` modifier link to `food-processor`.~~ WITHDRAWN 2026-05-12.** Premise was wrong on verification: the link is already present in both `red_additions_2026_04_20.csv` line 89 and the `freestyle_trick_modifier_links` DB join. Parser's `exact_self_atom` status is honest per layer-separation rule (canonical name "food processor" doesn't tokenize to a recognized modifier+base pair — same shape as the folk-named `blur` row). No action.
- **E. Doc-sync cleanup.** Update stale comment in `FM_MATH_DIVERGENCES.csv` row "Arch Nemesis" — "barraging modifier not in IFPA table" is incorrect. Minor.

No action recommended without explicit go-ahead on A/B/C/D/E.

---

## Cross-references

- `exploration/freestyle-notation-grammar/PT11_IMPACT_AUDIT.md` — pt11 audit + original Q1/Q2 formulations for blurry-whirl + blurry-torque (load-bearing precedent)
- `legacy_data/inputs/curated/tricks/red-correction-pt11.txt` — pt11 Red letter direct rulings
- `legacy_data/inputs/curated/tricks/CANONICALIZATION_POLICY.md` §3 — baroque-legacy divergence protocol (barraging-osis worked example)
- `exploration/freestyle-notation-grammar/PHASE_2_5_REFINEMENTS.md` — parser approximate/policy-dependent status taxonomy
- `exploration/freestyle-notation-grammar/SEMANTIC_AUDIT_FINDINGS.md` — barraging-osis as canonical "math says X, community says Y, both real" example
- `exploration/footbagmoves-federation/FM_MATH_DIVERGENCES.csv` — federation divergence registry (whirlygig destination if Q1=NO; Arch Nemesis row carries stale barraging comment)
- `project_freestyle_state.md` (memory) — pt12 queue items 1, 2, 5b, 5c, 9
