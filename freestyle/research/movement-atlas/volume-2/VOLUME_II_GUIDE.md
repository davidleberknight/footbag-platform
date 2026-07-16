# Volume II Guide: how to read the Two-Dex Atlas

Status: exploratory research under `exploration/`. Not production data, not doctrine, not a change to the live dictionary. A reader's guide to `VOLUME_II.md` and the machine-readable `volume_2_catalog.csv`. It explains the coordinate system, the columns, and the statuses. It adds no new claims and it assumes the Volume I guide.

## 1. The one idea

A two-dexterity movement is `launch -> dex1 -> dex2 -> terminal`, with nothing landing between the two dexterities. The bag is carried from the first dexterity to the second in an intermediate carriage state. So a two-dex movement is an **ordered pair of dexterity cubes**: the fiber grew from the three-cube (Volume I) to the six-cube. Each dexterity is one cube vertex; the pair is a six-cube vertex.

## 2. Reading a coordinate

A two-dex address extends the Volume I address with a second vertex after a bar:

```
   launch:landing / dex1 | dex2
   where each dex is   side.direction.out    ( S or O . IN or OUT . S or O )
```

- `launch` / `landing`: the surface pair, exactly as in Volume I.
- `dex1` = `side1.direction1.out1`. The first dexterity. Its `out1` is the intermediate carriage: the side the bag is on between the two dexterities.
- `dex2` = `side2.direction2.out2`. The second dexterity. Its input is `out1` (the handoff); its `out2` is the terminal side, where the bag finally lands.

Worked example:

- `toe:toe/O.IN.O|O.OUT.S` = toe launch; first dexterity opposite-side inward, leaving the bag crossed (`out1 = O`); second dexterity opposite-side outward, returning the bag same-side (`out2 = S`); landing on the toe. Two opposite-side dexterities into a toe, which is the region the double-leg-over occupies.

## 3. The catalog columns (`volume_2_catalog.csv`)

One row per two-dex coordinate. Columns:

- `region` — always `2-DEX` in this volume.
- `fiber` — the base point, `launch:landing`.
- `launch`, `landing`, `landing_grade`, `landing_lat` — the surface pair and its properties, as in Volume I.
- `dex1`, `dex2` — the two cube vertices, each `side.direction.out`.
- `atlas_coord` — the full address from Section 2. The stable, name-free key.
- `pair_kind` — `diagonal(repeated-dex)` if the two dexterities are identical, else `off-diagonal(ordered-pair)`.
- `swap_partner` — the address of this coordinate with the two dexterities exchanged (the dex-swap symmetry). For a diagonal coordinate the partner is itself.
- `symbolic_formula` — the frozen Grammar v1 movement formula.
- `add` — the additive difficulty: two scored dexterities plus the landing grade.
- `grammar_status` — see Section 4.
- `representation` — `unnamed` for every coordinate in this volume (see Section 5).
- `name` — blank in this volume.
- `notes` — a one-line description of the coordinate's standing.

## 4. What each status means

Identical to Volume I, lifted to the pair level:

- **valid** — a well-formed two-dex path the grammar generates and can score. Real terrain.
- **blocked** — the grammar refuses it: a cross-body (clipper) launch with a same-side first dexterity, foreclosed by bag control.
- **artifact** — an enumerator duplicate: on a midline landing the terminal side does not distinguish, so the opposite-side final copy is not a distinct movement.
- **uncertain** — the coordinate depends on an unsettled grammar question: here, a peak landing (unresolved as a surface).

Two further statuses live in the prose, not the per-row catalog, because they overlay the whole space rather than mark individual rows:

- **The simultaneity overlay.** Every valid coordinate has a second reading in which the two dexterities happen together rather than in order. Its scoring is unresolved, so it is an uncertain overlay over all valid coordinates, not a separate set of catalog rows.
- **The swap relation.** The `swap_partner` column records the dex-swap for each coordinate; whether a swap-pair is the same physical movement (commuting dexterities) is a movement question the atlas marks and does not resolve.

## 5. Why every coordinate is unnamed here

Coordinates are primary and names are annotations, and this volume maps the geometry rather than the naming. A pure-two-dexterity dictionary name exists (the double-leg-over most clearly), but pinning a name to one six-cube vertex needs the intermediate carriage, which the frozen notation does not always record. So a precise name-to-coordinate cross-walk is a later naming pass or an erratum, and this volume leaves `representation` at `unnamed` throughout rather than inventing mappings. A blank name is a fact about this volume's scope, not a claim that the coordinate is unnamed in the sport.

## 6. Navigating the map

- To explore one fiber's whole six-cube: filter `fiber` to a `launch:landing` value; you get its sixty-four coordinates.
- To find the repeated-dexterity movements: filter `pair_kind` to `diagonal(repeated-dex)`; there are eight per fiber.
- To find the two orderings of a dexterity pair: read a coordinate's `swap_partner`.
- To see the grammar's structure: filter `grammar_status` to `blocked`, `artifact`, or `uncertain`.
- To reason structurally about a coordinate: its family, grade, its two dexterity vertices, its swap partner, and its status all read directly from the row, with no reference to any name.
