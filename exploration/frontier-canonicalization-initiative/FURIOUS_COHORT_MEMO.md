# Operator-weight divergence memo: the Furious cohort (and its railing twin)

## What this documents

A systematic disagreement between FootbagMoves (FM) and the platform on the ADD weight of certain set operators. Discovered on `furious`, then independently confirmed on `railing`. This is a source-policy question, not a per-trick question.

## FM values vs structural values

Platform `furious` = **2** (locked: Fury = furious + paradox + mirage = 5, so furious = 5 - 1 - 2 = 2).

| Trick | FM name | FM ADD | Structural (furious=2) | Divergence |
|---|---|---|---|---|
| Fury (canonical anchor) | Furious Paradox Mirage | 6 | **5** | +1 |
| clown-face | Furious Eggbeater | 7 | 2+3 = **5** | +2 |
| genesis | Furious Whirl | 7 | 2+3 = **5** | +2 |
| rage | Furious Symposium Mirage | 7 | 2+1+2 = **5** | +2 |
| nebula | Furious Double Legover | 7 | 2+3 = **5** | +2 |

Independent second instance, `railing` = rooted(0) + sailing(2) = **2**:

| Trick | FM name | FM ADD | Structural (railing=2) | Divergence |
|---|---|---|---|---|
| dorshanatrix | Railing Symposium Mirage | 7 | **5** | +2 |
| flying-fish | Railing Ducking Mirage | 7 | **5** | +2 |
| rail-warrior | Railing Ducking Butterfly | 7 | **6** | +1 |

**Signature (both cohorts):** FM is always higher, by +1 to +2, consistently across the whole cohort. FM's effective weight for these set operators is ~3-4; the platform's, anchored structurally, is 2.

## Recommended publication policy

Treat this as a documented **source divergence**, exactly like the single-trick Big Apple Sauce case (FM 9 / structure 8), but at cohort scale:

1. **Publish at the structural value** (furious tricks at 5, railing tricks at 5-6), with the FM value recorded as a single-source divergence in the trick's provenance.
2. **Do NOT escalate to Red.** The platform weight is already locked (Fury anchors furious=2; rooted=0 + sailing=2 anchors railing=2). There is no platform-side uncertainty to resolve; only the FM convention differs, and FM is the non-authoritative single source.
3. This unblocks `clown-face`, `genesis`, `rage`, `nebula` (publish at 5) and `dorshanatrix`, `flying-fish`, `rail-warrior` (publish at 5-6) as a single policy decision, with no Red consultation.

## Glossary case-study text (draft)

> **Why a single example is not enough: the Furious cohort.**
> When one source records a different difficulty than the platform, it can be a one-off miscount. Big Apple Sauce is such a case: FootbagMoves lists it at 9, the structure derives 8, and we publish the 8 with the disagreement noted.
>
> But difficulty disagreements can also be systematic. The platform fixes the `furious` operator at 2 ADD, because Fury (Furious Paradox Mirage) is a settled 5, and 5 minus paradox (1) minus mirage (2) leaves 2. FootbagMoves, however, scores every furious trick about two points higher: Furious Whirl at 7 where the structure gives 5, Furious Eggbeater the same, and so on across the whole family. The same pattern appears independently on `railing` (rooted plus sailing, structurally 2), which FootbagMoves also scores about two points high.
>
> A single trick could be an error. An entire cohort moving together in one direction is a convention. The platform publishes the structural value and records the source convention as a divergence, rather than adopting a weight the platform grammar does not support. This is the difference between cataloguing a number and understanding a grammar.

## Status

Policy decision pending (curator, not Red). On approval: 7 tricks (4 furious + 3 railing) become promotable at structural value with documented divergence. The glossary text above is ready to drop into the publication-contract examples and the §source-divergence glossary section.
