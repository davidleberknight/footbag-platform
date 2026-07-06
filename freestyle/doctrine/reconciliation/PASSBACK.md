# Source Reconciliation — PassBack

## What this is

PassBack is a second outside lineage the encyclopedia draws on. Like the
FootbagMoves reconciliation, this document is scholarship, not doctrine: it creates
no rule and re-opens no settled one. For every trick where PassBack and the
platform disagree on a number, it states the same four things — the disagreement,
the source, the adopted interpretation, and why — under the same Charter policy of
**record, do not adopt**.

But PassBack requires one finding stated up front, because it reshapes everything
below: **PassBack and the platform are, for almost every divergent row, measuring
two different things.** PassBack records `dex_count` — a mechanical count of the
dexterities a player performs inside a trick. The platform records structural ADD —
the compositional sum across stall, dex, cross-body traversal, rotation, and
operator weights. A butterfly is one dexterity and three structural ADD. Both
numbers are correct; they answer different questions. Most PassBack "disagreements"
are therefore not disagreements about the same quantity at all. They are two
instruments reading the same trick.

This is the load-bearing distinction from the FootbagMoves record. FootbagMoves is
a rival *scorer*: when it lists 7 where the platform lists 5, it is making a
competing claim about the same structural quantity, and the reconciliation is a
genuine adjudication. PassBack is, for 65 of its 68 divergent rows, a different
*instrument*: when it lists 1 where the platform lists 3, it is not claiming the
trick is easier — it is counting dexes, not structure. The reconciliation there is
not adjudication; it is translation.

The three exceptions — where PassBack makes a genuine competing structural claim —
are the real disagreements, and they are handled in Section B.

## Method and sources

- `src/content/freestyleAddDisagreements.ts` — the 68 curator-shipped PassBack→IFPA
  name-matched rows where the PassBack ADD claim differs from the canonical ADD,
  sourced from `passback_formula_disagreements.csv` and surfaced on
  `/freestyle/add-analysis` as the external-source framing subsection.
- `src/content/freestyleTrickDoctrine.ts` — the per-trick divergence registry
  (`DOCTRINE_DIVERGENCE_REGISTRY`), which holds the three genuine structural-claim
  divergences.
- `database/footbag.db` — every platform ADD quoted below was verified against the
  live dictionary.

## The central finding, made concrete

PassBack's `dex_count` and IFPA's ADD diverge in a completely predictable way,
because ADD counts several things `dex_count` does not:

- A stall scores 1 ADD and 0 dexes (a stall is not a dexterity). So every pure
  stall — toe, clipper, foot, head, knee, neck, sole, inside, outside, heel,
  forehead, shoulder — reads `dex_count` 0 while the platform reads its structural
  value.
- A single-dex atom (mirage, illusion, legover, pickup) reads `dex_count` 1 and ADD
  2, because ADD also scores the stall the dex lands into.
- A cross-body or rotational atom (butterfly, whirl, swirl, osis, around-the-world)
  reads `dex_count` 1 and ADD 3 (or 2), because ADD also scores the cross-body
  traversal or the body rotation the dex count cannot see.
- A clipper kick reads `dex_count` 0 (a clipper is not a dex) and ADD 1 (it is a
  cross-body kick).

None of these is PassBack being wrong. Each is PassBack answering "how many dexes?"
correctly, while the platform answers "how much compositional difficulty?"
correctly. The adopted interpretation in every case is the platform's structural
ADD, for the site's purpose (it publishes compositional difficulty), and the reason
is not that PassBack is non-authoritative but that PassBack is measuring a different
quantity that the platform records honestly alongside — never absorbing it into ADD
and never contradicting it.

---

## A. The measurement-frame cohort (65 rows)

Every row here is the frame difference above. The disagreement is real as numbers
and unreal as a claim: PassBack's `dex_count` and the platform's ADD are both
correct readings of different quantities.

**Source (all rows):** PassBack `dex_count`, name-matched to the IFPA canonical.
**Adopted (all rows):** the platform's structural ADD.
**Why (all rows):** the site publishes compositional difficulty, which is what ADD
measures; PassBack's dex count is surfaced explicitly on the ADD-analysis page as a
parallel reading, so the divergence is recorded and explained, never silently
absorbed into ADD and never contradicted.

### A.1 The illustrative atoms (where the frame difference is most legible)

| Trick | PassBack dex_count | Platform ADD | The unseen structure |
|---|---|---|---|
| Clipper Kick | 0 | 1 | a clipper is a cross-body kick, not a dex |
| Butterfly | 1 | 3 | dex + cross-body + stall |
| Whirl | 1 | 3 | dex + rotation + stall |
| Swirl | 1 | 3 | dex + rotation + stall |
| Osis | 1 | 3 | spin + cross-body + stall |
| Mirage | 1 | 2 | dex + stall |
| Illusion | 1 | 2 | dex + stall |
| Legover | 1 | 2 | dex + stall |
| Pickup | 1 | 2 | dex + stall |
| Around the World | 1 | 2 | full-orbit dex + stall |
| Eggbeater | 1 | 3 | atomic + legover + stall |
| Pure stalls (toe, foot, head, knee, neck, sole, inside, outside, heel, forehead, shoulder) | 0 | their stall value | a stall is not a dexterity |

### A.2 The compound rows (uniform dex_count pattern)

