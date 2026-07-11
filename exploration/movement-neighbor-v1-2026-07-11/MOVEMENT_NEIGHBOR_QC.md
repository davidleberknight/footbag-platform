# Movement Neighbor v1 — QC

Exploration-only. Slice 3: audit the generated Version 1 relationship against every
doctrinal invariant. The audit is run by the generator itself (its `audit()` pass) and
by two read-only production checks recorded below. Every check passed.

## Invariants: expected versus actual

| Invariant | Expected | Actual | Result |
|---|---|---|---|
| Neighborhood closure | every edge endpoint is one of the eight | all 24 endpoints in the eight | PASS |
| Exactly one change | each edge differs in exactly one attribute | all 12 differ in exactly one, recomputed independently | PASS |
| Symmetry | each undirected edge has both directions in the projection | all 12 present both ways (24 directed rows) | PASS |
| Irreflexivity | no self-neighbor | no edge has A equal to B | PASS |
| No parallel edges | each unordered pair at most once | 12 distinct unordered pairs, no repeat | PASS |
| Regularity | every trick has exactly three neighbors | degrees all 3 (all eight atoms) | PASS |
| Expected graph size | 12 (derived, see below) | 12 | PASS |
| Change-label accuracy | label names the single changed attribute | every label matches its changed attribute | PASS |
| Closed, coordinate-free vocabulary | only the three plain labels; no coordinate terms | only the three labels; no cube, vertex, bit, or coordinate word | PASS |

### Expected graph size, derived (not hardcoded)

The neighborhood has three independent binary attributes over a complete set of two to
the third power, which is eight atoms. Fixing one attribute to change and holding the
other two constant pairs the eight atoms into eight divided by two, which is four
disjoint edges. Three attributes each contribute four such edges, so the total is three
times four, which is twelve. Equivalently, a cube in three binary dimensions has three
times eight divided by two edges, which is twelve. The generator computes the twelve
edges independently and matches this derived figure.

## Relation separation (read-only production checks)

| Check | Method | Result |
|---|---|---|
| No edge is an alias | queried the alias table for any of the eight slugs pointing at another of the eight | none found; all eight are distinct canonical rows | PASS |
| No edge is an operator add, remove, or swap | queried the modifier-link table and the base-trick column for any of the eight linking to another of the eight | none found; these atoms carry no operator links | PASS |
| Every endpoint is an active canonical trick | queried the dictionary for the eight slugs | all eight active, ADD 2, canonical | PASS |
| Distinct from existing structural-neighbor data | the existing operator-based structural-neighbor service derives from operator links, which these atoms lack | it produces zero edges among the eight; the two relations do not overlap | PASS |

## Manual sanity checks

| Pair | Expectation | Result |
|---|---|---|
| mirage and illusion | neighbors, reverse dex direction | PASS |
| mirage and pickup | neighbors, switch landing side | PASS |
| mirage and pixie | neighbors, switch circling side | PASS |
| mirage and fairy | not neighbors (two attributes differ: circling side and dex direction) | PASS |
| around the world and orbit | neighbors, reverse dex direction | PASS |
| pixie and fairy | neighbors, reverse dex direction | PASS |
| pickup and legover | neighbors, reverse dex direction | PASS |

### Intuitive-looking pairs correctly rejected

The audit reported every non-edge that differs in two or three attributes. The sixteen
rejected pairs, with what differs:

- Two attributes (twelve pairs): around the world and fairy (direction, landing);
  around the world and legover (circling, direction); around the world and mirage
  (circling, landing); fairy and legover (circling, landing); fairy and mirage
  (circling, direction); illusion and orbit (circling, landing); illusion and pickup
  (direction, landing); illusion and pixie (circling, direction); legover and mirage
  (direction, landing); orbit and pickup (circling, direction); orbit and pixie
  (direction, landing); pickup and pixie (circling, landing).
- Three attributes, the four long diagonals (four pairs): around the world and illusion;
  fairy and pickup; legover and pixie; mirage and orbit.

Twelve edges plus twelve two-apart pairs plus four three-apart pairs is twenty-eight,
which is every unordered pair of eight atoms. The partition is complete and accounts for
all pairs.

## Verdict

Every doctrinal invariant passes, the derived and actual edge counts agree, all seven
manual sanity checks pass, the sixteen non-edges are correctly rejected for the right
reason, and the relation is confirmed disjoint from the alias and operator relations and
from the existing structural-neighbor data. No contradiction with the definition
surfaced, so the definition stands unrevised.

## Final decision

**Is the generated Version 1 relationship sufficiently verified to be promoted into a
committed production-owned TypeScript resource?**

**Yes, ready for a separately approved production-data slice.**

The relationship is complete, exact, three-regular, fully audited against the doctrine,
grounded in the Atlas coordinates rather than names or notation, and provably distinct
from every existing dictionary relation. The next slice, whenever pulled, is the
production-data slice: emit a generated, checked-in TypeScript resource from these
verified tables, loaded by the service layer, under the distinct reader-facing name that
keeps it separate from the operator-based structural-neighbor concept. That promotion is
not performed here.
