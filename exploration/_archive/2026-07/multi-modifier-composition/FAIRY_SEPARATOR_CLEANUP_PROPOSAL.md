# Fairy Separator Cleanup - Proposal for Curator Review

Read-only consistency cleanup, not a promotion or doctrine change. Nothing written to red_corrections, tests, or dashboard.

## Goal
Settle the fairy entry separator before more notation is derived from fairy grammar. Pixie and stepping were standardized as uptime entries using `>>`; fairy evidence is mixed.

## Corpus evidence
43 fairy-modifier tricks open `TOE > SAME OUT [DEX]`. The separator immediately after the fairy dex, cross-tabbed against whether a body modifier (DUCK / DIVE / SPIN) follows:

| separator | next = body mod | next = non-body | total |
|---|---|---|---|
| `>` | 9 | 17 | **26** |
| `>>` | 13 | 3 | **16** |

Two facts decide the rule:
1. **`>` is dominant overall (26 vs 16).**
2. **`>` is used freely even before a body modifier (9 cases).** So a following body modifier does NOT require `>>`. The body-mod context only *correlates* with `>>`; it does not justify it as a rule.

That leaves the **3 non-body `>>` rows** as the genuine outliers: they use the uptime separator with no body-modifier context and against the dominant convention.

## Answers to the questions
1. **Default separator:** `>`.
2. **Standardize to `TOE > SAME OUT [DEX] > <base core>`:** yes, as the default for fairy.
3. **When `>>`:** the corpus does not support a clean `>>` rule (it appears in only 16 of 42, and `>` covers the body-mod context too). Lowest-risk reading: `>>` is not a fairy default in any context. The 13 existing `>>`-before-body rows are an established sub-pattern and are left untouched (changing them is out of scope and adds risk); they are not the cleanup target.
4. **Parser / ADD / terminal impact:** none. The separator is a timing marker (`>` planted/downtime, `>>` no-plant/uptime); it is not a bracket token. ADD (bracket count) is unchanged, the terminal catch and family are unchanged, and both separators parse. The only thing that changes is the timing *reading* of the entry, which for fairy should be the planted `>` to match its dominant form. This is what makes the cleanup safe.

## Rows affected (exactly 3, all in red_corrections, all ADD-neutral)
| slug | before | after | ADD |
|---|---|---|---|
| `fairy-whirl` | `TOE > SAME OUT [DEX] >> OP IN [DEX] > OP CLIP [XBD] [DEL]` | `TOE > SAME OUT [DEX] > OP IN [DEX] > OP CLIP [XBD] [DEL]` | 4 -> 4 |
| `fairy-butterfly` | `TOE > SAME OUT [DEX] >> SAME/OP OUT [DEX] > OP CLIP [XBD] [DEL]` | `TOE > SAME OUT [DEX] > SAME/OP OUT [DEX] > OP CLIP [XBD] [DEL]` | 4 -> 4 |
| `fairy-twirl` | `TOE > SAME OUT [DEX] >> SAME FRONT SWIRL [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]` | `TOE > SAME OUT [DEX] > SAME FRONT SWIRL [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]` | 5 -> 5 |

`fairy-whirl` and `fairy-butterfly` were derived in the whirl/butterfly batches; `fairy-twirl` is a pre-existing row. All three carry a `fairy` modifier and use `>>` with no following body modifier.

## Future derivations that depend on the ruling
Every held fairy case would adopt the `>` default: `fairy-merkon`, `fairy-ripstein`, `fairy-illusion`, `fairy-rev-whirl`, `fairy-gyro-torque`, `fairy-swirling-swirl`, `fairy-spinning-ducking-osis`, `fairy-torque`. Settling `>` now keeps those consistent when they are derived.

## Recommendation
**Adopt `>` as the fairy default and standardize only the 3 outlier rows to `>`.** The corpus is genuinely mixed, so this is the lowest-risk convention: it matches the dominant form, changes nothing structural (ADD / terminal / parse all invariant), leaves the established `>>`-before-body sub-pattern alone, and isolates the edit to the three known fairy rows. New fairy derivations use `>`.
