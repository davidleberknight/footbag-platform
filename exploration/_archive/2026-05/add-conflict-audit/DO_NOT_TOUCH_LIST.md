# Do-Not-Touch List

Canonical IFPA ADD values that this audit explicitly recommends preserving without alteration. The audit found mismatches against external sources or against computed formulas for several of these rows; in every case, the canonical stated value remains authoritative and the audit's role is to flag review, not to authorize edits.

Per `ADD_FORMULA_ASSUMPTIONS.md`: computed ADD is evidence, not authority. Stated values are preserved as-is.

## Class 1 -- IFPA canonical primitives (13 core atoms)

The 13 `is_core=1` rows in `freestyle_tricks`. These ARE the base ADD values that drive all formula computation. Touching them would invalidate the entire formula table.

| Slug | Stated ADD | Status |
|---|---:|---|
| around-the-world | 2 | PRESERVE |
| butterfly | 3 | PRESERVE |
| clipper | 1 | PRESERVE |
| fairy | 2 | PRESERVE (base value; fairy-as-modifier is Q4) |
| guay | 2 | PRESERVE |
| illusion | 2 | PRESERVE |
| legover | 2 | PRESERVE |
| mirage | 2 | PRESERVE |
| osis | 3 | PRESERVE |
| pickup | 2 | PRESERVE |
| pixie | 2 | PRESERVE |
| swirl | 3 | PRESERVE |
| whirl | 3 | PRESERVE |

## Class 2 -- canonical compound bases (used by formula table)

Non-core but treated as compositional bases:

| Slug | Stated ADD | Source/justification |
|---|---:|---|
| eggbeater | 3 | pt4 (eggbeater = atomic-legover) |
| drifter | 3 | pt11 (= miraging clipper) |
| torque | 4 | pt11 (= miraging osis) |
| blender | 4 | pt11 (= whirling osis) |
| dyno | 4 | FM corpus + pt-rulings cross-reference |
| reverse-drifter | 4 | pt-ruling on direction-variant pair |

## Class 3 -- pt12-open internal rows (do NOT touch pending Red)

The three rows under internal-stated-vs-computed disagreement:

| Slug | Stated ADD | Reason to preserve |
|---|---:|---|
| blurry-whirl | 5 | pt12 open; do not edit until Red rules on blurry-rotational |
| blurry-torque | 6 | pt12 open; same |
| barraging-osis | 5 | pt12 open; same |

The mismatch with the flat-additive formula is intentionally preserved pending the Red ruling in `RED_ADD_QUESTION_PACKET.md` Q1.

## Class 4 -- focus-target named tricks (DB self-atoms; preserve until decomposition is recorded)

DB has these rows with empty `notation` and `add_formula_status='exact_self_atom'`. Stated values are presumed canonical (sourced from IFPA dictionary). Until notation is backfilled or Red explicitly re-rules, do NOT modify.

| Slug | Stated ADD | Note |
|---|---:|---|
| atom-smasher | 4 | Decomposition "Atomic Mirage" pending formula verification (see Q3) |
| bullwhip | 5 | Folk-name; decomposition unknown |
| fury | 5 | pt6-derived; per-pt6 decomposition would yield 5 |
| witchdoctor | 4 | pt12 question pending (see Q2) |
| royale | 4 | Decomposition unrecorded (see Q4) |
| omelette | 3 | FM has +1 divergence (Atomic Illusion = 4 FM); IFPA preserves 3 |
| terrage | 4 | FM has -1 divergence (Double Pixie = 3 FM); IFPA preserves 4 |
| matador | 5 | Notation 'NUCLEAR BUTTERFLY' confirms via formula: nuclear(+2)+butterfly(3)=5 |
| spinning-osis | 4 | Notation confirms: spinning(+1)+osis(3)=4 |
| food-processor | 6 | Base=blender(4); +1 pattern matches blurry-rotational cohort; defer until Q1 |

## Class 5 -- FM federation rows (never adopt FM ADD)

All 23 rows in `FM_MATH_DIVERGENCES.csv` are folk-alias evidence. IFPA does not adopt FM's stated ADD. The FM-side numbers are preserved IN THAT MATRIX for federation context; they are NEVER applied to `freestyle_tricks.adds`.

Specifically:
- Hurl, Barfry, Godzilla (FM stated 4/4/5) -- preserve IFPA 5/5/6 derived under SS=+0.
- Bladerunner (FM stated 5) -- preserve IFPA 4 derived.
- Merlin (FM stated 5) -- preserve IFPA 4 derived.
- Enterrage (FM stated 4) -- preserve IFPA value (note: existing matrix claims IFPA=6 but formula gives 5; the matrix internal disagreement is a separate item for Bucket 3 review).
- Genesis (FM stated 7) -- preserve IFPA 5 derived (furious+whirl).
- Q4-blocked rows (Casket, Flaming Homer, Glaucoma, Park Avenue, etc.) -- not in `freestyle_tricks`; no IFPA value to preserve.

## Class 6 -- canonical aliases already in DB

The 126 rows in `freestyle_trick_aliases` are folk-name → canonical-slug mappings. These do NOT carry their own ADD; they inherit from the target trick. Do not edit alias rows' ADD-related state.

## What the do-not-touch list is NOT

- It is NOT a freeze on the `freestyle_tricks` table. Other columns (notation, operational_notation, description, related-trick links) remain editable per existing workflows.
- It is NOT a claim that the listed stated values are correct. It IS a claim that this audit does not produce evidence sufficient to override them, and that any override must come from an explicit Red ruling.
- It is NOT a list of "untouchable forever" rows. Several entries (Class 3 + Class 4 focus targets) are explicit candidates for re-rating once Red questions resolve.

## Editing protocol

If a future Red ruling overrides any value in this list:

1. The Red ruling lands in `legacy_data/inputs/curated/tricks/red-correction-pt*.txt`.
2. `ADD_FORMULA_ASSUMPTIONS.md` is updated to reflect the new operator policy.
3. The analyzer is re-run; the matrix re-emerges with the new closures.
4. ONLY THEN may the `freestyle_tricks.adds` value be edited, and only with the maintainer's explicit approval per CLAUDE.md.

This audit explicitly does NOT authorize any of those steps.
