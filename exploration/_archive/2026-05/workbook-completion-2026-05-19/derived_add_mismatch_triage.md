# Derived ADD Mismatch Triage -- 2026-05-19

Documentation-only triage of the 6 workbook rows currently flagged `derived_add_mismatch`. Surfaces the doctrine that explains the systematic +1 discrepancy; defers all derivation/modifier-table fixes to explicit curator approval.

No code changes applied; this document is the curator deliverable.

---

## 1. The 6 rows + raw discrepancy

| Slug | Compact notation | Base | Modifier ADD (DB) | Base ADD | Naïve derived sum | Official ADD | Diff | External (FM) |
|---|---|---|---|---|---|---|---|---|
| `blur` | STEPPING PARADOX MIRAGE | mirage | blurry +1 | 2 | 3 | 4 | +1 | FM=4, fborg=4 |
| `blurry-whirl` | blurry whirl | whirl | blurry +1 | 3 | 4 | 5 | +1 | FM=5 |
| `blurry-torque` | blurry torque | torque | blurry +1 | 4 | 5 | 6 | +1 | (none) |
| `food-processor` | blurry blender | blender | blurry +1 | 4 | 5 | 6 | +1 | FM=6 |
| `nemesis` | furious barfly | barfly | furious +1 | 4 | 5 | 6 | +1 | FM=6 |
| `sumo` | nuclear mirage | mirage | nuclear +2 | 2 | 4 | 5 | +1 | FM=5 |

**Pattern: every row shows official ADD = naïve-derived ADD + 1. Across-the-board systematic, not noise.**

The naïve derivation formula is:
```
derived_add = base_trick.adds + sum(modifier_link.add_value for all links)
```

Where `modifier_link.add_value` reads the row's `freestyle_trick_modifiers.add_value` (DB-recorded modifier ADD bonus).

The DB records `blurry` and `furious` as +1 modifiers. The DB records `nuclear` as +2. These are the values the workbook's `derive_add_math()` consumes; they produce the naïve sums in column 5 above.

---

## 2. Diagnosis: composite-modifier shorthand

The +1 systematic gap is explained by the doctrine: **these modifier labels are informal shorthand for two-modifier compositions, but the DB records them at the single-modifier ADD value.**

### 2.1 Blurry decomposition (Red-explicit)

Memory `project_freestyle_state` preserves three explicit Red rulings:

> Blurry Whirl = Stepping Paradox Whirl = 5
> Blurry Torque = Stepping Paradox Torque = 6
> Food Processor = Stepping Paradox Blender = 6

These rulings tell us: `blurry X = stepping paradox X`. Structurally:

```
blurry = stepping(+1) + paradox(+1) = +2 ADD bonus
```

Applying to each row:

| Slug | Decomposition | Math |
|---|---|---|
| `blur` | stepping(+1) + paradox(+1) + mirage(2) | = 4 ✓ |
| `blurry-whirl` | stepping(+1) + paradox(+1) + whirl(3) | = 5 ✓ |
| `blurry-torque` | stepping(+1) + paradox(+1) + torque(4) | = 6 ✓ |
| `food-processor` | stepping(+1) + paradox(+1) + blender(4) | = 6 ✓ |

All four resolve.

### 2.2 Furious decomposition (Red-implicit)

Memory `project_freestyle_state` records the "policy-class trio" (nemesis + jani-walker + bullwhip) completion at pilot. The nemesis row's compact notation is `furious barfly`; the official ADD is 6.

By parallel construction to blurry (both follow `{modifier}-paradox-X` shorthand), the implied decomposition is:

```
furious = barraging(+1) + paradox(+1) = +2 ADD bonus
```

Applying:

| Slug | Decomposition | Math |
|---|---|---|
| `nemesis` | barraging(+1) + paradox(+1) + barfly(4) | = 6 ✓ |

Confidence is HIGH but indirect (Red has not explicitly stated "furious = barraging paradox" in the captured rulings; the parallel structure is the basis).

### 2.3 Nuclear decomposition (unconfirmed)

The DB records `nuclear` as +2. If true, sumo = nuclear(+2) + mirage(2) = 4 ADD. Red ruled sumo = 5 ADD. The gap is +1.

If nuclear follows the same composite-shorthand pattern, candidates include:

