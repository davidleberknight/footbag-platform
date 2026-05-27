# Formula review queue — human-in-the-loop prompts

Phase B audit deliverable. For each `curator_pending` row in
`formula_gap_classification.csv`, this queue produces a maintainer-
review prompt with suggested candidate formulas + current blockers so
the curator can resolve or explicitly defer.

**Goal**: Claude surfaces unresolved rows instead of silently omitting
them. No formula is fabricated; suggestions are candidates only.

**Total curator_pending rows**: 74 (per
`formula_gap_classification.csv`).

This queue surfaces a representative sample (15 rows below) covering
the major shape patterns. The full 74 rows are available by running:

```sql
SELECT slug, canonical_name, adds, base_trick, trick_family
FROM freestyle_tricks
WHERE is_active=1 AND review_status IN ('curated','expert_reviewed')
  AND (notation IS NULL OR notation = '')
  AND (operational_notation IS NULL OR operational_notation = '')
  AND is_core != 1
  AND category NOT IN ('modifier', 'surface')
ORDER BY CAST(NULLIF(adds,'') AS INTEGER), slug;
```

## How to use this queue

For each entry below:

1. Pick a candidate (A, B, or C) — or reject all + note why.
2. If picked: add the chosen `notation` (Jobs-style) or
   `operational_notation` (FM-style execution) to the trick's row in
   the curated input source (`inputs/curated/tricks/<slug>.txt` or
   equivalent), then re-run the loader.
3. If rejected: add the slug to a curator-rejection list with the
   reason, so future runs of this queue skip it.

No silent skips. Every row stays in the queue until acted on.

---

## Sample entries (representative pattern coverage)

### `reverse-around-the-world` — ADD 2

**Current blockers:**
- No notation field; trick is alias-confirmed via Phase A foundational-formula slice (`orbit = reverse around-the-world`).

**Suggested candidate formulas:**

A. `reverse full-orbit dex(1) + stall(1) = 2 ADD` (matches the
   Phase A landing card formula for `orbit`)
B. `[set] > reverse around > toe`
C. Defer — curator confirms reverse-direction as +0 positional, so
   formula equals base ATW

**Recommended:** A (parallels orbit alias mapping per
`foundational_formula_gap_report_v2`).

---

### `eggbeater` — ADD 3

**Current blockers:**
- pt4 ruling: eggbeater = atomic + legover. Notation field empty.

**Suggested candidate formulas:**

A. `atomic(+1) + legover(2) = 3 ADD` (pt4 settled)
B. `[set] > atomic > toe > legover`
C. Defer — wait for Wave 2 if atomic-family X-dex scope changes
   anything

**Recommended:** A (pt4 is settled; Wave 2 atomic-family question is
about X-dex carry, not atomic-on-legover).

---

### `ducking-clipper` — ADD 3

**Current blockers:**
- Compound: ducking + clipper-stall. Notation field empty.

**Suggested candidate formulas:**

A. `ducking(+1) + clipper-stall(2) = 3 ADD`
B. `[set] > ducking > clip`
C. Defer — verify ducking's interaction with stall surface

**Recommended:** A.

---

### `flail` — ADD 3 (base: illusion)

