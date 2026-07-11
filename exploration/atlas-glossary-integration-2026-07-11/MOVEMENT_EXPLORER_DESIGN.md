# Movement Explorer — Product Design Document (planning only)

Planning only. Nothing is implemented, no production code is written, the glossary
and the Atlas are untouched, no graphics are created, nothing is prototyped. This
document decides whether an interactive learning component belongs in the public
glossary, what it should teach, and how it would be shaped if approved.

It builds on the companion `INTEGRATION_PLAN.md`, which recommended a static "eight
from three" figure as a collapsed Advanced expander in the Dexterities chapter. This
document is the second revision, sharpened by a maintainer note that corrected an
overcorrection in the first draft. The correction is important enough to state up
front.

---

## 0. The core question, and the corrected line

Can the Atlas insight become an intuitive interactive experience for ordinary players?

Yes. And the risk is narrower and more precise than the first draft claimed. The first
draft said that any design letting a player see all eight tricks as one system had
become a mathematical demonstration. That is wrong. Seeing relationships is not seeing
mathematics. A player who watches eight familiar trick cards link up by "one change
away" is learning that these movements are cousins, not learning graph theory. The
mathematics lives in the framing and the vocabulary, not in the fact of connectedness.

So the line to hold is this: **present the structure as relationships between named
tricks, never as a formal system.** What must never appear is the formal dress, which
is a state count, a coordinate grid, switches presented as independent variables, or
the whole set drawn at once as a single geometric shape. What may and should appear is
the felt relationship: mirage is one change away from illusion.

This reframes the entire component. **The Atlas is infrastructure, not content.** It
quietly precomputes which tricks are one change apart and what the single difference
is. The glossary surfaces that as plain human features (one change away, nearby
movements, compare two tricks) and never names the Atlas, a cube, or a variable. The
player comes away thinking "these tricks are not random, they are closely related
movements," which is exactly true and carries no mathematics.

There remains a governance fact this document cannot decide for the maintainer. The
freestyle symbolic-restraint doctrine currently forbids interaction-heavy UI on the
glossary, and the glossary today ships zero interactive widgets. A Movement Explorer
would be the first. This plan recommends building it, as a progressive enhancement over
the already-recommended static figure, but only after an explicit maintainer decision to
allow one pedagogical widget. If that decision is no, the static figure alone still meets
the beginner goal and nothing is lost.

---

## 1. Atlas as infrastructure: the relationship data underneath everything

Before the interaction, the data. The single durable asset harvested from the Atlas is a
small, verified **adjacency table**: for each of the eight one-dex toe tricks, its true
one-change neighbors and the one plain-language difference for each.

Every trick has exactly three one-change neighbors, one for each aspect that can differ
(the direction the leg circles, which side it circles on, and which side the bag lands).
Verified from the Atlas catalog:

| Trick | One change away (direction) | One change away (which side circles) | One change away (landing side) |
|---|---|---|---|
| Mirage | Illusion | Pixie | Pickup |
| Illusion | Mirage | Fairy | Legover |
| Pixie | Fairy | Mirage | Around-the-world |
| Fairy | Pixie | Illusion | Orbit |
| Around-the-world | Orbit | Pickup | Pixie |
| Orbit | Around-the-world | Legover | Fairy |
| Pickup | Legover | Around-the-world | Mirage |
| Legover | Pickup | Orbit | Illusion |

This table is the infrastructure. It is precomputed and verified once, so no feature that
draws on it can ever show a false neighbor. (A hand-authored version is exactly the trap:
mirage and fairy feel related, but they are two changes apart, not one, so a guessed list
would teach a relationship that is not there. The Atlas is what prevents that.)

Note the direction column reproduces the four sibling pairs the community already feels:
mirage and illusion, pixie and fairy, around-the-world and orbit, pickup and legover.
Those are the strongest "aha" and the natural first teaching examples.

Several glossary and trick-page features draw on this one table without any of them
exposing the mathematics:

- **One Change Away** — on a trick, a short list of its three neighbors, each labeled with
  the single thing that differs.
- **Nearby Movements** — the same idea framed as a small neighbor view around a focus trick.
- **Compare Two Tricks** — pick any two, and the interface highlights the one movement
  aspect that differs and, at the deeper layer, the one notation token that differs.
- **Highlight exactly what changed** — the shared primitive under both, calling out the
  single difference in movement and in notation.

