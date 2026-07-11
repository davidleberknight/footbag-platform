# Is "structural neighbor" a first-class production concept?

Architecture determination. Planning only, no implementation. The question is
ownership and data model, deliberately settled before any widget: production should
own relationships, the UI should only visualize them. The finding is that this is
already true in the codebase, and the Atlas "one change away" idea is a specific new
relation that must be added in the same spirit, not a reason to invent a system.

---

## Short answer

Yes. "Structural neighbor" is already a first-class, production-owned relationship,
and it is built the way the freestyle doctrine prescribes (projection over extension:
derive from existing curator inputs, own no new schema, keep the template logic-light).
Two mechanisms own neighbor relationships today:

1. **A derived operator relation** (`src/services/freestyleAdjacency.ts`). It computes
   the plus-or-minus-one-operator relation at read time from two already-populated
   inputs, each trick's `base_trick` and its `freestyle_trick_modifier_links` rows. It
   stores no edges, owns no schema, and explicitly never reads notation or parser
   output. It buckets neighbors as Built on, Swap the operator, Extend, Same operator
   other base, and Same structure, and renders through
   `src/views/partials/trick-structural-neighbors.hbs`.

2. **A curated movement-neighborhood overlay** (`src/services/freestyleRelatedTricks.ts`,
   `NEIGHBORHOOD_GROUPS` and `EXPLICIT_NEIGHBORS`). It hand-lists mutual neighbor groups
   for atoms that sit in their own family with a self-referential base, so no rule
   connects them (surface stalls, flying-clipper variants, the directional
   around-the-world variants, and so on). These are stored as small curated arrays in a
   TypeScript module, not schema.

So the principle you are asserting is not a proposal, it is the established
architecture. The service layer owns the relationship; the Handlebars partial only
draws it.

The important consequence: the Atlas "one change away" idea is a **third, distinct
relation**, and the honest work is to add it in the same style, not to rename or
overload what exists.

---

## Why the Atlas relation is genuinely different, not a duplicate

The existing operator relation connects tricks that differ by one operator on the same
base (spinning-whirl to whirl, to double-spinning-whirl, to paradox-whirl). The eight
one-dex toe atoms (mirage, illusion, pixie, fairy, around-the-world, orbit, pickup,
legover) carry **zero operators**, so the operator relation has almost nothing to say
about them, and the code even suppresses the zero-operator sibling rule on purpose to
avoid false neighbors.

The Atlas relation connects those same eight atoms by a different axis entirely: they
differ by one **movement aspect** (the direction the leg circles, which side it circles
on, or which side the bag lands). Mirage relates to illusion, pixie, and pickup, but not
directly to fairy. That is precisely the relation the operator mechanism structurally
cannot express, and it is finer than the curated overlay's fully-connected groups (the
overlay would wrongly imply all eight are mutually adjacent). It is complementary, and it
is a new axis. The family-is-not-topology caution applies: do not collapse it into the
existing "structural neighbors" name, which already means the operator relation.

---

## The ten questions, answered

**Is this metadata?** Split by relation. The operator relation is not metadata; it is
derived at read time from `base_trick` plus modifier links, with no stored edges. The
Atlas movement-aspect relation is irreducibly curated for these atoms, because the three
aspects that distinguish them are not present in production data the way operators are.
They live only in the lossy notation (Volume III showed notation drops handedness and
which-leg, and some atoms share a notation string) and in the research coordinate. So the
movement-aspect relation cannot be reliably derived from current production inputs; it is
a small curated fact set.

**Is it generated?** The operator relation is generated live, by projection, every read.
The movement-aspect relation was generated once by the Atlas (one-step differences over
its coordinate) and cannot be regenerated in production without importing the coordinate
model, which is research-only and forbidden in production. In production it is a frozen
curated snapshot, not a live generator.

**Does it belong in the database?** No new schema now. The operator relation already
runs on existing tables with no adjacency schema, and the curated overlay is a
TypeScript module. Follow both: the movement-aspect neighbors go in a small TypeScript
content module, reversible, scoped to the eight atoms, while Red doctrine waves are still
open. Promote to a table only if and when a queryable surface needs it at scale (search
across many neighborhoods), and only after stabilization. That trigger is the sole
schema-promotion condition; absent it, a module is correct.

