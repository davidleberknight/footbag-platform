# base_trick / modifier_links QC worklist — adjacency layer

QC ONLY. No data modified. Detectors: `qc_detect.py` (token-vs-links) plus an
ADD-gap probe (folk under-links). Every flagged row makes the adjacency layer
wrong in a specific way: a missing operator link drops a trick to the **wrong
ladder rung** (it sits at rung 0 instead of where its operators put it) and gives
it the **wrong neighbor set** (empty opset → no siblings/extensions).

Three root causes:
- **A. Registered operator missing from links** — auto-derivable from the name.
- **B. Folk name, ADD-gap** — operators present but name hides them; not derivable.
- **C. Unregistered operator (`sailing`)** — the modifier itself is absent from the
  registry, so `sailing-*` tricks cannot be linked until `sailing` is registered.

Counts: A = 26, B = 91, C ≈ 6. Priority order below = neighbor correctness →
ladder rung → folk equivalence → public visibility.

---

## TIER 1 — auto-fixable (Class A, ADD-consistent, movement base)

Name states a registered operator, the base does not contain it, and
`base.adds + Σ operator bonuses == trick.adds` (the asserted ADD already assumes
the operator). Adding the link is metadata completion, not new structure.
**Safe to batch-fix with a single curator sign-off on the batch.**

| slug | cur base | cur links | exp base | exp links | reason | conf | auto? |
|---|---|---|---|---|---|---|---|
| inspinning-mirage | mirage | — | mirage | `inspinning` | rung 0→1; missing sibling of spinning-mirage; mirage = top family | high | yes |
| inspinning-osis | osis | — | osis | `inspinning` | rung 0→1; osis neighborhood | high | yes |
| inspinning-butterfly | butterfly | — | butterfly | `inspinning` | rung 0→1; butterfly family | high | yes |
| inspinning-legover | legover | — | legover | `inspinning` | rung 0→1; legover family | high | yes |
| inspinning-illusion | illusion | — | illusion | `inspinning` | rung 0→1; illusion family | high | yes |
| inspinning-paradox-mirage | mirage | — | mirage | `inspinning,paradox` | rung 0→2; two missing ops | high | yes |
| inspinning-paradox-illusion | illusion | — | illusion | `inspinning,paradox` | rung 0→2 | high | yes |
| inspinning-symposium-mirage | mirage | — | mirage | `inspinning,symposium` | rung 0→2 | high | yes |
| atomic-inspinning-butterfly | butterfly | `atomic` | butterfly | `atomic,inspinning` | rung 1→2; partial links | high | yes |
| symposium-reverse-whirl | rev-whirl | — | rev-whirl | `symposium` | rung 0→1; whirl family | high | yes |
| inspinning-flail | flail | — | flail | `inspinning` | rung 0→1 (minor family) | high | yes |
| paradox-da-da-curve | dada-curve | — | dada-curve | `paradox` | rung 0→1 (minor family) | high | yes |

**Systematic finding:** every `inspinning-*` row is unlinked — the operator was
never wired at load time. Fix the whole `inspinning` cohort in one pass.

---

## TIER 2 — auto-fixable (Class A, repeated operator) — "double spinning"

Ruled: **"double spinning" is repeated application of the registered `spinning`
operator, not a new modifier.** The +2 ADD gap is exactly two `spinning` bonuses
(1+1), so `base.adds + spinning + spinning == trick.adds` — ADD-consistent.
**Safe to batch-fix with curator sign-off**, same as Tier 1.