The Movement Explorer is the guided, exploratory front end to this table. The other
features are lighter surfaces onto the same data. Building the table well is the real work;
the surfaces are thin.

---

## 2. Product design document

### What it is

A small, reusable glossary component that lets a player take one familiar one-dex toe
trick and discover its neighbors: the tricks that are one change away, and the single
thing that changes. It is the interactive form of the static "eight from three" figure,
in the same home, powered by the adjacency table above. It teaches relationships, in the
language of neighbors, not choices.

### What it is not

- Not an encyclopedia entry, a trick browser, or a search tool.
- Not a state count, a coordinate grid, or a two-by-two-by-two array.
- Not the entire eight-node graph drawn at once as one figure.
- Not an animation of leg motion.
- Not a surface that ever uses the words cube, hypercube, topology, lattice, symmetry
  group, fiber bundle, variable, or combination, and never shows a number of states.

Note what is no longer on this list, corrected from the first draft: a view that relates
all eight tricks is fine, as long as the player builds it by walking neighbors rather than
being handed a grid; free experimentation is fine, once the neighbor framing is set.

### The one sentence a player should leave with

"These tricks are not random, they are closely related movements." Nothing about
mathematics, nothing about the Atlas.

---

## 3. Educational goals

**Must land (beginner):**

- Changing one part of a movement turns a trick into a specific neighboring trick.
- The eight tricks are closely related; each is a neighbor of a few others.

**Should land (intermediate):**

- The four sibling pairs (mirage and illusion, pixie and fairy, around-the-world and
  orbit, pickup and legover) differ only in the direction the leg circles.
- The written notation changes in exactly the one spot the movement changed.

**May land (advanced), only on opt-in:**

- Each trick has three neighbors because there are three things that can change. Stated in
  words, as a fact about relationships, with no count of tricks, no grid, and no model
  vocabulary.

**Must never land (the real failure mode, corrected):**

- Not "that the tricks are related," which is the goal. The failure is the formal dress:
  that there are "eight combinations," a "two by two by two," a shape, a set of variables,
  or any sense that a piece of mathematics has been shown. Relationships landing is
  success; a formal system landing is failure.

---

## 4. Interaction comparison

Six criteria: teaches the neighbor goal, respects the restraint doctrine, keeps a clean
no-JS fallback, accessibility, mobile fit, and formal-smell risk (does the presentation
drift into looking like a formal system). The last is weighted highest, but it is judged
on framing and vocabulary now, not on whether relationships are visible.

| Model | Teaches neighbors | Restraint fit | No-JS fallback | Accessibility | Mobile | Formal-smell risk | Verdict |
|---|---|---|---|---|---|---|---|
| Guided "change one thing" walkthrough | Strong, one relationship at a time | Strong | Static figure plus prose | Excellent | Excellent | Low | **Default experience** |
| Neighbor-walk (stand on a trick, see its three neighbors, hop) | Strong, reinforces relatedness every hop | Strong: a relationship web, not a panel | Static neighbor list | Good, announceable | Good | Low | **Recommended free-explore mode** |
| Compare two tricks (highlight the one difference) | Strong on single-difference | Strong | Static two-trick figure | Good | Stacks on mobile | Low | **Recommended companion feature** |
| Three movement-change controls, labeled as movement not variables | Direct on causality | Medium: still lays the three aspects out at once | Static figure | Good, native controls | Good | Medium: closest to a variable panel, acceptable only if never showing a combined readout | Acceptable alternative to the neighbor-walk, not preferred |
| Card explorer (deck of eight, pick one, neighbors highlight) | Teaches neighborhoods | Medium | Static grid of cards | Good | Medium | Medium, if the eight are shown as a plain deck rather than an array | Secondary |
| Full eight-node relationship graph drawn at once | Teaches adjacency directly | Poor as one figure | Hard to render statically | Poor for graphs | Poor | High: the complete three-regular graph on eight nodes still reads as the cube | Reject as a single drawn figure; allow only local neighbor views |
| Animation of the leg motion | Could show the change | Poor, doctrine says no animation | None | Poor for motion-sensitive users | Poor | Medium | Reject |

The corrected reading: the free options are no longer disqualified. The neighbor-walk and
compare-two-tricks are now first-class, because framed as relationships they carry low
formal smell. The only presentations still rejected are the ones whose *form itself* is the
formal object: the whole graph drawn at once, and animation.

