# Movement Semantics vs. Scoring Semantics

**A movement-language architecture note**

*Date:* 2026-05-23
*Status:* core philosophical insight; preserve as architecture-layer doctrine
*Audience:* project-internal; not beginner-facing

---

## The distinction

A freestyle trick has two semantic dimensions that look unified but are
not:

- **Movement semantics** — what the trick *is*: the structural
  decomposition into surfaces, modifiers, transitions, and core atoms.
  The answer to "how do you do it?" Encoded as the canonical notation
  reading (e.g. `Stepping Paradox Whirl`); single-valued per trick; a
  property of the body's movement vocabulary.

- **Scoring semantics** — what the trick is *worth*: the ADD value
  assigned to it under some accounting convention. The answer to "how
  many points does it count for?" Potentially multi-valued — PassBack
  may say one thing, IFPA-grammar derivation another, Red-adjudicated
  rulings a third — and a property of an external accounting system
  laid over the movement.

Pre-Wave-7 work implicitly assumed these two dimensions cohere
universally: that any trick whose movement decomposition is settled
*ipso facto* has a settled ADD. The 2026-05-23 doctrine-divergence
work showed this assumption is false in a structurally informative way.

---

## Why they are formally separable

Movement semantics answers a question about the body and the bag.
Scoring semantics answers a question about a community's choice of
how to weight that body-and-bag work into a competition-legible
number. The first is constrained by physics, anatomy, learnability,
and the practice-and-naming tradition of the sport. The second is
constrained by what an organization or community has agreed counts
for what, at what historical moment, under whatever scoring framework
was current.

The dimensions interact — the scoring system reads the movement to
assign a value — but the directionality is one-way. Movement
decomposition does not depend on scoring; you can describe `Stepping
Paradox Whirl` without ever quoting an ADD. Scoring depends on
movement decomposition; you cannot assign an ADD without knowing what
parts you are adding up.

This asymmetry is the architectural starting point: **movement
semantics is the substrate; scoring semantics is one layer of
interpretation laid over it**. Multiple scoring layers can coexist —
indeed, multiple scoring layers *do* coexist — and the substrate
remains stable underneath them.

---

## The empirical case

The doctrine-divergence framework (Wave 7, 2026-05-23) ships three
canonical tricks — `blurrage`, `predator`, `schmoe` — whose movement
decompositions are uncontested while their scoring values diverge by
+1 ADD between two recognized systems:

| trick    | movement reading              | PassBack | IFPA-grammar add-up |
|----------|-------------------------------|----------|---------------------|
| blurrage | Stepping far Barrage          | 3        | 4                   |
| predator | Atomic far DLO                | 3        | 4                   |
| schmoe   | Stepping near Legover         | 2        | 3                   |

These tricks are not parser bugs. Their structural readings are
clean, the modifier vocabulary is stable, and neither side of the
disagreement is using a different decomposition. The math just
*differs*. The Wave 7 registry treats this as a first-class
phenomenon: the canonical published value is the IFPA-derived one
(preserving the parser-canonical invariant), and the PassBack value
is documented as provenance metadata — a different community's
historically-anchored answer to the scoring question, neither erased
nor overruled.

The empirical pattern hardens beyond three rows. A 17-row clean
cohort (single readings, stable vocabulary, both totals known)
splits 3/7/6/1 across gap = +1/+2/+3/+5. **PassBack is always
lower** — never higher, never equal. Same-direction across 17 rows
is statistically incompatible with random data error; it is evidence
of two distinct accounting conventions reading the same movement
substrate.

The movement substrate does not budge. The number on top of it does.

---

## Five mechanisms producing divergence

Across the project's accumulated cases, five structurally distinct
mechanisms have surfaced as plausible sources of scoring divergence
over identical movement readings:

### 1. PassBack historical scoring

PassBack is a published trick-and-score reference compiled in the
community-tournament era. Its scoring may have been authored under a
different baseline — a community-tournament-floor framework rather
than the full add-up IFPA-grammar later adopted — or it may simply
predate the rulings (pt8 / pt10 / pt12-style refinements) that
sharpened modifier weights in IFPA's later interpretation. Either way,
PB's scoring is not "wrong"; it is *expressing a different scoring
convention*, and the divergence is timeline drift or framework-choice
drift, not error.

### 2. IFPA-style derivation

The IFPA-grammar add-up is a compositional rule: base trick + each
modifier weight + each positional weight. It is deliberately
*compositional* — designed to produce a deterministic value from any
parsed structural reading. Its strength is reproducibility; its
weakness is that it treats every movement decomposition as
arithmetically additive, even where community judgment historically
treated some compositions as discounted (folk atomicity) or as
implicit-operator carriers (paradox-from-atomic). It is one
accounting system among possible ones.

### 3. Implicit operator compression

Some IFPA rulings (pt10 most prominently) propose that named
compounds *implicitly carry* an operator that the literal name
omits: `Atomic X` reads structurally as `Paradox Atomic X`. The
operator is not in the surface notation; it is in the *reading
convention*. Implicit-operator compression is a scoring-side
phenomenon — the movement is unchanged — but it adds +1 ADD to any
trick the convention applies to. Two communities that agree on the
movement can disagree on whether the implicit operator is read in,
and produce diverging scores.

### 4. Folk atomicity

Folk-named tricks — `Colossus`, `Pandora's Box`, `Predator`, names
born in practice culture before any compositional grammar was
formalized — may be scored against the *name* rather than the
decomposition. A folk-atomic reading gives the trick a baseline ADD
(often equal to the lowest movement element, or a low fixed value)
that is *less than* its parts add up to. The decomposition exists as
teaching material; the score honors the name. This is incompatible
with strict compositional grammar but consistent with how oral
naming traditions actually score in practice.

