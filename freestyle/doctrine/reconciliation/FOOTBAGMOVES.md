# Source Reconciliation — FootbagMoves

## What this is

FootbagMoves (fbmoves.com) is one of the outside lineages the encyclopedia draws
on. Where its readings agree with the platform, the agreement needs no record.
Where they disagree, the disagreement is scholarship: it deserves to be explained,
attributed, and resolved on the record, so that a future reader who finds
FootbagMoves listing a different number or a different name can see that the
platform considered it and decided, rather than missed it.

This document is that record. It is **not doctrine and not a ruling.** It creates
no new rule and re-opens no settled one. For every trick where FootbagMoves and
the platform dictionary disagree, it states four things:

1. **The disagreement** — what FootbagMoves reads, and what the platform reads.
2. **The source** — where each reading comes from.
3. **The adopted interpretation** — which reading the encyclopedia publishes.
4. **Why** — the reason, grounded in the platform's own structural model and in
   the source-reconciliation policy stated in the doctrine Charter.

The governing policy is the Charter's, quoted here because every case below
applies it:

> **Record, do not adopt.** Where an outside source diverges, the platform
> publishes its own structural value and records the divergence in provenance.
> The divergence is documented and explained, never silently absorbed or silently
> overridden.
> **Frequency is evidence, never authority.**
> **A single source is non-authoritative for a contested value.**
> **Weight corroboration by independent lineage, not source count.**

FootbagMoves is, for almost every divergent value below, the **sole** source of
the higher (or lower) number. Under the policy that makes its figure
non-authoritative for the contested value: recorded, explained, not adopted.

## Method and sources

The inventory was compiled from the federation corpus and the live dictionary,
not from memory:

- `exploration/footbagmoves-federation/` — the dedicated 22-row math-divergence
  audit (`FM_MATH_DIVERGENCES.csv`), the 221-row name-divergence review, the
  43-row alias-candidate review, the 55-operator inventory, and the reconciliation
  summary.
- `exploration/symbolic-master/comprehensive_symbolic_trick_corpus_2026-05-23.csv`
  — filtered to true FootbagMoves rows to surface divergences not recorded in any
  registry.
- The platform's own divergence surfaces: the operator-weight divergence policy
  and the per-trick divergence registry in
  `src/content/freestyleTrickDoctrine.ts`, and the in-row provenance strings in
  `src/content/freestyleResolvedFormulas.ts`.
- `database/footbag.db` — every platform ADD quoted below was verified against the
  live dictionary as it ships, not inferred.

## Agreement baseline

Disagreement is the exception, and the record should say so before it catalogs the
exceptions. Measured against the live dictionary, of the FootbagMoves rows that
resolve to an existing canonical trick at all, roughly **88 to 91 percent agree**
on ADD. The strict measurement (FootbagMoves-only rows, excluding corpus rows that
merely share a grammar tag) is 77 of 87 matched slugs in agreement; the broad
measurement is 122 of 134. The overwhelming majority of what FootbagMoves carries
is structure the encyclopedia already carries, at the same value.

One honest caveat travels with that figure: it is a rate among *matched* tricks,
not among the full FootbagMoves corpus. FootbagMoves lists hundreds of rows that
have no platform match at all — folk names, positional variants of a base already
covered, structures not promoted. Those are not disagreements; they are simply
outside the matched set. The disagreements catalogued here are the resolved
minority within the overlap.

## The shape of the disagreement

FootbagMoves does not miscount at random. Its divergences cluster by **operator**,
and both directions are attested. Understanding the three mechanisms below explains
almost every individual case that follows.

**1. The over-count: an implicit operator term the platform folds into the base.**
This is the largest cohort. FootbagMoves scores an extra structural term — a second
modifier, a recursive set expansion, a cross-dex bonus — that the platform's
grammar treats as already contained in the base or as non-qualifying. It runs +1 to
+2 high. Two of its sub-cohorts are formally registered:

- **Furious cohort** (`freestyleTrickDoctrine.ts`, `OPERATOR_WEIGHT_DIVERGENCE_POLICY['furious']`).
  Anchor: Fury (Furious Paradox Mirage) is a settled 5 ADD, so furious = 5 − paradox(1)
  − mirage(2) = 2. FootbagMoves scores furious as a rotational +3-class operator and
  runs the cohort high.