---

## 5. Recommended interaction: the guided-then-free hybrid

Adopt the hybrid the maintainer proposed. It is stronger than either half alone.

**Default: a guided walkthrough, in neighbor language.** The reader starts on one trick,
say mirage, shown as a small card with a one-line feel. The interface offers a neighbor:
"Reverse the direction of the circle and mirage becomes illusion." The reader takes it,
sees the two side by side with the one difference called out, and is invited to try
another. Two or three steps in, the reader has felt that mirage and illusion, and pixie
and fairy by the same move, are one change apart. This is calm, linear, and one
relationship at a time.

**Unlocked after the walkthrough: "Explore for yourself," a free neighbor-walk.** Once the
framing is set, the reader can stand on any of the eight and freely hop to any neighbor,
following relationships wherever curiosity leads. Each hop names the trick and the single
difference. There is no grid, no count, no combined readout; the player is walking a web of
related movements, which is discovery, not combinatorics. Free exploration is acceptable
precisely because the neighbor framing was established first and travels with the player
into free mode.

Why the free mode is a neighbor-walk rather than a three-switch panel: both are acceptable
under the corrected line, but the neighbor-walk reinforces "these are related movements"
with every hop and never lays the three aspects out as independent dimensions, whereas a
switch panel is the one free presentation that still resembles a set of variables. A
labeled three-change control is a fine alternative if the neighbor-walk proves awkward on a
small screen, provided it never shows a combined eight-state readout.

**Companion feature: Compare Two Tricks.** The same highlight-the-one-difference mechanism,
available as a small pick-two comparator, reusable on trick pages later.

---

## 6. User flow

Beginner path, no notation:

1. The reader opens the collapsed "Explore these eight related tricks" Advanced expander in
   the Dexterities chapter. It opens on one trick, for example mirage, with a one-line feel
   and an offered neighbor.
2. The reader takes the offered change. Mirage becomes illusion, shown beside it, with the
   one difference named: same movement across the body, reversed direction.
3. The reader takes another offered neighbor, or resets to a different starting trick. Every
   step is one change and one named neighbor.
4. After a few steps the always-visible takeaway reads: each of these tricks is a single
   change away from a few close neighbors.
5. An "Explore for yourself" control appears, now unlocked. The reader is free to hop
   between neighbors at will.

Intermediate path adds the notation: on each change the trick's notation appears and only
the changed token is highlighted, tying the movement change to the written change.

Advanced path adds one opt-in sentence: each trick has three neighbors because there are
three things that can change. No count of tricks, no grid, no model, and no link out to the
Atlas.

---

## 7. Integration plan

### Primary home

The **Dexterities chapter**. The neighbor relationships are that chapter's own subject
(direction, which side circles, landing side), so the explorer is the payoff of the
chapter, shipping as the interactive form of the same collapsed Advanced expander, not a
second block.

Candidate homes compared: Dexterities is primary. Notation gets a one-line cross-link only,
since the notation highlight is an intermediate tie-in and the component is about movement.
Movement Language, Operators, and Families are not homes; operators stack rather than swap a
single aspect, so forcing the explorer there would misteach. Standalone reusable is the
implementation shape, deployed in Dexterities first.

### Secondary uses (same adjacency table)

- **One Change Away** on each of the eight trick detail pages: the trick's three neighbors,
  each labeled with the difference. A thin, static surface onto the table.
- **Compare Two Tricks** as a small reusable comparator, glossary first, trick pages later.

Both are separate later decisions, not part of the first build, and inherit the same
guardrails.

### The no-JS contract

The static "eight from three" figure remains the fallback and ships first or together. The
explorer enhances it. Removing the interactive layer later leaves the figure and the
chapter intact.

---

## 8. Visual planning

- **Size:** small, on the order of the timing-clock figure; one trick card, an offered
  neighbor, and a brief side-by-side on change. Fits one column with no horizontal scroll.
- **Placement:** end of the Dexterities chapter, inside the advanced expander.
- **Collapsed by default:** yes.
- **Mobile:** single column; the side-by-side reveal stacks; full-width tap targets; no
  hover-dependent affordance.
- **Desktop:** the same, with the before-and-after placed side by side using the width.
- **Accessibility:** keyboard operable; each change and each hop is a real button; the
  resulting trick name is announced through a polite live region; the highlighted notation
  token uses weight or underline as well as color; fully usable with no pointer and no
  motion.