**Schema confirmed:** the link PK is `(trick_slug, modifier_slug, apply_order)`,
so two `spinning` rows at different `apply_order` are distinct and legal. **No
`double-spinning` modifier is created.** Repeated links **must set distinct
`apply_order`** (`spinning` #1, `spinning` #2); both rows carry `modifier_slug =
'spinning'`.

| slug | cur base | cur links | exp base | exp links (apply_order) | reason | conf | auto? |
|---|---|---|---|---|---|---|---|
| double-spinning-whirl | whirl | — | whirl | `spinning`#1, `spinning`#2 | rung 0→2; whirl family | high | yes + sign-off |
| double-spinning-mirage | mirage | — | mirage | `spinning`#1, `spinning`#2 | rung 0→2; mirage family | high | yes + sign-off |
| double-spinning-osis | osis | — | osis | `spinning`#1, `spinning`#2 | rung 0→2; osis neighborhood | high | yes + sign-off |
| double-spinning-butterfly | butterfly | — | butterfly | `spinning`#1, `spinning`#2 | rung 0→2; butterfly family | high | yes + sign-off |
| double-spinning-clipper | clipper-stall | — | clipper-stall | `spinning`#1, `spinning`#2 | surface ladder; lower visibility | high | yes + sign-off |

**Adjacency-model consequence (must land with this fix):** the prototype currently
keys opset as a `frozenset`, which collapses `spinning,spinning` → `{spinning}` and
would mis-place double-spinning at rung 1 (≡ spinning-whirl). Once repeated links
exist, the adjacency opset must be a **multiset** (count multiplicity): rung =
total operator count *with* repeats, and twin/sibling matching compares multisets.
This is the first case in the corpus to require it; update `neighbors()`/`ladder()`
opset handling accordingly.

---

## TIER 3 — registry gap (Class C) — `sailing` is not a registered modifier

`sailing-*` names imply a `sailing` operator absent from `freestyle_trick_modifiers`,
so these can't be linked until `sailing` is registered (with its add_bonus). **Two
steps: (1) register `sailing`; (2) link.** Reviewer/curator required.

Affected (non-exhaustive): `sailing-butterfly` (butterfly, +2), `sailing-legover`
(legover, +2), `sailing-double-leg-over` (+2), `sailing-eggbeater` (+2),
`Sailing Whirl`, `Sailing Mirage`. These currently sit at rung 0 with high ADD —
the clearest visual symptom of the gap.

---

## TIER 4 — curator decomposition (Class B) — folk ADD-gap (91 rows)

0 links, no operator token in the name, but `adds` exceeds the base — real
operators the folk name hides. **Not auto-derivable**; each needs curator
decomposition. They land at rung 0 today, so they distort every ladder they touch.
Highest-visibility / largest-gap first:

| slug | cur base | fam | add | base add | gap | exp links | reason | conf | auto? |
|---|---|---|---|---|---|---|---|---|---|
| goliath | legover | legover | 5 | 2 | +3 | (curator) | top-family ladder rung 0→? | low | review |
| atom-bomb | symposium-mirage | mirage | 6 | 3 | +3 | (curator) | mirage neighborhood | low | review |
| chainsaw-massacre | symposium-eggbeater | legover | 7 | 4 | +3 | (curator) | high-ADD public trick | low | review |
| yoda | butterfly | butterfly | 5 | 3 | +2 | (curator) | named exemplar, butterfly | low | review |
| morpheus | paradox-drifter | drifter | 6 | 4 | +2 | (curator) | drifter ladder | low | review |
| lotus | drifter | clipper-stall | 5 | 3 | +2 | (curator) | + base mis-root (Tier 5) | low | review |
| trixie | pixie | pixie | 5 | 2 | +3 | (curator) | — | low | review |
| dark-avenue / darkwalk / quantanamera / ripped-warrior | butterfly | butterfly | 5 | 3 | +2 | (curator) | butterfly rung 0 cluster | low | review |

…and ~80 more. These collectively are the biggest source of rung-0 noise; they are
a curator batch, not a script.

---

## TIER 5 — base mis-roots (lineage label only) — DEFER

Affect `lineage_root` (the optional "neighborhood" label), **not** the
structural-neighbors block or ladders (which key on `base_trick` + links directly).
Lowest priority for the adjacency layer.

- `drifter → clipper-stall` (16): drifter tricks rooted at a landing surface.
- `inside-stall → guay` (23): rooted at a non-anchor base.
- `legover ↔ double-leg-over` (6): inconsistent — DLO should fold into legover.

---

## Recommended sequencing

1. **Tier 1 + Tier 2** (17 rows, one curator sign-off) — removes the systematic
   `inspinning` breakage and the repeated-`spinning` rows; immediate, correct
   ladder/neighbor improvement for top families. Tier 2 also requires the
   multiset opset change in the adjacency layer (see Tier 2 note).
2. **Tier 3** (register `sailing`, then ~6 links).
3. **Tier 4** (91-row curator decomposition pass — schedule, not blocking).
4. **Tier 5** (only if the neighborhood label ships).

Nothing here has been applied. **Tier 1 + Tier 2** are the batches safe to
auto-apply, each only with the batch shown to a curator first.
