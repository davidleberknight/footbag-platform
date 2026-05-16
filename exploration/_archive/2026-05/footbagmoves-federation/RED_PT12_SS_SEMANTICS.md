# Red pt12 -- Same-Side (ss) Weighting Semantics

Date: 2026-05-11. Status: focused single-question clarification packet for Red review.

## Scope

A single governing-principle question: does "same-side" (ss) ever contribute ADD weight in canonical IFPA decomposition math?

This is a modifier-policy clarification request. It does NOT propose adopting FM ontology, inserting rows, editing the modifier table, mutating the parser, or changing Wave-2 implementation. The intended outcome is a rule for ss semantics that can be applied consistently across future federation/reconciliation work.

---

## 1. Math-baseline reconciliation up front

Before presenting cases, three baselines must be stated explicitly. Two are pt10/pt11-settled rulings; one is a parser-side observation from active IFPA data.

- **Pt10 (settled):** `nuclear = +2 ADD`, grouped with the Paradox Atomic set. The active `freestyle_trick_modifiers` row for `nuclear` reads `add_bonus=2, add_bonus_rotational=2`.
- **Pre-pt established:** `pixie = +1 ADD` flat. Active row reads `add_bonus=1, add_bonus_rotational=1`.
- **IFPA additive baseline (current):** `same-side` does not appear in the `freestyle_trick_modifiers` table. The IFPA additive math has no `ss` contribution. Compound ADD = `sum(modifier add_bonuses) + base_trick adds`.

Under this baseline the math for the FM cases below uses `nuclear=+2`, NOT `nuclear=+1`. Earlier framings of these cases that assumed `nuclear=+1` produced different deltas; this packet uses the active DB / pt10 values.

---

## 2. Four real-world FM cases

All four are verbatim rows from `legacy_data/out/footbagmoves_inventory.csv` and `legacy_data/reports/footbagmoves_match_preview*`. No hypothetical constructions.

### CASE A -- Hurl (Nuclear ss Whirl)

| Field | Value |
|-------|-------|
| FM display | Hurl |
| FM technical_name | Nuclear ss Whirl |
| FM ADD | 4 |
| IFPA additive (nuclear=+2; ss=+0) | 2 + 3 = 5 |
| Delta (FM minus IFPA additive) | -1 |

### CASE B -- Barfry (Nuclear ss Butterfly)

| Field | Value |
|-------|-------|
| FM display | Barfry |
| FM technical_name | Nuclear ss Butterfly |
| FM ADD | 4 |
| IFPA additive (nuclear=+2; ss=+0) | 2 + 3 = 5 |
| Delta | -1 |

### CASE C -- Nuclear Mirage (same side) (FM display-only; maps to sumo)

| Field | Value |
|-------|-------|
| FM display | Nuclear Mirage (same side) |
| FM technical_name | (display-only; no FM tech) |
| FM ADD | 4 |
| IFPA additive (nuclear=+2; ss=+0) | 2 + 2 = 4 |
| Delta | 0 |
| F2 match target | sumo (IFPA slug); sumo IFPA-adds=5 per pt9 X-Dex ruling |
| Note | FM appears to read sumo as 4 additive; IFPA reads 5 (pt9 added X-Dex). Independent of the ss question. |

### CASE D -- Maverick (Pixie ss Osis)

| Field | Value |
|-------|-------|
| FM display | Maverick |
| FM technical_name | Pixie ss Osis |
| FM ADD | 4 |
| IFPA additive (pixie=+1; ss=+0) | 1 + 3 = 4 |
| Delta | 0 |

---

## 3. The pattern across the 4 cases

| Case | Modifier | Base | Base adds | FM | IFPA additive | Delta |
|------|----------|------|----------:|---:|--------------:|------:|
| A Hurl | nuclear | whirl | 3 | 4 | 5 | -1 |
| B Barfry | nuclear | butterfly | 3 | 4 | 5 | -1 |
| C Nuclear Mirage ss | nuclear | mirage | 2 | 4 | 4 | 0 |
| D Maverick | pixie | osis | 3 | 4 | 4 | 0 |

The pattern is **not** "ss=+0 universally" (cases A and B disagree).

The pattern is **not** "ss=-1 universally" (cases C and D disagree).

