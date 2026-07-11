# Movement Neighbor — Doctrine (Slice 1)

Definition slice. No code. This is the durable meaning of a movement neighbor, written
before any generator, table, or widget, because the definition outlives all of them.
The governing shape is the compiler pipeline: the Atlas computes a verified relationship
table from movement formulas, production consumes the frozen table, and the interface
visualizes it. The Atlas never reaches the interface directly.

---

## Definition

Two tricks are **movement neighbors** if they differ by exactly one structural movement
choice while both remaining inside the same bounded movement neighborhood.

Unpacking the three load-bearing parts:

- **Structural movement choice.** One of the small, enumerable attributes that define a
  trick's movement within its neighborhood. For the first neighborhood, the one-dex toe
  tricks, there are exactly three: the direction the leg circles, the side the leg
  circles on relative to the planted foot, and the side the bag comes down on. A choice
  is a real movement decision a player makes, described in plain words, never a
  coordinate or a bit.
- **Exactly one.** The two tricks agree on every choice but one. Differing in two or more
  choices is not a neighbor relationship; those tricks are further apart in the same
  neighborhood.
- **Same bounded neighborhood.** A neighborhood is a closed set of tricks that share the
  same fixed context and vary only across the same small set of choices. The one-dex toe
  tricks are one neighborhood: all launch and land on the toe, all use a single leg
  circle, and they vary only across the three choices above. Two tricks in different
  neighborhoods are never movement neighbors, however similar they feel.

Worked example, the neighbors of mirage:

| Trick | Neighbor | The one change |
|---|---|---|
| Mirage | Illusion | Reverse the circle direction |
| Mirage | Pixie | Switch the side the leg circles on |
| Mirage | Pickup | Switch the side the bag lands on |

Mirage and fairy are not neighbors: they differ in two choices at once (both the
direction and the circling side), so fairy is a step further away, reachable only
through a neighbor.

---

## What a movement neighbor is not

- **Not two changes at once.** Differing in more than one choice is not a neighbor edge.
- **Not a cross-neighborhood link.** A one-dex toe trick and a two-dex trick, or two
  tricks on different landing surfaces, are in different neighborhoods and are never
  neighbors.
- **Not an alias.** An alias is the same trick under another name. A neighbor is a
  different trick reached by one movement change. The two relations must never merge.
- **Not the operator relation.** The dictionary already owns a relation for adding,
  removing, or swapping one operator on a base (whirl to spinning-whirl). That is a
  different axis, the composition axis. A movement neighbor changes a movement choice
  inside a single atom, not an operator on top of one.
- **Not a family or a feeling.** Sharing a family, a surface, or a look does not make two
  tricks neighbors. Only differing by exactly one enumerated choice does.
- **Not a self-loop.** A trick is not its own neighbor.

---

## Is the relationship symmetric?

Yes. It is an undirected relation. If A differs from B by exactly one choice, then B
differs from A by exactly that same one choice. The change label names the attribute that
differs, which reads the same in both directions (reversing the direction takes mirage to
illusion and illusion to mirage). Edges are unordered pairs; the generator and the table
represent each pair once and both endpoints see it.

---

## Can two tricks have multiple neighbor relationships?

Two senses, and they must be kept apart:

- **A single trick has several neighbors.** Yes. In the one-dex toe neighborhood every
  trick has three neighbors, one for each choice that can change. That is the normal
  case, not a special one.
- **A single pair of tricks has at most one neighbor relationship.** Between any two
  distinct tricks there is at most one movement-neighbor edge, carrying one change label.
  If two tricks differed by exactly one choice in two different ways, they would have to
  differ in more than one attribute, which contradicts the definition. So the graph has
  no parallel edges: each pair is either not neighbors, or neighbors via exactly one named
  change.

---

## Is it computed or curated?

Computed, then frozen. This is the compiler framing and it is neither hand-curation nor
live production computation:

- **Computed once, in the Atlas, from movement formulas.** The generator's input is the
  Atlas's structural representation of each trick (the movement formula that records the
  three choices), not the production notation. Production notation is deliberately lossy
  for these atoms (it drops which leg and which side, and some atoms share a notation
  string), so the neighbors cannot be reliably recovered from it. The Atlas formula is
  precisely the representation that can, which is why the Atlas is the compiler.
- **Frozen and checked in for production.** The computed table is committed as a
  generated production resource. Production loads the frozen table and never recomputes
  it, and never reads the Atlas. Regenerating the table is a research-side act that
  re-runs the compiler and commits a new output, the same way other generated resources
  are refreshed.

So the honest one-word answer is generated, with the generation living in the research
layer and the output owned by production.

---

## Is it restricted to the one-dex neighborhood initially?

Yes for the data, no for the concept. Version 1 contains exactly one bounded
neighborhood, the eight one-dex toe tricks, and nothing else. But the definition is
written in terms of "a bounded neighborhood" from the start, so later versions add more
neighborhoods without changing the meaning of a movement neighbor:

- **Version 1:** the eight one-dex toe tricks. One neighborhood, three choices, a
  three-regular graph.
- **Version 2:** other bounded neighborhoods (other landing surfaces, other small
  variation families such as the pixie-eggbeater positional set), each with its own fixed
  context and its own small set of choices. The number of choices, and therefore the
  number of neighbors per trick, is a property of each neighborhood, not a universal
  three.
- **Eventually:** any trick page can show "movement neighbors" for the neighborhood that
  trick belongs to, which is the pixie-eggbeater question that started this whole thread.

The neighborhood is a first-class notion in the table from day one, even while only one
neighborhood is populated, so growth is additive and never a redefinition.

---

## Invariants

The doctrine-level invariants every version must satisfy. These are the meaning of the
relation; the QC slice will turn each into a mechanical check.

- **Bounded.** Every edge lies within a single named neighborhood. There are no
  cross-neighborhood edges.
- **Exactly-one-change.** Every edge changes exactly one movement attribute and carries a
  label naming which attribute changed.
- **Closed change vocabulary.** Change labels come from a small, plain-language set fixed
  per neighborhood. For the one-dex toe neighborhood the whole vocabulary is: reverse the
  circle direction, switch the circling side, switch the landing side. No coordinate, bit,
  count, or model word ever appears, in the data or in anything rendered from it.
- **Symmetric and irreflexive.** Edges are unordered pairs; no trick neighbors itself.
- **At most one edge per pair.** No two tricks are neighbors in more than one way.
- **Disjoint from the alias and operator relations.** A neighbor is a different trick
  (not a renaming) reached by a movement change (not an operator change).
- **Real, active tricks only.** Every endpoint resolves to a real, active dictionary
  trick.
- **Neighborhood-regular.** Within a neighborhood, every trick has the same number of
  neighbors, equal to that neighborhood's number of choices. For the one-dex toe
  neighborhood that number is three, so the graph is three-regular and connected; this
  exact count is a property of that neighborhood, not a law for all of them.
- **Provenance-tagged, one-directional.** The table records that it was generated by the
  Atlas compiler. Production consumes it and never imports the Atlas; the flow is Atlas to
  table to production to interface, never Atlas to interface.

---

## Why this slice matters most

A widget can be redrawn in an afternoon. This definition decides, permanently, which pairs
of tricks the whole system will ever call related, on which axis, and how that claim is
checked. Get it right here and every later slice, the generator, the graph audit, the
production table, and the five consumers, is a faithful projection of a settled idea. Get
it wrong here and every slice inherits the confusion. That is why the definition is the
deliverable, and the widgets are downstream.
