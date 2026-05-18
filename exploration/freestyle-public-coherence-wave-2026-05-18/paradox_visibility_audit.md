# Paradox visibility audit

Phase B planning doc. Audits where the paradox modifier currently surfaces
on public freestyle pages, identifies the structural-centrality gap, and
recommends visibility expansions.

## Current paradox surface footprint

13 files mention paradox; 93 distinct references across the freestyle
subtree. Categorized:

| Surface | Context | Visibility weight |
|---|---|---|
| `/freestyle/add-analysis` worked examples | Paradox-Mirage (Phase A): `paradox(+1) + mirage(2) = 3 ADD` | High — explicit derivation |
| `/freestyle/add-analysis` discrepancy cases | DC-04 Blurry Whirl, DC-05 Blurry Torque, DC-06 Food Processor (all compress through stepping paradox) | High — Red-settled |
| `/freestyle/add-analysis` component-class table | Listed under "Body operators" with the `PDX → CLIP > OP IN [DEX]` formula | Medium |
| `/freestyle/glossary` §3 paradox term | Canonical formula visible | High |
| `/freestyle/history` | Mentioned in evolution narrative | Low |
| `/freestyle/combo-analysis` | Sequence-level mentions | Low |
| `/freestyle/tricks` Movement System view (`?view=movement-system`) | Solo group under "Entry Topologies" axis | Medium |
| `/freestyle/tricks` Component View (`?view=component`) | Body modifier group | Medium |
| Landing operator board | Listed as PDX in tier-II Body operators | High |
| Trick-detail pages for paradox-derived compounds | Modifier link, sometimes "paradox formula visible" | Variable |

## Structural-centrality gap

Paradox is one of the **two structurally densest operators** (alongside
spinning) in the IFPA vocabulary — Red rulings repeatedly use paradox
to canonicalize compound names (blurry expands to stepping paradox;
food processor → stepping paradox blender; atom smasher carries an
X-dex from a toe LIKE paradox). Despite this centrality:

1. **Movement System view** gives paradox a solo axis ("Entry
   Topologies") with one modifier. The axis name is technical and the
   one-modifier group reads as undersized next to the 5-modifier Set/
   Uptime axis. A user scanning the four axes wouldn't immediately see
   paradox as load-bearing.
2. **Topology view** (`?view=topology`) doesn't have a paradox-anchored
   neighborhood. The 6 pedagogical groups are biomechanical (hippy-
   downtime-dex, etc.) and paradox doesn't appear as a topology label.
3. **Trick-detail pages** for paradox-derived compounds reference paradox
   in modifier-links but don't visually amplify the PDX formula. The
   paradox formula `PDX → CLIP > OP IN [DEX]` appears only on the
   glossary term entry, not on individual compound pages.
4. **Decomposition references** across compounds (paradox-mirage,
   paradox-whirl, paradox-torque, etc.) don't surface the paradox
   formula inline — readers have to follow a link to glossary §3.

## Recommended visibility expansions

### High-priority (low risk)

1. **Expand Movement System "Entry Topologies" axis name**. Rename the
   axis to "Entry Topologies (Paradox)" or "Body Entry / Paradox Family"
   so the one-modifier group is contextualized. The axis is structurally
   distinct from the others; the name should reflect paradox's role as
   the primary entry-topology operator.
2. **Add paradox formula chip to trick-detail pages** for paradox-derived
   compounds. Inline `PDX → CLIP > OP IN [DEX]` as a small reference
   chip near the modifier-links block. Reusable component (cross-link
   to glossary §3 paradox term).
3. **Promote paradox to its own operator-board tier callout**. Currently
   PDX sits as one of several body operators in the operator board. A
   compact "Paradox Anatomy" sub-callout below the tier table could
   carry the formula visibly without expanding the tier table itself.

### Medium-priority (judgment calls)

4. **Add a paradox-anchored topology group** to `/freestyle/tricks?view=
   topology`. Currently the 6 neighborhoods are biomechanical; a 7th
   anchored on "paradox entry pattern" would surface the family at the
   topology layer too.
5. **Paradox cross-link from Movement System axis card**. The axis card
   for "Entry Topologies" could link to the glossary §3 paradox term
   directly, not just to `?view=movement-system#paradox`.

### Low-priority / out of scope

- Paradox formula promotion to the symbolic-equivalence layer
  (`freestyleSymbolicEquivalences.ts`) — touches the parser/editorial
  boundary; needs careful review.
- Paradox-as-trick redesignation — Wave 2-adjacent (operator-vs-trick
  boundary is Wave 2 question), explicitly blocked.

## Doctrinal safety classifications

| Expansion | Safety |
|---|---|
| #1 Axis rename | Safe — content-only |
| #2 Inline formula chip on compound pages | Safe — read-only display, glossary cross-link |
| #3 Operator board paradox callout | Safe — content addition, existing tier table preserved |
| #4 Paradox topology group | Caution — requires biomechanical definition curator |
| #5 Cross-link Movement axis → glossary | Safe |

## Out of scope for this slice

- Implementation of any expansion (this is audit + recommendation only)
- Wave 2 operator-vs-trick boundary work
- Parser-layer paradox grammar changes