The pattern correlates with: nuclear vs non-nuclear AND with base-trick ADD value, not with rotational vs non-rotational alone. Specifically:

- nuclear + ss on a 3-ADD base shows delta -1 (A, B).
- nuclear + ss on a 2-ADD base shows delta 0 (C).
- pixie + ss on a 3-ADD base shows delta 0 (D).

---

## 4. Three rival hypotheses

### H1 -- ss is genuinely +0; FM math is non-canonical on cases A and B

The IFPA additive baseline is correct universally. Cases A (Hurl) and B (Barfry) reflect FM rows where FM applied a non-canonical body-direction discount on top of nuclear+base math. IFPA should NOT adopt this discount. The -1 deltas are FM data noise.

Under H1:
- IFPA decompositions remain additive.
- ss is not registered in the modifier table.
- Any future FM row showing nuclear+ss with FM-ADD reduced by 1 is preserved as a federation-conflict alias, not as a new IFPA canonical.
- Sumo (pt9) remains 5 ADD; FM's 4 is non-canonical for the sumo-equivalent row.

### H2 -- ss carries a conditional ADD impact specific to nuclear

ss interacts specifically with nuclear's +2 weighting. The hypothesis: in same-side context, the nuclear modifier's body-direction commitment loses one of its two ADD points (likely the "paradox" half of the Paradox Atomic set per pt10). Equivalently: `nuclear-with-ss = +1`, behaving like atomic alone.

Under H2:
- IFPA either (a) registers `nuclear-ss` as a distinct modifier with add_bonus=+1, OR (b) preserves the additive math and reads `Nuclear ss X` as `Atomic X` editorially.
- Cases A and B are correctly modeled by H2; the -1 deltas vanish.
- Case C (Nuclear Mirage ss = 4) requires either: nuclear-with-ss on mirage is +2 (special-case mirage), OR FM data is non-canonical on case C specifically.
- Case D (pixie ss osis) is unaffected; pixie has no paradox component to remove.

### H3 -- ss is a +0 body-direction flag; FM math reflects an unrelated convention