- **Railing cohort** (same file, `['railing']`). Anchor: railing = rooted(0) +
  sailing(2) = 2. FootbagMoves scores it higher.

**2. The same-side under-count.** Where a Nuclear or Pixie set stacks on a
same-side-marked base, FootbagMoves reads the same-side marker as adding a point.
The platform's settled rule (Red, 2026-05-11) is that same-side is +0 universally.
FootbagMoves therefore runs −1 low on exactly this configuration.

**3. Isolated mechanism-specific gaps.** A few rows diverge for a single reason
particular to that trick (a missed cross-dex trigger, an operator weight not
applied). These are noted individually.

The load-bearing scholarship finding is that the platform's response is uniform
across all three: **publish the platform's independently-derived structural value;
record FootbagMoves' convention as provenance; do not adopt its weight, because
FootbagMoves is the sole source for the contested number.** The direction of the
divergence (high or low) does not change the treatment.

---

## A. ADD disagreements — the over-count cohort

For every row: FootbagMoves reads high, the platform publishes its structural
value, and the divergence is recorded (registry or in-row provenance) rather than
adopted. The shared reason is the source-reconciliation policy: FootbagMoves is the
sole source of the higher number, and a single source is non-authoritative for a
contested value.

### A.1 Furious cohort (registered)

| Trick | FootbagMoves | Platform | Adopted | Why |
|---|---|---|---|---|
| Genesis | 7 (Furious Whirl) | **5** | Platform | furious = 2 (anchored on Fury = 5), not the +3-class weight FM applies; registered in the furious divergence policy |
| Clown Face | 7 | **5** | Platform | same furious over-count |
| Rage | 7 | **5** | Platform | same |
| Nebula | 7 | **5** | Platform | same |

**Source:** FootbagMoves is the sole source of the 7-readings; the platform value
is anchored on the settled Fury decomposition and recorded in
`OPERATOR_WEIGHT_DIVERGENCE_POLICY['furious']`.

### A.2 Railing cohort (registered)

| Trick | FootbagMoves | Platform | Adopted | Why |
|---|---|---|---|---|
| Dorshanatrix | 7 | **5** | Platform | railing = 2 (rooted 0 + sailing 2), not FM's higher weight; registered in the railing divergence policy |
| Flying Fish | 7 | **5** | Platform | same railing over-count |
| Rail Warrior | 7 | **6** | Platform | same, +1 here |

**Source:** FootbagMoves sole source; platform value registered in
`OPERATOR_WEIGHT_DIVERGENCE_POLICY['railing']`.

### A.3 Single-source structural promotions (in-row provenance)

These are tricks the platform promoted *from* FootbagMoves as the only source. It
published the structurally-derived value and recorded FootbagMoves' higher claim in
that row's own provenance string. The disagreement is documented at the point of
promotion.

| Trick | FootbagMoves | Platform | Adopted | Why |
|---|---|---|---|---|
| Big Apple Sauce | 9 | **8** | Platform | the corpus's lone 9; the X-Dex bonus FM reads cannot fire (no qualifying set; the receiving dex follows a paradox dex). See the Frontier paper's worked example. |
| Warp | 7 | **5** | Platform | warping = a 2-dex set (3 ADD), not FM's higher reading |
| Floatation | 7 | **6** | Platform | floating = quantum + symposium + quantum (3 ADD) |
| Liquifier | 7 | **6** | Platform | splicing = gyro + reving |
| Oh Wheely | 7 | **6** | Platform | nova = symposium-DLO; nuclear's X-Dex does not fire on a legover base |
| Bill & Ted's Excellent Adventure | 7 | **5** | Platform | flailing = symposium illusioning; FM's explicit Symposium term is redundant |
| Shooting Star | 8 | **7** | Platform | "shooting" (+3) is not a qualifying X-Dex trigger set; the cross-dex bonus FM adds does not fire |
| Shooting Barfly | 8 | **7** | Platform | same shooting mechanism |
| Redwetter | 7 | **6** | Platform | same shooting mechanism |
| Atom Smasher | 3 | **4** | Platform | the one over-direction inversion here: FM *collapses* an atomic-specific X-Dex/paradox term the platform scores; platform reads atomic(1) + mirage(2) + [XDEX](1) = 4 |

