# Progression & Learning-Path Modeling (Part 5)

Philosophy memo. The goal is **not** a recommendation engine and **not** new edges — it is to
understand how curated media can *express* progression, so the gallery IA and (future) relationship
vocabulary support learning without overreaching into ontology.

## What a progression is (and isn't)

A **progression** is a curator-authored *ordered sequence of tricks* with media at the nodes, meant to
be learned in order. It is a **pedagogical artifact**, not a structural claim:
- It does NOT assert that trick B "contains" trick A (that's decomposition — ontology).
- It does NOT assert difficulty ordering as fact (ADD is the dictionary's measure; a progression is a
  *teaching* order, which can differ from ADD order).
- It is reversible curator content (a list), not schema.

## Three progression shapes observed

1. **Atom/foundation ladder** — the entry path through the core atoms:
   `toe-stall → around-the-world → orbit → mirage → illusion → butterfly → whirl`.
   Each node ideally has a tutorial (direct coverage); gaps are visible (e.g. an `embedded_only` atom
   like orbit-in-ATW signals "needs a dedicated clip").
2. **Set-acquisition path** — learning a set system and its expansions:
   `pixie → smear → ripwalk → blurry-whirl → torque`. Crosses into `#set_*` media + the set
   encyclopedia; a progression here is "how to build up the pixie family."
3. **Family-expansion path** — within a terminal-identity family, easiest→hardest *to learn*
   (butterfly → ducking-butterfly → spinning-butterfly → …), which the trick-detail Next/Previous
   navigation already approximates by ADD within family.

## How media expresses progression (without new machinery)

- **Node = trick + its exemplar clip.** A progression is a list of slugs; the media for each node is
  whatever direct coverage exists (preferring the `exemplar_of` clip, per `COVERAGE_SEMANTICS.md`).
- **Entry = concept media.** A "how to learn" concept video (`#concept_learning`) is the *frame* /
  entry node of a progression, not a step. Concept media tells you *how* to use the ladder.
- **Gaps are honest signals.** A progression node with no direct coverage (only embedded, or none) is
  a visible "coverage gap" — progressions double as a coverage-priority map (which atoms/sets most
  need a dedicated tutorial). This is the highest-leverage *pedagogical* use of the coverage data.
- **Future edge:** `progression_for` (a clip is a step in path X) — semantic vocabulary reserved, not
  built. Until then a progression is a curator-authored ordered slug list (TS content module), with
  media resolved per node at render time.

## Intersections (kept clean)

| Axis | Owns | Progression borrows |
|---|---|---|
| Ontology (dictionary) | family, ADD, decomposition | which tricks exist + their family/ADD (read-only) |
| Set encyclopedia | set systems | set-acquisition sequences |
| Media | clips per trick | the node assets |
| Glossary | concept definitions | concept-media entry framing |

A progression *reads from* all of these; it *owns* only the ordering + the teaching narrative. It
never writes back into ontology (a teaching order is not a structural order) — the firewall again.

## Design stance

- Progressions are **curator-authored, reversible content** (lists), surfaced as a gallery node
  ("Learning progressions") and optionally cross-linked from trick-detail/family pages.
- Start with **one** hand-authored flagship progression (the atom ladder) as the pattern; do not
  build a generator. Difficulty/ordering is a teaching judgment, not an algorithm.
- A progression must visibly distinguish "learn order" from "ADD order" so it never reads as a
  difficulty/structure claim.

## Deliverable stance
This is the philosophy; the concrete first artifact (the atom-ladder progression list + its coverage-
gap readout) is a small follow-on once the namespace (`concept_`) and exemplar flag land. No engine,
no edges, no schema.