**Does it belong in the Atlas?** The coordinate model and the generation stay in
exploration as provenance and are research-only (the production handoff forbids the
geometric models from reaching production content). The plain-language aspects and the
resulting neighbor pairs are harvested out into the production module, with the Atlas
cited as provenance in a comment only. Production never imports from `exploration/`; a
convention guard should enforce that.

**Does it belong in the dictionary?** Yes. It is dictionary-domain curated data, owned
by the freestyle service layer alongside the two existing neighbor mechanisms, but as a
distinctly named relation.

**What invariants should hold?**
- Every referenced slug resolves to an active `freestyle_tricks` row (no dangling
  neighbors), matching the tag and media invariants elsewhere.
- The relation is symmetric and irreflexive (no trick is its own neighbor).
- Each edge carries exactly one changed-aspect label from a closed plain-language
  vocabulary (direction, which side circles, landing side), and no coordinate, bit,
  or count vocabulary appears anywhere in the data or the rendered output.
- For the complete one-dex-toe neighborhood, each atom has exactly three one-change
  neighbors (a strong, testable regularity), pinned by a golden set of the twelve
  undirected edges so an edit cannot silently corrupt adjacency.
- The relation is disjoint from alias pairs (a neighbor is a different trick, not a
  renaming) and distinct from the operator-relation buckets (no shared bucket key or
  reader label).

**How is it tested?**
- Unit tests on the module: symmetry, irreflexivity, three-regularity, closed
  vocabulary, active slugs, and a golden-file pin of the twelve edges to the verified
  Atlas harvest.
- A service-contract test: the accessor returns labeled neighbors for the eight atoms
  and null for every other trick, so absence is graceful (mirroring how the operator
  builder returns null when no bucket has members).
- An integration test on the consuming trick page: the block renders only for the eight,
  the links resolve, and a non-atom trick renders nothing.
- Convention guards: no `exploration/` import in `src/`, and no coordinate or bit
  vocabulary in the module or its output.

**Which glossary features could consume it?** The Movement Explorer (guided and free),
Nearby Movements, the eight-from-three figure, and Compare Two Tricks. All read the
service; none computes adjacency in the browser.

**Which trick-page features could consume it?** A distinct "one movement change away"
block on the eight atom pages, deliberately separate from the existing operator
Structural Neighbors block so the two axes are not conflated, and Compare Two Tricks.
The existing partial and section-subtitle naming are already taken by the operator
relation, so this block needs its own label.

**Which search features could consume it?** A "near this trick" or did-you-mean or
more-like-this affordance. Search is the surface most likely to justify eventual schema
promotion, because it wants a queryable form rather than an in-memory module; it is
public trick data, so no privacy gating applies.

---

## Recommended shape

A small curated content module in the freestyle service neighborhood, modeled on the
existing curated overlay but carrying labeled pairwise edges rather than fully-connected
groups. Two representations are viable:

- **Curated per-atom aspects, edges derived.** Record for each of the eight atoms its
  three plain-language movement aspects (which way it circles, which side, where it
  lands), then derive "one change away" as differ-in-exactly-one-aspect. This keeps the
  relation a projection (consistent with the operator mechanism), makes the
  three-regularity an emergent invariant rather than an asserted one, powers Compare Two
  Tricks directly (compare aspects), and exposes no coordinate because the aspects are
  plain words. Preferred.
- **Curated labeled edge list.** Store the twelve edges with their labels directly.
  Simpler, but it asserts adjacency rather than deriving it and does less for the
  comparison feature.

Either way: TypeScript module, no schema, Atlas as provenance-comment only, distinctly
named, service-owned, template-visualized. That satisfies the ownership principle you set
out, matches how the codebase already treats relationships, and keeps the Atlas invisible.

---

## The one governance flag

Naming and slot ownership. "Structural neighbors" is already a production term meaning
the operator relation, with its own service, partial, and section subtitle. The Atlas
relation must take a different reader-facing name (for example "one movement change away"
or "movement variations") and its own block, or a deliberate, separately-approved
decision is needed to broaden the existing structural-neighbors concept to host a second
axis. Left unnamed, the two would silently merge, which is the exact axis-collapse the
freestyle caution warns against. This is the one point that needs a maintainer call
before any build.