**Source:** FootbagMoves sole source for each; platform values grounded in the
X-Dex rule and the composite-operator decompositions, recorded in
`freestyleResolvedFormulas.ts` provenance.

### A.4 Implicit-paradox cohort (doctrine-sensitive)

| Trick | FootbagMoves | Platform | Adopted | Why |
|---|---|---|---|---|
| Cheese Processor | 8 | **7** | Platform (provisionally) | FM reads an added implicit paradox term ("King Koopa"); the platform's parallel non-paradox chassis does not carry it |
| Spinning Ducking Symposium Torque | 8 | **7** | Platform (provisionally) | same implicit-paradox reading |

**Source:** FootbagMoves sole source of the paradox term. **Why "provisionally":**
whether a paradox term present in one lineage and absent in another should score is
the open **paradox-predicate** question in the Scoring paper. The platform
currently publishes the paradox-free value; if the predicate is ruled the other
way, these two rows (and only rows of this shape) move. The disagreement is
recorded here precisely because its resolution is not yet settled.

---

## B. ADD disagreements — the same-side under-count cohort

FootbagMoves reads the same-side marker as +1. The platform's settled rule is
same-side = +0 (Red, 2026-05-11). FootbagMoves therefore runs low on this
configuration.

| Trick | FootbagMoves | Platform | Adopted | Why |
|---|---|---|---|---|
| Hurl | 4 (nuclear + whirl, ss) | **5** | Platform | same-side = +0; FM's 4 undercounts by treating ss as absorbing a point. Live at 5. |
| Barfry | 4 (nuclear + butterfly, ss) | **5** | Platform | same mechanism; live at 5 |
| Godzilla | 4 (nuclear + dyno, ss) | 5 (structural) | Platform reading | same mechanism; Godzilla is a folk alias, not a promoted canonical row, so no live value ships, but the reading is the same +0 same-side correction |

**Source:** FootbagMoves sole source of the lower number; the platform value
follows the same-side ruling and is live in the dictionary for Hurl and Barfry
(`red_additions_2026_04_20.csv` rows 908 to 909).

---

## C. ADD disagreements recorded here for the first time

Cross-referencing the comprehensive symbolic corpus against the live dictionary
surfaces a cohort of FootbagMoves divergences that no registry or provenance string
currently captures. Six of them share a PassBack-sourced sibling already recorded
in the per-trick divergence registry, but that entry documents the *PassBack*
claim, not FootbagMoves' independent (and sometimes differently-valued) one. This
section is where those become part of the record.

| Trick | FootbagMoves | Platform | Adopted | Why |
|---|---|---|---|---|
| Blaze | 4 (Blazing Mirage) | **3** | Platform | over-count of the blazing operator on a mirage base; platform reads whirling-far-mirage at 3 |
| Blizzard | 4 (Blurry Illusion) | **3** | Platform | blurry over-count; platform reads the base at 3 |
| Omelette | 4 (Atomic Illusion) | **3** | Platform | atomic is +1 flat, not the higher reading FM's naming implies |
| Bedwetter | 5 (Blurry Eggbeater) | **4** | Platform | blurry over-count on an eggbeater base |
| Fury | 6 (Furious Mirage) | **5** | Platform | the furious cohort mechanism (A.1), here on a mirage base; Fury is itself the anchor that fixes furious = 2, so FM's own 6 contradicts the decomposition its naming rests on |
| Blurrage | 6 (Blurry Barrage) | **4** | Platform | doubled over-count (blurry + barrage both read high); the registry records a PassBack claim of 3, a different divergence in the opposite direction — FM's 6 is layered on top and recorded here |
| Predator | 5 (Atomic Double Legover) | **4** | Platform | FM reads atomic as adding to a double-legover base above the flat +1; the registry records a separate PassBack claim of 3 (−1), so the platform sits between two single sources diverging in opposite directions |
| Terrage | 3 (Double Pixie) | **4** | Platform | FM under-counts; the specific mechanism of FM's lower reading is not independently established, so this is recorded as an observational divergence, platform value published |
| Witchdoctor | 4 (Atomic Symposium Mirage) | **5** | Platform | FM under-counts; mechanism not independently established; recorded as observational, platform value published |