- **Animation:** minimal to none. At most a brief name cross-fade on change, disabled under
  reduced motion. Motion is never required to understand the change; the text always states
  it.
- **Reusable on trick pages or glossary only:** built reusable, shipped glossary-only first;
  the One Change Away and Compare features on trick pages are separate later decisions.

---

## 9. Future extensibility notes

Evaluated for whether the architecture should anticipate each, without building any now. The
infrastructure framing makes this cleaner: the question is whether the adjacency-table model
generalizes, not whether the widget does.

| Future use | Anticipate? | Reasoning |
|---|---|---|
| Two-dex neighborhoods | No | The Atlas falsified the clean two-dex structure and the space is large and unresolved. A verified adjacency table cannot be built there yet, so the neighbor feature would have to guess, which is the one thing the infrastructure exists to prevent. |
| Other small curated neighborhoods | Yes, lightly | Keep the adjacency as curated data, not hardcoded, so another verified neighborhood could be authored later. Do not build a generic engine. |
| Operator exploration | No | Operators stack additively; they are not a swap of one fixed aspect, so they do not fit the neighbor model and would misteach. |
| Symmetry demonstrations | No, never | This is the formal-system failure mode by another name. |
| Trick comparisons | Yes | Compare Two Tricks is already a general pairwise comparator over the table; exposing it is a natural, low-risk secondary capability. |

Architecture principle: a small, curated, verified adjacency table with thin relationship
surfaces over it. Anticipate more curated neighborhoods and pairwise comparison. Do not
anticipate, and leave no seams for, two-dex, operators, or symmetry.

---

## 10. Risks and anti-patterns

- **The formal-dress trap (the corrected headline).** The failure is not showing that
  tricks are related; that is the goal. The failure is dressing the relationships as a
  formal system: a state count, a grid, a two-by-two-by-two, variable-labeled switches, or
  the whole set drawn at once. Avoid by speaking only in neighbors and single differences,
  and by never showing a number of states or a combined array.
- **The whole-graph trap.** The complete eight-node three-regular graph drawn at once still
  reads as the cube. Avoid by keeping only local neighbor views; let the player build the
  whole picture by walking it, never by being handed it.
- **The false-neighbor trap.** Hand-authoring the neighbor lists would ship wrong
  relationships (mirage and fairy feel adjacent but are two changes apart). Avoid by driving
  every neighbor feature from the verified adjacency table, never from intuition.
- **Combinatoric language.** "Eight combinations," "two by two by two," "each choice is
  independent" leaks the mathematics with no diagram at all. Ban the vocabulary; the deepest
  layer says "three things can change" and "close neighbors," never a number of tricks.
- **Animation as the teacher.** Relying on motion fails motion-sensitive and no-JS users.
  Motion is decorative and reduced-motion-safe; the text always carries the meaning.
- **Losing the no-JS fallback.** A JS-only widget breaks the page's contract. The static
  figure is the fallback and ships with it.
- **Scope drift.** Extending to two-dex, operators, or symmetry reintroduces the machinery
  and, worse, forces guessed adjacencies. Hold the scope to the verified eight.
- **The governance risk.** This is the glossary's first interactive widget and sits against
  the symbolic-restraint doctrine. It is not the plan's to self-authorize; it needs an
  explicit maintainer decision, and a no is a complete answer with the static figure standing
  alone.

---

## 11. Recommendation in one paragraph

Build the Movement Explorer as a guided-then-free experience powered by a verified
adjacency table harvested from the Atlas, homed in the Dexterities chapter, degrading
cleanly to the static figure without JavaScript. Teach in the language of neighbors, not
choices: each trick is one change away from a few close relatives, and the interface names
the single difference. Default to a calm guided walkthrough; unlock a free neighbor-walk
once the framing is set, because free exploration framed as relationships is discovery, not
combinatorics. Reuse the same table for One Change Away and Compare Two Tricks. Never show a
count, a grid, a variable, or the whole set as one shape. Build it only as a progressive
enhancement, only after the static figure is accepted, and only with an explicit maintainer
decision to allow one interactive learning widget. The Atlas stays invisible infrastructure;
its insight becomes something a player feels, that these tricks are closely related
movements, without a single word of mathematics.