| Candidate | Math (for sumo) | Note |
|---|---|---|
| nuclear = atomic(+1) + paradox(+1) + ???(+1) = +3 | = 5 ✓ | atomic+paradox alone = +2, so need one more |
| nuclear = pixie(+1) + paradox(+1) + paradox(+1) = +3 (double paradox?) | = 5 ✓ | "double paradox" is not a recognized atom |
| nuclear is structurally +2 but sumo carries an additional hidden flag (similar to atom-smasher's x-dex-from-toe) | = 4+1 = 5 ✓ | Would parallel the atom-smasher pattern |

None of these is directly grounded in a captured Red ruling. **This is the genuine open question.**

---

## 3. Classification by confidence

| Confidence | Slugs | Doctrine | Action recommendation |
|---|---|---|---|
| **HIGH (Red explicit)** | blur, blurry-whirl, blurry-torque, food-processor | blurry = stepping + paradox = +2 | Curator can apply the doctrine without further Red consultation. The Red rulings are captured verbatim in `project_freestyle_state`. |
| **HIGH (Red implicit via policy-class trio)** | nemesis | furious = barraging + paradox = +2 | Curator can apply; the parallel structure is strong but worth a confirmation pass before changing modifier-table data. |
| **LOW (unconfirmed)** | sumo | nuclear composition unknown (+3 needed; possible atomic+paradox+x or atom-smasher-style hidden flag) | **Surface as Red Wave 3 supplement Q7** |

---

## 4. Why "document only" is the right posture here

1. **Modifier-table change is a multi-row blast radius.** Changing `blurry.add_value` from +1 to +2 affects every trick using blurry. The 4 SAFE rows are the *only* known users in our scope, but a stray reference elsewhere would silently shift. Curator should diff before applying.

2. **`MODIFIER_COMPOSITION_GLOSSES` already exists** (per Slice M ontology stabilization, memory `project_freestyle_state`). The right architectural home for "blurry = stepping + paradox" is this registry, not the modifier table. Reading from a composition gloss in `derive_add_math()` is the right fix; surfacing it via DB column changes is not.

3. **Counting-frame doctrine for `sumo` is genuinely open.** Applying SAFE rows in isolation while sumo's nuclear question is unresolved fragments the slice. Better to bundle: confirm nuclear via Red, then apply all 6 in one curator-approved pass.

4. **`derive_add_math()` is a workbook function, not a public-surface authority.** The 6 rows still render correctly on `/freestyle/tricks` because they read DB.adds (5 / 6 / 6 / 6 / 5), which Red has already confirmed. The mismatch is internal-to-workbook governance signal, not a user-facing bug.

---

## 5. Recommended next steps (curator-paced)

1. **Curator confirms `blurry = stepping + paradox`** (already in Red rulings; just needs explicit "apply to modifier table OR add to composition gloss" decision).
2. **Curator confirms `furious = barraging + paradox`** (parallel-structure inference; Red can confirm during next consultation pass).
3. **Red Wave 3 supplement Q7 added** for nuclear composition:
   > Q7. Nuclear modifier composition: sumo (nuclear mirage) = 5 ADD official; naïve nuclear(+2) + mirage(2) = 4. Is nuclear a +3 modifier (composite of atomic + paradox + something), or does sumo carry a hidden flag (parallel to atom-smasher's x-dex-from-toe)? Please confirm the structural decomposition so the workbook derivation can be settled.
4. **After curator decisions: single workbook PR** that either:
   - Updates `freestyle_trick_modifiers.add_value` for blurry / furious (and nuclear if confirmed +3); OR
   - Adds a `MODIFIER_COMPOSITION_GLOSSES`-style registry entry per modifier and updates `derive_add_math()` to use it.
5. **Workbook re-run**: expected delta is `derived_add_mismatch` 6 → 0 (or 6 → 1 if sumo remains open).

---

## 6. Citations

- Memory: `project_freestyle_state` (Red rulings: Blurry Whirl = Stepping Paradox Whirl = 5; Blurry Torque = Stepping Paradox Torque = 6; Food Processor = Stepping Paradox Blender = 6; policy-class trio complete at pilot: nemesis + jani-walker + bullwhip)
- Memory: `project_reconciliation_governance_gate` (6 derived_add_mismatch rows deferred curator-paced)
- Workbook: `legacy_data/reports/trick_reconciliation.csv` (per-row computed_add vs official_add columns)
- Builder: `legacy_data/scripts/build_trick_reconciliation_workbook.py` (`derive_add_math()` function + `ROTATIONAL_BASE_SLUGS` rotational-aware bonus)

---

## 7. What this document does NOT propose

- Does not change `freestyle_trick_modifiers.add_value` for any modifier
- Does not add to `COMPOSITE_MODIFIER_EXPANSIONS` or any new registry
- Does not modify `derive_add_math()`
- Does not apply any DB write or canonical CSV change
- Does not silently fix the discrepancy at the workbook layer

The 6 rows remain `derived_add_mismatch` in the workbook output. This document is the governance signal; the fix awaits curator-approved decision per §5.
