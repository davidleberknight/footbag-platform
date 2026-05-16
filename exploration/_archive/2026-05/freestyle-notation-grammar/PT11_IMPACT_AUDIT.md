# pt11 ontology-impact audit

**Status:** Read-only audit. No code changes, no ontology mutations, no parser edits, no DB writes.
**Input:** `legacy_data/inputs/curated/tricks/red-correction-pt11.txt` (Red's answers, 2026-05-10).
**Output path:** this file.

---

## 1. Red's pt11 decisions captured

| # | Topic | Red's answer | Type |
|--:|---|---|---|
| 1 | Blurry rotational normalization | **+1 model** (joins spinning/swirling/whirling as flat +1) | Modifier-table impact |
| 2 | Frigidosis decomposition | **Deferred** ("I'll have to look into this one") | No action |
| 3 | Blender semantic reading | **Whirling Osis** | Semantic-decomp surface |
| 4 | Barfry semantic acceptability | **Acceptable** (Nuclear ss Butterfly) | Add to trick dictionary |
| 5 | Mobius semantic reading | **Spinning Torque** (rejected the Symposium-prefixed options) | Semantic-decomp surface |
| 6 | Ripwalk semantic reading | **Stepping Butterfly** (NOT Blurry Butterfly) | Semantic-decomp surface |
| 7 | Torque semantic atomicity | **Surface decomposition: Miraging Osis** | Semantic-decomp surface |

**Sequencing note from the human:** `mobius == spinning torque`. Combined with #7, the chain resolves transitively as **Mobius = Spinning Torque = Spinning Miraging Osis**.

**Frigidosis (Q2)** is the only pt11 item with no actionable answer. FM uses it as a cross-trick reference inside Arcwalk's operational notation (`Frigidosis > Same In (DEX) >> ...`). Audit ignores Frigidosis pending Red's follow-up; no current canonical row, no impact.

---

## 2. Federation-not-adoption posture re-affirmed

pt11 is a textbook federation moment. Every decision preserves IFPA's canonical layer as authoritative and treats FM's labels as folk aliases, not structural truth:

| Trick | FM label | IFPA canonical decomp (pt11) | Posture |
|---|---|---|---|
| Blur | "Blurry Mirage" (+2 reading, ADD=4) | Stepping Paradox Mirage (+1+1+2=4) | FM = folk alias; IFPA = canonical |
| Blender | "Whirling Osis" | Whirling Osis | Names agree; no conflict |
| Ripwalk | "Blurry Butterfly" (in tricks.csv aliases) | Stepping Butterfly | IFPA semantic > FM folk |
| Torque | (base trick in both) | Miraging Osis | Surfaced semantic > atomic |
| Mobius | (atomic in FM `tricks.csv` aliases include "gyro torque") | Spinning Torque → Spinning Miraging Osis | Surfaced semantic chain |
| Barfry | "Nuclear ss Butterfly" | Nuclear ss Butterfly (accepted) | FM-aligned; rare ratification |

**No FM-driven canonical mutation. No automated import. No notation-table rewrite.** Each semantic surface is an EDITORIAL annotation, not a structural override of the parser or modifier links.

---

## 3. Affected trick inventory

### 3.1 Blurry-named rows (sourced from `legacy_data/inputs/noise/tricks.csv` + aliases)

| Trick | Slug | Base | asserted_adds | Old +2 math | New +1 math | Math status under +1 |
|---|---|---|--:|--:|--:|---|
| **Blur** | `blur` | mirage | 4 | blurry(2)+mirage(2)=4 ✓ | blurry(1)+mirage(2)=**3** | ✗ — rescued by IFPA decomp Stepping Paradox Mirage (1+1+2=4 ✓) |
| **Blurry Whirl** | `blurry-whirl` | whirl | 5 | blurry(2)+whirl(3)=5 ✓ | blurry(1)+whirl(3)=**4** | ✗ — **needs Red reconfirmation** |
| **Blurriest** | `blurriest` | barfly | 5 | blurry(2)+barfly(4)=**6** | blurry(1)+barfly(4)=5 ✓ | ✓ — math IMPROVES under +1 |
| **Blurry Torque** | `blurry-torque` | torque | 6 | blurry(2)+torque(4)=6 ✓ | blurry(1)+torque(4)=**5** | ✗ — **needs Red reconfirmation** |
| **Ripwalk** | `ripwalk` | butterfly (alias: "blurry butterfly") | 4 | blurry(2)+butterfly(3)=**5** | blurry(1)+butterfly(3)=4 ✓ | ✓ — math agrees; pt11 reassigns canonical decomp to Stepping Butterfly (1+3=4 ✓) anyway |

**Math-shift summary:**
- Two tricks get RESCUED by +1 (Blurriest, Ripwalk — math now agrees with asserted).
- One trick is RESCUED by an existing alternate IFPA decomp (Blur via Stepping Paradox Mirage).
- **Two tricks break under +1** (Blurry Whirl, Blurry Torque) with no Red-supplied alternate decomposition. These join the Red Review Queue.

### 3.2 Pt11 named-compound rows (Torque / Mobius / Ripwalk / Blender / Barfly / Barfry)

| Trick | Slug | Base | asserted_adds | pt11 decomposition | Decomp math | Notes |
|---|---|---|--:|---|--:|---|
| **Torque** | `torque` | osis | 4 | Miraging Osis | miraging(1)+osis(3)=4 ✓ | base→base chain; introduces semantic-only annotation |
| **Mobius** | `mobius` | torque | 5 | Spinning Torque | spinning(1)+torque(4)=5 ✓ | Level-1 chain; OR Spinning Miraging Osis (1+1+3=5 ✓) Level-2 chain |
| **Blender** | `blender` | osis | 4 | Whirling Osis | whirling(1)+osis(3)=4 ✓ | Already in candidate_core_families.yaml reading_b; Red confirms |
| **Ripwalk** | `ripwalk` | butterfly | 4 | Stepping Butterfly (NOT Blurry Butterfly) | stepping(1)+butterfly(3)=4 ✓ | Overrides existing alias "blurry butterfly" |
| **Barfly** | `barfly` | infinity | 4 | (operational seed already landed: `CLIP >> SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [DEL] [XBD]`) | n/a | No pt11 change |
| **Barfry** | (not in tricks.csv yet) | — | — | Nuclear ss Butterfly | nuclear(2)+butterfly(3)=**5** (but FM asserts ADD=4) | **ADD-math ambiguity — needs Red clarification on "ss" weight** |

**Barfry math caveat:** Under the registered modifier weights (Nuclear=+2, Butterfly=3), the bare decomposition yields 5, but FM lists Barfry as ADD=4. The "ss" (same-side) flag may reduce the Nuclear set bonus from +2 (Paradox + Atomic-x-dex) to +1 (Paradox only) when execution is same-side, which would resolve to nuclear-ss(1)+butterfly(3)=4 ✓. This is plausible but unconfirmed; flagged as a separate Red follow-up.

---

## 4. Modifier-table impact

**File:** `legacy_data/inputs/noise/trick_modifiers.csv`
**Schema:** `modifier, add_bonus, add_bonus_rotational, modifier_type, notes`

### 4.1 The one required row edit

| Modifier | Current | pt11 target | Justification |
|---|---|---|---|
| `blurry` | `1, 2, set, ...` | `1, 1, set, ...` | Red pt11 +1-flat-rotational decision; aligns with spinning/swirling/whirling pt10 normalization |

**No other modifier rows change.** `spinning`, `swirling`, `whirling`, `stepping`, `paradox`, `symposium`, `ducking`, `miraging`, `pixie`, `quantum`, `barraging`, `furious`, etc. all stay as configured.

### 4.2 What does NOT change in the modifier surface

- No new modifiers introduced (Torque/Blender/Ripwalk/Mobius decompose into EXISTING modifiers).
- `atomic` stays at `(1, 2)` — pt11 does not touch atomic.
- `nuclear` stays at `(2, 2)` — Barfry's "ss" question is about per-trick override, not a generic modifier-weight change.
- No "ss" / same-side modifier added (would be a notation flag, not an ADD-bearing modifier — Red has not requested it).

---

## 5. Trick-row impact (tricks.csv)

### 5.1 Editorial annotations to add (semantic-decomposition column or equivalent)

`tricks.csv` currently does not have a "semantic_decomposition" column populated (Explore agent's report confirms; the seed loader does not populate the newer columns). The pt11 decompositions are best surfaced as:

1. **Operational notation** for compounds where FM has a curator-reviewed entry (e.g. Blur, Barfly — already seeded). **No new operational seeds in pt11** because Red's pt11 is about SEMANTIC structure, not operational-execution mechanics.
2. **Semantic-decomposition annotation** (free-text or YAML field) for Torque, Mobius, Blender, Ripwalk. This is currently a candidate-cores YAML construct; pt11 should either:
   - Promote the candidate-cores YAML to the source-of-truth for semantic decomp, or
   - Add a new `semantic_decomposition` column to `tricks.csv` (schema change — **not** a pt11 task).

### 5.2 Required tricks.csv additions

| Trick | Add | Reason |
|---|---|---|
| `Barfry` | New row | Red ratified semantic alias "Nuclear ss Butterfly" — needs canonical home. asserted_adds pending Red ADD-math clarification (4 per FM; semantic-derived 4 or 5 depending on ss-weight). |

### 5.3 NOT required (pt11 is editorial, not row-level)

- No row deletions.
- No alias additions/removals (Ripwalk's existing "blurry butterfly" alias becomes a FOLK alias; the canonical decomp is Stepping Butterfly — but the alias itself stays valid as a historical name).
- No new modifier-link rows (modifier links are derived from canonical_name parsing; not stored as a separate table in current schema).

---

## 6. Candidate-cores YAML impact

**File:** `exploration/freestyle-notation-grammar/candidate_core_families.yaml`

All five candidates (blur, blender, barfly, ripwalk, stepping_star) are already marked `red_disposition: answered_b` from pt10 (2026-05-10). pt11 layers ADDITIONAL semantic decompositions on top:

| Candidate | pt10 status | pt11 layered decision |
|---|---|---|
| blur | answered_b + Stepping Paradox Mirage adjudication | No change (already final per pt10 adjudication line 41-45) |
| blender | answered_b + reading_b: [whirling, osis] | **Confirmed by pt11**; reading_b's math (computed=4) was already correct; pt11 elevates from "approximate" to **canonical semantic decomp** |
| barfly | answered_b + operational-decomp approved | No change (pt11 doesn't touch barfly) |
| ripwalk | answered_b + reading_b: [blurry, butterfly] (math agreed under old +2) | **pt11 SUPERSEDES reading_b**: new canonical decomp is `[stepping, butterfly]`; reading_b becomes a folk-alias note |
| stepping_star | answered_a (no separate stepping family) | No change |

**New candidate-cores entries that pt11 IMPLIES (not yet in YAML):**
- `torque` — was treated as a base trick; pt11 surfaces semantic decomp `[miraging, osis]`. Recommend adding as a new candidate with `reading_a: core_family` (status quo) and `reading_b: structural_decomposition [miraging, osis]` — but **with Red's pt11 disposition already attached: answered_b (semantic surfacing approved)**.
- `mobius` — was treated as a torque-derived compound; pt11 surfaces 2-level chain. Recommend adding as a new candidate with `reading_b: structural_decomposition [spinning, torque]` and a `transitive_chain` field documenting `[spinning, miraging, osis]`.

**Stale YAML comments to clean up (low risk):**
- `ripwalk` block lines 124-128 note that "the pt10 rotational-escalation migration drops spinning/swirling rotational columns 2->1 but does NOT touch blurry's rotational column (still 1,2)". This comment becomes STALE upon pt11 commit. Edit (when applying pt11) to: "pt11 also drops blurry's rotational column 2→1; ripwalk decomp now Stepping Butterfly per Red".

---

## 7. Parser impact

**File:** `scripts/parse_freestyle_notation.py`

### 7.1 What changes

- `add_bonus_rotational` for blurry: 2 → 1 (DB-loaded value; parser reads from DB).
- For tricks whose canonical_name contains "blurry", parser's computed_adds shifts DOWN by 1 IF the base trick is rotational (mirage/whirl/torque/swirl). For non-rotational bases (butterfly/eggbeater/osis/etc), the old code path used `add_bonus=1` regardless, so computed_adds is unchanged.

### 7.2 What does NOT change

- `MODIFIER_TOKENS` registry (line 78) does NOT change — `blurry` stays as a MODIFIER_TOKEN.
- `ROTATIONAL_BASES` registry (line 61) does NOT change.
- Token-role classification (line 142-143) does NOT change.
- Parser code itself requires **zero edits**. Only the DB-loaded modifier-table value flips.

### 7.3 Parser-status transitions expected

After the blurry (1,2)→(1,1) flip and a full parser re-run:

| Trick | Old computed | New computed | asserted | Old status | New status |
|---|--:|--:|--:|---|---|
| Blur | 4 | 3 | 4 | exact | **disagrees** (rescued via Stepping Paradox Mirage if structural-parse path picks it) |
| Blurry Whirl | 5 | 4 | 5 | exact | **disagrees** — Red Review Queue |
| Blurriest | 6 | 5 | 5 | disagrees | **exact** |
| Blurry Torque | 6 | 5 | 6 | exact | **disagrees** — Red Review Queue |
| Ripwalk | 5 | 4 | 4 | disagrees | **exact** |

**Net effect:** parser_status flips for 5 rows. Two NEW disagreements (Blurry Whirl, Blurry Torque) join the Red queue; two PRE-EXISTING disagreements (Blurriest, Ripwalk) clear. Blur stays "disagrees" against the modifier-derived decomposition but is editorial-truth-overridden by the IFPA Stepping Paradox Mirage decomp.

---

## 8. Render-surface impact

**No template or service code changes required for pt11.** The existing surfaces shaped by O1a-O1d already handle the relevant fields gracefully:

| Surface | File | pt11 impact |
|---|---|---|
| Operational notation section | `src/views/freestyle/trick.hbs:119-143` | None — pt11 doesn't add operational seeds. |
| Semantic notation section | `src/views/freestyle/trick.hbs:98-115` | None at code level; once tricks.csv gets a semantic-decomp annotation for Torque/Mobius/Blender/Ripwalk, the existing tokenizer renders it. |
| Decomposition diagnostic | `src/views/freestyle/trick.hbs:145-177` | Auto-renders new "agrees/disagrees" state after parser re-run. |
| Glossary integration | `/freestyle/glossary#operational-notation` (O1c) | None — pt11 doesn't introduce new tokens. |
| Modifier reference (hidden public) | `feedback_modifier_public_visibility.md` | None — modifier list is render-disabled; the blurry row's data shift is internal-only. |

---

## 9. Workbook impact

**File:** `legacy_data/scripts/build_fborg_reconciliation_xlsx.py` (R1 generator)

| Sheet | Column | pt11 impact |
|---|---|---|
| Tricks | `computed_adds` | Shifts for 5 blurry-named rows after parser re-run. |
| Tricks | `parser_status` | Flips for the same 5 rows (see §7.3). |
| Tricks | `operational_notation` / `operational_notation_status` | No pt11 change (no new operational seeds). |
| Tricks | `fmoves_match` | No change (still `no_external_match`; F4 deferred). |
| Reconciliation | (existing rows) | Two rows transition to RESOLVED (Blurriest, Ripwalk computed now agrees). Two rows enter the queue (Blurry Whirl, Blurry Torque). |
| Red Review Queue | (R3 file-backed queue deferred) | Manual-add via R3 once it ships; for now, this audit is the queue artifact. |

**Workbook risk:** none. R1's generator is idempotent and re-runnable; the next workbook build will simply re-shape with the new computed values. No schema or generator changes required.

---

## 10. Risk assessment

### 10.1 Safe immediate edits (low risk; no Red reconfirmation needed)

1. **Update candidate_core_families.yaml comments** for `ripwalk` (stale pt10 comment about blurry-rotational unchanged) — see §6 "stale YAML comments to clean up". *Effect: editorial accuracy.* *Risk: none.*
2. **Add candidate_core_families.yaml entries** for `torque` and `mobius`, recording pt11 reading_b dispositions (Miraging Osis; Spinning Torque → transitive Spinning Miraging Osis). *Effect: editorial record.* *Risk: none.*
3. **Add Barfry to tricks.csv** as a base row with semantic decomposition annotation "Nuclear ss Butterfly", **asserted_adds left blank or marked pending** until the ss-weight question resolves. *Effect: dictionary completeness.* *Risk: low, but ADD-math caveat must be flagged in the row.*

### 10.2 Math-impact edits (require parser re-run + workbook re-build sequencing)

4. **Flip blurry row in `trick_modifiers.csv` from (1,2) to (1,1).** Single-line edit. *Effect: 5 trick computed_adds shift.* *Risk: medium — must be paired with parser re-run and Red Review Queue updates for Blurry Whirl + Blurry Torque.*

### 10.3 Edits requiring Red reconfirmation (DO NOT proceed without pt12)

5. **Blurry Whirl** — under +1 model, math gives 4 vs asserted 5. Either:
   - asserted=5 is wrong (downgrade to 4), or
   - canonical decomp is deeper (e.g. Stepping Paradox Whirl, blurry+spinning+whirl, etc.).
   *Status: Red Review Queue entry required.*
6. **Blurry Torque** — under +1 model, math gives 5 vs asserted 6. Same options:
   - asserted=6 is wrong (downgrade to 5), or
   - canonical decomp is deeper (e.g. Blurry Miraging Osis = 1+1+3=5 — still disagrees; Stepping Paradox Torque = 1+1+4=6 ✓ — agrees).
   *Status: Red Review Queue entry required. **Stepping Paradox Torque hypothesis is internally consistent — flag for Red verification.***
7. **Barfry asserted_adds** — pending Red clarification on "ss" weight (1 vs 2 from Nuclear). *Status: Red Review Queue.*
8. **Frigidosis** — Red deferred; needs pt12. *Status: parked.*

### 10.4 Parser-risk areas

- **None.** Parser code requires zero edits. Only DB-loaded data shifts.
- The `add_bonus_rotational` field is read at parse-time; ensure parser re-run is done after the trick_modifiers.csv reload, not before.

### 10.5 Workbook-risk areas

- **None.** Workbook regenerates from canonical CSVs; idempotent.
- Caveat: R1 workbook's `evidence_summary` sheet may surface the parser-status flips as new entries. Expected; not a defect.

### 10.6 Federation-not-adoption risk

- **None at code level.** No FM data is being adopted; pt11 is entirely IFPA-internal semantic clarification.
- The Blur "Stepping Paradox Mirage" vs FM's "Blurry Mirage" disagreement is the load-bearing precedent that pt11 reinforces: math conflicts are NOT auto-resolved toward FM; IFPA decomposition wins.

---

## 11. Recommended sequencing

**Phase A — Safe editorial edits (no Red dependency):**

1. Update `candidate_core_families.yaml`:
   - Refresh stale `ripwalk` comment (mention pt11 +1 flip).
   - Append new `torque` entry with reading_b `[miraging, osis]` + `red_disposition: answered_b` (semantic-surfacing approved per pt11).
   - Append new `mobius` entry with reading_b `[spinning, torque]` + `transitive_chain: [spinning, miraging, osis]` + `red_disposition: answered_b`.
   - Refresh `blender` comment to mark reading_b's "[whirling, osis]" decomp as pt11-elevated to canonical semantic.

2. Decide where Barfry lives:
   - Option A: Add row to `legacy_data/inputs/noise/tricks.csv` (base trick with semantic-decomp annotation in the `notes` column).
   - Option B: Add row to a new pt11-corrections CSV (e.g. `red_corrections_pt11.csv`) per the existing pt5/pt8/pt9/pt10 pattern.
   - **Recommended: Option B** for traceability and consistency with pt10's pattern.

**Phase B — Math-impact edit (single change, paired with re-run):**

3. Flip blurry row in `trick_modifiers.csv` from `1,2` to `1,1`.
4. Re-run `python3 scripts/parse_freestyle_notation.py --apply` to refresh `structural_parse_json` + `computed_adds` for all rows (per `feedback_parser_population_after_rebuild.md`).
5. Rebuild R1 workbook (`legacy_data/scripts/build_fborg_reconciliation_xlsx.py`) and inspect:
   - Tricks sheet: 5 row state-flips (Blur, Blurry Whirl, Blurriest, Blurry Torque, Ripwalk).
   - Reconciliation sheet: 2 RESOLVED (Blurriest, Ripwalk), 2 NEW QUEUE entries (Blurry Whirl, Blurry Torque).
   - Evidence Summary: pt11 line item recording the modifier flip.

**Phase C — Red Review Queue (pt12 inputs):**

6. Compose pt12 packet with:
   - Q1: Blurry Whirl — confirm asserted_adds=5 + name canonical decomp (candidate: Stepping Paradox Whirl?).
   - Q2: Blurry Torque — confirm asserted_adds=6 + name canonical decomp (candidate: Stepping Paradox Torque?).
   - Q3: Barfry ADD math — confirm "Nuclear ss" weight (4 or 5?).
   - Q4: Frigidosis — Red's deferred follow-up.

**Phase D — Editorial sweep (optional, after pt12):**

7. Once pt12 closes Blurry Whirl + Blurry Torque, update tricks.csv asserted_adds if Red downgrades, and finalize the candidate_core_families YAML transitions from `red_disposition: answered_b` to a hypothetical new `applied` state (or remove from the YAML if the candidate-cores construct is retired as a recurring tool).

---

## 12. Specifically evaluated questions

### Q (from task spec): "Whether blurry now joins spinning/swirling/whirling in the flat rotational family"

**Answer:** YES per Red pt11. Single modifier-table edit (blurry rotational column 2→1). pt11 formally extends the pt10 rotational-normalization to the last outstanding +2 rotational modifier. After this edit, the only remaining +2 rotational modifiers in `trick_modifiers.csv` are `atomic` and `furious` (both flagged as rotation-bonus-bearing, both NOT touched by pt11).

### Q: "Whether torque decomposition should now surface operationally, semantically, or both"

**Answer:** SEMANTICALLY (only). Red's answer was "Torque can be defined as Miraging Osis" — a semantic decomposition. There is no FM-curator-reviewed operational notation for Torque (the existing operational seeds are Blur + Barfly). Surfacing Miraging Osis is purely an editorial / semantic-layer annotation; the operational-notation column stays NULL for Torque until/unless a curator provides a reviewed operational seed.

### Q: "Whether mobius should remain culturally atomic despite semantic interpretation"

**Answer:** SURFACE THE SEMANTIC, PRESERVE THE CULTURAL. Recommendation:
- Keep Mobius as a named row in `tricks.csv` (cultural primacy — Mobius is a recognized trick name in IFPA tradition).
- Add semantic-decomposition annotation "Spinning Torque" (level 1) with optional transitive "Spinning Miraging Osis" (level 2).
- DO NOT remove the Mobius row or alias it under Torque — Mobius is culturally atomic in the dictionary even if structurally decomposable.
- This pattern mirrors Blur (kept as a named row, structurally decomposed to Stepping Paradox Mirage).

The "mobius == spinning torque" sequencing note from the human reinforces this: equivalence, not replacement.

---

## 13. Open questions for pt12

Carried forward from §10.3 + §1:

1. Blurry Whirl canonical decomposition + asserted_adds re-confirmation.
2. Blurry Torque canonical decomposition + asserted_adds re-confirmation.
3. Barfry "Nuclear ss" weight clarification (ADD-math).
4. Frigidosis decomposition (Red deferred in pt11).
5. (Lower priority) Whether to introduce a `same-side` / `ss` flag in the modifier registry, or keep it as a per-trick notation suffix without ADD impact.

---

## 14. Contract preserved

- ✓ No code changes.
- ✓ No ontology mutations.
- ✓ No parser logic edits.
- ✓ No canonical-row rewrites.
- ✓ No bulk-update of notation.
- ✓ No FM auto-import.
- ✓ Three-layer separation (operational / semantic / parser) preserved end-to-end.
- ✓ Federation-not-adoption posture preserved: FM "Blurry Mirage" remains a folk alias; IFPA "Stepping Paradox Mirage" remains canonical.
- ✓ Read-only audit produced; downstream sequencing recommended but not executed.
