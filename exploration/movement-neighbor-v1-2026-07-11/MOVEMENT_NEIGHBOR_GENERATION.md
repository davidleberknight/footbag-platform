# Movement Neighbor v1 — Generation

Exploration-only. Slice 2 of the movement-neighbor pipeline: generate the complete
Version 1 relationship for the bounded eight-trick one-dex toe neighborhood from the
Atlas movement formulas. No production code, no database, no UI, no changes to aliases,
families, operators, or canonical trick data. The definition is unchanged; the data
produced no contradiction with it.

## Source data

Structural source: the Atlas one-dex toe cube coordinates, read from the Atlas catalog
(`exploration/movement-atlas/atlas_catalog.csv`), region 1-DEX, sub cube, launch toe,
landing toe. Each of the eight atoms carries three explicit binary attribute columns
(`dex_side`, `direction`, `term_side`) and a structural coordinate string
(`atlas_coord`, e.g. `toe:toe/S.IN.S`). Identity is that Atlas coordinate, never the
trick name and never the production operational-notation string.

The eight atoms and their coordinates:

| Trick | Circling side | Dex direction | Landing side | Coordinate |
|---|---|---|---|---|
| around the world | same | in | same | toe:toe/S.IN.S |
| pixie | same | in | opposite | toe:toe/S.IN.O |
| orbit | same | out | same | toe:toe/S.OUT.S |
| fairy | same | out | opposite | toe:toe/S.OUT.O |
| pickup | opposite | in | same | toe:toe/O.IN.S |
| mirage | opposite | in | opposite | toe:toe/O.IN.O |
| legover | opposite | out | same | toe:toe/O.OUT.S |
| illusion | opposite | out | opposite | toe:toe/O.OUT.O |

Production cross-check (read-only, recorded for provenance, not used as the identity
key): all eight are active canonical tricks with ADD 2. Their Atlas name equals their
production slug, and their display name is the coordinate name with underscores turned
to spaces, which matches the production canonical name for all eight.

## Generation rule

An undirected edge joins two atoms when, and only when, they are distinct members of
this one neighborhood and their three structural attributes differ in exactly one place.
The one differing attribute names the edge, through a small closed vocabulary of plain
movement words that carries no coordinate terminology:

- differ only in circling side, the leg circles on the other side of the planted foot:
  **switch circling side**
- differ only in dex direction, the leg circles the other way: **reverse dex direction**
- differ only in landing side, the bag comes down on the other side: **switch landing
  side**

Each label reads correctly in both directions of its undirected edge, so it is symmetric
by construction (reversing a direction or switching a side is the same statement either
way). The generator emits each unordered pair once, ordered by slug, and separately
projects a directed view with both directions for later service-layer consumption.

Every edge is computed from the coordinates by the generator. None is hand-authored, and
no unexpected output was repaired by hand.

## Results

- Nodes: 8. Undirected edges: 12. Directed rows: 24.
- The graph is three-regular: every atom has exactly three neighbors, one per attribute.
- Outputs:
  - `movement_neighbor_nodes.csv` — one row per atom with its three attributes, its
    coordinate, and its Atlas provenance.
  - `movement_neighbor_edges.csv` — the twelve canonical undirected edges, each with the
    changed attribute, the plain-language label, both source coordinates, and the
    provenance version.
  - `movement_neighbor_directed.csv` — the 24-row directed projection (source, neighbor,
    change label). A convenience view only; the canonical relationship is the undirected
    edge table.

The full neighbor set, read from the generated edges:

| Trick | Neighbors (change) |
|---|---|
| around the world | orbit (reverse dex direction), pickup (switch circling side), pixie (switch landing side) |
| orbit | around the world (reverse dex direction), legover (switch circling side), fairy (switch landing side) |
| pixie | fairy (reverse dex direction), mirage (switch circling side), around the world (switch landing side) |
| fairy | pixie (reverse dex direction), illusion (switch circling side), orbit (switch landing side) |
| mirage | illusion (reverse dex direction), pixie (switch circling side), pickup (switch landing side) |
| illusion | mirage (reverse dex direction), fairy (switch circling side), legover (switch landing side) |
| pickup | legover (reverse dex direction), around the world (switch circling side), mirage (switch landing side) |
| legover | pickup (reverse dex direction), orbit (switch circling side), illusion (switch landing side) |

## Assumptions

- The Atlas one-dex toe cube coordinates are correct and authoritative for these eight
  atoms. The generation trusts them and does not re-derive movement facts from names or
  from production notation.
- The three attributes are independent binary choices in this neighborhood, which the
  Atlas cube asserts and the three-regular result confirms.
- Atlas name equals production slug for all eight (verified against the active dictionary).

## Boundaries

- Exactly the eight named atoms. No other launch or landing surfaces, no operators,
  modifiers, positional variants, or higher-dex movements were added, even where an edge
  might have looked interesting.
- The relationship is only the one-changed-attribute movement relation. It is not an
  alias relation, not an operator add, remove, or swap relation, and not the existing
  operator-based structural-neighbor relation, which produces nothing among these
  operator-free atoms.
- Exploration-only artifact. Nothing here is imported by production; it is a candidate
  input for a later, separately approved production-data slice.