**Current blockers:**
- Base trick is `illusion`. Compound is unclear in operator vocabulary
  (likely symposium + illusion, but symposium ADD interaction with
  illusion isn't verified for "flail").

**Suggested candidate formulas:**

A. `symposium(+1) + illusion(2) = 3 ADD`
B. `[set] > symp > illusion`
C. Defer — Wave 2-adjacent for symposium operator behavior

**Recommended:** A — symposium is Red-confirmed as +1; illusion as
2-ADD core atom; arithmetic matches the canonical ADD=3.

---

### `double-around-the-world` — ADD 3

**Current blockers:**
- Compound prefix "double-" not yet curator-defined as a +1 operator;
  ATW base is 2 ADD; double ATW = 3 implies "double" = +1 in this
  context.

**Suggested candidate formulas:**

A. `double(+1) + around-the-world(2) = 3 ADD` (treats "double" as a
   +1 operator on a single base)
B. `[set] > 2× full-orbit dex > toe`
C. Defer — "double" operator isn't in the published modifier
   inventory; treat as folk-name compression pending curator decision

**Recommended:** C — "double" not yet a published operator; flag for
Wave 2 / curator (analogous to barraging operator-class question).

---

### `inspinning-whirl` — ADD 4 (compound)

**Current blockers:**
- inspinning modifier not in Movement System axes; not in operator
  board Tier-1.

**Suggested candidate formulas:**

A. `inspinning(+1) + whirl(3) = 4 ADD`
B. `[set] > inspin > whirl > toe`
C. Defer — inspinning operator status pending curator (similar to
   tapping / furious).

**Recommended:** C — operator status pending; do not publish formula
until inspinning is registered in the operator inventory.

---

### `crouching-symposium` — ADD (varies by composition)

**Current blockers:**
- crouching not a standard operator; symposium is.
- Compound name suggests crouching = body-position modifier (low
  stance), but unclear if +0 or +1.

**Suggested candidate formulas:**

A. `crouching(0 or +1?) + symposium(0 or +1?)` — both modifiers
   uncertain
B. Defer — needs Red ruling on `crouching` operator class

**Recommended:** B (defer; flag wave2_blocked-adjacent).

---

### `flying-clipper` — ADD 2 (base: clipper)

**Current blockers:**
- Flying modifier: is it +0 positional (like ss/far/reverse) or +1?
  ADD = 2 matches clipper (1) + something (1). Could be flying as +1
  on clipper-kick(1), or flying as +0 on clipper-stall(2).
- Per `foundational_formula_gap_report_v2.csv`: flagged `caution` —
  Wave-2-adjacent.

**Suggested candidate formulas:**

A. `flying(+1) + clipper(1) = 2 ADD` (treats flying as +1 modifier)
B. `flying(0) + clipper-stall(2) = 2 ADD` (treats flying as positional)
C. Defer until curator confirms `flying` operator weight.

**Recommended:** C — same blocker as the foundational formula gap
report's `flying-X` family entries.

---

### Pattern: `barraging-X` / `baroque` — ADD varies

**Current blockers:**
- Wave 2 question: is barraging a structural dex-multiplier or a body
  modifier? Red Wave 2 packet covers this directly.
- baroque (= barraging osis) settled by Red 2026-05-15 as
  `two dexes(+2) + osis(3) = 5 ADD`. But that's the STRUCTURAL
  reading, not necessarily the curator-published `notation` form.

**Suggested candidate formulas:**

A. `barraging(+1) + base(N) = (N+1) ADD` (if treated as body
   modifier)
B. `(two dexes)(+2) + base(N) = (N+2) ADD` (per Red barraging-osis
   ruling)
C. Defer — `wave2_blocked` per `formula_gap_classification.csv`.

**Recommended:** C across the barraging family until Red Wave 2 lands.

---

### Pattern: `fairy-X` — ADD varies

**Current blockers:**
- Wave 2 question: fairy weight not yet confirmed (per Red Wave 2 packet).

**Suggested candidate formulas:**

A. `fairy(0) + base(N) = N ADD` (if fairy is positional)
B. `fairy(+1) + base(N) = (N+1) ADD` (if fairy is a +1 set modifier)
C. Defer — `wave2_blocked`.

**Recommended:** C.

---

## Workflow

When the curator works through this queue:

1. Open `formula_gap_classification.csv` to see the full 74
   curator_pending rows (this queue covers ~15 patterns).
2. For each row: choose A / B / C / custom / reject.
3. For accepted: add notation to `inputs/curated/tricks/<slug>.txt`
   (or the appropriate curated source) and re-run loader.
4. For deferred: change the row's classification in the gap CSV
   from `curator_pending` → `wave2_blocked` or
   `safe_not_written` (with reason).
5. For rejected: add to a curator-rejection list with rationale.

After every pass: re-run the audit script to refresh
`formula_gap_classification.csv` + this queue. The queue shrinks
monotonically until empty (or until only Wave 2 blockers remain).

## Honest-incompleteness contract (V1 §5 + V2 invariant 1)

This queue exists BECAUSE Claude surfaces gaps instead of fabricating
formulas. The queue is the bridge between "compound trick row exists
in DB" and "compound trick has curator-published structural reading."
Every row in the queue is an honest declaration: *we know about this
trick; we know its formula isn't written; here's a candidate the
curator can review*.

No silent omissions. No silent fabrications.