The remaining rows are compounds where PassBack records `dex_count` 2 against a
higher platform ADD — the same frame difference, one layer up. They include the
paradox family (paradox mirage, osis, whirl, torque, legover, blender, drifter),
the pixie family (pixie mirage, osis, whirl), the spinning family (spinning mirage,
osis, whirl, torque, butterfly, symposium whirl), the ducking family (ducking
mirage, osis, whirl), the stepping and whirling and symposium families, and folk
compounds (blender, torque, mobius, ripwalk, dimwalk, dada curve, gauntlet,
parkwalk, sidewalk, tripwalk, smear, smoke, phoenix, bullwhip, blurriest, orbit).
In every one, PassBack counts the dexterities executed and the platform counts the
compositional structure; the two numbers diverge by exactly the structure the dex
count cannot see.

There is no per-row adjudication to make here, and pretending there were would
misrepresent the data. The honest scholarship is the pattern: 65 rows, one
explanation, both readings preserved.

---

## B. The genuine structural-claim divergences (3 rows)

These three are the real disagreements. Here PassBack is not counting dexes — it
historically lists a specific structural ADD, and that number competes with the
platform's grammar-derived value. All three diverge by exactly +1 (platform over
PassBack), which is itself the evidence for an open question.

| Trick | PassBack claim | Platform ADD | Adopted | Why |
|---|---|---|---|---|
| Blurrage | 3 | **4** | Platform | grammar derivation stepping(+1) + barrage(3) = 4; PassBack's 3 recorded as historical-divergence, gated on the open Q7 |
| Predator | 3 | **4** | Platform | atomic(+1) + double-legover(3) = 4; PassBack's 3 is the strongest single-row evidence for the Q7 implicit-paradox hypothesis (an `Atomic X` that may read as `Paradox Atomic X`) |
| Schmoe | 2 | **3** | Platform | stepping(+1) + legover(2) = 3; the positional `near` in "Stepping near Legover" is +0 under current convention, so the platform reads 3 |

**Source:** PassBack, as a historical ADD list (not a dex count). **Adopted:** the
platform's grammar-derived value, live in the dictionary at 4, 4, and 3
respectively. **Why:** the platform publishes its own executable-grammar
derivation and records PassBack's lower number as a documented historical
divergence in the per-trick registry, per record-don't-adopt. The gap is a uniform
+1 across all three, which is not treated as three coincidences: it is the visible
signature of the open **Q7** question — whether an implicit operator term (a
paradox reading of `Atomic X`, or a systemic implicit modifier) accounts for the
difference. Until Q7 is ruled, the platform's value ships and PassBack's is
recorded; if Q7 resolves toward the implicit-operator reading, these rows (and
their shape) revise by 1, which is why the gap=1 batch was chosen as the
lowest-risk publication.

These are the only PassBack rows where the reconciliation is genuine adjudication
rather than translation.

---

## C. Cross-reference: Blurrage and Predator carry three readings each

Blurrage and Predator appear in both this record and the FootbagMoves one, and the
two outside sources diverge from the platform in **opposite directions**:

- **Blurrage** — platform 4; PassBack lists 3 (−1, Section B here); FootbagMoves
  lists 6 (+2, an over-count in the FootbagMoves record). Three readings, one
  platform value between two single-source outliers.
- **Predator** — platform 4; PassBack lists 3 (−1); FootbagMoves lists 5 (+1).
  Again the platform sits between two divergent single sources.

This is the clearest vindication of the source-reconciliation policy in the whole
corpus. Two independent outside lineages disagree with the platform and with each
other on the same two tricks. Weighting by source count would be paralysing; the
policy instead weights by independent lineage and adopts neither outlier, publishing
the platform's own grammar-derived value and recording both divergences. The
per-trick registry currently holds the PassBack half of each; the FootbagMoves half
is recorded in the FootbagMoves reconciliation document.

---

## D. Sumo, an edge case carried in the frame cohort

Sumo appears in the 68-row frame cohort (PassBack `dex_count` 2) but also carries a
separate X-Dex note in the curator data: its cross-dex behaviour is the one place
where the frame-difference row also touches the open X-Dex receiver boundary
question (whether a far dex onto a down-adjacent base is an eligible receiver). It
is recorded here as a frame-difference row whose structural reading additionally
depends on that open Scoring-paper edge, not as a resolved disagreement.

---

## E. Open cases

1. **Q7 — the implicit-operator hypothesis.** The uniform +1 gap on Blurrage,
   Predator, and Schmoe is the standing evidence that the platform's grammar may be
   missing (or PassBack may be adding) an implicit operator term. This is a live Red
   question. The platform's values ship in the meantime as the lowest-risk reading;
   the gap=1 batch is deliberately small and reversible.
2. **Sumo's X-Dex reading** (Section D), which rests on the open receiver-boundary
   question in the Scoring paper.

Everything else in the PassBack overlap is either agreement or the measurement-frame
difference of Section A — recorded, explained, and not a conflict to resolve.

---

## F. Summary

| Category | Count | Nature | Where it lives |
|---|---|---|---|
| Measurement-frame difference | 65 | Not a rival claim; PassBack counts dexes, platform counts structure | `freestyleAddDisagreements.ts`, surfaced on the ADD-analysis page |
| Genuine structural-claim divergence | 3 | Real +1 disagreement, Q7-gated | `DOCTRINE_DIVERGENCE_REGISTRY` |
| Open (Q7, sumo X-Dex) | — | Live questions, platform value ships provisionally | Red queue / Scoring paper |

The single sentence of this reconciliation: **PassBack is mostly a different
instrument, not a different answer.** The three rows where it is a different answer
are recorded, explained, and held against the platform's own grammar, exactly as
the Charter's policy requires.