**Source:** FootbagMoves (with a PassBack sibling for Blaze, Blizzard, Omelette,
Bedwetter, Fury, Blurrage, and Predator). **Adopted:** the platform's live value in
every case (verified against `database/footbag.db`). **Why:** the same
record-don't-adopt policy. For the seven with cohort-explained mechanisms the
reasoning is the furious/blurry/atomic over-count; for Terrage and Witchdoctor the
platform publishes its structural value and records FootbagMoves' lower reading as
an observational divergence without claiming to have reconstructed FootbagMoves'
internal reasoning — honesty about the limit of the reconciliation, not a hidden
adoption.

For Blurrage and Predator specifically, the record now holds three readings each:
the platform value, a PassBack claim, and a FootbagMoves claim, diverging in
different directions. That is exactly the multi-source divergence the per-trick
registry exists to hold; it currently holds only the PassBack half, and this
document is the standing record of the FootbagMoves half until the registry is
extended.

---

## D. Name and identity disagreements

FootbagMoves and the platform sometimes carry the same trick under different names.
The 221-row name-divergence review resolves as: 108 already an alias on the
platform, 62 positional or directional variants, 44 folk names, 7 abbreviations.
The overwhelming majority are not disagreements at all — they are names the platform
already maps. A few carry genuine identity content:

- **Carousel.** FootbagMoves' own technical name (Surging Ducking Paradox Symposium
  Whirling Rake) is *identical* to the platform's structural reading. There is no
  disagreement of structure; the only open thread is the `surging` compositional
  operator, which is unresolved on both sides. **Adopted:** the shared structural
  reading; the alias is not yet wired pending the surging question. **Why:** agreement
  on structure, deferral only on an operator neither source has settled.

- **Genesis, dual label.** FootbagMoves proper labels Genesis "Furious Whirl" (7 ADD,
  the A.1 case). A separate corpus row labels it "Barraging Whirl" (6 ADD). That
  second label traces to the **PassBack** subsystem in the row-level data, not to
  FootbagMoves proper — a correction worth recording, because the reconciliation
  summary cited it as FootbagMoves' own evidence for "Furious ≈ Barraging." The
  Furious = Barraging equivalence is settled precedent regardless of which lineage
  supplied the second label. **Adopted:** platform value 5, furious cohort. **Why:**
  as A.1.

- **Quantum versus Miraging.** FootbagMoves' Sets tab defines **Quantum = "Toe
  Miraging"** — it treats Quantum as a compound built on Miraging. The platform
  (`freestyleOperatorReference.ts`) defines Miraging and Quantum as two independent
  operators with no cross-reference. This is the one genuinely open identity question
  in the FootbagMoves overlap. **Adopted:** the platform's current two-operator model
  ships as-is. **Why:** the "one set or two" merger question is unresolved by design;
  the platform does not adopt FootbagMoves' single-operator framing on a single
  source's say-so, and it does not foreclose the merger either. Recorded as an open
  identity divergence, carried to the Identity paper's merger discussion. This is
  the FootbagMoves-side counterpart to the merger the doctrine series already names
  as its live case.

- **43 alias candidates, unwired.** The alias-candidate review lists 43 high-and-
  medium-confidence FootbagMoves names (Vertigo, Croissant, Sabotage, Cyclone,
  Spanish Fly, and others) not yet present as live alias rows. **Adopted:** none
  wired yet. **Why:** this is pending curator alias-wiring work, not a resolved
  disagreement; it is recorded so the backlog is visible, not lost.

- **Blacula and Kiwi.** Down-family / DOD candidates held pending a down-family
  ruling. **Adopted:** not promoted. **Why:** doctrine-held, not rejected.

---

## E. Structural and notation disagreements

Here ADD may agree while the decomposition differs. These are surface-syntax
differences, not scoring disputes, with a few substantive exceptions.

- **FootbagMoves' parenthetical positional layer** (`ss`, `far`, `near`, `op`, `os`,
  `(uptime)`, `(downtime)`, `(rooted)`) versus the platform's expanded bracket form:
  the same information in different syntax. `ss` is settled at +0. **`far`/`near`
  weight is explicitly not formally adjudicated** — an open question the platform
  routes to Red, not a FootbagMoves error.