ss is a cosmetic flag (no ADD impact) but FM rows that include "ss" sometimes ALSO use FM-specific modifier-weight conventions where `nuclear = +1` (not pt10's +2). The -1 delta on cases A and B is not from ss at all -- it is from FM's `nuclear=+1` vs IFPA's `nuclear=+2`.

Under H3:
- IFPA additive math (with nuclear=+2) remains correct.
- ss continues to be unrepresented in the modifier table.
- FM rows showing nuclear+ss with FM-ADD reduced by 1 are explained by FM's different nuclear weight, not by ss.
- All non-nuclear ss cases (Maverick = pixie ss osis) match IFPA additive directly, which is consistent with H3.
- Case C (Nuclear Mirage ss = 4) under H3: FM applies its own nuclear=+1 + mirage=+2 = 3, then ADDS something for ss = +1, giving 4. Under H3 this would mean FM ss=+1 on mirage. Inconsistent within FM, but consistent with the view that FM has its own non-IFPA math conventions.

---

## 5. Question to Red

**Should "same-side" (ss) ever contribute ADD weight in canonical IFPA decomposition math?**

Three branching follow-ups based on Red's choice:

### Branch (a): ss = +0 universally (H1 or H3 selected)

- Confirm IFPA decomposition continues to omit `ss` from the modifier table.
- Confirm FM rows showing nuclear+ss with -1 delta (Hurl, Barfry) are non-canonical math; IFPA decompositions stay at the additive value.
- Future federation rows where FM-ADD disagrees with IFPA-additive on ss grounds: preserve as folk aliases; do not adjust IFPA decomposition.

### Branch (b): ss interacts specifically with nuclear (H2 selected)

- Confirm whether `nuclear-ss` should be:
  - **(b1)** registered as a distinct modifier in `freestyle_trick_modifiers` with add_bonus=+1, OR
  - **(b2)** editorially treated as `atomic` (nuclear minus paradox half), with the canonical decomposition rewriting `Nuclear ss X` rows to `atomic X` form.
- Clarify case C (Nuclear Mirage same side = 4): does case C contradict H2, or is the mirage base a special exception?

### Branch (c): ss carries a general ADD weight (different from H2)

- Specify the weight (+1 / -1 / context-dependent).
- Specify the conditions (which modifier combinations, which base families).
- Indicate whether `ss` should be added to `freestyle_trick_modifiers` as a row.

---

## 6. Implementation consequence per branch

| Branch | Modifier table | Federation handling | Wave-2 ready-after-Red rows |
|--------|----------------|---------------------|----------------------------|
| (a) ss=0 universal | No change | Hurl-type FM rows = folk aliases only | Hurl, Casket insert at IFPA additive (Hurl=5, Casket pending Q4 fairy) |
| (b1) nuclear-ss=+1 modifier | Add `nuclear-ss` row | FM rows reading nuclear+ss adopt the new modifier in editorial decomposition | Hurl: re-decompose as nuclear-ss + whirl = 4 |
| (b2) nuclear-ss editorially = atomic | No table change | FM rows re-mapped to atomic+base editorially | Hurl: re-decompose as atomic + whirl = 4 |
| (c) ss = general modifier | Add `ss` row with weight | FM rows enter additive math with new modifier | Hurl: nuclear + ss + whirl = depends on +1 vs -1 |

Branches (a) and (b2) require ZERO modifier-table mutations. Branch (b1) requires 1 row insertion. Branch (c) requires 1 row insertion + a per-base or per-modifier interaction policy.

---

## 7. Affected scope

This packet's resolution governs:
- Wave-2 ready-after-Red rows that involve ss: Hurl (Tier 3), Casket (Tier 3; doubly blocked on Q4 fairy vocabulary).
- 54-row same-side cohort in `footbagmoves_match_preview_same_side.csv`. Most of those rows are non-Tier-1 future-wave candidates.
- The pt12-queued Barfry case (Nuclear ss Butterfly) is included here as CASE B and is resolved by this packet's outcome.
- Sumo's IFPA=5 vs FM=4 reading (case C) is independent of this packet; remains a pt9 X-Dex matter.

---

## 8. What this packet does NOT request

- Parser changes (none required for any branch).
- Ontology mutation beyond the modifier-table addition in branches (b1) and (c).
- Adoption of FM math (H1 or H3 explicitly reject FM math where it conflicts).
- Wave-2 implementation changes (Tier-1 already shipped W2b; ss-dependent rows are Tier 3 only).
- Alias insertion. Marius / Whirlwind federation conflicts are a separate question (deferred Q5).
- FM-vocabulary modifier adjudication (fairy, gyro, blazing) -- separate question (Q4).
- Pt10/pt11 re-litigation. Nuclear=+2 and pixie=+1 are baseline inputs to this packet, not contested.

---

## 9. Preservation

- Federation-not-adoption: any branch (a) outcome preserves the strongest federation-not-adoption posture (FM math may diverge from IFPA; IFPA stays additive). Branches (b) and (c) introduce minimal-scope ontology growth specifically tied to observed federation evidence, not to FM authority.
- Parser/editorial separation: every branch preserves the editorial-decomposition surface (`base_trick` + `freestyle_trick_modifier_links`) as the canonical math source. Parser reads `canonical_name` only.
- Pt10/pt11 baseline: every branch preserves pt10 nuclear=+2 and pt11 blurry=+1 rulings. The ss question is a separate dimension.
- Restraint-first: minimum-viable answers in (a) or (b2) require zero schema work. The packet does not pre-commit to any branch.

---

## 10. Recommended dispatch shape

Send as a standalone packet; estimated Red review effort: small (one governing-principle decision plus optional branch follow-ups).

Single-question form: "Should ss ever contribute ADD weight? If yes, under what conditions?" Branches (a)/(b)/(c) are the decomposition of Red's possible answers; Red may select one or refine the framing.

---

## Appendix A: Math-discrepancy note for internal review

The original brief for this packet framed nuclear at `+1` (e.g., "nuclear(+1) + whirl(3) = 4"). Active IFPA data and pt10 ruling specify `nuclear=+2`. This packet uses `nuclear=+2` consistently; the case deltas and the hypothesis space changed correspondingly.

If the original brief's `nuclear=+1` framing was intentional (e.g., reflecting a hypothesis that nuclear's effective weight in ss-context is +1), that hypothesis is captured as branch H2 in §4.

If the original brief's `nuclear=+1` framing was a typographical slip, the corrected analysis in this packet supersedes it.

This appendix is for internal/reviewer context; it is not part of the question dispatched to Red.