### 5. Modifier absorption

Compositional grammars assume modifiers stack independently: each
modifier adds its declared weight. In practice, many scoring
conventions exhibit diminishing returns when modifiers stack — two
modifiers may add +1 rather than +2; three modifiers may add +1
rather than +3. The mechanism is modifier *absorption*: each
subsequent modifier is partially absorbed into the prior
composition's complexity rather than being counted as a separable
unit. This collapses the +2/+3/+5 gap distribution onto an
accounting system that compresses high-modifier-count compositions
toward a flatter score curve than IFPA-grammar's strict additivity
would predict.

These five mechanisms are not mutually exclusive. A given trick's
divergence may layer two or three of them.

---

## Why divergence itself is meaningful ontology evidence

The reflex on first encountering a PB/IFPA disagreement was to ask
*which is right*. The Wave 7 finding reframes the question: when 17
of 17 vocab-clean rows show same-direction divergence, the divergence
is no longer noise. It is *signal* — evidence about the structure
of the scoring layer itself.

The signal carries information:

- **Direction tells us which system is more compositional.** PB
  systematically lower implies PB compresses; IFPA-grammar
  systematically higher implies IFPA add-up expands. Neither is the
  "true" reading; they are calibrated to different ends of the
  compositional-vs-atomic spectrum.

- **Gap magnitude tells us about modifier interaction.** A
  uniformly +1 gap would point at a single implicit-operator
  mechanism. A widening gap with modifier count points at absorption.
  A flat folk-name baseline points at atomicity. The shape of the
  gap distribution is diagnostic.

- **Distribution across trick families tells us about convention
  scope.** If gaps cluster on `Atomic X` compounds, an
  implicit-operator hypothesis localizes. If they cluster on
  folk-named tricks regardless of structure, folk atomicity
  localizes. If they spread across all multi-modifier compounds,
  absorption localizes.

The divergence pattern, in other words, *is* the ontology evidence.
It does not need to be resolved before being informative. Treating it
as a first-class phenomenon — registering it, surfacing it as
provenance, asking the right adjudicator (Red) the right
meta-question — extracts that information without forcing
premature collapse to a single accounting layer.

This is the philosophical pivot the doctrine-divergence framework
enacts: **the project stops trying to make scoring cohere and starts
treating divergence as data**.

---

## Architectural consequences

Holding these two dimensions formally separate has shaped, and
continues to shape, the project's architecture in concrete ways.

- **Movement semantics ships as canonical content.** The structural
  reading is a single-valued property of each trick, computed from
  the canonical notation by the parser, surfaced consistently across
  surfaces. Layer separation rules (parser reads `canonical_name`
  only; editorial reads `base_trick` and `freestyle_trick_modifier_links`
  strictly; neither overrides the other) keep this dimension free of
  scoring contamination.

- **Scoring semantics ships with provenance.** The published ADD
  value (`freestyle_tricks.adds`) is the IFPA-grammar derivation —
  one accounting system, chosen as the platform's published canonical
  for stability — but the Doctrine Divergence Registry attaches
  per-slug metadata recording other systems' values where they
  differ. PB's value is surfaced as historical-divergence;
  Red-adjudicated values that conflict pre-promotion are surfaced as
  doctrine-sensitive; IFPA-grammar-internal accounting exceptions
  (the MODIFIER_COMPOSITIONS carve-outs) are surfaced as
  alternate-accounting. Each entry is factual, source-attributed,
  brief.

- **The zero-mismatch invariant is preserved by definition.**
  Because the published value equals the IFPA-derived value for
  every registered slug, the audit classifies them as `exact`. The
  divergence is *documented*, not *failed*. This is the
  architectural payoff of treating the two dimensions as separable:
  the audit remains clean while the divergence remains visible.

- **Future Red consultation is movement-language-only.** Red is not
  asked to certify the parser. He is asked to interpret which
  scoring convention applies in which context — meta-questions
  about the scoring layer, never adjudication of the movement layer.
  Q11 ("is PassBack a different convention?") is the clean form of
  this; the four hypotheses (PB-as-baseline / PB-as-floor / PB-as-
  different-formula / PB-as-stale-snapshot) are all scoring-layer
  questions that leave the movement substrate untouched.

- **Display surfaces honor the asymmetry.** The trick-detail page
  may render a scoring-notes section ("PassBack historically lists
  this at 3 ADD; the IFPA-grammar derivation gives 4") without
  destabilizing browse cards, glossary terms, or progression paths.
  The movement reading is what every surface needs; the scoring
  provenance is what the detail page can afford to expand.

---

## Closing

Movement semantics is the project's stable substrate — the body's
work, the names the community gives it, the structural
decompositions that have settled. Scoring semantics is one layer of
interpretation over that substrate — a community's choice of how
much credit to give which movements, made at a particular historical
moment under a particular framework. The two can be discussed in the
same breath, surfaced on the same page, taught together — but they
must not be conflated.

When they diverge, the divergence is informative. It tells the
project something about how the scoring layer is structured —
whether the scoring system is compositional or atomic, whether
modifiers absorb or stack, whether implicit operators read in,
whether the community's convention has drifted from a pure
add-up rule. Treating that information as a first-class ontology
phenomenon — rather than as parser bugs to fix or data errors to
discard — is what lets the project preserve both the stability of
movement language and the honesty of competing scoring traditions.

The substrate stays still. The interpretations layer over it.

This separability is core architecture, not implementation detail.
Preserve it across all future scoring-layer work.

— end —