- **FootbagMoves' recursive compositional operators** decompose several concepts more
  deeply than the platform's flat modifier stack (Sailing = Pixie Atomic; Frantic =
  Pixie Quantum; Flailing = Symposium Atomic, now platform-resolved via the Bill &
  Ted row; and others). Where the ADD agrees, these are alternate decompositions of
  the same value, recorded as structural notes, not disagreements to resolve.

- **Slicing — a FootbagMoves-internal inconsistency, not a platform disagreement.**
  FootbagMoves' own Sets tab gives Slicing two different definitions ("Gyro Rev.
  Swirling" and "Blurry Quasi") in the same source. Recorded here as evidence the
  corpus is not internally self-consistent on this operator; the platform takes no
  reading from a source that disagrees with itself.

- **FootbagMoves-only operators with no platform equivalent** (Fairy, Gyro, Blazing,
  Surging, Splicing, Surfing, and others). Most are open Red-question-class vocabulary.
  Several once on this list have since been resolved elsewhere (Furious and Railing
  now carry structural weight 2; Terraging is +3 per Red pt6), which means the
  operator inventory file, dated 2026-05-11, is itself stale for those three and
  should not be read as current status without cross-checking the doctrine file.

---

## F. Open and unresolved cases

Two cases in the FootbagMoves overlap remain open, recorded per the Charter's rule
that a genuine source-of-truth conflict is surfaced, not silently decided. A third,
Bladerunner, was a live contradiction when this document was first written and has
since been resolved; it is kept here for the record.

1. **Bladerunner — resolved to 4.** This was a three-source contradiction: the
   math-divergence audit and the ADD-analysis content both computed atomic(1) +
   eggbeater(3) = **4**, an observational-tricks comment implied the row was
   observational, and the live dictionary shipped it as an expert-reviewed canonical
   row at ADD **5** (FootbagMoves' number). The audit trail was validated as still
   correct — not stale — and the drift was in the promotion: the row had published
   FootbagMoves' 5, whose notation inserted an `[XDEX]` bonus that the settled X-Dex
   rule does not permit, because the bonus requires a following far dex onto a
   receiving base (mirage/illusion/whirl/torque/drifter) and Bladerunner's base is
   legover-family. The row's own base `eggbeater` (3) and its explicit sister
   `atomic-double-leg-over` (4) both score the identical atomic-on-legover pattern
   with no X-Dex. The canonical row is now **4**, its notation carries three dexes
   and a toe delay with no `[XDEX]`, and FootbagMoves' 5 is recorded as
   non-authoritative — the standard record-don't-adopt outcome.

2. **Quantum versus Miraging** (Section D). Open by design; the merger question is
   live in the Identity paper.

3. **Rake.** The platform ships 2; FootbagMoves reads 3. The platform value is
   grounded in the swing-element doctrine, but that row is marked "Red review
   pending" — so the platform's own value is provisional, not a settled rejection of
   FootbagMoves' 3. Recorded as doctrine-sensitive.

---

## G. Summary of documentation status

| Category | Where the divergence lives today |
|---|---|
| Furious cohort (Genesis, Clown Face, Rage, Nebula) | Registered — `freestyleTrickDoctrine.ts`, furious policy |
| Railing cohort (Dorshanatrix, Flying Fish, Rail Warrior) | Registered — same file, railing policy |
| ~10 single-source structural promotions (A.3) | In-row provenance — `freestyleResolvedFormulas.ts` |
| Implicit-paradox pair (A.4) | In-row provenance; resolution gated on the paradox predicate |
| Same-side cohort (Hurl, Barfry, Godzilla) | `red_additions` rows for the two promoted; Godzilla folk-only |
| First-recorded cohort (Section C, 9 tricks) | **This document** — not previously in any registry |
| Bladerunner | Resolved to 4 — the `[XDEX]` could not fire on a legover-family receiver |
| Quantum-vs-Miraging, Rake | Open — surfaced for the maintainer |

The nine Section C rows are the cleanest candidate for a future extension of the
per-trick divergence registry, since seven already have a sibling entry there and
the FootbagMoves figure only needs to be added to an existing note rather than
authored from scratch. Recording that as an observation, not doing it here: this
document is scholarship, and extending the registry is a code change for a separate,
scoped slice.
